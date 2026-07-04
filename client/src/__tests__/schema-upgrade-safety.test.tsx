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
import * as schemaModule from "@shared/schema";
import { DatabaseStorage } from "@server/storage";
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { FOUNDING_COLUMNS } from "@shared/founding-columns";

// Drizzle SQLite tables carry this well-known symbol on their prototype chain.
// It is the canonical way to distinguish table objects from other schema exports
// (Zod schemas, plain constants, type-only values, etc.) without importing
// internal Drizzle helpers.
const DRIZZLE_TABLE_SYMBOL = Symbol.for("drizzle:Name");

function isDrizzleTable(val: unknown): boolean {
  return val !== null && typeof val === "object" && DRIZZLE_TABLE_SYMBOL in (val as object);
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_TABLES: Record<string, any> = {
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

  it("ALL_TABLES registry covers every Drizzle SQLite table exported from shared/schema", () => {
    // Auto-detect every Drizzle table object in the schema module by looking for the
    // well-known internal symbol that drizzle-orm stamps on every table instance.
    // This means a developer who adds a new table to shared/schema.ts but forgets to
    // add it to ALL_TABLES in this file (and in scripts/check-founding-columns.ts)
    // will get an explicit failure here rather than silent omission.
    const schemaTableNames = Object.entries(schemaModule)
      .filter(([, val]) => isDrizzleTable(val))
      .map(([key]) => key);

    // Fail-closed sanity guard: if the symbol-based detection finds zero tables it
    // means drizzle-orm changed its internal marker and the check is silently broken,
    // not that the schema is empty.  Require at least the well-known baseline tables.
    const BASELINE_TABLES = ["users", "connections", "conversations"];
    const missing = BASELINE_TABLES.filter(t => !schemaTableNames.includes(t));
    if (missing.length > 0) {
      throw new Error(
        `isDrizzleTable() detection appears broken — baseline tables not found: ${missing.join(", ")}.\n` +
        `Symbol.for("drizzle:Name") may have changed in a drizzle-orm upgrade.\n` +
        `Update isDrizzleTable() in this file and in scripts/check-founding-columns.ts.`
      );
    }

    const missingFromRegistry = schemaTableNames.filter(name => !(name in ALL_TABLES));

    if (missingFromRegistry.length > 0) {
      throw new Error(
        `ALL_TABLES registry is incomplete — the following table(s) are exported from ` +
        `shared/schema.ts but are not registered in ALL_TABLES:\n\n` +
        missingFromRegistry.map(n => `  - ${n}`).join("\n") +
        `\n\nFix: add each missing table to ALL_TABLES in:\n` +
        `  client/src/__tests__/schema-upgrade-safety.test.tsx\n` +
        `  scripts/check-founding-columns.ts\n\n` +
        `Without this registration the static column audit silently skips the new table's columns.`
      );
    }
  });

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
        `an existing database via ALTER TABLE ADD COLUMN — SQLite rejects this when rows exist.\n\n` +
        `HOW TO FIX:\n` +
        `  Option A — Give the column a SQL DEFAULT in shared/schema.ts (e.g. .default(0) or .default("")).\n` +
        `  Option B — Make the column nullable (.notNull() removed) so ALTER TABLE can add it safely.\n` +
        `  Option C — Add the column to FOUNDING_COLUMNS in\n` +
        `              shared/founding-columns.ts\n` +
        `              (only if the column is in the ORIGINAL CREATE TABLE and will never be\n` +
        `              ALTER TABLE'd onto an existing database that already has rows).\n\n` +
        `QUICK HELPER: run  npx tsx scripts/check-founding-columns.ts\n` +
        `to see every NOT NULL non-PK column that lacks a SQL DEFAULT, grouped by table.`
      );
    }
  });
});

// ── 2. MIGRATION COVERAGE ──────────────────────────────────────────────────────

/**
 * Verifies that every Drizzle table declared in shared/schema.ts has a
 * corresponding CREATE TABLE statement in at least one migration SQL file.
 *
 * The auto-migration runner only applies files that already exist in
 * migrations/ — it cannot conjure a CREATE TABLE for a table that was added
 * to the schema but never committed as a migration file.  New installs are
 * unaffected (Drizzle creates tables at startup), but existing users who
 * pull a new release will never get the table unless a migration file exists.
 *
 * If this test fails:
 *   1. Run `npx drizzle-kit generate` to create the missing migration file.
 *   2. Commit the generated .sql file to the migrations/ directory.
 */

