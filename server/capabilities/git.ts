import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import type { CapabilityDefinition, CapabilityContext } from "./index";

const execAsync = promisify(exec);

const MAX_OUTPUT = 12000;

function trim(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n…[output truncated]" : s;
}

function resolveWorkdir(ctx: CapabilityContext, relativePath?: unknown): string {
  const base = ctx.rootFolder ?? process.cwd();
  if (!relativePath || typeof relativePath !== "string") return base;
  const resolved = path.resolve(base, relativePath);
  if (!resolved.startsWith(path.resolve(base))) throw new Error("Path is outside root folder");
  return resolved;
}

async function runGit(args: string, cwd: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args}`, { cwd, timeout: 15000 });
    const out = stdout.trim();
    const err = stderr.trim();
    if (!out && err) throw new Error(err);
    return trim(out || "(no output)");
  } catch (e: any) {
    const msg: string = e.stderr ?? e.stdout ?? e.message ?? String(e);
    throw new Error(msg.trim());
  }
}

export const gitCapabilities: CapabilityDefinition[] = [
  {
    name: "git_log",
    description: "Show recent git commits for a repository. Returns a concise one-line-per-commit log with hash, author, date, and message. Use this to understand what has changed and when.",
    argsSchema: {
      path: { type: "string", description: "Relative path (from root folder) to the git repository. Defaults to root folder.", required: false },
      limit: { type: "number", description: "Max number of commits to return (default 20, max 50).", required: false },
      branch: { type: "string", description: "Branch or ref to show log for (default: current branch).", required: false },
    },
    handler: async (args, ctx: CapabilityContext) => {
      const cwd = resolveWorkdir(ctx, args.path);
      const n = Math.min(Number(args.limit) || 20, 50);
      const branch = typeof args.branch === "string" ? args.branch : "HEAD";
      const log = await runGit(`log ${branch} --oneline --graph --decorate -${n} --format="%h %ad %an — %s" --date=short`, cwd);
      return { log, cwd };
    },
  },

  {
    name: "git_show",
    description: "Show the full diff and metadata for a specific commit. Use this to read exactly what changed in a commit.",
    argsSchema: {
      commit: { type: "string", description: "Commit hash or ref (e.g. abc1234, HEAD, HEAD~2, main).", required: true },
      path: { type: "string", description: "Relative path to the git repository. Defaults to root folder.", required: false },
    },
    handler: async (args, ctx: CapabilityContext) => {
      if (!args.commit || typeof args.commit !== "string") throw new Error("commit is required");
      const cwd = resolveWorkdir(ctx, args.path);
      const output = await runGit(`show ${args.commit} --stat --patch`, cwd);
      return { output, commit: args.commit };
    },
  },

  {
    name: "git_diff",
    description: "Show the diff between two commits, refs, or the working tree. Use this to see what changed between two points in time.",
    argsSchema: {
      from: { type: "string", description: "Starting ref (default: HEAD~1).", required: false },
      to: { type: "string", description: "Ending ref (default: HEAD). Use empty string for working tree.", required: false },
      file: { type: "string", description: "Limit diff to a specific file path (relative to the repo).", required: false },
      path: { type: "string", description: "Relative path to the git repository. Defaults to root folder.", required: false },
    },
    handler: async (args, ctx: CapabilityContext) => {
      const cwd = resolveWorkdir(ctx, args.path);
      const from = typeof args.from === "string" && args.from ? args.from : "HEAD~1";
      const to = typeof args.to === "string" && args.to ? args.to : "HEAD";
      const fileArg = typeof args.file === "string" && args.file ? ` -- "${args.file}"` : "";
      const output = await runGit(`diff ${from}..${to}${fileArg}`, cwd);
      return { output, from, to };
    },
  },

  {
    name: "git_status",
    description: "Show the current working tree status — which files are modified, staged, or untracked. Useful for knowing what is in progress.",
    argsSchema: {
      path: { type: "string", description: "Relative path to the git repository. Defaults to root folder.", required: false },
    },
    handler: async (args, ctx: CapabilityContext) => {
      const cwd = resolveWorkdir(ctx, args.path);
      const status = await runGit("status", cwd);
      return { status, cwd };
    },
  },
];
