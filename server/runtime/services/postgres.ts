// ── PostgreSQL Service Definition ─────────────────────────────────────────────
// canonical:   server/runtime/services/postgres.ts
// contract:    probe, diagnostics, and troubleshooting guide for PostgreSQL.
//
// Why this file does NOT contain the data-access layer:
//   PostgreSQL is the application database — every feature in Creatrix reads
//   and writes through it. Its "call code" is the Drizzle ORM layer in
//   server/storage.ts and the schema in shared/schema.ts. Collapsing those into
//   a service file would be counterproductive; they ARE the application.
//   SearXNG and Whisper are optional capabilities called from two places each —
//   those HTTP clients live in their service files (searxng.ts / whisper.ts).
//   Postgres is different in kind, not just degree.
//
// data layer:  server/storage.ts       (IStorage interface + DrizzleStorage impl)
// schema:      shared/schema.ts        (Drizzle table definitions + Zod schemas)
// session:     server/index.ts         (connect-pg-simple session middleware)
//
// backup:      scripts/services/postgres-backup.sh
//              Dumps the database to an external drive, checks the drive is
//              actually mounted before writing, and rotates old files.
//              Scheduled by: scripts/services/postgres-backup.timer (systemd)
//              Install once: sudo cp scripts/services/postgres-backup.{service,timer}
//                            /etc/systemd/system/ && sudo systemctl enable --now
//                            postgres-backup.timer
//
// probe:       SELECT 1 via a fresh pg.Client (same credentials as the main pool).
//              A fresh client is used — not the shared pool — so the probe
//              remains valid even if the pool itself is exhausted or degraded.
//
// ready means: Postgres is accepting connections AND executing queries.
//              Not just "port is open" — an actual query succeeded.

import pg from "pg";
import type { ServiceDefinition, ReadinessResult } from "./index";

function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/:([^:@/]+)@/, ":***@");
  }
}

export const PostgresService: ServiceDefinition = {
  key: "postgres",
  name: "PostgreSQL",
  description:
    "Primary data store — conversations, settings, projects, system logs. " +
    "Creatrix cannot start or function without it.",
  capabilities: ["all"],

  troubleshooting: {
    commands: [
      "pg_isready -h 127.0.0.1 -p 5432",
      "psql $DATABASE_URL -c 'SELECT 1'",
      "echo $DATABASE_URL",
      "systemctl status postgresql          # Linux (systemd)",
      "pg_lsclusters                        # Debian/Ubuntu — lists all clusters",
    ],
    commonIssues: [
      {
        symptom: "Connection refused on port 5432",
        action:
          "PostgreSQL is not running. Start it:\n" +
          "  Linux:  sudo systemctl start postgresql\n" +
          "  macOS:  brew services start postgresql@16\n" +
          "  manual: pg_ctl -D /var/lib/postgresql/data start",
      },
      {
        symptom: "Authentication failed / wrong password",
        action: "Check DATABASE_URL in your .env file — username, password and database name must match the running instance.",
      },
      {
        symptom: "Database does not exist",
        action: "psql -U postgres -c \"CREATE DATABASE creatrix\"",
      },
      {
        symptom: "SSL connection required",
        action: "Append ?sslmode=disable to DATABASE_URL for a local Postgres instance without TLS.",
      },
    ],
  },

  async checkReady(endpoint: string | null): Promise<ReadinessResult> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return {
        ready: false,
        status: "not_configured",
        detail: "DATABASE_URL environment variable is not set",
        latencyMs: null,
        action: "Set DATABASE_URL in your .env file pointing at the running Postgres instance.",
        firstLook: "echo $DATABASE_URL",
      };
    }

    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 3000,
      statement_timeout: 2000,
    } as pg.ClientConfig);

    const start = Date.now();
    try {
      await client.connect();
      await client.query("SELECT 1");
      return {
        ready: true,
        status: "ready",
        detail: "SELECT 1 → OK",
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      const msg: string = err?.message ?? "Connection failed";
      const isRefused = msg.includes("ECONNREFUSED") || msg.includes("connect");
      const isAuth    = msg.includes("password") || msg.includes("authentication");
      return {
        ready: false,
        status: "unreachable",
        detail: msg,
        latencyMs: null,
        action: isAuth
          ? "Check DATABASE_URL credentials in your .env file."
          : isRefused
          ? "PostgreSQL is not accepting connections.\n" +
            "  Linux:  sudo systemctl start postgresql\n" +
            "  macOS:  brew services start postgresql@16\n" +
            "  check:  pg_isready -h 127.0.0.1 -p 5432"
          : "Check DATABASE_URL and ensure PostgreSQL is running.",
        firstLook: isRefused
          ? "pg_isready -h 127.0.0.1 -p 5432"
          : "psql $DATABASE_URL -c 'SELECT 1'",
      };
    } finally {
      await client.end().catch(() => {});
    }
  },
};
