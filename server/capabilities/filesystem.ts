import fs from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import type { CapabilityDefinition, CapabilityContext } from "./index";

const PLAIN_TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".rtf", ".odt",
  ".py", ".js", ".ts", ".tsx", ".jsx",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".xml",
  ".css", ".html", ".htm", ".csv",
  ".sh", ".env",
]);

function sanitizePath(filePath: string, ctx: Pick<CapabilityContext, "rootFolder" | "libraryPaths">): string {
  const resolved = path.resolve(filePath);
  const allRoots = [
    ...(ctx.rootFolder ? [path.resolve(ctx.rootFolder)] : []),
    ...(ctx.libraryPaths || []).map(p => path.resolve(p)),
  ];
  if (allRoots.length > 0 && !allRoots.some(root => resolved.startsWith(root))) {
    const rootList = allRoots.join(", ");
    throw new Error(`Path "${filePath}" is outside all configured library paths (${rootList}).`);
  }
  return resolved;
}

export async function readFileContent(filePath: string): Promise<{ content: string; format: string }> {
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
    const zip = new AdmZip(filePath);

    const containerXml = zip.readAsText("META-INF/container.xml");
    const opfMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
    if (!opfMatch) throw new Error("Invalid EPUB: could not find OPF package file.");
    const opfPath = opfMatch[1];
    const opfDir = path.posix.dirname(opfPath).replace(/^\.$/, "");

    const opfXml = zip.readAsText(opfPath);

    const manifestMap = new Map<string, string>();
    Array.from(opfXml.matchAll(/<item\s[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/gi)).forEach((m) => {
      manifestMap.set(m[1], m[2]);
    });

    const spineIds = Array.from(opfXml.matchAll(/<itemref\s[^>]*\bidref="([^"]+)"/gi)).map((m) => m[1]);

    const stripHtml = (html: string): string =>
      html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<h[1-6][^>]*>/gi, "\n\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;|&#160;/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const chapters: string[] = [];
    for (const id of spineIds) {
      const href = manifestMap.get(id);
      if (!href) continue;
      const entryPath = opfDir ? `${opfDir}/${href}` : href;
      try {
        const html = zip.readAsText(entryPath);
        const text = stripHtml(html);
        if (text.length > 50) chapters.push(text);
      } catch {
        // skip unreadable entries silently
      }
    }

    if (chapters.length === 0) throw new Error("Could not extract any readable text from this EPUB.");
    return { content: chapters.join("\n\n---\n\n"), format: "EPUB" };
  }

  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    const content = await fs.readFile(filePath, "utf-8");
    return { content, format: ext.slice(1).toUpperCase() };
  }

  throw new Error(
    `Unsupported file type: ${ext}. Supported: .md .txt .pdf .docx .xlsx .epub .py .js .ts .json .yaml .csv .html and more.`
  );
}

// ── Filesystem search helpers ─────────────────────────────────────────────────

interface WalkEntry { path: string; name: string; isDir: boolean; depth: number }

const SKIP_NAMES = new Set(["$RECYCLE.BIN", "node_modules", ".git", ".Trash-1000", "System Volume Information"]);

async function walkFilesystem(
  dirPath: string,
  depth: number,
  maxDepth: number,
  bucket: WalkEntry[],
  maxEntries: number,
): Promise<void> {
  if (depth > maxDepth || bucket.length >= maxEntries) return;
  let items: import("fs").Dirent[];
  try { items = await fs.readdir(dirPath, { withFileTypes: true }); }
  catch { return; }
  for (const item of items) {
    if (bucket.length >= maxEntries) break;
    if (item.name.startsWith(".") || SKIP_NAMES.has(item.name)) continue;
    const full = path.join(dirPath, item.name);
    bucket.push({ path: full, name: item.name, isDir: item.isDirectory(), depth });
    if (item.isDirectory() && depth < maxDepth) {
      await walkFilesystem(full, depth + 1, maxDepth, bucket, maxEntries);
    }
  }
}

function fuzzyScore(query: string, entry: WalkEntry): number {
  const q = query.toLowerCase().trim();
  const n = entry.name.toLowerCase();
  const p = entry.path.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  let score = 0;
  if (n === q) score += 20;
  if (n.startsWith(q)) score += 10;
  if (n.includes(q)) score += 8;
  if (p.includes(q)) score += 4;
  const nameHits = terms.filter(t => n.includes(t)).length;
  score += nameHits * 3;
  if (nameHits === terms.length && terms.length > 1) score += 5;
  score += terms.filter(t => p.includes(t)).length;
  score -= entry.depth * 0.2;
  return score;
}

