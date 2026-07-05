/**
 * Unit tests for the bundle verification logic in script/verify-bundle-logic.ts.
 *
 * `checkBundleContents()` is a pure function — no filesystem access, no
 * process.exit — so we can exercise it with synthetic bundle strings.
 *
 * Coverage:
 *   - Allowlist package leaked as require() → BUNDLED CHECK FAIL
 *   - Multiple leaked packages produce one error per package
 *   - Clean bundle (no leaks, all externals present, large enough) → passes
 *   - Bundle below MIN_BUNDLE_BYTES → SIZE CHECK FAIL
 *   - External package missing from bundle → EXTERNAL CHECK FAIL
 *   - Both quote styles for require() are detected (double and single quotes)
 *   - Accidentally removing a recently-added allowlist entry is caught
 *   - build.ts allowlist is derived exactly from bundledPackages (no drift)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  checkBundleContents,
  bundledPackages,
  externalPackages,
  MIN_BUNDLE_BYTES,
} from "@server/verify-bundle-logic";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal passing bundle string given the external packages to include. */
function makeValidBundle(
  externals: readonly string[],
  minBytes: number,
): string {
  const requireCalls = externals
    .map((pkg) => `require("${pkg}")`)
    .join("; ");
  const padding = "x".repeat(Math.max(0, minBytes + 1 - requireCalls.length));
  return requireCalls + padding;
}

// ── bundled-package leak detection ────────────────────────────────────────────

describe("checkBundleContents – bundled package leaks", () => {
  const BUNDLED = ["express"] as const;
  const EXTERNAL = ["@libsql/client"] as const;
  const MIN = 10;

  it("reports an error when an allowlisted package appears as require()", () => {
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require("express")`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"express"/);
  });

  it("detects the leak with single-quote require() style too", () => {
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require('express')`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"express"/);
  });

  it("reports one error per leaked package, not one combined error", () => {
    const bundle =
      makeValidBundle(EXTERNAL, MIN) +
      ` require("express") require("openai")`;
    const { errors } = checkBundleContents(
      bundle,
      ["express", "openai"],
      EXTERNAL,
      MIN,
    );

    expect(errors).toHaveLength(2);
    expect(errors.some((e) => e.includes('"express"'))).toBe(true);
    expect(errors.some((e) => e.includes('"openai"'))).toBe(true);
  });

  it("passes cleanly when no allowlisted package appears as require()", () => {
    const bundle = makeValidBundle(EXTERNAL, MIN);
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(0);
  });
});

// ── size check ────────────────────────────────────────────────────────────────

describe("checkBundleContents – size check", () => {
  const BUNDLED = ["express"] as const;
  const EXTERNAL = ["@libsql/client"] as const;
  const MIN = 1000;

  it("fails when the bundle is smaller than the minimum byte threshold", () => {
    // Construct a bundle that satisfies all other checks but is too small.
    const tinyBundle = `require("@libsql/client")`;
    const { errors } = checkBundleContents(tinyBundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.some((e) => e.includes("SIZE CHECK FAIL"))).toBe(true);
  });

  it("passes the size check when the bundle meets the minimum byte threshold", () => {
    const bundle = makeValidBundle(EXTERNAL, MIN);
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.every((e) => !e.includes("SIZE CHECK FAIL"))).toBe(true);
  });
});

// ── external-package presence checks ─────────────────────────────────────────

describe("checkBundleContents – external package presence", () => {
  const BUNDLED = ["express"] as const;
  const EXTERNAL = ["@libsql/client", "dotenv/config"] as const;
  const MIN = 10;

  it("fails when an expected external package is absent from the bundle", () => {
    // Bundle includes @libsql/client but NOT dotenv/config.
    const bundle =
      "x".repeat(MIN + 1) + ` require("@libsql/client")`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.some((e) => e.includes("EXTERNAL CHECK FAIL"))).toBe(true);
    expect(errors.some((e) => e.includes('"dotenv/config"'))).toBe(true);
  });

  it("passes when all expected external packages are present", () => {
    const bundle = makeValidBundle(EXTERNAL, MIN);
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.every((e) => !e.includes("EXTERNAL CHECK FAIL"))).toBe(true);
  });

  it("passes when external packages appear with single-quote require() style", () => {
    // Build a bundle that uses single quotes for all external require() calls.
    const requireCalls = [...EXTERNAL]
      .map((pkg) => `require('${pkg}')`)
      .join("; ");
    const padding = "x".repeat(Math.max(0, MIN + 1 - requireCalls.length));
    const bundle = requireCalls + padding;

    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.every((e) => !e.includes("EXTERNAL CHECK FAIL"))).toBe(true);
  });

  it("fails when one external package is missing even though others use single-quote require() style", () => {
    // Bundle includes @libsql/client with single quotes but omits dotenv/config entirely.
    const bundle =
      "x".repeat(MIN + 1) + ` require('@libsql/client')`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.some((e) => e.includes("EXTERNAL CHECK FAIL"))).toBe(true);
    expect(errors.some((e) => e.includes('"dotenv/config"'))).toBe(true);
  });
});

// ── newly-added allowlist entry accidentally removed scenario ─────────────────