// Matches:  CREATE TABLE `name`
//           CREATE TABLE IF NOT EXISTS `name`
// Both backtick-quoted (drizzle-kit style) and unquoted names.
const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;

/**
 * Scans `sqlFiles` from `migrationsDir` for CREATE TABLE statements and
 * returns a Set of lowercase SQL table names found.
 */
function collectMigrationTableNames(migrationsDir: string, sqlFiles: string[]): Set<string> {
  const tablesInMigrations = new Set<string>();
  for (const filename of sqlFiles) {
    const content = readFileSync(join(migrationsDir, filename), "utf8");
    let match: RegExpExecArray | null;
    CREATE_TABLE_RE.lastIndex = 0;
    while ((match = CREATE_TABLE_RE.exec(content)) !== null) {
      tablesInMigrations.add(match[1].toLowerCase());
    }
  }
  return tablesInMigrations;
}

/**
 * Core assertion: throws a descriptive error if any entry in `schemaTables`
 * has no matching CREATE TABLE in `tablesInMigrations`.
 *
 * Extracted so both the positive test (real schema) and the negative test
 * (synthetic orphan injected) exercise the identical check path and error
 * surface.
 */
function assertMigrationCoverage(
  schemaTables: Array<{ exportName: string; sqlName: string }>,
  tablesInMigrations: Set<string>
): void {
  const missing = schemaTables.filter(
    ({ sqlName }) => !tablesInMigrations.has(sqlName.toLowerCase())
  );

  if (missing.length > 0) {
    const lines = missing.map(
      ({ exportName, sqlName }) => `  - ${exportName} (SQL name: ${sqlName})`
    );
    throw new Error(
      `Migration coverage gap — the following table(s) exist in shared/schema.ts ` +
      `but have no CREATE TABLE statement in any file under migrations/:\n\n` +
      lines.join("\n") +
      `\n\nExisting users who pull a new release will never get these tables ` +
      `because the auto-migration runner only applies files that already exist.\n\n` +
      `Fix: run \`npx drizzle-kit generate\` and commit the generated SQL file.`
    );
  }
}

