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
      const raw: string = err?.message ?? "Connection failed";

      // Classify the pg error into a specific, actionable diagnosis.
      // Each branch sets (status, detail, action, firstLook) independently so
      // the roll call and repair panel can surface the exact reason without the
      // user having to parse raw pg error messages.
      const isRefused    = raw.includes("ECONNREFUSED");
      const isTimeout    = raw.includes("timeout") || raw.includes("ETIMEDOUT") || raw.includes("timed out");
      const isDns        = raw.includes("could not translate host") || raw.includes("ENOTFOUND");
      const isAuth       = raw.includes("password authentication failed") || raw.includes("authentication failed");
      const isMissingDb  = raw.includes("does not exist") && raw.includes("database");
      const isMissingRole = raw.includes("does not exist") && raw.includes("role");
      const isSSL        = raw.includes("SSL") || raw.includes("sslmode");
      const isHba        = raw.includes("pg_hba.conf");

      let detail:   string;
      let status:   "unreachable" | "degraded";
      let action:   string;
      let firstLook: string;

      if (isRefused) {
        status    = "unreachable";
        detail    = "Connection refused — PostgreSQL is not running or not listening on this port";
        action    = "Start PostgreSQL:\n" +
                    "  Linux:  sudo systemctl start postgresql\n" +
                    "  macOS:  brew services start postgresql@16\n" +
                    "  check:  pg_isready -h 127.0.0.1 -p 5432";
        firstLook = "pg_isready -h 127.0.0.1 -p 5432";
      } else if (isTimeout) {
        status    = "unreachable";
        detail    = "Connection timed out — PostgreSQL may be starting up or port 5432 is firewalled";
        action    = "Check PostgreSQL is reachable:\n" +
                    "  pg_isready -h 127.0.0.1 -p 5432\n" +
                    "  sudo systemctl status postgresql";
        firstLook = "pg_isready -h 127.0.0.1 -p 5432";
      } else if (isDns) {
        status    = "unreachable";
        detail    = "Hostname in DATABASE_URL could not be resolved";
        action    = "Use '127.0.0.1' or 'localhost' as the host in DATABASE_URL for local installs";
        firstLook = "echo $DATABASE_URL";
      } else if (isAuth) {
        status    = "degraded";
        detail    = "Wrong credentials — password authentication failed";
        action    = "Check the username and password in DATABASE_URL in your .env file";
        firstLook = "echo $DATABASE_URL | sed 's/:.*@/:***@/'";
      } else if (isMissingDb) {
        const dbName = raw.match(/database "([^"]+)"/)?.[1] ?? "creatrix";
        status    = "degraded";
        detail    = `Database '${dbName}' does not exist`;
        action    = `Create the database:\n  psql -U postgres -c "CREATE DATABASE ${dbName}"`;
        firstLook = `psql -U postgres -c "\\\\l" | grep ${dbName}`;
      } else if (isMissingRole) {
        const roleName = raw.match(/role "([^"]+)"/)?.[1] ?? "creatrix";
        status    = "degraded";
        detail    = `PostgreSQL user '${roleName}' does not exist`;
        action    = `Create the user:\n  psql -U postgres -c "CREATE USER ${roleName} WITH PASSWORD 'yourpassword'"`;
        firstLook = `psql -U postgres -c "\\\\du" | grep ${roleName}`;
      } else if (isSSL) {
        status    = "degraded";
        detail    = "SSL required but not configured — DATABASE_URL needs ?sslmode=disable for a local instance";
        action    = "Append '?sslmode=disable' to DATABASE_URL for a local instance without TLS";
        firstLook = "echo $DATABASE_URL";
      } else if (isHba) {
        status    = "degraded";
        detail    = "PostgreSQL rejected the connection — pg_hba.conf doesn't allow this user/host combination";
        action    = "Check pg_hba.conf — ensure a rule allows your user to connect from 127.0.0.1:\n" +
                    "  sudo cat /etc/postgresql/*/main/pg_hba.conf | grep -v '^#'";
        firstLook = "sudo cat /etc/postgresql/*/main/pg_hba.conf | grep -v '^#'";
      } else {
        status    = "unreachable";
        detail    = "Connection failed";
        action    = "Check DATABASE_URL and ensure PostgreSQL is running:\n  pg_isready -h 127.0.0.1 -p 5432";
        firstLook = "psql $DATABASE_URL -c 'SELECT 1'";
      }

      return { ready: false, status, detail, latencyMs: null, action, firstLook };
    } finally {
      await client.end().catch(() => {});
    }
  },
};
