/**
 * Pure bundle-verification logic — no filesystem access, no process.exit.
 *
 * Extracted so unit tests can exercise the checks against synthetic bundle
 * strings without running a real build.  `verifyBundle()` in build.ts is the
 * thin wrapper that reads the file and calls process.exit on failure.
 */

// Packages that must NOT appear as require() calls — they are inlined by esbuild.
export const bundledPackages: readonly string[] = [
  "@notionhq/client",
  "adm-zip",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-session",
  "memorystore",
  "openai",
  "passport",
  "passport-local",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

// Packages that MUST appear as require() calls — deliberately external.
export const externalPackages: readonly string[] = [
  "@libsql/client",
  "dotenv/config",
];

// Minimum bundle size (bytes) that proves at least some packages were inlined.
export const MIN_BUNDLE_BYTES = 500_000;

export interface BundleCheckResult {
  errors: string[];
}

/**
 * Inspect a bundle string and return every constraint violation found.
 *
 * @param bundle      - Full text of the built bundle (dist/index.cjs).
 * @param bundled     - Packages that must NOT appear as require() calls.
 * @param external    - Packages that MUST appear as require() calls.
 * @param minBytes    - Minimum acceptable bundle size in bytes.
 */
export function checkBundleContents(
  bundle: string,
  bundled: readonly string[] = bundledPackages,
  external: readonly string[] = externalPackages,
  minBytes: number = MIN_BUNDLE_BYTES,
): BundleCheckResult {
  const errors: string[] = [];

  // ── Size check ────────────────────────────────────────────────────────────
  if (bundle.length < minBytes) {
    errors.push(
      `SIZE CHECK FAIL: bundle is only ${bundle.length} bytes — expected > ${minBytes}. ` +
        `Allowlist packages may have been accidentally externalised.`,
    );
  }

  // ── "Must NOT be required" checks for bundled packages ───────────────────
  //
  // Match require("pkg"), require('pkg'), and whitespace-padded variants such
  // as require( "pkg" ) that some bundlers or hand-edited bundles may emit.
  // The package name is regex-escaped so scoped names like @scope/pkg work.
  const isRequired = (pkg: string) => {
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`require\\(\\s*["']${escaped}["']\\s*\\)`).test(bundle);
  };

  for (const pkg of bundled) {
    if (isRequired(pkg)) {
      errors.push(
        `BUNDLED CHECK FAIL: "${pkg}" is in the allowlist but still appears as require("${pkg}") — it was not inlined`,
      );
    }
  }

  // ── "Must be required" checks for external packages ──────────────────────
  for (const pkg of external) {
    if (!isRequired(pkg)) {
      errors.push(
        `EXTERNAL CHECK FAIL: "${pkg}" is expected to be external but does not appear as require("${pkg}") in the bundle`,
      );
    }
  }

  return { errors };
}
