/**
 * Schema upgrade safety tests.
 *
 * Two complementary layers of protection:
 *
 * 1. STATIC AUDIT — introspects the Drizzle schema objects and asserts that every
 *    NOT NULL, non-PK column without a SQL-level default is registered in the
 *    FOUNDING_COLUMNS allowlist. Any developer who adds a new NOT NULL column
 *    without a default must explicitly add it to the allowlist and justify why it
 *    is safe (i.e. it will always be supplied by the application, never added via
 *    ALTER TABLE to an existing database that already has rows).
 *
 * 2. MIGRATION SIMULATION — creates an "old" database (missing columns that were
 *    added in a later version but have defaults or are nullable), inserts data,
 *    applies the new columns via ALTER TABLE ADD COLUMN (what `drizzle-kit push`
 *    does), then opens DatabaseStorage and verifies that existing rows are intact
 *    and the new columns resolve to their expected defaults / null.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  users,
  connections,
  projects,
  conversations,
  memoryEntries,
  knowledgeDocuments,
  settings,
  libraryFolders,
  libraryItems,
  journalEntries,
  conversationFlags,
  workspaceDocs,
  consultants,
  systemLogs,
} from "@shared/schema";
import { DatabaseStorage } from "@server/storage";
import { createClient } from "@libsql/client";
import { rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── helpers ────────────────────────────────────────────────────────────────────

function makeTempPath(): string {
  return join(tmpdir(), `creatrix-schema-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

async function execSql(dbPath: string, statements: string[]): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` });
  for (const sql of statements) {
    const trimmed = sql.trim();
    if (trimmed) await client.execute(trimmed);
  }
  await client.close();
}

// ── 1. STATIC AUDIT ────────────────────────────────────────────────────────────

/**
 * FOUNDING_COLUMNS is the allowlist of columns that are legitimately NOT NULL
 * without a SQL-level default. These columns exist in the original CREATE TABLE
 * statement for their table — they are safe there because the application always
 * supplies a value at INSERT time.
 *
 * They would be UNSAFE if added to an existing table via ALTER TABLE ADD COLUMN
 * (SQLite rejects adding a NOT NULL column without a default when rows exist).
 *
 * HOW TO MAINTAIN THIS LIST:
 *  - If you add a new NOT NULL column WITH a default or nullable, do nothing.
 *  - If you add a new NOT NULL column WITHOUT a default that is part of the
 *    original table definition (i.e. it will never be ALTER TABLE'd onto an
 *    existing DB), add it here with a comment explaining why it is safe.
 *  - NEVER add a column here just to make the test pass if the real intent is
 *    to ALTER TABLE onto an existing production database that has rows.
 */
const FOUNDING_COLUMNS = new Set<string>([
  // users
  "users.username",
  "users.password",

  // connections
  "connections.name",
  "connections.provider",
  "connections.endpoint",
  "connections.defaultModel",

  // projects
  "projects.name",
  "projects.createdAt",

  // conversations
  "conversations.title",
  "conversations.model",
  "conversations.createdAt",
  "conversations.updatedAt",

  // memoryEntries
  "memoryEntries.scope",
  "memoryEntries.content",
  "memoryEntries.createdAt",

  // knowledgeDocuments
  "knowledgeDocuments.title",
  "knowledgeDocuments.source",
  "knowledgeDocuments.content",
  "knowledgeDocuments.createdAt",

  // systemLogs — timestamp uses $defaultFn (JS-side, not a SQL DEFAULT). It is safe here
  // because it has been part of the CREATE TABLE statement from the start, not added via
  // ALTER TABLE. $defaultFn does NOT produce a SQL DEFAULT clause, so SQLite would reject
  // adding this column to an existing table with rows — hence it must live in the allowlist.
  "systemLogs.timestamp",
  "systemLogs.level",
  "systemLogs.category",
  "systemLogs.message",

  // libraryFolders
  "libraryFolders.name",
  "libraryFolders.createdAt",

  // libraryItems
  "libraryItems.title",
  "libraryItems.source",
  "libraryItems.createdAt",

  // journalEntries
  "journalEntries.type",
  "journalEntries.title",
  "journalEntries.createdAt",

  // conversationFlags
  "conversationFlags.conversationId",
  "conversationFlags.conversationTitle",
  "conversationFlags.pivotSentence",
  "conversationFlags.createdAt",

  // workspaceDocs
  "workspaceDocs.title",
  "workspaceDocs.updatedAt",
  "workspaceDocs.createdAt",

  // consultants
  "consultants.projectId",
  "consultants.name",
  "consultants.description",
  "consultants.connectionId",
  "consultants.model",
  "consultants.systemPrompt",
  "consultants.createdAt",
]);

const ALL_TABLES: Record<string, Record<string, unknown>> = {
  users,
  connections,
  projects,
  conversations,
  memoryEntries,
  knowledgeDocuments,
  settings,
  libraryFolders,
  libraryItems,
  journalEntries,
  conversationFlags,
  workspaceDocs,
  consultants,
  systemLogs,
};