// ── Capabilities ──────────────────────────────────────────────────────────────

export const filesystemCapabilities: CapabilityDefinition[] = [
  {
    name: "find_path",
    description:
      "Fuzzy-search for a file or directory by name across the entire file library — no manual navigation needed. " +
      "Returns up to 10 matches ranked by relevance, each with its full path and type. " +
      "Use this instead of listing directories one by one whenever you need to locate something by name or partial name.",
    requires: { rootFolder: true },
    argsSchema: {
      query: { type: "string", description: "Name or partial name to search for (fuzzy, case-insensitive)", required: true },
      type: { type: "string", description: 'Filter results: "file", "directory", or "any" (default: "any")' },
      from: { type: "string", description: "Start search from this path instead of the root folder (optional)" },
    },
    async handler(args, ctx) {
      const root = args.from
        ? sanitizePath(args.from as string, ctx)
        : (ctx.rootFolder || process.cwd());
      const filter = (args.type as string | undefined) ?? "any";
      const bucket: WalkEntry[] = [];
      await walkFilesystem(root, 0, 7, bucket, 8000);
      const scored = bucket
        .filter(e => filter === "any" || (filter === "directory" ? e.isDir : !e.isDir))
        .map(e => ({ ...e, score: fuzzyScore(args.query as string, e) }))
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return {
        query: args.query,
        matches: scored.map(e => ({ path: e.path, name: e.name, type: e.isDir ? "directory" : "file" })),
        total_scanned: bucket.length,
      };
    },
  },

  {
    name: "search_filesystem",
    description:
      "Search for files and directories whose names or paths contain the given terms. " +
      "Broader than find_path — returns up to 20 matches. Useful when you're not sure of the exact name. " +
      "Results are ranked by how many search terms appear in the name and path.",
    requires: { rootFolder: true },
    argsSchema: {
      query: { type: "string", description: "One or more search terms (space-separated, case-insensitive)", required: true },
      from: { type: "string", description: "Limit search to this subtree (optional; defaults to root folder)" },
    },
    async handler(args, ctx) {
      const root = args.from
        ? sanitizePath(args.from as string, ctx)
        : (ctx.rootFolder || process.cwd());
      const bucket: WalkEntry[] = [];
      await walkFilesystem(root, 0, 8, bucket, 12000);
      const scored = bucket
        .map(e => ({ ...e, score: fuzzyScore(args.query as string, e) }))
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      return {
        query: args.query,
        matches: scored.map(e => ({ path: e.path, name: e.name, type: e.isDir ? "directory" : "file" })),
        total_scanned: bucket.length,
      };
    },
  },

  {
    name: "list_directory",
    description: "List the contents of a directory. Returns each entry's name, type (\"file\" or \"directory\"), size in bytes, and last-modified timestamp. Use this when you already know the exact path. If you're searching for something by name, use find_path instead — it searches the whole library in one call.",
    requires: { rootFolder: true },
    argsSchema: {
      path: {
        type: "string",
        description: "Directory path to list. Omit to list the root folder.",
      },
    },
    async handler(args, ctx) {
      const dirPath = args.path
        ? sanitizePath(args.path as string, ctx)
        : ctx.rootFolder || process.cwd();
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter(e => !e.name.startsWith("."))
          .map(async e => {
            const fullPath = path.join(dirPath, e.name);
            const stat = await fs.stat(fullPath).catch(() => null);
            return {
              name: e.name,
              type: e.isDirectory() ? "directory" : "file",
              size: stat?.size,
              modified: stat?.mtime.toISOString(),
            };
          })
      );
      return { path: dirPath, count: items.length, items };
    },
  },

  {
    name: "read_file",
    description: "Read the full text contents of a file. Returns: path, format, content (as a string), line count, and file size. Supports .md, .txt, .pdf, .docx, .xlsx, .epub, .py, .js, .ts, .json, .yaml, .csv, .html and more.",
    requires: { rootFolder: true },
    argsSchema: {
      path: { type: "string", description: "Absolute or root-relative path to the file", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("Path is not a file.");
      const { content, format } = await readFileContent(filePath);
      const lines = content.split("\n").length;
      return { path: filePath, format, content, lines, size: stat.size };
    },
  },

  {
    name: "write_file",
    description: "Write or overwrite a text file. Creates parent directories automatically. Returns: path and written: true on success. Use append_file to add to an existing file without overwriting.",
    requires: { rootFolder: true },
    argsSchema: {
      path: { type: "string", description: "Path to write to", required: true },
      content: { type: "string", description: "Text content to write", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, args.content as string, "utf-8");
      return { path: filePath, written: true };
    },
  },

  {
    name: "append_file",
    description: "Append text to the end of a file without overwriting it. Creates the file if it does not exist. Returns: path, appended: true, and the new file size in bytes.",
    requires: { rootFolder: true },
    argsSchema: {
      path: { type: "string", description: "Path to the file to append to", required: true },
      content: { type: "string", description: "Text to append", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, args.content as string, "utf-8");
      const stat = await fs.stat(filePath);
      return { path: filePath, appended: true, size: stat.size };
    },
  },

  {
    name: "create_note",
    description: "Create a new Markdown note in the root folder or a subfolder. Adds a title heading and creation timestamp automatically. Returns: path, filename, and created: true.",
    requires: { rootFolder: true },
    argsSchema: {
      title: { type: "string", description: "Note title (used as the filename)", required: true },
      content: { type: "string", description: "Note body in Markdown", required: true },
      folder: { type: "string", description: "Subfolder relative to root (optional)" },
    },
    async handler(args, ctx) {
      const root = ctx.rootFolder || (ctx.libraryPaths?.[0]) || process.cwd();
      const subfolder = args.folder ? path.join(root, args.folder as string) : root;
      await fs.mkdir(subfolder, { recursive: true });
      const filename =
        (args.title as string).replace(/[^a-zA-Z0-9\s\-_]/g, "").trim().replace(/\s+/g, "-") + ".md";
      const filePath = sanitizePath(path.join(subfolder, filename), ctx);
      const timestamp = new Date().toISOString();
      const noteContent = `# ${args.title}\n\n*Created: ${timestamp}*\n\n${args.content}`;
      await fs.writeFile(filePath, noteContent, "utf-8");
      return { path: filePath, filename, created: true };
    },
  },

  {
    name: "create_folder",
    description: "Create a new directory at the given path (including any missing parent directories). Returns: path and created: true.",
    requires: { rootFolder: true },
    argsSchema: {
      path: { type: "string", description: "Path of the folder to create", required: true },
    },
    async handler(args, ctx) {
      const folderPath = sanitizePath(args.path as string, ctx);
      await fs.mkdir(folderPath, { recursive: true });
      return { path: folderPath, created: true };
    },
  },

  {
    name: "copy_file",
    description: "Copy a file from one location to another. Creates destination parent directories automatically. Returns: source, destination, and copied: true.",
    requires: { rootFolder: true },
    argsSchema: {
      source: { type: "string", description: "Source path", required: true },
      destination: { type: "string", description: "Destination path", required: true },
    },
    async handler(args, ctx) {
      const src = sanitizePath(args.source as string, ctx);
      const dest = sanitizePath(args.destination as string, ctx);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      return { source: src, destination: dest, copied: true };
    },
  },

  {
    name: "move_file",
    description: "Move or rename a file or folder. Always requires user confirmation before executing. Returns: source, destination, and moved: true.",
    requiresConfirmation: true,
    requires: { rootFolder: true },
    argsSchema: {
      source: { type: "string", description: "Source path", required: true },
      destination: { type: "string", description: "Destination path", required: true },
    },
    async handler(args, ctx) {
      const src = sanitizePath(args.source as string, ctx);
      const dest = sanitizePath(args.destination as string, ctx);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(src, dest);
      return { source: src, destination: dest, moved: true };
    },
  },

  {
    name: "delete_file",
    description: "Permanently delete a file. Always requires explicit user confirmation. Returns: path and deleted: true.",
    requiresConfirmation: true,
    requires: { rootFolder: true },
    argsSchema: {
      path: { type: "string", description: "Path to the file to delete", required: true },
    },
    async handler(args, ctx) {
      const filePath = sanitizePath(args.path as string, ctx);
      await fs.unlink(filePath);
      return { path: filePath, deleted: true };
    },
  },
];