describe("checkBundleContents – catches accidental allowlist removal", () => {
  it("catches a newly-added package that was left out of the allowlist and leaks into require()", () => {
    // Simulate: developer adds "some-new-lib" to the allowlist so it should be
    // inlined, but a build config mistake causes it to remain external.
    // The bundle will contain require("some-new-lib") — the check must fire.
    const BUNDLED = ["express", "some-new-lib"] as const;
    const EXTERNAL = ["@libsql/client"] as const;
    const MIN = 10;

    const bundle =
      makeValidBundle(EXTERNAL, MIN) + ` require("some-new-lib")`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"some-new-lib"/);
  });

  it("passes cleanly once the allowlist entry is correctly inlined (no require() leak)", () => {
    const BUNDLED = ["express", "some-new-lib"] as const;
    const EXTERNAL = ["@libsql/client"] as const;
    const MIN = 10;

    // Bundle does NOT contain require("some-new-lib") — it was inlined correctly.
    const bundle = makeValidBundle(EXTERNAL, MIN);
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(0);
  });
});

// ── build.ts allowlist contract ───────────────────────────────────────────────
//
// build.ts must derive its esbuild `external` filter allowlist *exclusively*
// from bundledPackages.  If someone hardcodes the list, adds extra items, or
// breaks the import, the bundle check becomes unreliable without any obvious
// error.  This test reads build.ts as source text and asserts the contract.

describe("build.ts allowlist derivation contract", () => {
  const BUILD_TS_PATH = resolve(__dirname, "../../../script/build.ts");
  let buildSrc: string | null = null;
  try {
    buildSrc = readFileSync(BUILD_TS_PATH, "utf-8");
  } catch {
    // buildSrc stays null; each test will surface a clear failure below.
  }

  function requireBuildSrc(): string {
    expect(
      buildSrc,
      `script/build.ts was not found at the expected path:\n` +
        `  ${BUILD_TS_PATH}\n` +
        `If the file was renamed or relocated, update the path in:\n` +
        `  client/src/__tests__/verify-bundle.test.tsx`,
    ).not.toBeNull();
    return buildSrc!;
  }

  it("defines allowlist as exactly [...bundledPackages] with no extra items", () => {
    const src = requireBuildSrc();
    // Match the canonical single-line derivation.  Whitespace variants are
    // tolerated (one or more spaces around = and inside [...]), but the RHS
    // must be the spread of bundledPackages and nothing else.
    const derivationPattern =
      /const\s+allowlist\s*=\s*\[\s*\.\.\.bundledPackages\s*\]\s*;/;

    expect(
      derivationPattern.test(src),
      "build.ts must derive allowlist as `const allowlist = [...bundledPackages]` — " +
        "any addition, removal, or hardcoding breaks the drift guarantee",
    ).toBe(true);
  });

  it("does not reference any extra packages not in bundledPackages", () => {
    const src = requireBuildSrc();
    // Extract the RHS of the allowlist assignment.
    // Matches: const allowlist = [ ...anything... ];
    const assignMatch = src.match(
      /const\s+allowlist\s*=\s*(\[[^\]]*\])\s*;/,
    );

    expect(
      assignMatch,
      "could not locate `const allowlist = [...]` assignment in build.ts — " +
        "the allowlist construction line may have been renamed or restructured",
    ).not.toBeNull();

    const rhs = assignMatch![1];

    // The RHS must be exactly `[...bundledPackages]` — any extra string
    // literals or identifiers beyond the single spread indicate manual drift.
    const extraStringLiteral = /"[^"]*"|'[^']*'/.test(rhs);
    expect(
      extraStringLiteral,
      `build.ts allowlist RHS contains hardcoded string literals: ${rhs}\n` +
        "Use only bundledPackages — never add items by hand",
    ).toBe(false);

    // Count spread expressions: must be exactly one and it must be bundledPackages.
    const spreads = Array.from(rhs.matchAll(/\.\.\.([\w]+)/g)).map((m) => m[1]);
    expect(spreads).toHaveLength(1);
    expect(spreads[0]).toBe("bundledPackages");
  });

  it("imports bundledPackages from verify-bundle-logic", () => {
    const src = requireBuildSrc();
    // The import that provides bundledPackages must come from verify-bundle-logic.
    // This catches renaming the import source to a different (possibly stale) file.
    const importPattern =
      /import\s+\{[^}]*\bbundledPackages\b[^}]*\}\s+from\s+["'][^"']*verify-bundle-logic/;

    expect(
      importPattern.test(src),
      "build.ts must import bundledPackages from verify-bundle-logic — " +
        "importing from any other file severs the single-source-of-truth contract",
    ).toBe(true);
  });
});

// ── live constants sanity check ───────────────────────────────────────────────

describe("bundledPackages and externalPackages constants", () => {
  it("bundledPackages includes core server libraries that must be inlined", () => {
    expect(bundledPackages).toContain("express");
    expect(bundledPackages).toContain("openai");
    expect(bundledPackages).toContain("drizzle-orm");
    expect(bundledPackages).toContain("zod");
  });

  it("externalPackages includes packages that must stay external", () => {
    expect(externalPackages).toContain("@libsql/client");
    expect(externalPackages).toContain("dotenv/config");
  });

  it("no package appears in both bundledPackages and externalPackages", () => {
    const bundledSet = new Set(bundledPackages);
    const overlap = externalPackages.filter((p) => bundledSet.has(p));
    expect(overlap).toHaveLength(0);
  });

  it("MIN_BUNDLE_BYTES is a reasonable threshold (at least 100 KB)", () => {
    expect(MIN_BUNDLE_BYTES).toBeGreaterThanOrEqual(100_000);
  });
});
