import fs from "fs/promises";
import path from "path";
import type { CapabilityDefinition } from "./index";

const PLAIN_TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".rtf", ".odt",
  ".py", ".js", ".ts", ".tsx", ".jsx",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".xml",
  ".css", ".html", ".htm", ".csv",
  ".sh", ".env",
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

async function readFileContent(filePath: string): Promise<{ content: string; format: string }> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const pdfModule = await import("pdf-parse");
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
      (pdfModule as any).default ?? pdfModule;
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return { content: data.text.trim(), format: "PDF" };
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer: buffer as any });
    if (result.messages.length > 0 && !result.value) {
      throw new Error(`Could not extract text from docx: ${result.messages[0]?.message}`);
    }
    return { content: result.value.trim(), format: "DOCX" };
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.readFile(filePath);
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `## Sheet: ${name}\n${csv}`;
    });
    return { content: sheets.join("\n\n"), format: "XLSX" };
  }

  if (ext === ".epub") {
    throw new Error(
      "EPUB reading is not yet enabled. Install adm-zip (npm install adm-zip) to add EPUB support."
    );
  }

  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    const content = await fs.readFile(filePath, "utf-8");
    return { content, format: ext.slice(1).toUpperCase() };
  }

  throw new Error(
    `Unsupported file type: ${ext}. Supported: .md .txt .pdf .docx .xlsx .epub .py .js .ts .json .yaml .csv .html and more.`
  );
}

export const filesystemCapabilities: CapabilityDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Supports .md, .txt, .pdf, .docx, .xlsx, .py, .js, .ts, .json, .yaml, .csv, .html and many more.",
    argsSchema: {
      path: { type: "string", description: "Absolute or root-relative path to the file", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx.rootFolder);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("Path is not a file.");
      const { content, format } = await readFileContent(filePath);
      const lines = content.split("\n").length;
      return { path: filePath, format, content, lines, size: stat.size };
    },
  },

  {
    name: "write_file",
    description: "Write or overwrite a text file at the given path. Use append_file to add to an existing file without overwriting.",
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
    name: "append_file",
    description: "Append text to the end of an existing file without overwriting it. Creates the file if it does not exist.",
    argsSchema: {
      path: { type: "string", description: "Path to the file to append to", required: true },
      content: { type: "string", description: "Text to append", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx.rootFolder);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, args.content as string, "utf-8");
      const stat = await fs.stat(filePath);
      return { path: filePath, appended: true, size: stat.size };
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
      const filename =
        (args.title as string).replace(/[^a-zA-Z0-9\s\-_]/g, "").trim().replace(/\s+/g, "-") + ".md";
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
    description: "Copy a file to a new location.",
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
    description: "Move or rename a file or folder. Always requires user confirmation.",
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
