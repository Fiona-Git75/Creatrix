// ── SQLite Service Definition ──────────────────────────────────────────────────
// canonical:   server/runtime/services/sqlite.ts
// contract:    probe, diagnostics, and troubleshooting guide for the SQLite DB.
//
// SQLite is an embedded database — there is no daemon, no TCP connection, and
// no service to start. The database is a single file that the application opens
// directly. The failure space is: "file exists and is readable/writable."
//
// data layer:  server/storage.ts       (IStorage interface + DatabaseStorage impl)
// schema:      shared/schema.ts        (Drizzle table definitions + Zod schemas)
// file path:   SQLITE_PATH env var, or ./data/creatrix.db by default
//
// probe:       SELECT 1 via the live application db connection.
//              Ready means: the file is open AND queries execute.

import { existsSync } from "fs";
import type { ServiceDefinition, ReadinessResult } from "./index";

export const SqliteService: ServiceDefinition = {
  key: "sqlite",
  name: "Database",
  description:
    "Primary data store — conversations, settings, projects, system logs. " +
    "A single file on disk; no service to start.",
  capabilities: ["all"],

  troubleshooting: {
    commands: [
      "ls -lh ./data/creatrix.db",
      "sqlite3 ./data/creatrix.db '.tables'",
      "sqlite3 ./data/creatrix.db 'SELECT COUNT(*) FROM conversations'",
    ],
    commonIssues: [
      {
        symptom: "Database file missing",
        action:
          "The file is created automatically on first run. Check that the data/ directory is writable:\n" +
          "  ls -la ./data/",
      },
      {
        symptom: "Permission denied reading or writing the database",
        action:
          "Fix file permissions:\n" +
          "  chmod 644 ./data/creatrix.db\n" +
          "  chmod 755 ./data/",
      },
      {
        symptom: "Disk full — writes failing",
        action: "Check available disk space:\n  df -h .",
      },
    ],
  },

  async checkReady(_endpoint: string | null): Promise<ReadinessResult> {
    const dbPath = process.env.SQLITE_PATH ?? "./data/creatrix.db";

    if (!existsSync(dbPath)) {
      return {
        ready: false,
        status: "not_configured",
        detail: `Database file not found at ${dbPath} — will be created on first run`,
        latencyMs: null,
        action: "Start the application — the database file is created automatically.",
        firstLook: `ls -la ${dbPath}`,
      };
    }

    const start = Date.now();
    try {
      // Import dynamically; path is server/storage.ts from server/runtime/services/
      const { storage } = await import("../../storage");
      await (storage as any).db.$client.execute({ sql: "SELECT 1", args: [] });
      return {
        ready: true,
        status: "ready",
        detail: `SELECT 1 → OK  (${dbPath})`,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      const msg: string = err?.message ?? "Query failed";
      const isPermission = msg.includes("SQLITE_CANTOPEN") || msg.includes("permission");
      const isCorrupt   = msg.includes("SQLITE_CORRUPT") || msg.includes("malformed");

      if (isPermission) {
        return {
          ready: false,
          status: "unreachable",
          detail: `Cannot open database — permission denied`,
          latencyMs: null,
          action: `Fix file permissions:\n  chmod 644 ${dbPath}`,
          firstLook: `ls -la ${dbPath}`,
        };
      }
      if (isCorrupt) {
        return {
          ready: false,
          status: "degraded",
          detail: `Database file appears corrupted`,
          latencyMs: null,
          action: `Restore from backup, or delete the file to start fresh:\n  mv ${dbPath} ${dbPath}.bak`,
          firstLook: `sqlite3 ${dbPath} 'PRAGMA integrity_check'`,
        };
      }
      return {
        ready: false,
        status: "unreachable",
        detail: `Query failed: ${msg}`,
        latencyMs: null,
        action: `Check the database file:\n  sqlite3 ${dbPath} '.tables'`,
        firstLook: `ls -lh ${dbPath}`,
      };
    }
  },
};
