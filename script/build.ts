import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import {
  bundledPackages,
  externalPackages,
  MIN_BUNDLE_BYTES,
  checkBundleContents,
} from "../server/verify-bundle-logic.js";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [...bundledPackages];

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

async function verifyBundle() {
  const bundlePath = "dist/index.cjs";
  if (!existsSync(bundlePath)) {
    console.error(`bundle verification failed — ${bundlePath} does not exist`);
    process.exit(1);
  }

  console.log("verifying bundle...");
  const bundle = await readFile(bundlePath, "utf-8");
  const { errors } = checkBundleContents(bundle);

  if (errors.length > 0) {
    console.error("bundle verification failed:");
    for (const err of errors) console.error(`  ${err}`);
    process.exit(1);
  }

  console.log(
    `bundle verification passed — size ${bundle.length} bytes, ` +
      `${bundledPackages.length} bundled checks OK, ${externalPackages.length} external checks OK.`,
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
