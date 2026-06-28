// ── PostgreSQL Service Definition ─────────────────────────────────────────────
// canonical:   server/runtime/services/postgres.ts
// contract:    self-contained readiness check for the Postgres database.
//              Everything needed to understand, probe, and troubleshoot this
//              service lives here. Nothing Postgres-specific lives elsewhere.
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
      "docker compose ps postgres",
      "echo $DATABASE_URL",
      "psql $DATABASE_URL -c 'SELECT 1'",
      "docker compose logs postgres --tail=30",
    ],
    commonIssues: [
      {
        symptom: "Connection refused on port 5432",
        action: "Start the database: docker compose up -d postgres",
      },
      {
        symptom: "Authentication failed / wrong password",
        action: "Check DATABASE_URL in your .env file matches docker-compose.yml credentials",
      },
      {
        symptom: "Database does not exist",
        action: "psql $DATABASE_URL -c 'CREATE DATABASE creatrix'",
      },
      {
        symptom: "SSL connection required",
        action: "Append ?sslmode=disable to DATABASE_URL for local Docker Postgres",
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
        firstLook: "cat .env | grep DATABASE_URL",
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
          ? "Start Postgres: docker compose up -d postgres"
          : "Check DATABASE_URL and ensure Postgres is running.",
        firstLook: isRefused ? "docker compose ps postgres" : "echo $DATABASE_URL",
      };
    } finally {
      await client.end().catch(() => {});
    }
  },
};
