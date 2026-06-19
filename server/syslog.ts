export type LogLevel = "info" | "warn" | "error";
export type LogCategory = "system" | "chat" | "tool" | "connection" | "notion" | "filesystem" | "web";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  detail?: string;
}

const MAX_ENTRIES = 500;
const _log: LogEntry[] = [];
let _seq = 0;

type PersistFn = (entry: { level: string; category: string; message: string; detail?: string }) => void;
let _persist: PersistFn | null = null;

export function setLogPersist(fn: PersistFn): void {
  _persist = fn;
}

export function syslog(
  level: LogLevel,
  category: LogCategory,
  message: string,
  detail?: string
): void {
  _seq++;
  const entry: LogEntry = {
    id: String(_seq),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    detail,
  };
  _log.push(entry);
  if (_log.length > MAX_ENTRIES) _log.shift();

  if (_persist) {
    try { _persist({ level, category, message, detail }); } catch {}
  }

  const prefix = `[${category}]`;
  if (level === "error") console.error(prefix, message, detail ?? "");
  else if (level === "warn") console.warn(prefix, message, detail ?? "");
  else console.log(prefix, message, detail ? `| ${detail}` : "");
}

export function getLogs(opts?: {
  level?: string;
  category?: LogCategory;
  limit?: number;
}): LogEntry[] {
  let entries = [..._log].reverse();
  if (opts?.level && opts.level !== "all") {
    if (opts.level === "issues") {
      entries = entries.filter(e => e.level === "warn" || e.level === "error");
    } else {
      entries = entries.filter(e => e.level === opts.level);
    }
  }
  if (opts?.category) entries = entries.filter(e => e.category === opts.category);
  return entries.slice(0, opts?.limit ?? 200);
}

export function clearLogs(): void {
  _log.length = 0;
}
