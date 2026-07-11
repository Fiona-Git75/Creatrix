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

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── module guard ───────────────────────────────────────────────────────────────
//
// The four symbols below are loaded via a dynamic import so that renaming or
// relocating `server/verify-bundle-logic.ts` produces a clearly-named test
// failure (the guard test below) rather than a suite-level collection error
// that hides which file is missing.

type CheckBundleContents = (
  bundle: string,
  bundled: readonly string[],
  external: readonly string[],
  minBytes: number,
) => { errors: string[] };

let checkBundleContents: CheckBundleContents;
let bundledPackages: readonly string[];
let externalPackages: readonly string[];
let MIN_BUNDLE_BYTES: number;
let _moduleLoadError: unknown = null;

const VERIFY_BUNDLE_MODULE = "@server/verify-bundle-logic";
const VERIFY_BUNDLE_SOURCE = "server/verify-bundle-logic.ts";

beforeAll(async () => {
  try {
    const mod = await import(VERIFY_BUNDLE_MODULE);
    checkBundleContents = mod.checkBundleContents;
    bundledPackages = mod.bundledPackages;
    externalPackages = mod.externalPackages;
    MIN_BUNDLE_BYTES = mod.MIN_BUNDLE_BYTES;
  } catch (e) {
    _moduleLoadError = e;
  }
});

// ── module presence guard ──────────────────────────────────────────────────────