describe("Migration coverage – every schema table must have a CREATE TABLE in a migration file", () => {
  /**
   * NEGATIVE TEST — confirms the detection logic is live and not accidentally no-op'd.
   *
   * Injects a synthetic orphan table name that is absent from all migration
   * files, then asserts that assertMigrationCoverage() throws an error that
   * names the orphaned table.  A future refactor that silently breaks the
   * guard (wrong symbol, bad regex, wrong directory path) will cause this
   * test to fail rather than give false confidence.
   */
  it("raises an explicit error naming any table that has no CREATE TABLE in the migration files", () => {
    const migrationsDir = resolve(process.cwd(), "migrations");

    if (!existsSync(migrationsDir)) {
      throw new Error(
        `migrations/ directory not found at ${migrationsDir}. Cannot run negative coverage test.`
      );
    }

    const sqlFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql"));

    if (sqlFiles.length === 0) {
      throw new Error(
        `No SQL migration files found in ${migrationsDir}. Cannot run negative coverage test.`
      );
    }

    const tablesInMigrations = collectMigrationTableNames(migrationsDir, sqlFiles);

    // Synthetic orphan: a name that could never appear in any real migration file.
    const ORPHAN_SQL_NAME = "__creatrix_orphan_test_table__";

    // Guarantee our orphan is truly absent — if it somehow leaked into a
    // migration file the test setup itself is wrong.
    expect(tablesInMigrations.has(ORPHAN_SQL_NAME)).toBe(false);

    // Inject the orphan and assert the shared check function throws an error
    // that explicitly names both the export name and the SQL table name.
    const syntheticSchemaTables = [
      { exportName: "orphanTable", sqlName: ORPHAN_SQL_NAME },
    ];

    expect(() => assertMigrationCoverage(syntheticSchemaTables, tablesInMigrations))
      .toThrowError(/Migration coverage gap/);

    expect(() => assertMigrationCoverage(syntheticSchemaTables, tablesInMigrations))
      .toThrowError(new RegExp(ORPHAN_SQL_NAME));

    expect(() => assertMigrationCoverage(syntheticSchemaTables, tablesInMigrations))
      .toThrowError(/orphanTable/);
  });

  it("every Drizzle table in shared/schema.ts has a CREATE TABLE statement across migration SQL files", () => {
    // ── locate the migrations directory ──────────────────────────────────────
    const migrationsDir = resolve(process.cwd(), "migrations");

    // Fail-closed: the directory must exist and be readable.
    if (!existsSync(migrationsDir)) {
      throw new Error(
        `migrations/ directory not found at ${migrationsDir}.\n` +
        `Expected the project root to contain a migrations/ folder with SQL files.\n` +
        `Run \`npx drizzle-kit generate\` to create an initial migration.`
      );
    }

    // ── collect all CREATE TABLE names across every SQL migration file ────────
    const sqlFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql"));

    if (sqlFiles.length === 0) {
      throw new Error(
        `No SQL migration files found in ${migrationsDir}.\n` +
        `Run \`npx drizzle-kit generate\` to produce the initial migration.`
      );
    }

    const tablesInMigrations = collectMigrationTableNames(migrationsDir, sqlFiles);

    // ── collect all SQL table names declared in shared/schema.ts ─────────────
    // The Drizzle symbol holds the SQL-level table name (snake_case), not the
    // JS export name (camelCase).  That is exactly what the migration file uses.
    const schemaTables: Array<{ exportName: string; sqlName: string }> = [];

    for (const [exportName, val] of Object.entries(schemaModule)) {
      if (isDrizzleTable(val)) {
        const sqlName = (val as Record<symbol, string>)[DRIZZLE_TABLE_SYMBOL];
        if (sqlName) {
          schemaTables.push({ exportName, sqlName });
        }
      }
    }

    // Fail-closed sanity guard: we must find at least the well-known baseline
    // tables or the symbol-based detection is broken.
    const BASELINE_SQL_NAMES = ["users", "connections", "conversations"];
    const missingBaseline = BASELINE_SQL_NAMES.filter(
      n => !schemaTables.some(t => t.sqlName === n)
    );
    if (missingBaseline.length > 0) {
      throw new Error(
        `isDrizzleTable() / DRIZZLE_TABLE_SYMBOL detection appears broken — ` +
        `baseline tables not found: ${missingBaseline.join(", ")}.\n` +
        `Symbol.for("drizzle:Name") may have changed in a drizzle-orm upgrade.\n` +
        `Update isDrizzleTable() in this file.`
      );
    }

    // ── compare via the shared assertion helper ───────────────────────────────
    assertMigrationCoverage(schemaTables, tablesInMigrations);
  });
});

// ── 3. MIGRATION ORPHAN CHECK ──────────────────────────────────────────────────

/**
 * Reverse-coverage check: every CREATE TABLE statement found across all
 * migration SQL files must correspond to a Drizzle table that is still
 * exported from shared/schema.ts.
 *
 * If a table is removed from shared/schema.ts but its CREATE TABLE migration
 * is left behind, the migrations directory silently accumulates orphaned SQL
 * that no longer reflects what is actually live. This check makes that
 * situation a hard failure instead of quiet accumulation.
 *
 * Internal Drizzle metadata tables (names prefixed with "__creatrix_") are
 * excluded from the check because they are managed by the migration runner
 * itself and are never declared in the application schema.
 *
 * If this check fails:
 *   1. If the table was intentionally removed from shared/schema.ts, delete
 *      or archive the corresponding migration SQL file (or add an explicit
 *      DROP TABLE migration if it needs to be removed from live databases).
 *   2. If the table was accidentally removed from the schema, add it back.
 */

/** Table names managed by the migration runner itself — never in app schema. */
const INTERNAL_MIGRATION_TABLES = new Set(["__creatrix_migrations"]);

/**
 * Core assertion: throws a descriptive error if any table name found in a
 * CREATE TABLE statement inside migration files is not present in the live
 * schema, after excluding known internal tables.
 *
 * Extracted so both the positive test (real migration files) and the negative
 * test (synthetic orphan injected) exercise the identical check path and error
 * surface.
 */
function assertNoOrphanedMigrationTables(
  tablesInMigrations: Set<string>,
  schemaTableSqlNames: Set<string>
): void {
  const orphans = [...tablesInMigrations].filter(
    name =>
      !INTERNAL_MIGRATION_TABLES.has(name) &&
      !schemaTableSqlNames.has(name)
  );

  if (orphans.length > 0) {
    const lines = orphans.map(name => `  - ${name}`);
    throw new Error(
      `Orphaned migration table(s) detected — the following table(s) appear in a ` +
      `CREATE TABLE statement inside migrations/ but are no longer defined in shared/schema.ts:\n\n` +
      lines.join("\n") +
      `\n\nThis usually means a table was removed from shared/schema.ts without cleaning up ` +
      `its migration file, making the migration history misleading.\n\n` +
      `Fix options:\n` +
      `  A — If the table was intentionally removed, delete or archive its migration SQL file,\n` +
      `      or add an explicit DROP TABLE migration so live databases are cleaned up.\n` +
      `  B — If the table was accidentally removed from the schema, add it back to shared/schema.ts.`
    );
  }
}

