import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawnSync } from "child_process";
import { existsSync } from "fs";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
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

async function runTests() {
  console.log("running tests...");
  const result = spawnSync("npx", ["vitest", "run"], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("tests failed — aborting build");
    process.exit(result.status ?? 1);
  }
  console.log("tests passed.");
}

async function runTypeCheck() {
  console.log("running type check...");
  const result = spawnSync("npx", ["tsc", "--noEmit"], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("type check failed — aborting build");
    process.exit(result.status ?? 1);
  }
  console.log("type check passed.");
}

// Packages that must NOT appear as require() calls in the bundle — they are inlined.
// This list mirrors `allowlist` above; the smoke-test enforces they stay in sync.
const bundledPackages = allowlist;

// Packages that MUST appear as require() calls — they are intentionally external.
// These are server-side packages that are definitely imported and deliberately
// excluded from the allowlist so that native bindings / large trees stay external.
// Use the exact specifier that the server source imports (e.g. "dotenv/config",
// not bare "dotenv", because that is what esbuild writes into the require() call).
const externalPackages = [
  "@libsql/client",  // server/storage.ts: import { createClient } from "@libsql/client"
  "dotenv/config",   // server/index.ts: import "dotenv/config"
];

// Minimum bundle size (bytes) that proves at least some packages were inlined.
// With the current allowlist (openai, drizzle-orm, express, …) the minified
// bundle comfortably exceeds 1 MB. A tiny bundle (~KB) is a red flag that
// everything was accidentally externalised.
const MIN_BUNDLE_BYTES = 500_000;

async function verifyBundle() {
  const bundlePath = "dist/index.cjs";
  if (!existsSync(bundlePath)) {
    console.error(`bundle verification failed — ${bundlePath} does not exist`);
    process.exit(1);
  }

  console.log("verifying bundle...");
  const bundle = await readFile(bundlePath, "utf-8");
  const errors: string[] = [];

  // ── Positive inlining check ────────────────────────────────────────────────
  // If known-bundled packages (openai, drizzle-orm, express …) were actually
  // inlined the bundle must be substantially large. A suspiciously small file
  // means the allowlist stopped working.
  if (bundle.length < MIN_BUNDLE_BYTES) {
    errors.push(
      `SIZE CHECK FAIL: bundle is only ${bundle.length} bytes — expected > ${MIN_BUNDLE_BYTES}. ` +
        `Allowlist packages may have been accidentally externalised.`
    );
  }

  // ── "Not required" checks for bundled packages ────────────────────────────
  // esbuild emits require("pkg") (double quotes) for externals.
  // Accept either quote style defensively.
  const isRequired = (pkg: string) =>
    bundle.includes(`require("${pkg}")`) ||
    bundle.includes(`require('${pkg}')`);

  for (const pkg of bundledPackages) {
    if (isRequired(pkg)) {
      errors.push(
        `BUNDLED CHECK FAIL: "${pkg}" is in the allowlist but still appears as require("${pkg}") — it was not inlined`
      );
    }
  }

  // ── "Is required" checks for external packages ───────────────────────────
  for (const pkg of externalPackages) {
    if (!isRequired(pkg)) {
      errors.push(
        `EXTERNAL CHECK FAIL: "${pkg}" is expected to be external but does not appear as require("${pkg}") in the bundle`
      );
    }
  }

  if (errors.length > 0) {
    console.error("bundle verification failed:");
    for (const err of errors) console.error(`  ${err}`);
    process.exit(1);
  }

  console.log(
    `bundle verification passed — size ${bundle.length} bytes, ` +
      `${bundledPackages.length} bundled checks OK, ${externalPackages.length} external checks OK.`
  );
}

async function buildAll() {
  await runTests();
  await runTypeCheck();

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  await verifyBundle();
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
