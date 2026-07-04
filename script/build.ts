import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawnSync } from "child_process";

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
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