describe("verify-bundle-logic module guard", () => {
  it("can be imported from server/verify-bundle-logic.ts — update the path here if the file is renamed", () => {
    expect(
      _moduleLoadError,
      `\nFailed to import ${VERIFY_BUNDLE_MODULE}.\n` +
        `Expected source file: ${VERIFY_BUNDLE_SOURCE}\n\n` +
        `If the file was renamed or relocated:\n` +
        `  1. Update the module path in client/src/__tests__/verify-bundle.test.tsx\n` +
        `  2. Update the @server alias in tsconfig.json / vite.config.ts if needed\n` +
        `  3. Update any imports in script/build.ts that reference verify-bundle-logic\n`,
    ).toBeNull();
  });

  it("exports checkBundleContents as a function — update callers if this export is renamed", () => {
    expect(
      typeof checkBundleContents,
      `\nThe named export "checkBundleContents" is missing or is not a function.\n` +
        `Source file: ${VERIFY_BUNDLE_SOURCE}\n\n` +
        `If the export was renamed:\n` +
        `  1. Restore the export name to "checkBundleContents", OR\n` +
        `  2. Update every reference in client/src/__tests__/verify-bundle.test.tsx\n` +
        `     and any other file that imports it (e.g. script/build.ts)\n`,
    ).toBe("function");
  });

  it("exports bundledPackages as an array — update callers if this export is renamed", () => {
    expect(
      Array.isArray(bundledPackages),
      `\nThe named export "bundledPackages" is missing or is not an array.\n` +
        `Source file: ${VERIFY_BUNDLE_SOURCE}\n\n` +
        `If the export was renamed:\n` +
        `  1. Restore the export name to "bundledPackages", OR\n` +
        `  2. Update every reference in client/src/__tests__/verify-bundle.test.tsx\n` +
        `     and script/build.ts (which imports bundledPackages to derive the allowlist)\n`,
    ).toBe(true);
  });

  it("exports externalPackages as an array — update callers if this export is renamed", () => {
    expect(
      Array.isArray(externalPackages),
      `\nThe named export "externalPackages" is missing or is not an array.\n` +
        `Source file: ${VERIFY_BUNDLE_SOURCE}\n\n` +
        `If the export was renamed:\n` +
        `  1. Restore the export name to "externalPackages", OR\n` +
        `  2. Update every reference in client/src/__tests__/verify-bundle.test.tsx\n`,
    ).toBe(true);
  });

  it("exports MIN_BUNDLE_BYTES as a number — update callers if this export is renamed", () => {
    expect(
      typeof MIN_BUNDLE_BYTES,
      `\nThe named export "MIN_BUNDLE_BYTES" is missing or is not a number.\n` +
        `Source file: ${VERIFY_BUNDLE_SOURCE}\n\n` +
        `If the export was renamed:\n` +
        `  1. Restore the export name to "MIN_BUNDLE_BYTES", OR\n` +
        `  2. Update every reference in client/src/__tests__/verify-bundle.test.tsx\n`,
    ).toBe("number");
  });
});

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

  it("detects the leak with whitespace-padded require() style — e.g. require( \"pkg\" )", () => {
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require( "express" )`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"express"/);
  });

  it("detects the leak with single-quote whitespace-padded require() style — e.g. require( 'pkg' )", () => {
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require( 'express' )`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"express"/);
  });

  it("detects the leak for a scoped bundled package with single-quote whitespace-padded require() — e.g. require( '@scope/pkg' )", () => {
    const SCOPED_BUNDLED = ["@notionhq/client"] as const;
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require( '@notionhq/client' )`;
    const { errors } = checkBundleContents(bundle, SCOPED_BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"@notionhq\/client"/);
  });

  it("detects the leak for a scoped bundled package with double-quote whitespace-padded require() — e.g. require( \"@scope/pkg\" )", () => {
    const SCOPED_BUNDLED = ["@notionhq/client"] as const;
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require( "@notionhq/client" )`;
    const { errors } = checkBundleContents(bundle, SCOPED_BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"@notionhq\/client"/);
  });

  it("detects the leak for a scoped bundled package with single-quote non-padded require() — e.g. require('@scope/pkg')", () => {
    const SCOPED_BUNDLED = ["@notionhq/client"] as const;
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require('@notionhq/client')`;
    const { errors } = checkBundleContents(bundle, SCOPED_BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"@notionhq\/client"/);
  });

  it("detects the leak for a scoped bundled package with double-quote non-padded require() — e.g. require(\"@scope/pkg\")", () => {
    const SCOPED_BUNDLED = ["@notionhq/client"] as const;
    const bundle = makeValidBundle(EXTERNAL, MIN) + ` require("@notionhq/client")`;
    const { errors } = checkBundleContents(bundle, SCOPED_BUNDLED, EXTERNAL, MIN);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/BUNDLED CHECK FAIL/);
    expect(errors[0]).toMatch(/"@notionhq\/client"/);
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

  it("passes when external packages appear with whitespace-padded require() — e.g. require( \"pkg\" )", () => {
    // Some bundlers or hand-edited bundles emit spaces inside the parens.
    // The check must recognise these as valid require() calls so it does not
    // produce false-positive EXTERNAL CHECK FAIL errors.
    const requireCalls = [...EXTERNAL]
      .map((pkg) => `require( "${pkg}" )`)
      .join("; ");
    const padding = "x".repeat(Math.max(0, MIN + 1 - requireCalls.length));
    const bundle = requireCalls + padding;

    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.every((e) => !e.includes("EXTERNAL CHECK FAIL"))).toBe(true);
  });

  it("fails when an external package is missing even when others use whitespace-padded require()", () => {
    // Bundle includes @libsql/client with space-padded parens but omits dotenv/config entirely.
    // The check must still report EXTERNAL CHECK FAIL for the missing package.
    const bundle =
      "x".repeat(MIN + 1) + ` require( "@libsql/client" )`;
    const { errors } = checkBundleContents(bundle, BUNDLED, EXTERNAL, MIN);

    expect(errors.some((e) => e.includes("EXTERNAL CHECK FAIL"))).toBe(true);
    expect(errors.some((e) => e.includes('"dotenv/config"'))).toBe(true);
  });

  it("fails when a third external package is absent and the bundle mixes double- and single-quote require() styles", () => {
    // Three externals: pkg-a (double-quote), pkg-b (single-quote), pkg-c (absent).
    // The check must report EXTERNAL CHECK FAIL for pkg-c only.
    const MIXED_EXTERNAL = ["pkg-a", "pkg-b", "pkg-c"] as const;
    const bundle =
      "x".repeat(MIN + 1) +
      ` require("pkg-a")` +   // double-quote style
      ` require('pkg-b')`;    // single-quote style
    // pkg-c is completely absent from the bundle.

    const { errors } = checkBundleContents(bundle, BUNDLED, MIXED_EXTERNAL, MIN);

    // pkg-c must be flagged
    expect(errors.some((e) => e.includes("EXTERNAL CHECK FAIL") && e.includes('"pkg-c"'))).toBe(true);
    // pkg-a and pkg-b must NOT be flagged (they are present)
    expect(errors.some((e) => e.includes('"pkg-a"'))).toBe(false);
    expect(errors.some((e) => e.includes('"pkg-b"'))).toBe(false);
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

// ── verifyBundle wrapper guard ────────────────────────────────────────────────
//
// build.ts contains a thin `verifyBundle()` wrapper that reads the built file
// and calls process.exit on failure.  If that wrapper is renamed or deleted the
// build completes without any integrity check, silently.  These tests read
// build.ts as source text and assert that the wrapper still exists and is
// called.

describe("build.ts verifyBundle wrapper guard", () => {
  const BUILD_TS_PATH = resolve(__dirname, "../../../script/build.ts");
  let buildSrc: string | null = null;
  try {
    buildSrc = readFileSync(BUILD_TS_PATH, "utf-8");
  } catch {
    // buildSrc stays null; each test will surface a clear failure below.
  }

  function requireBuildSrcForWrapper(): string {
    expect(
      buildSrc,
      `script/build.ts was not found at the expected path:\n` +
        `  ${BUILD_TS_PATH}\n` +
        `If the file was renamed or relocated, update the path in:\n` +
        `  client/src/__tests__/verify-bundle.test.tsx`,
    ).not.toBeNull();
    return buildSrc!;
  }

  it("defines a verifyBundle function — update this test if the wrapper is intentionally renamed", () => {
    const src = requireBuildSrcForWrapper();
    // Match async or sync function declaration / arrow function assignment.
    // Tolerates: `async function verifyBundle(`, `function verifyBundle(`,
    // `const verifyBundle =`, `const verifyBundle=`.
    const definitionPattern =
      /(?:async\s+function\s+verifyBundle\s*\(|function\s+verifyBundle\s*\(|const\s+verifyBundle\s*=)/;

    expect(
      definitionPattern.test(src),
      `\nCould not find a "verifyBundle" function in script/build.ts.\n\n` +
        `If the wrapper was renamed:\n` +
        `  1. Restore the name to "verifyBundle", OR\n` +
        `  2. Update the pattern in this test AND update the call-site assertion below\n` +
        `     so the renamed wrapper is still verified to be invoked.\n` +
        `\nA missing wrapper means the build completes without any bundle integrity check.\n`,
    ).toBe(true);
  });

  it("calls verifyBundle inside buildAll — renaming without updating the call site silently drops the check", () => {
    const src = requireBuildSrcForWrapper();
    // Find lines that contain `verifyBundle(` but do NOT contain `function`.
    // A function declaration always has the word "function" on the same line;
    // a call site never does.  This prevents the declaration itself from
    // satisfying the assertion, which would let a deleted call-site go undetected.
    const callSiteLines = src
      .split("\n")
      .filter(
        (line) =>
          /\bverifyBundle\s*\(/.test(line) && !/\bfunction\b/.test(line),
      );

    expect(
      callSiteLines.length,
      `\nscript/build.ts defines verifyBundle but does not appear to call it.\n\n` +
        `Expected to find at least one line like "await verifyBundle()" that is\n` +
        `NOT the function declaration (i.e. a line without the word "function").\n\n` +
        `If the call was removed or the function was renamed at the call site:\n` +
        `  1. Restore the call to "await verifyBundle()" inside buildAll(), OR\n` +
        `  2. If the wrapper was intentionally renamed, update both the definition\n` +
        `     pattern and the call pattern in client/src/__tests__/verify-bundle.test.tsx\n` +
        `\nA wrapper that is defined but never invoked provides no protection.\n`,
    ).toBeGreaterThan(0);
  });

  it("verifyBundle reads the bundle file and delegates to checkBundleContents — renaming checkBundleContents severs the check", () => {
    const src = requireBuildSrcForWrapper();
    // The verifyBundle wrapper must call checkBundleContents.  Extracting just
    // the function body is fragile, so we assert on the full file — if
    // checkBundleContents appears, the delegation is present.
    const delegationPattern = /\bcheckBundleContents\s*\(/;

    expect(
      delegationPattern.test(src),
      `\nscript/build.ts does not appear to call checkBundleContents().\n\n` +
        `The verifyBundle wrapper must delegate to checkBundleContents (from\n` +
        `server/verify-bundle-logic) to perform the actual integrity check.\n\n` +
        `If checkBundleContents was renamed:\n` +
        `  1. Update the call inside verifyBundle in script/build.ts, AND\n` +
        `  2. Rename the export in server/verify-bundle-logic.ts to match, AND\n` +
        `  3. Update the pattern in this test.\n`,
    ).toBe(true);
  });
});

// ── buildAll entry-point guard ────────────────────────────────────────────────
//
// build.ts orchestrates everything inside buildAll().  If that function is
// renamed or its bottom-level call (`buildAll().catch(...)`) is removed, none
// of the gates (tests, type-check, verifyBundle) run and the build silently
// produces output with no checks at all.  These tests read build.ts as source
// text and assert that the entry point still exists and is invoked.

describe("build.ts buildAll entry-point guard", () => {
  const BUILD_TS_PATH = resolve(__dirname, "../../../script/build.ts");
  let buildSrc: string | null = null;
  try {
    buildSrc = readFileSync(BUILD_TS_PATH, "utf-8");
  } catch {
    // buildSrc stays null; each test will surface a clear failure below.
  }

  function requireBuildSrcForEntryPoint(): string {
    expect(
      buildSrc,
      `script/build.ts was not found at the expected path:\n` +
        `  ${BUILD_TS_PATH}\n` +
        `If the file was renamed or relocated, update the path in:\n` +
        `  client/src/__tests__/verify-bundle.test.tsx`,
    ).not.toBeNull();
    return buildSrc!;
  }

  it("defines a buildAll function — update this test if the entry point is intentionally renamed", () => {
    const src = requireBuildSrcForEntryPoint();
    // Tolerates: `async function buildAll(`, `function buildAll(`,
    // `const buildAll =`, `const buildAll=`.
    const definitionPattern =
      /(?:async\s+function\s+buildAll\s*\(|function\s+buildAll\s*\(|const\s+buildAll\s*=)/;

    expect(
      definitionPattern.test(src),
      `\nCould not find a "buildAll" function in script/build.ts.\n\n` +
        `If the function was renamed:\n` +
        `  1. Restore the name to "buildAll", OR\n` +
        `  2. Update the pattern in this test AND update the call-site assertion\n` +
        `     below so the renamed function is still verified to be invoked.\n` +
        `\nA missing buildAll means no build gates (tests, type-check, bundle\n` +
        `verification) are executed — the build silently skips all checks.\n`,
    ).toBe(true);
  });

  it("invokes buildAll at the top level with .catch() — removing this call silently skips all build gates", () => {
    const src = requireBuildSrcForEntryPoint();
    // Match the canonical top-level invocation pattern.
    // Tolerates whitespace variants:
    //   buildAll().catch(...)
    //   buildAll().catch( ... )
    //   buildAll()
    //     .catch(...)
    // The pattern requires both the call and the .catch chaining so that a
    // bare `buildAll()` without error handling is also flagged.
    const invocationPattern = /\bbuildAll\s*\(\s*\)\s*\.catch\s*\(/;

    expect(
      invocationPattern.test(src),
      `\nscript/build.ts does not contain the expected top-level invocation:\n` +
        `  buildAll().catch(...)\n\n` +
        `This call is the sole entry point that triggers all build gates\n` +
        `(tests, type-check, bundle verification).  Without it the script\n` +
        `exits immediately and all checks are silently skipped.\n\n` +
        `If the invocation was removed or restructured:\n` +
        `  1. Restore "buildAll().catch((err) => { ... })" at the bottom of\n` +
        `     script/build.ts, OR\n` +
        `  2. Update this pattern to match the new invocation form AND ensure\n` +
        `     the new form still propagates unhandled errors to process.exit.\n`,
    ).toBe(true);
  });

});

// ── buildAll gate-call guard ──────────────────────────────────────────────────
//
// buildAll() derives its protection from three sequential calls:
//   1. runTests()      — abort if any test fails
//   2. runTypeCheck()  — abort if TypeScript compilation fails
//   3. verifyBundle()  — abort if the produced bundle is invalid
//
// If any of the first two are removed the build completes silently without
// that gate running.  These tests read build.ts as source text, extract the
// buildAll function body via brace-balanced scanning, and assert that all
// three gate calls appear within that specific body — not merely anywhere in
// the file.

/**
 * Extract the text of a named function body from TypeScript source.
 *
 * Locates the first occurrence of `function <name>(` (sync or async),
 * advances to the opening `{`, then walks character-by-character keeping a
 * brace depth counter to find the matching `}`.  Returns the substring from
 * the opening `{` to the closing `}` inclusive, or null when the pattern is
 * not found.
 *
 * This approach is intentionally simple and works for any well-formed TS
 * function that uses braces for its body.
 */
function extractFunctionBody(src: string, name: string): string | null {
  // Match: (async )? function name (
  const headerPattern = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\(`,
  );
  const headerMatch = headerPattern.exec(src);
  if (!headerMatch) return null;

  // Advance past the header match to find the opening brace of the body.
  let i = headerMatch.index + headerMatch[0].length;
  while (i < src.length && src[i] !== "{") i++;
  if (i >= src.length) return null;

  // Walk forward counting braces until we reach depth 0 again.
  let depth = 0;
  const start = i;
  while (i < src.length) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i++;
  }
  return null; // unbalanced braces
}

/**
 * Extract the brace-balanced body of the first `if` statement whose condition
 * matches a given regex.  The regex is tested against the source starting from
 * the beginning; when a match is found the scanner advances past it, skips to
 * the next `{`, then walks character-by-character keeping a brace depth counter
 * to find the matching `}`.  Returns the block text from `{` to `}` inclusive,
 * or null when no match is found.
 *
 * Used to isolate a specific branch (e.g. `if (result.status !== 0) { ... }`)
 * so assertions can be scoped to that branch rather than the full function body.
 */
function extractConditionBlock(src: string, conditionPattern: RegExp): string | null {
  const match = conditionPattern.exec(src);
  if (!match) return null;

  // Advance past the matched condition to the opening brace of the block.
  let i = match.index + match[0].length;
  while (i < src.length && src[i] !== "{") i++;
  if (i >= src.length) return null;

  let depth = 0;
  const start = i;
  while (i < src.length) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i++;
  }
  return null; // unbalanced braces
}

/**
 * Find all brace-balanced `try { ... }` blocks in a source string and return
 * them as an array of strings (each from the opening `{` to the matching `}`).
 * Used to assert that no try-block in a function body wraps a process.exit()
 * call, which would let a paired catch clause swallow the exit silently.
 */
function extractTryBlocks(src: string): string[] {
  const blocks: string[] = [];
  // \btry\s*\{ — the last character of every match is the opening brace.
  const tryPattern = /\btry\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = tryPattern.exec(src)) !== null) {
    const openIdx = match.index + match[0].length - 1; // position of the {
    let depth = 0;
    let i = openIdx;
    while (i < src.length) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          blocks.push(src.slice(openIdx, i + 1));
          break;
        }
      }
      i++;
    }
  }
  return blocks;
}