describe("Schema safety audit – NOT NULL columns must have a SQL default or be allowlisted", () => {
  /**
   * IMPORTANT: only SQL-level defaults (.default(...)) are safe for ALTER TABLE ADD COLUMN.
   * A JS-side $defaultFn does NOT produce a SQL DEFAULT clause — SQLite will reject adding
   * such a column to a populated table. Therefore $defaultFn is intentionally NOT counted
   * as a pass condition here; columns using $defaultFn without a SQL default must appear in
   * FOUNDING_COLUMNS (meaning they were in the original CREATE TABLE, not added later).
   */
  it("every NOT NULL non-PK column either has a SQL DEFAULT or is in the founding-columns allowlist", () => {
    const violations: string[] = [];

    for (const [tableName, table] of Object.entries(ALL_TABLES)) {
      for (const [colKey, colDef] of Object.entries(table)) {
        const col = colDef as {
          notNull?: boolean;
          hasDefault?: boolean;
          primary?: boolean;
        };

        if (!col || typeof col !== "object") continue;
        if (!("notNull" in col)) continue; // not a column definition

        const isNotNull = col.notNull === true;
        const hasSqlDefault = col.hasDefault === true; // SQL DEFAULT clause only
        const isPrimaryKey = col.primary === true;

        if (isNotNull && !hasSqlDefault && !isPrimaryKey) {
          const key = `${tableName}.${colKey}`;
          if (!FOUNDING_COLUMNS.has(key)) {
            violations.push(
              `  ${key} — NOT NULL without a SQL DEFAULT and not in the founding-columns allowlist.\n` +
              `  Fix: add .default(...) or make nullable for ALTER TABLE safety, ` +
              `or add to FOUNDING_COLUMNS with a comment explaining it is in the original CREATE TABLE ` +
              `and will never be added to a populated DB via ALTER TABLE.\n` +
              `  Note: $defaultFn does NOT count — it generates no SQL DEFAULT clause.`
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Schema upgrade safety violation(s) detected:\n\n${violations.join("\n\n")}\n\n` +
        `Columns that are NOT NULL without a SQL DEFAULT clause are unsafe when added to ` +
        `an existing database via ALTER TABLE ADD COLUMN — SQLite rejects this when rows exist.\n` +
        `See client/src/__tests__/schema-upgrade-safety.test.tsx for how to fix.`
      );
    }
  });
});

// ── 2. MIGRATION SIMULATION ────────────────────────────────────────────────────

/**
 * Simulates the real-world upgrade scenario:
 *
 *   User has creatrix.db from v1 (missing newer optional columns).
 *   They pull a new release and run `drizzle-kit push`.
 *   drizzle-kit push issues ALTER TABLE ADD COLUMN for each new column.
 *   Existing rows must survive and the new columns must resolve gracefully.
 *
 * The "v1" schema used here omits columns that were plausibly added in later
 * releases: orderIndex on connections/projects, maxImageSizeMb on connections,
 * and dayNote on settings. All of them have a DEFAULT or are nullable, making
 * them safe additions.
 */

const V1_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS settings (
    id                          TEXT PRIMARY KEY DEFAULT 'default',
    default_connection_id       TEXT,
    default_project_id          TEXT,
    theme                       TEXT DEFAULT 'system',
    root_folder                 TEXT,
    library_paths               TEXT,
    morning_orientation_enabled INTEGER DEFAULT 0,
    whisper_endpoint            TEXT,
    search_endpoint             TEXT,
    embedding_model             TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS connections (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    provider      TEXT NOT NULL,
    endpoint      TEXT NOT NULL,
    api_key       TEXT,
    default_model TEXT NOT NULL,
    is_default    INTEGER DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    connection_id TEXT,
    system_prompt TEXT,
    current_task  TEXT,
    folder_path   TEXT,
    created_at    TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS conversations (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    project_id   TEXT,
    connection_id TEXT,
    model        TEXT NOT NULL,
    messages     TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS memory_entries (
    id              TEXT PRIMARY KEY,
    scope           TEXT NOT NULL,
    project_id      TEXT,
    conversation_id TEXT,
    content         TEXT NOT NULL,
    summary         TEXT,
    created_at      TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS knowledge_documents (
    id         TEXT PRIMARY KEY,
    project_id TEXT,
    title      TEXT NOT NULL,
    source     TEXT NOT NULL,
    content    TEXT NOT NULL,
    chunks     TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )`,
];

/**
 * The ALTER TABLE statements that `drizzle-kit push` would emit when upgrading
 * from v1 to the current schema.
 */
const UPGRADE_SQL = [
  // connections: new columns added with safe defaults / nullable
  `ALTER TABLE connections ADD COLUMN max_image_size_mb INTEGER`,
  `ALTER TABLE connections ADD COLUMN order_index INTEGER DEFAULT 0`,

  // projects: order_index added with default
  `ALTER TABLE projects ADD COLUMN order_index INTEGER DEFAULT 0`,

  // settings: day_note added as nullable
  `ALTER TABLE settings ADD COLUMN day_note TEXT`,
];

describe("Migration simulation – existing data survives column additions", () => {
  let dbPath: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(async () => {
    dbPath = makeTempPath();
    await execSql(dbPath, V1_SCHEMA_SQL);
    process.env.SQLITE_PATH = dbPath;
  });

  afterEach(() => {
    if (originalSqlitePath === undefined) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = originalSqlitePath;
    }
    if (existsSync(dbPath)) {
      rmSync(dbPath);
    }
  });

  it("ALTER TABLE ADD COLUMN with a DEFAULT succeeds on a table that already has rows", async () => {
    // Seed a row into connections using the v1 schema (no order_index column yet)
    await execSql(dbPath, [
      `INSERT INTO connections (id, name, provider, endpoint, default_model, is_default)
       VALUES ('conn-1', 'Local Ollama', 'ollama', 'http://localhost:11434', 'llama3', 0)`,
    ]);

    // Apply the upgrade (simulating drizzle-kit push)
    await execSql(dbPath, UPGRADE_SQL);

    // Verify the pre-existing row survived and the new column resolves to its default
    const client = createClient({ url: `file:${dbPath}` });
    const result = await client.execute(`SELECT * FROM connections WHERE id = 'conn-1'`);
    await client.close();

    expect(result.rows.length).toBe(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row["name"]).toBe("Local Ollama");
    expect(row["provider"]).toBe("ollama");
    // New column: order_index should be the default 0
    expect(Number(row["order_index"])).toBe(0);
    // New nullable column: max_image_size_mb should be null
    expect(row["max_image_size_mb"]).toBeNull();
  });

  it("ALTER TABLE ADD COLUMN nullable succeeds and reads as null for pre-existing rows", async () => {
    // Seed a settings row
    await execSql(dbPath, [
      `INSERT INTO settings (id, theme) VALUES ('default', 'dark')`,
    ]);

    // Apply the upgrade
    await execSql(dbPath, UPGRADE_SQL);

    const client = createClient({ url: `file:${dbPath}` });
    const result = await client.execute(`SELECT * FROM settings WHERE id = 'default'`);
    await client.close();

    expect(result.rows.length).toBe(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row["theme"]).toBe("dark");
    // day_note was nullable, should be null for pre-existing row
    expect(row["day_note"]).toBeNull();
  });

  it("DatabaseStorage reads pre-existing data correctly after a schema upgrade", async () => {
    // Seed data into the v1 database before upgrade
    const now = new Date().toISOString();
    await execSql(dbPath, [
      `INSERT INTO conversations (id, title, model, messages, created_at, updated_at)
       VALUES ('conv-v1', 'Pre-upgrade conversation', 'llama3', '[]', '${now}', '${now}')`,
      `INSERT INTO memory_entries (id, scope, content, created_at)
       VALUES ('mem-v1', 'global', 'Important context from before upgrade', '${now}')`,
    ]);

    // Apply the upgrade
    await execSql(dbPath, UPGRADE_SQL);

    // Now open DatabaseStorage (which uses the current Drizzle schema against the upgraded DB)
    const storage = new DatabaseStorage();
    await storage.initialize();

    const conv = await storage.getConversation("conv-v1");
    expect(conv, "pre-upgrade conversation should be readable after schema upgrade").toBeDefined();
    expect(conv!.title).toBe("Pre-upgrade conversation");
    expect(conv!.model).toBe("llama3");

    const memories = await storage.getMemoryEntries("global");
    const found = memories.find(m => m.id === "mem-v1");
    expect(found, "pre-upgrade memory entry should be readable after schema upgrade").toBeDefined();
    expect(found!.content).toBe("Important context from before upgrade");
  });

  it("projects with pre-upgrade rows get orderIndex = 0 after adding order_index column", async () => {
    const now = new Date().toISOString();
    await execSql(dbPath, [
      `INSERT INTO projects (id, name, created_at)
       VALUES ('proj-v1', 'My Project', '${now}')`,
    ]);

    // Apply the upgrade
    await execSql(dbPath, UPGRADE_SQL);

    const client = createClient({ url: `file:${dbPath}` });
    const result = await client.execute(`SELECT order_index FROM projects WHERE id = 'proj-v1'`);
    await client.close();

    expect(result.rows.length).toBe(1);
    // order_index DEFAULT 0 — pre-existing row should get the default
    expect(Number(result.rows[0]["order_index"])).toBe(0);
  });

  it("attempting to add a NOT NULL column without a default to a non-empty table fails", async () => {
    // This test documents the dangerous pattern so developers know exactly what
    // failure they would get if they violated the schema-safety rule.
    const now = new Date().toISOString();
    await execSql(dbPath, [
      `INSERT INTO conversations (id, title, model, messages, created_at, updated_at)
       VALUES ('conv-bad', 'Test', 'model', '[]', '${now}', '${now}')`,
    ]);

    // Trying to ADD a NOT NULL column without a default to a table that already has rows
    // MUST fail — this is the breakage we are guarding against.
    await expect(
      execSql(dbPath, [
        `ALTER TABLE conversations ADD COLUMN required_field TEXT NOT NULL`,
      ])
    ).rejects.toThrow();
  });
});
