import { exec } from "child_process";
import { promisify } from "util";
import type { CapabilityDefinition } from "./index";

const execAsync = promisify(exec);
const MAX_OUTPUT = 8_000;

export const terminalCapabilities: CapabilityDefinition[] = [
  {
    name: "run_command",
    description:
      "Run a shell command on the local machine and return its output. " +
      "Returns: command, cwd, exitCode, stdout, stderr, truncated. " +
      "Use for file operations, glob patterns, batch moves, system queries, scripts, " +
      "or anything requiring shell syntax that individual file tools cannot express. " +
      "Commands run in the user's configured root folder by default. " +
      "Always prefer specific file tools (read_file, move_file, etc.) for simple single-file " +
      "operations — use run_command when shell expressiveness is genuinely needed.",
    requiresConfirmation: true,
    argsSchema: {
      command: {
        type: "string",
        description: "The shell command to run (executed via /bin/bash)",
        required: true,
      },
      cwd: {
        type: "string",
        description:
          "Working directory for the command. Defaults to the user's configured root folder, " +
          "or their home directory if no root folder is set.",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default 30, max 120)",
      },
    },
    async handler(args, ctx) {
      const command = args.command as string;
      const cwd =
        (args.cwd as string | undefined) ||
        ctx.rootFolder ||
        process.env.HOME ||
        "/tmp";
      const timeoutSec = Math.min(Math.max((args.timeout as number) || 30, 1), 120);

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          timeout: timeoutSec * 1000,
          maxBuffer: 4 * 1024 * 1024,
          shell: "/bin/bash",
        });

        return {
          command,
          cwd,
          exitCode: 0,
          stdout: stdout.slice(0, MAX_OUTPUT),
          stderr: stderr.slice(0, MAX_OUTPUT),
          truncated: stdout.length > MAX_OUTPUT || stderr.length > MAX_OUTPUT,
        };
      } catch (err: any) {
        // exec throws on non-zero exit but still carries stdout/stderr
        return {
          command,
          cwd,
          exitCode: typeof err.code === "number" ? err.code : 1,
          stdout: (err.stdout ?? "").slice(0, MAX_OUTPUT),
          stderr: (err.stderr ?? err.message ?? "").slice(0, MAX_OUTPUT),
          truncated: false,
        };
      }
    },
  },
];