describe("build.ts buildAll gate-call guard — runTests and runTypeCheck", () => {
  const BUILD_TS_PATH = resolve(__dirname, "../../../script/build.ts");
  let buildSrc: string | null = null;
  try {
    buildSrc = readFileSync(BUILD_TS_PATH, "utf-8");
  } catch {
    // buildSrc stays null; each test will surface a clear failure below.
  }

  function requireBuildSrcForGates(): string {
    expect(
      buildSrc,
      `script/build.ts was not found at the expected path:\n` +
        `  ${BUILD_TS_PATH}\n` +
        `If the file was renamed or relocated, update the path in:\n` +
        `  client/src/__tests__/verify-bundle.test.tsx`,
    ).not.toBeNull();
    return buildSrc!;
  }

  /** Return the brace-balanced body of buildAll, or fail with a clear message. */
  function requireBuildAllBody(src: string): string {
    const body = extractFunctionBody(src, "buildAll");
    expect(
      body,
      `\nCould not extract the body of "buildAll" from script/build.ts.\n\n` +
        `The extractor looks for "function buildAll(" or "async function buildAll("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. The "extractFunctionBody" call in the gate-call guard describe block\n` +
        `  2. The definition guard pattern in the buildAll entry-point guard describe block\n`,
    ).not.toBeNull();
    return body!;
  }

  it("defines a runTests function — removing this definition silently skips the test gate", () => {
    const src = requireBuildSrcForGates();
    const definitionPattern =
      /(?:async\s+function\s+runTests\s*\(|function\s+runTests\s*\(|const\s+runTests\s*=)/;

    expect(
      definitionPattern.test(src),
      `\nCould not find a "runTests" function in script/build.ts.\n\n` +
        `If the function was renamed:\n` +
        `  1. Restore the name to "runTests", OR\n` +
        `  2. Update the definition pattern in this test AND update the\n` +
        `     call-site assertion below so the renamed gate is still verified\n` +
        `     to be invoked from buildAll.\n` +
        `\nA missing runTests definition means the test gate is completely absent\n` +
        `and the build will succeed even when tests are failing.\n`,
    ).toBe(true);
  });

  it("calls runTests inside the buildAll body — removing this call silently skips the test gate", () => {
    const src = requireBuildSrcForGates();
    const body = requireBuildAllBody(src);

    // Within the buildAll body, any line containing `runTests(` that does not
    // also contain the word "function" is a call site.  Declaration lines
    // always contain "function"; call-site lines never do.
    const callSiteLines = body
      .split("\n")
      .filter(
        (line) =>
          /\brunTests\s*\(/.test(line) && !/\bfunction\b/.test(line),
      );

    expect(
      callSiteLines.length,
      `\nscript/build.ts does not call runTests() inside the buildAll function body.\n\n` +
        `Expected to find at least one line like "await runTests()" within the\n` +
        `brace-balanced body of buildAll — not elsewhere in the file.\n\n` +
        `If the call was removed:\n` +
        `  1. Restore "await runTests()" inside buildAll(), OR\n` +
        `  2. If the gate was intentionally renamed, update both the definition\n` +
        `     pattern and this call pattern in client/src/__tests__/verify-bundle.test.tsx\n` +
        `\nA gate defined outside buildAll but never called from inside it provides\n` +
        `no protection — the build can complete without running tests.\n`,
    ).toBeGreaterThan(0);
  });

  it("defines a runTypeCheck function — removing this definition silently skips the type-check gate", () => {
    const src = requireBuildSrcForGates();
    const definitionPattern =
      /(?:async\s+function\s+runTypeCheck\s*\(|function\s+runTypeCheck\s*\(|const\s+runTypeCheck\s*=)/;

    expect(
      definitionPattern.test(src),
      `\nCould not find a "runTypeCheck" function in script/build.ts.\n\n` +
        `If the function was renamed:\n` +
        `  1. Restore the name to "runTypeCheck", OR\n` +
        `  2. Update the definition pattern in this test AND update the\n` +
        `     call-site assertion below so the renamed gate is still verified\n` +
        `     to be invoked from buildAll.\n` +
        `\nA missing runTypeCheck definition means TypeScript errors will not\n` +
        `abort the build — broken types ship silently.\n`,
    ).toBe(true);
  });

  it("calls runTypeCheck inside the buildAll body — removing this call silently skips the type-check gate", () => {
    const src = requireBuildSrcForGates();
    const body = requireBuildAllBody(src);

    const callSiteLines = body
      .split("\n")
      .filter(
        (line) =>
          /\brunTypeCheck\s*\(/.test(line) && !/\bfunction\b/.test(line),
      );

    expect(
      callSiteLines.length,
      `\nscript/build.ts does not call runTypeCheck() inside the buildAll function body.\n\n` +
        `Expected to find at least one line like "await runTypeCheck()" within the\n` +
        `brace-balanced body of buildAll — not elsewhere in the file.\n\n` +
        `If the call was removed:\n` +
        `  1. Restore "await runTypeCheck()" inside buildAll(), OR\n` +
        `  2. If the gate was intentionally renamed, update both the definition\n` +
        `     pattern and this call pattern in client/src/__tests__/verify-bundle.test.tsx\n` +
        `\nA gate defined outside buildAll but never called from inside it provides\n` +
        `no protection — TypeScript errors will not abort the build.\n`,
    ).toBeGreaterThan(0);
  });

  it("calls verifyBundle inside the buildAll body — removing this call silently skips the bundle integrity check", () => {
    const src = requireBuildSrcForGates();
    const body = requireBuildAllBody(src);

    const callSiteLines = body
      .split("\n")
      .filter(
        (line) =>
          /\bverifyBundle\s*\(/.test(line) && !/\bfunction\b/.test(line),
      );

    expect(
      callSiteLines.length,
      `\nscript/build.ts does not call verifyBundle() inside the buildAll function body.\n\n` +
        `Expected to find at least one line like "await verifyBundle()" within the\n` +
        `brace-balanced body of buildAll — not elsewhere in the file.\n\n` +
        `If the call was removed:\n` +
        `  1. Restore "await verifyBundle()" inside buildAll(), OR\n` +
        `  2. If the wrapper was intentionally renamed, update both the definition\n` +
        `     pattern (in the verifyBundle wrapper guard) and this call pattern\n` +
        `     in client/src/__tests__/verify-bundle.test.tsx\n` +
        `\nA bundle integrity check that is never invoked from buildAll provides\n` +
        `no protection — a corrupt or oversized bundle will ship silently.\n`,
    ).toBeGreaterThan(0);
  });
});

// ── process.exit guard for runTests and runTypeCheck ─────────────────────────
//
// runTests() and runTypeCheck() each spawn a subprocess and check the exit
// status.  On a non-zero status they must call process.exit so the build
// aborts immediately.  If someone replaces the exit call with a console.warn
// or simply removes it, the build continues silently past a failing gate.
//
// These tests read build.ts as source text, extract each function body via the
// shared brace-balanced scanner, and assert that process.exit appears within
// that specific body — not merely somewhere else in the file.

describe("build.ts process.exit guard — runTests and runTypeCheck abort on failure", () => {
  const BUILD_TS_PATH = resolve(__dirname, "../../../script/build.ts");
  let buildSrc: string | null = null;
  try {
    buildSrc = readFileSync(BUILD_TS_PATH, "utf-8");
  } catch {
    // buildSrc stays null; each test will surface a clear failure below.
  }

  function requireBuildSrcForExitGuard(): string {
    expect(
      buildSrc,
      `script/build.ts was not found at the expected path:\n` +
        `  ${BUILD_TS_PATH}\n` +
        `If the file was renamed or relocated, update the path in:\n` +
        `  client/src/__tests__/verify-bundle.test.tsx`,
    ).not.toBeNull();
    return buildSrc!;
  }

  /**
   * The pattern that identifies the non-zero status branch inside each gate
   * function.  It matches `if (result.status !== 0)` tolerating whitespace
   * variants.  The closing `)` is included so `extractConditionBlock` can scan
   * forward to find the opening `{` of the block.
   */
  const NON_ZERO_BRANCH_PATTERN =
    /if\s*\(\s*result\s*\.\s*status\s*!==?\s*0\s*\)/;

  /**
   * Strip lines that are pure single-line comments (`// …`) so that
   * `process.exit` appearing only in a commented-out line does not satisfy
   * the assertion.
   */
  function stripLineComments(src: string): string {
    return src
      .split("\n")
      .filter((line) => !/^\s*\/\//.test(line))
      .join("\n");
  }

  it("runTests contains a process.exit call inside the result.status !== 0 branch — removing it lets a failing test suite continue the build silently", () => {
    const src = requireBuildSrcForExitGuard();

    // Step 1: isolate the runTests function body.
    const body = extractFunctionBody(src, "runTests");
    expect(
      body,
      `\nCould not extract the body of "runTests" from script/build.ts.\n\n` +
        `The extractor looks for "function runTests(" or "async function runTests("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the gate-call guard describe block\n`,
    ).not.toBeNull();

    // Step 2: within that body, isolate the if (result.status !== 0) { ... } block.
    const nonZeroBlock = extractConditionBlock(body!, NON_ZERO_BRANCH_PATTERN);
    expect(
      nonZeroBlock,
      `\n"runTests" in script/build.ts does not contain an\n` +
        `  if (result.status !== 0) { ... }\n` +
        `branch that the extractor can find.\n\n` +
        `The test looks for the pattern:\n` +
        `  if ( result.status !== 0 )  (whitespace-tolerant)\n` +
        `followed by a brace-balanced block.  If the condition was rewritten\n` +
        `(e.g. to result.status != 0, result.status > 0, or status !== 0)\n` +
        `update NON_ZERO_BRANCH_PATTERN in this test to match the new form.\n`,
    ).not.toBeNull();

    // Step 3: assert process.exit appears as executable code — not only in
    // single-line comments — within that specific branch block.
    const executableBranchSrc = stripLineComments(nonZeroBlock!);
    expect(
      /\bprocess\.exit\s*\(/.test(executableBranchSrc),
      `\nThe non-zero status branch of "runTests" in script/build.ts does not\n` +
        `call process.exit().\n\n` +
        `When the spawned test command exits with a non-zero status the build\n` +
        `must abort immediately.  Without process.exit the build continues\n` +
        `silently even when tests are failing.\n\n` +
        `To fix:\n` +
        `  1. Restore the process.exit call inside the non-zero branch:\n` +
        `       if (result.status !== 0) {\n` +
        `         console.error("tests failed — aborting build");\n` +
        `         process.exit(result.status ?? 1);\n` +
        `       }\n` +
        `  2. Do not replace process.exit with console.warn or a thrown error\n` +
        `     that is subsequently caught — both allow the build to continue.\n` +
        `  3. Do not leave process.exit only in a comment — commented-out calls\n` +
        `     are filtered out by this test.\n`,
    ).toBe(true);
  });

  it("verifyBundle contains a process.exit call — removing it lets a corrupt or undersized bundle ship without aborting the build", () => {
    const src = requireBuildSrcForExitGuard();

    // Extract the brace-balanced body of verifyBundle so the assertion is
    // scoped to that function and not to process.exit calls elsewhere in the file.
    const body = extractFunctionBody(src, "verifyBundle");
    expect(
      body,
      `\nCould not extract the body of "verifyBundle" from script/build.ts.\n\n` +
        `The extractor looks for "function verifyBundle(" or "async function verifyBundle("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the verifyBundle wrapper guard describe block\n`,
    ).not.toBeNull();

    // Assert process.exit appears as executable code — not only in single-line
    // comments — within the verifyBundle body.
    const executableBody = stripLineComments(body!);
    expect(
      /\bprocess\.exit\s*\(/.test(executableBody),
      `\n"verifyBundle" in script/build.ts does not contain a process.exit() call.\n\n` +
        `When bundle verification fails (corrupt bundle, wrong size, missing externals,\n` +
        `or the bundle file does not exist) the build must abort immediately.\n` +
        `Without process.exit the build completes silently and a corrupt or\n` +
        `undersized bundle is deployed.\n\n` +
        `To fix:\n` +
        `  1. Restore process.exit(1) inside each failure branch of verifyBundle:\n` +
        `       if (!existsSync(bundlePath)) {\n` +
        `         console.error("bundle verification failed — ...");\n` +
        `         process.exit(1);\n` +
        `       }\n` +
        `       if (errors.length > 0) {\n` +
        `         ...\n` +
        `         process.exit(1);\n` +
        `       }\n` +
        `  2. Do not replace process.exit with console.warn or a thrown error\n` +
        `     that is subsequently caught — both allow the build to continue.\n` +
        `  3. Do not leave process.exit only in a comment — commented-out calls\n` +
        `     are filtered out by this test.\n`,
    ).toBe(true);
  });

  it("verifyBundle file-existence branch contains process.exit — removing existsSync guard lets a missing bundle be silently ignored", () => {
    const src = requireBuildSrcForExitGuard();

    // Step 1: isolate the verifyBundle function body.
    const body = extractFunctionBody(src, "verifyBundle");
    expect(
      body,
      `\nCould not extract the body of "verifyBundle" from script/build.ts.\n\n` +
        `The extractor looks for "function verifyBundle(" or "async function verifyBundle("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the verifyBundle wrapper guard describe block\n`,
    ).not.toBeNull();

    // Step 2: within that body, isolate the if (!existsSync(...)) { ... } block.
    const existsSyncBranchPattern = /if\s*\(\s*!\s*existsSync\s*\(/;
    const existsSyncBlock = extractConditionBlock(body!, existsSyncBranchPattern);
    expect(
      existsSyncBlock,
      `\n"verifyBundle" in script/build.ts does not contain an\n` +
        `  if (!existsSync(...)) { ... }\n` +
        `branch that the extractor can find.\n\n` +
        `The test looks for the pattern:\n` +
        `  if ( !existsSync(  (whitespace-tolerant)\n` +
        `followed by a brace-balanced block.  If the condition was rewritten\n` +
        `(e.g. to a try/catch or a separate helper), update the pattern in\n` +
        `this test to match the new form.\n\n` +
        `Without this guard a missing bundle file is silently ignored — the\n` +
        `build reports success even though no bundle was produced.\n`,
    ).not.toBeNull();

    // Step 3: assert process.exit appears as executable code — not only in
    // single-line comments — within that specific branch block.
    const executableExistsSyncBlock = stripLineComments(existsSyncBlock!);
    expect(
      /\bprocess\.exit\s*\(/.test(executableExistsSyncBlock),
      `\nThe file-existence branch of "verifyBundle" in script/build.ts does not\n` +
        `call process.exit().\n\n` +
        `When the bundle file does not exist the build must abort immediately.\n` +
        `Without process.exit the build continues silently and no bundle is deployed.\n\n` +
        `To fix:\n` +
        `  1. Restore the process.exit call inside the !existsSync branch:\n` +
        `       if (!existsSync(bundlePath)) {\n` +
        `         console.error("bundle verification failed — ...");\n` +
        `         process.exit(1);\n` +
        `       }\n` +
        `  2. Do not replace process.exit with console.warn or a thrown error\n` +
        `     that is subsequently caught — both allow the build to continue.\n` +
        `  3. Do not leave process.exit only in a comment — commented-out calls\n` +
        `     are filtered out by this test.\n`,
    ).toBe(true);
  });

  it("verifyBundle errors branch contains process.exit — removing it lets a corrupt or invalid bundle ship without aborting the build", () => {
    const src = requireBuildSrcForExitGuard();

    // Step 1: isolate the verifyBundle function body.
    const body = extractFunctionBody(src, "verifyBundle");
    expect(
      body,
      `\nCould not extract the body of "verifyBundle" from script/build.ts.\n\n` +
        `The extractor looks for "function verifyBundle(" or "async function verifyBundle("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the verifyBundle wrapper guard describe block\n`,
    ).not.toBeNull();

    // Step 2: within that body, isolate the if (errors.length > 0) { ... } block.
    const errorsLengthBranchPattern = /if\s*\(\s*errors\s*\.\s*length\s*>\s*0\s*\)/;
    const errorsLengthBlock = extractConditionBlock(body!, errorsLengthBranchPattern);
    expect(
      errorsLengthBlock,
      `\n"verifyBundle" in script/build.ts does not contain an\n` +
        `  if (errors.length > 0) { ... }\n` +
        `branch that the extractor can find.\n\n` +
        `The test looks for the pattern:\n` +
        `  if ( errors.length > 0 )  (whitespace-tolerant)\n` +
        `followed by a brace-balanced block.  If the condition was rewritten\n` +
        `(e.g. to errors.length !== 0, errors.length >= 1, or checking a boolean)\n` +
        `update the pattern in this test to match the new form.\n\n` +
        `Without this guard a bundle that fails content checks is silently\n` +
        `accepted — the build reports success even though the bundle is invalid.\n`,
    ).not.toBeNull();

    // Step 3: assert process.exit appears as executable code — not only in
    // single-line comments — within that specific branch block.
    const executableErrorsBlock = stripLineComments(errorsLengthBlock!);
    expect(
      /\bprocess\.exit\s*\(/.test(executableErrorsBlock),
      `\nThe errors branch of "verifyBundle" in script/build.ts does not\n` +
        `call process.exit().\n\n` +
        `When checkBundleContents returns errors the build must abort immediately.\n` +
        `Without process.exit the build continues silently and an invalid bundle\n` +
        `(wrong size, leaked bundled packages, missing externals) is deployed.\n\n` +
        `To fix:\n` +
        `  1. Restore the process.exit call inside the errors.length > 0 branch:\n` +
        `       if (errors.length > 0) {\n` +
        `         console.error("bundle verification failed:");\n` +
        `         for (const err of errors) console.error(\`  \${err}\`);\n` +
        `         process.exit(1);\n` +
        `       }\n` +
        `  2. Do not replace process.exit with console.warn or a thrown error\n` +
        `     that is subsequently caught — both allow the build to continue.\n` +
        `  3. Do not leave process.exit only in a comment — commented-out calls\n` +
        `     are filtered out by this test.\n`,
    ).toBe(true);
  });

  it("verifyBundle failure branches are not wrapped in try/catch — a surrounding catch could swallow process.exit and let the build continue silently", () => {
    const src = requireBuildSrcForExitGuard();

    // Step 1: isolate the verifyBundle function body.
    const body = extractFunctionBody(src, "verifyBundle");
    expect(
      body,
      `\nCould not extract the body of "verifyBundle" from script/build.ts.\n\n` +
        `The extractor looks for "function verifyBundle(" or "async function verifyBundle("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the verifyBundle wrapper guard describe block\n`,
    ).not.toBeNull();

    // Step 2: strip line comments so commented-out try/catch blocks do not
    // produce false positives.
    const executableBody = stripLineComments(body!);

    // Step 3: collect every try { ... } block within the verifyBundle body.
    // If any try-block contains process.exit(), the paired catch clause could
    // intercept the exit signal and allow the build to continue silently even
    // when bundle verification has failed.
    const tryBlocks = extractTryBlocks(executableBody);
    for (const tryBlock of tryBlocks) {
      expect(
        /\bprocess\.exit\s*\(/.test(tryBlock),
        `\nA try { ... } block inside "verifyBundle" in script/build.ts contains\n` +
          `a process.exit() call.\n\n` +
          `A try/catch wrapped around process.exit() can intercept the exit signal\n` +
          `and allow the build to continue silently even when bundle verification\n` +
          `fails — which means a corrupt or invalid bundle may be deployed.\n\n` +
          `To fix:\n` +
          `  1. Move process.exit() calls outside of any try/catch block:\n` +
          `       if (!existsSync(bundlePath)) {\n` +
          `         console.error("bundle verification failed — ...");\n` +
          `         process.exit(1);   // must be at top level inside verifyBundle\n` +
          `       }\n` +
          `       if (errors.length > 0) {\n` +
          `         ...\n` +
          `         process.exit(1);   // must be at top level inside verifyBundle\n` +
          `       }\n` +
          `  2. If readFile error handling is needed, catch it in a wrapper that\n` +
          `     calls process.exit() outside the try block, or re-throw after\n` +
          `     logging so the unhandled-rejection handler exits the process.\n`,
      ).toBe(false);
    }
  });

  it("runTypeCheck contains a process.exit call inside the result.status !== 0 branch — removing it lets broken TypeScript ship silently", () => {
    const src = requireBuildSrcForExitGuard();

    // Step 1: isolate the runTypeCheck function body.
    const body = extractFunctionBody(src, "runTypeCheck");
    expect(
      body,
      `\nCould not extract the body of "runTypeCheck" from script/build.ts.\n\n` +
        `The extractor looks for "function runTypeCheck(" or "async function runTypeCheck("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the gate-call guard describe block\n`,
    ).not.toBeNull();

    // Step 2: within that body, isolate the if (result.status !== 0) { ... } block.
    const nonZeroBlock = extractConditionBlock(body!, NON_ZERO_BRANCH_PATTERN);
    expect(
      nonZeroBlock,
      `\n"runTypeCheck" in script/build.ts does not contain an\n` +
        `  if (result.status !== 0) { ... }\n` +
        `branch that the extractor can find.\n\n` +
        `The test looks for the pattern:\n` +
        `  if ( result.status !== 0 )  (whitespace-tolerant)\n` +
        `followed by a brace-balanced block.  If the condition was rewritten\n` +
        `(e.g. to result.status != 0, result.status > 0, or status !== 0)\n` +
        `update NON_ZERO_BRANCH_PATTERN in this test to match the new form.\n`,
    ).not.toBeNull();

    // Step 3: assert process.exit appears as executable code — not only in
    // single-line comments — within that specific branch block.
    const executableBranchSrc = stripLineComments(nonZeroBlock!);
    expect(
      /\bprocess\.exit\s*\(/.test(executableBranchSrc),
      `\nThe non-zero status branch of "runTypeCheck" in script/build.ts does not\n` +
        `call process.exit().\n\n` +
        `When the spawned tsc command exits with a non-zero status the build\n` +
        `must abort immediately.  Without process.exit the build continues\n` +
        `silently even when TypeScript compilation is failing.\n\n` +
        `To fix:\n` +
        `  1. Restore the process.exit call inside the non-zero branch:\n` +
        `       if (result.status !== 0) {\n` +
        `         console.error("type check failed — aborting build");\n` +
        `         process.exit(result.status ?? 1);\n` +
        `       }\n` +
        `  2. Do not replace process.exit with console.warn or a thrown error\n` +
        `     that is subsequently caught — both allow the build to continue.\n` +
        `  3. Do not leave process.exit only in a comment — commented-out calls\n` +
        `     are filtered out by this test.\n`,
    ).toBe(true);
  });
});

// ── outfile / bundlePath alignment guard ─────────────────────────────────────
//
// verifyBundle must read the same path that esbuild writes.  If the two drift,
// verifyBundle always hits the !existsSync branch and exits even though the
// build itself succeeded — and there is no error pointing at the mismatch.
//
// The guard is enforced by deriving both values from a single shared constant
// (BUNDLE_OUT) declared at module level in build.ts.  These tests verify:
//
//   1. BUNDLE_OUT exists at module level as a string literal.
//   2. The esbuild outfile property in buildAll references BUNDLE_OUT (not a
//      separate literal that could drift from the constant).
//   3. The bundlePath variable in verifyBundle is assigned BUNDLE_OUT (not a
//      separate literal that could drift from the constant).
//
// If outfile or bundlePath are ever refactored back to independent string
// literals the mismatch hazard reappears — these tests will catch that too,
// because steps 2 and 3 require the identifier BUNDLE_OUT, not a quote.
//
// If outfile is passed via a *different* identifier the test in step 2 will
// fail with a clear message naming BUNDLE_OUT, which is far easier to diagnose
// than a silent path mismatch at runtime.

describe("build.ts outfile / bundlePath alignment guard", () => {
  const BUILD_TS_PATH = resolve(__dirname, "../../../script/build.ts");
  let buildSrc: string | null = null;
  try {
    buildSrc = readFileSync(BUILD_TS_PATH, "utf-8");
  } catch {
    // buildSrc stays null; each test surfaces a clear failure below.
  }

  function requireBuildSrcForAlignment(): string {
    expect(
      buildSrc,
      `script/build.ts was not found at the expected path:\n` +
        `  ${BUILD_TS_PATH}\n` +
        `If the file was renamed or relocated, update the path in:\n` +
        `  client/src/__tests__/verify-bundle.test.tsx`,
    ).not.toBeNull();
    return buildSrc!;
  }

  it("declares BUNDLE_OUT as a module-level string-literal constant — this is the single source of truth for the bundle output path", () => {
    const src = requireBuildSrcForAlignment();

    // Match the canonical declaration.  The constant must be a string literal
    // at module level (outside any function) so both buildAll and verifyBundle
    // can reference it.  Whitespace variants around = are tolerated.
    const declarationPattern =
      /^const\s+BUNDLE_OUT\s*=\s*["']([^"']+)["']\s*;/m;

    expect(
      declarationPattern.test(src),
      `\nCould not find a module-level "BUNDLE_OUT" string constant in script/build.ts.\n\n` +
        `The alignment guard requires a single declaration of the form:\n` +
        `  const BUNDLE_OUT = "dist/index.cjs";\n` +
        `at module level (outside any function) so both buildAll (esbuild outfile)\n` +
        `and verifyBundle (bundlePath) can reference the same identifier.\n\n` +
        `If the constant was renamed:\n` +
        `  1. Restore the name to "BUNDLE_OUT", OR\n` +
        `  2. Update the constant name in all three places: the declaration, the\n` +
        `     outfile property in buildAll, the bundlePath assignment in verifyBundle,\n` +
        `     AND in this test.\n` +
        `\nWithout a shared constant both sites carry independent string literals\n` +
        `that can drift without any test catching the mismatch.\n`,
    ).toBe(true);
  });

  it("esbuild outfile in buildAll references BUNDLE_OUT — using a separate literal here could silently diverge from verifyBundle", () => {
    const src = requireBuildSrcForAlignment();

    const buildAllBody = extractFunctionBody(src, "buildAll");
    expect(
      buildAllBody,
      `\nCould not extract the body of "buildAll" from script/build.ts.\n\n` +
        `The extractor looks for "function buildAll(" or "async function buildAll("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the buildAll entry-point guard describe block\n`,
    ).not.toBeNull();

    // The outfile property must reference the shared BUNDLE_OUT identifier —
    // not a string literal.  A string literal here can drift from the constant.
    // Pattern: outfile: BUNDLE_OUT  (tolerates whitespace around the colon)
    const outfileIdentifierPattern = /\boutfile\s*:\s*BUNDLE_OUT\b/;

    expect(
      outfileIdentifierPattern.test(buildAllBody!),
      `\nThe esbuild "outfile" property in buildAll does not reference BUNDLE_OUT.\n\n` +
        `Expected to find:\n` +
        `  outfile: BUNDLE_OUT,\n` +
        `within the brace-balanced body of buildAll.\n\n` +
        `If the outfile was set to an independent string literal (e.g. outfile: "dist/index.cjs"),\n` +
        `it can silently diverge from the value in verifyBundle.  Use the shared\n` +
        `constant instead:\n` +
        `  outfile: BUNDLE_OUT,\n` +
        `\nIf the constant was intentionally renamed, update BUNDLE_OUT to the new\n` +
        `name here AND in the declaration test above.\n`,
    ).toBe(true);
  });

  it("bundlePath in verifyBundle is assigned BUNDLE_OUT — using a separate literal here could silently diverge from the esbuild outfile", () => {
    const src = requireBuildSrcForAlignment();

    const verifyBundleBody = extractFunctionBody(src, "verifyBundle");
    expect(
      verifyBundleBody,
      `\nCould not extract the body of "verifyBundle" from script/build.ts.\n\n` +
        `The extractor looks for "function verifyBundle(" or "async function verifyBundle("\n` +
        `followed by a brace-balanced body.  If the function was renamed or\n` +
        `restructured (e.g. converted to an arrow function), update:\n` +
        `  1. This test's extractFunctionBody call\n` +
        `  2. The definition guard pattern in the verifyBundle wrapper guard describe block\n`,
    ).not.toBeNull();

    // The bundlePath assignment must reference BUNDLE_OUT — not a string literal.
    // Pattern: const bundlePath = BUNDLE_OUT  (tolerates whitespace around =)
    const bundlePathIdentifierPattern = /\bconst\s+bundlePath\s*=\s*BUNDLE_OUT\b/;

    expect(
      bundlePathIdentifierPattern.test(verifyBundleBody!),
      `\nThe "bundlePath" assignment in verifyBundle does not reference BUNDLE_OUT.\n\n` +
        `Expected to find:\n` +
        `  const bundlePath = BUNDLE_OUT;\n` +
        `within the brace-balanced body of verifyBundle.\n\n` +
        `If bundlePath was set to an independent string literal\n` +
        `(e.g. const bundlePath = "dist/index.cjs"), it can silently diverge from\n` +
        `the esbuild outfile.  Use the shared constant instead:\n` +
        `  const bundlePath = BUNDLE_OUT;\n` +
        `\nIf the constant was intentionally renamed, update BUNDLE_OUT to the new\n` +
        `name here AND in the declaration test above.\n`,
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