describe("Migration orphan check – every CREATE TABLE in migration files must match a live schema table", () => {
  /**
   * NEGATIVE TEST — confirms the detection logic is live and not accidentally no-op'd.
   *
   * Injects a synthetic orphan table name into the "tables in migrations" set
   * while the schema set is kept empty, then asserts that
   * assertNoOrphanedMigrationTables() throws an error that names the orphan.
   * A future refactor that silently breaks the guard will cause this test to
   * fail rather than give false confidence.
   */
  it("raises an explicit error naming any migration table that no longer exists in the schema", () => {
    const ORPHAN_SQL_NAME = "__creatrix_orphan_reverse_test_table__";

    const syntheticMigrationTables = new Set([ORPHAN_SQL_NAME]);
    const emptySchemaSet = new Set<string>();

    expect(() =>
      assertNoOrphanedMigrationTables(syntheticMigrationTables, emptySchemaSet)
    ).toThrowError(/Orphaned migration table\(s\) detected/);

    expect(() =>
      assertNoOrphanedMigrationTables(syntheticMigrationTables, emptySchemaSet)
    ).toThrowError(new RegExp(ORPHAN_SQL_NAME));
  });

  it("internal migration-runner tables (e.g. __creatrix_migrations) are not flagged as orphans", () => {
    // The migration runner's own tracking table must never be flagged as
    // orphaned — it is managed internally and is not in the app schema.
    const onlyInternal = new Set(["__creatrix_migrations"]);
    const emptySchemaSet = new Set<string>();

    // Should not throw — internal tables are excluded from the check.
    expect(() =>
      assertNoOrphanedMigrationTables(onlyInternal, emptySchemaSet)
    ).not.toThrow();
  });

  it("every CREATE TABLE in migration SQL files corresponds to a live table in shared/schema.ts", () => {
    // ── locate the migrations directory ──────────────────────────────────────
    const migrationsDir = resolve(process.cwd(), "migrations");

    if (!existsSync(migrationsDir)) {
      throw new Error(
        `migrations/ directory not found at ${migrationsDir}.\n` +
        `Expected the project root to contain a migrations/ folder with SQL files.`
      );
    }

    const sqlFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql"));

    if (sqlFiles.length === 0) {
      throw new Error(
        `No SQL migration files found in ${migrationsDir}.\n` +
        `Run \`npx drizzle-kit generate\` to produce the initial migration.`
      );
    }

    // ── collect CREATE TABLE names from migration files ───────────────────────
    const tablesInMigrations = collectMigrationTableNames(migrationsDir, sqlFiles);

    // ── collect live SQL table names from shared/schema.ts ───────────────────
    const schemaTableSqlNames = new Set<string>();

    for (const [, val] of Object.entries(schemaModule)) {
      if (isDrizzleTable(val)) {
        const sqlName = (val as Record<symbol, string>)[DRIZZLE_TABLE_SYMBOL];
        if (sqlName) {
          schemaTableSqlNames.add(sqlName.toLowerCase());
        }
      }
    }

    // Fail-closed sanity guard: symbol-based detection must find baseline tables.
    const BASELINE_SQL_NAMES = ["users", "connections", "conversations"];
    const missingBaseline = BASELINE_SQL_NAMES.filter(n => !schemaTableSqlNames.has(n));
    if (missingBaseline.length > 0) {
      throw new Error(
        `isDrizzleTable() / DRIZZLE_TABLE_SYMBOL detection appears broken — ` +
        `baseline tables not found: ${missingBaseline.join(", ")}.\n` +
        `Symbol.for("drizzle:Name") may have changed in a drizzle-orm upgrade.\n` +
        `Update isDrizzleTable() in this file.`
      );
    }

    // ── compare via the shared assertion helper ───────────────────────────────
    assertNoOrphanedMigrationTables(tablesInMigrations, schemaTableSqlNames);
  });
});

// ── 4. MIGRATION SIMULATION ────────────────────────────────────────────────────

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
