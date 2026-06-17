import fs from "fs/promises";
import path from "path";
import type { CapabilityDefinition } from "./index";

const READABLE_EXTENSIONS = new Set([
  ".md", ".txt", ".rtf", ".odt",
  ".py", ".js", ".ts", ".tsx", ".jsx",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".xml",
  ".css", ".html", ".htm", ".csv", ".sh", ".env",
]);

function sanitizePath(filePath: string, rootFolder?: string): string {
  const resolved = path.resolve(filePath);
  if (rootFolder) {
    const root = path.resolve(rootFolder);
    if (!resolved.startsWith(root)) {
      throw new Error(`Path "${filePath}" is outside the configured root folder.`);
    }
  }
  return resolved;
}

async function readTextFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (!READABLE_EXTENSIONS.has(ext) && ext !== ".docx" && ext !== ".pdf") {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  const content = await fs.readFile(filePath, "utf-8");
  return content;
}

export const filesystemCapabilities: CapabilityDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Supports .md, .txt, .py, .js, .ts, .json, .yaml, .csv and more.",
    argsSchema: {
      path: { type: "string", description: "Absolute or root-relative path to the file", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx.rootFolder);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("Path is not a file.");
      const content = await readTextFile(filePath);
      const lines = content.split("\n").length;
      return { path: filePath, content, lines, size: stat.size };
    },
  },

  {
    name: "write_file",
    description: "Write or overwrite a text file at the given path.",
    argsSchema: {
      path: { type: "string", description: "Path to write to", required: true },
      content: { type: "string", description: "Text content to write", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx.rootFolder);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, args.content as string, "utf-8");
      return { path: filePath, written: true };
    },
  },

  {
    name: "create_note",
    description: "Create a new Markdown note in the root folder or a specified subfolder.",
    argsSchema: {
      title: { type: "string", description: "Note title (used as filename)", required: true },
      content: { type: "string", description: "Note body in Markdown", required: true },
      folder: { type: "string", description: "Subfolder relative to root (optional)" },
    },
    async handler(args, ctx) {
      const root = ctx.rootFolder || process.cwd();
      const subfolder = args.folder ? path.join(root, args.folder as string) : root;
      await fs.mkdir(subfolder, { recursive: true });
      const filename = (args.title as string).replace(/[^a-zA-Z0-9\s\-_]/g, "").trim().replace(/\s+/g, "-") + ".md";
      const filePath = sanitizePath(path.join(subfolder, filename), ctx.rootFolder);
      const timestamp = new Date().toISOString();
      const noteContent = `# ${args.title}\n\n*Created: ${timestamp}*\n\n${args.content}`;
      await fs.writeFile(filePath, noteContent, "utf-8");
      return { path: filePath, filename, created: true };
    },
  },

  {
    name: "create_folder",
    description: "Create a new folder at the given path.",
    argsSchema: {
      path: { type: "string", description: "Path of the folder to create", required: true },
    },
    async handler(args, ctx) {
      const folderPath = sanitizePath(args.path as string, ctx.rootFolder);
      await fs.mkdir(folderPath, { recursive: true });
      return { path: folderPath, created: true };
    },
  },

  {
    name: "copy_file",
    description: "Copy a file or folder to a new location.",
    argsSchema: {
      source: { type: "string", description: "Source path", required: true },
      destination: { type: "string", description: "Destination path", required: true },
    },
    async handler(args, ctx) {
      const src = sanitizePath(args.source as string, ctx.rootFolder);
      const dest = sanitizePath(args.destination as string, ctx.rootFolder);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      return { source: src, destination: dest, copied: true };
    },
  },

  {
    name: "move_file",
    description: "Move a file or folder to a new location. Always requires user confirmation.",
    requiresConfirmation: true,
    argsSchema: {
      source: { type: "string", description: "Source path", required: true },
      destination: { type: "string", description: "Destination path", required: true },
    },
    async handler(args, ctx) {
      const src = sanitizePath(args.source as string, ctx.rootFolder);
      const dest = sanitizePath(args.destination as string, ctx.rootFolder);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(src, dest);
      return { source: src, destination: dest, moved: true };
    },
  },

  {
    name: "delete_file",
    description: "Delete a file. Always requires explicit confirmation from the user.",
    requiresConfirmation: true,
    argsSchema: {
      path: { type: "string", description: "Path to the file to delete", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx.rootFolder);
      await fs.unlink(filePath);
      return { path: filePath, deleted: true };
    },
  },
];
