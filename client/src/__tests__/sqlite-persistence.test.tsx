/**
 * Integration smoke test: DatabaseStorage persistence across restart cycles.
 *
 * These tests confirm that data written through DatabaseStorage is actually
 * persisted to disk and survives the storage layer being torn down and
 * recreated — the closest in-process equivalent of a server restart.
 *
 * The test uses a real on-disk SQLite file in the OS temp directory.
 * Each test gets a fresh file; the file is deleted after the test.
 *
 * What is covered:
 *   1. Conversation messages survive a full storage restart (JSON round-trip).
 *   2. settings.libraryPaths survives a restart (was a text().array() column,
 *      now stored as JSON text — verified to decode correctly on reload).
 *   3. unifiedSearch finds conversation content that was written before restart.
 *   4. Memory entries (global scope) survive a full storage restart.
 *   5. Knowledge document chunks survive a restart and deserialise correctly.
 *   6. Project-scoped and conversation-scoped memory entries are not mixed up
 *      with each other or with global entries after a restart.
 *   7. searchDocuments finds content inside chunks written before a restart.
 *   8. (separate describe) Fresh-install: _runMigrations creates all tables
 *      from scratch on a brand-new empty SQLite file.
 *   9. (separate describe) Rolled-back tracking: duplicate-column error is
 *      swallowed when the column already exists but the tracking row was deleted.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseStorage } from "@server/storage";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createClient } from "@libsql/client";

// ── Schema DDL ────────────────────────────────────────────────────────────────
// Minimal set of tables required by the test scenarios.
// Column definitions are kept in sync with shared/schema.ts.

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id                         TEXT PRIMARY KEY DEFAULT 'default',
  default_connection_id      TEXT,
  default_project_id         TEXT,
  theme                      TEXT DEFAULT 'system',
  root_folder                TEXT,
  library_paths              TEXT,
  morning_orientation_enabled INTEGER DEFAULT 0,
  whisper_endpoint           TEXT,
  search_endpoint            TEXT,
  embedding_model            TEXT,
  day_note                   TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  project_id   TEXT,
  connection_id TEXT,
  model        TEXT NOT NULL,
  messages     TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_entries (
  id              TEXT PRIMARY KEY,
  scope           TEXT NOT NULL,
  project_id      TEXT,
  conversation_id TEXT,
  content         TEXT NOT NULL,
  summary         TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id         TEXT PRIMARY KEY,
  project_id TEXT,
  title      TEXT NOT NULL,
  source     TEXT NOT NULL,
  content    TEXT NOT NULL,
  chunks     TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function applySchema(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` });
  // Execute each statement individually — @libsql/client rejects batched DDL
  // when passed as a single string with multiple statements.
  const statements = SCHEMA_SQL
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  await client.close();
}

function makeTempPath(): string {
  return join(tmpdir(), `creatrix-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DatabaseStorage – SQLite persistence across restart", () => {
  let dbPath: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(async () => {
    dbPath = makeTempPath();
    await applySchema(dbPath);
    process.env.SQLITE_PATH = dbPath;
  });

  afterEach(() => {
    // Restore env var
    if (originalSqlitePath === undefined) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = originalSqlitePath;
    }
    // Clean up temp DB file
    if (existsSync(dbPath)) {
      rmSync(dbPath);
    }
  });

  // ── 1. Conversation JSON round-trip ─────────────────────────────────────────

  it("conversation messages survive a storage restart (JSON round-trip)", async () => {
    // ── Write via instance A ──────────────────────────────────────────────────
    const storageA = new DatabaseStorage();
    await storageA.initialize();

    const conv = await storageA.createConversation({
      title: "Persist me",
      model: "gpt-4o",
      connectionId: "conn-test",
    });

    // Add a user message
    await storageA.addMessageToConversation(conv.id, {
      id: "msg-u1",
      role: "user",
      content: "Hello, SQLite!",
      createdAt: new Date().toISOString(),
    });

    // Add an assistant reply
    await storageA.addMessageToConversation(conv.id, {
      id: "msg-a1",
      role: "assistant",
      content: "Hello back from disk.",
      createdAt: new Date().toISOString(),
    });

    // ── Simulate restart: create a new instance pointing at the same file ──────
    const storageB = new DatabaseStorage();
    await storageB.initialize();

    const retrieved = await storageB.getConversation(conv.id);

    expect(retrieved, "conversation should be found after restart").toBeDefined();
    expect(retrieved!.title).toBe("Persist me");
    expect(retrieved!.messages).toHaveLength(2);

    const [user, assistant] = retrieved!.messages;
    expect(user.role).toBe("user");
    expect(user.content).toBe("Hello, SQLite!");
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toBe("Hello back from disk.");
  });

  // ── 2. settings.libraryPaths round-trip ─────────────────────────────────────

  it("settings.libraryPaths survives a restart (text JSON array round-trip)", async () => {
    const paths = ["/home/user/docs", "/home/user/notes", "/home/user/books"];

    // ── Write via instance A ──────────────────────────────────────────────────
    const storageA = new DatabaseStorage();
    await storageA.initialize();
    await storageA.updateSettings({ libraryPaths: paths, theme: "dark" });

    // ── Simulate restart ──────────────────────────────────────────────────────
    const storageB = new DatabaseStorage();
    await storageB.initialize();
    const settings = await storageB.getSettings();

    expect(settings.libraryPaths, "libraryPaths should be an array after restart").toEqual(paths);
    expect(settings.theme).toBe("dark");
  });

  // ── 3. Unified search finds persisted conversation content ──────────────────

  it("unifiedSearch finds conversation content written before restart", async () => {
    const uniquePhrase = "quartz-resonance-cascade";

    // ── Write via instance A ──────────────────────────────────────────────────
    const storageA = new DatabaseStorage();
    await storageA.initialize();

    const conv = await storageA.createConversation({
      title: `Discussion about ${uniquePhrase}`,
      model: "llama3",
      connectionId: "conn-search-test",
    });

    await storageA.addMessageToConversation(conv.id, {
      id: "msg-s1",
      role: "user",
      content: `Tell me everything about ${uniquePhrase} phenomena.`,
      createdAt: new Date().toISOString(),
    });

    // ── Simulate restart ──────────────────────────────────────────────────────
    const storageB = new DatabaseStorage();
    await storageB.initialize();

    const results = await storageB.unifiedSearch(uniquePhrase);

    expect(
      results.conversations.length,
      "should find at least one conversation matching the unique phrase",
    ).toBeGreaterThan(0);

    const found = results.conversations.find(c => c.id === conv.id);
    expect(found, "the exact conversation should appear in search results").toBeDefined();
  });

  // ── 4. Memory entry (global scope) round-trip ────────────────────────────────

  it("global memory entry survives a storage restart", async () => {
    // ── Write via instance A ──────────────────────────────────────────────────
    const storageA = new DatabaseStorage();
    await storageA.initialize();

    const entry = await storageA.createMemoryEntry({
      scope: "global",
      content: "The user prefers concise responses.",
      summary: "Concise preference",
    });

    // ── Simulate restart ──────────────────────────────────────────────────────
    const storageB = new DatabaseStorage();
    await storageB.initialize();

    const entries = await storageB.getMemoryEntries("global");

    expect(entries.length, "at least one global memory entry should exist after restart").toBeGreaterThan(0);

    const found = entries.find(e => e.id === entry.id);
    expect(found, "the exact memory entry should be present after restart").toBeDefined();
    expect(found!.scope).toBe("global");
    expect(found!.content).toBe("The user prefers concise responses.");
    expect(found!.summary).toBe("Concise preference");
  });

  // ── 5. Knowledge document chunks round-trip ──────────────────────────────────

  it("knowledge document chunks survive a restart and deserialise correctly", async () => {
    // ── Write via instance A ──────────────────────────────────────────────────
    const storageA = new DatabaseStorage();
    await storageA.initialize();

    const doc = await storageA.createKnowledgeDocument({
      title: "Photosynthesis Overview",
      source: "manual",
      content: "Plants convert light into energy via chlorophyll.",
      projectId: undefined,
    });

    // Attach two chunks via updateKnowledgeDocument
    const chunks = [
      { id: "chunk-1", content: "Chlorophyll absorbs red and blue light.", index: 0 },
      { id: "chunk-2", content: "Glucose is produced as a byproduct.", index: 1 },
    ];
    await storageA.updateKnowledgeDocument(doc.id, { chunks });

    // ── Simulate restart ──────────────────────────────────────────────────────
    const storageB = new DatabaseStorage();
    await storageB.initialize();

    const retrieved = await storageB.getKnowledgeDocument(doc.id);

    expect(retrieved, "knowledge document should be found after restart").toBeDefined();
    expect(retrieved!.title).toBe("Photosynthesis Overview");
    expect(retrieved!.chunks, "chunks should deserialise as an array").toHaveLength(2);

    const [c1, c2] = retrieved!.chunks;
    expect(c1.id).toBe("chunk-1");
    expect(c1.content).toBe("Chlorophyll absorbs red and blue light.");
    expect(c2.id).toBe("chunk-2");
    expect(c2.content).toBe("Glucose is produced as a byproduct.");
  });

  // ── 6. Memory scope isolation across restart ─────────────────────────────────

  it("project-scoped and conversation-scoped memory entries are not mixed up after restart", async () => {
    const projectId = "proj-abc";
    const conversationId = "conv-xyz";

    // ── Write one entry per scope via instance A ──────────────────────────────
    const storageA = new DatabaseStorage();
    await storageA.initialize();

    const globalEntry = await storageA.createMemoryEntry({
      scope: "global",
      content: "Global preference: always use metric units.",
      summary: "Metric units",
    });

    const projectEntry = await storageA.createMemoryEntry({
      scope: "project",
      projectId,
      content: "Project-specific note: use TypeScript strict mode.",
      summary: "TS strict",
    });

    const conversationEntry = await storageA.createMemoryEntry({
      scope: "conversation",
      conversationId,
      content: "In this conversation the user wants bullet-point answers.",
      summary: "Bullet points",
    });

    // ── Simulate restart ──────────────────────────────────────────────────────
    const storageB = new DatabaseStorage();
    await storageB.initialize();

    // ── Query each scope independently ────────────────────────────────────────
    const globalEntries = await storageB.getMemoryEntries("global");
    const projectEntries = await storageB.getMemoryEntries("project", projectId);
    const conversationEntries = await storageB.getMemoryEntries("conversation", conversationId);

    // Global scope: must contain the global entry and must NOT contain the others
    const foundGlobal = globalEntries.find(e => e.id === globalEntry.id);
    expect(foundGlobal, "global entry should appear in global scope query").toBeDefined();
    expect(foundGlobal!.scope).toBe("global");
    expect(globalEntries.find(e => e.id === projectEntry.id),
      "project entry must not appear in global scope query").toBeUndefined();
    expect(globalEntries.find(e => e.id === conversationEntry.id),
      "conversation entry must not appear in global scope query").toBeUndefined();

    // Project scope: must contain the project entry and must NOT contain the others
    const foundProject = projectEntries.find(e => e.id === projectEntry.id);
    expect(foundProject, "project entry should appear in project scope query").toBeDefined();
    expect(foundProject!.scope).toBe("project");
    expect(foundProject!.projectId).toBe(projectId);
    expect(projectEntries.find(e => e.id === globalEntry.id),
      "global entry must not appear in project scope query").toBeUndefined();
    expect(projectEntries.find(e => e.id === conversationEntry.id),
      "conversation entry must not appear in project scope query").toBeUndefined();

    // Conversation scope: must contain the conversation entry and must NOT contain the others
    const foundConversation = conversationEntries.find(e => e.id === conversationEntry.id);
    expect(foundConversation, "conversation entry should appear in conversation scope query").toBeDefined();
    expect(foundConversation!.scope).toBe("conversation");
    expect(foundConversation!.conversationId).toBe(conversationId);
    expect(conversationEntries.find(e => e.id === globalEntry.id),
      "global entry must not appear in conversation scope query").toBeUndefined();
    expect(conversationEntries.find(e => e.id === projectEntry.id),
      "project entry must not appear in conversation scope query").toBeUndefined();

    // Cross-project: a query for a different projectId must not return our entry
    const otherProjectEntries = await storageB.getMemoryEntries("project", "proj-other");
    expect(otherProjectEntries.find(e => e.id === projectEntry.id),
      "project entry must not appear when querying a different projectId").toBeUndefined();

    // Cross-conversation: a query for a different conversationId must not return our entry
    const otherConversationEntries = await storageB.getMemoryEntries("conversation", "conv-other");
    expect(otherConversationEntries.find(e => e.id === conversationEntry.id),
      "conversation entry must not appear when querying a different conversationId").toBeUndefined();
  });

  // ── 6b. getMemoryEntries("project") with no scopeId — data-leak guard ────────
  //
  // CURRENT BEHAVIOUR (documented, not desired):
  //   When scopeId is omitted, the else-branch in getMemoryEntries fires and
  //   returns every row whose scope column equals "project", regardless of
  //   projectId.  This is a silent data leak: a caller that forgets to pass
  //   projectId gets every project's memory entries merged together.
  //
  // This test pins that behaviour explicitly so any future change — either
  // fixing the leak (result becomes empty) or intentionally keeping it — is a
  // visible, deliberate decision rather than an invisible regression.

  it("getMemoryEntries('project') without scopeId currently returns all project-scope rows (documents data-leak behaviour)", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write two entries belonging to two different projects
    const entryA = await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-alpha",
      content: "Alpha project: use tabs for indentation.",
      summary: "Tabs preference",
    });

    const entryB = await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-beta",
      content: "Beta project: use spaces for indentation.",
      summary: "Spaces preference",
    });

    // Call with no scopeId — falls through to the bare scope filter
    const allProjectEntries = await storage.getMemoryEntries("project");

    // DOCUMENT the current (leaky) behaviour: both entries are returned even
    // though no projectId was supplied.  If this assertion ever starts failing
    // because the implementation was tightened to return [] when scopeId is
    // missing, update this test to assert the empty-result path instead.
    expect(
      allProjectEntries.find(e => e.id === entryA.id),
      "currently, alpha entry is returned even without a scopeId (data-leak behaviour)",
    ).toBeDefined();
    expect(
      allProjectEntries.find(e => e.id === entryB.id),
      "currently, beta entry is returned even without a scopeId (data-leak behaviour)",
    ).toBeDefined();

    // Sanity: a correctly-scoped query still returns only the right entry
    const alphaOnly = await storage.getMemoryEntries("project", "proj-alpha");
    expect(alphaOnly.find(e => e.id === entryA.id),
      "scoped query for proj-alpha should find alpha entry").toBeDefined();
    expect(alphaOnly.find(e => e.id === entryB.id),
      "scoped query for proj-alpha must not find beta entry").toBeUndefined();
  });

  // ── 7. clearMemory only erases entries in its own scope ─────────────────────

  it("clearMemory(project) removes only project-scoped entries, leaving global and conversation entries untouched", async () => {
    const projectId = "proj-clear-test";
    const conversationId = "conv-clear-test";

    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write one entry per scope
    const globalEntry = await storage.createMemoryEntry({
      scope: "global",
      content: "Global: always use SI units.",
      summary: "SI units",
    });

    const projectEntry = await storage.createMemoryEntry({
      scope: "project",
      projectId,
      content: "Project note: enable strict null checks.",
      summary: "Strict nulls",
    });

    const conversationEntry = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId,
      content: "Conversation: user wants numbered lists.",
      summary: "Numbered lists",
    });

    // Confirm all three are present before the clear
    const beforeGlobal = await storage.getMemoryEntries("global");
    const beforeProject = await storage.getMemoryEntries("project", projectId);
    const beforeConversation = await storage.getMemoryEntries("conversation", conversationId);
    expect(beforeGlobal.find(e => e.id === globalEntry.id)).toBeDefined();
    expect(beforeProject.find(e => e.id === projectEntry.id)).toBeDefined();
    expect(beforeConversation.find(e => e.id === conversationEntry.id)).toBeDefined();

    // Clear only the project scope
    const cleared = await storage.clearMemory("project", projectId);
    expect(cleared).toBe(true);

    // Project-scoped entry must be gone
    const afterProject = await storage.getMemoryEntries("project", projectId);
    expect(
      afterProject.find(e => e.id === projectEntry.id),
      "project entry should be removed after clearMemory('project', projectId)",
    ).toBeUndefined();

    // Global entry must survive
    const afterGlobal = await storage.getMemoryEntries("global");
    expect(
      afterGlobal.find(e => e.id === globalEntry.id),
      "global entry must not be affected by clearMemory('project', ...)",
    ).toBeDefined();

    // Conversation entry must survive
    const afterConversation = await storage.getMemoryEntries("conversation", conversationId);
    expect(
      afterConversation.find(e => e.id === conversationEntry.id),
      "conversation entry must not be affected by clearMemory('project', ...)",
    ).toBeDefined();
  });

  // ── 8. searchDocuments finds content inside chunks written before a restart ───

  it("searchDocuments finds content inside chunks written before a restart", async () => {
    const uniquePhrase = "vellichor-cascade-photon";

    // ── Write via instance A ──────────────────────────────────────────────────
    const storageA = new DatabaseStorage();
    await storageA.initialize();

    const doc = await storageA.createKnowledgeDocument({
      title: "Optics Reference",
      source: "manual",
      content: "A reference document about optical phenomena.",
      projectId: undefined,
    });

    const chunks = [
      { id: "chunk-a", content: `Introduction to ${uniquePhrase} theory.`, index: 0 },
      { id: "chunk-b", content: "Refraction causes light to bend at interfaces.", index: 1 },
      { id: "chunk-c", content: `Advanced ${uniquePhrase} applications in fibre optics.`, index: 2 },
    ];
    await storageA.updateKnowledgeDocument(doc.id, { chunks });

    // ── Simulate restart: new instance on the same file ───────────────────────
    const storageB = new DatabaseStorage();
    await storageB.initialize();

    const results = await storageB.searchDocuments(uniquePhrase);

    expect(results.length, "searchDocuments should return at least one result").toBeGreaterThan(0);

    const hit = results.find(r => r.doc.id === doc.id);
    expect(hit, "the document written before restart should appear in results").toBeDefined();

    const matchedIds = hit!.chunks.map(c => c.id);
    expect(
      matchedIds.some(id => id === "chunk-a" || id === "chunk-c"),
      "at least one matching chunk should be returned",
    ).toBe(true);

    for (const chunk of hit!.chunks) {
      expect(
        chunk.content.toLowerCase().includes(uniquePhrase.split("-")[0]),
        `returned chunk content should contain the search term (got: "${chunk.content}")`,
      ).toBe(true);
    }
  });
});

// ── Fresh-install path ────────────────────────────────────────────────────────
//
// Verifies that _runMigrations handles a completely empty SQLite file correctly:
// no pre-existing tables, no __creatrix_migrations tracking table.
// After initialize() returns every application table must exist and be queryable,
// and __creatrix_migrations must contain exactly one row for "0000_sweet_red_shift".

describe("DatabaseStorage – fresh-install migration from empty database", () => {
  let dbPath: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    // Create a unique temp path but do NOT write any SQL to it — the file
    // itself does not need to pre-exist; @libsql/client creates it on first
    // connection, leaving a truly empty database with no tables at all.
    dbPath = join(tmpdir(), `creatrix-fresh-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

  it("creates all application tables from scratch on a brand-new empty database", async () => {
    // ── Run migrations against a completely empty file ────────────────────────
    const storage = new DatabaseStorage();
    await storage.initialize();

    // ── Verify every application table is queryable ───────────────────────────
    // A successful SELECT (even returning zero rows) proves the table was created.
    const client = createClient({ url: `file:${dbPath}` });

    const appTables = [
      "connections",
      "consultants",
      "conversation_flags",
      "conversations",
      "journal_entries",
      "knowledge_documents",
      "library_folders",
      "library_items",
      "memory_entries",
      "projects",
      "settings",
      "system_logs",
      "users",
      "workspace_docs",
    ];

    for (const table of appTables) {
      const result = await client.execute(`SELECT 1 FROM ${table} LIMIT 0`);
      expect(result, `table "${table}" should exist and be queryable after fresh initialize()`).toBeDefined();
    }

    // ── Verify migration tracking record ──────────────────────────────────────
    const migResult = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0000_sweet_red_shift'"
    );
    expect(
      migResult.rows.length,
      "__creatrix_migrations should have a row for '0000_sweet_red_shift'",
    ).toBe(1);
    expect(migResult.rows[0]["tag"]).toBe("0000_sweet_red_shift");

    await client.close();
  });

  it("allows data to be written and read immediately after fresh initialize()", async () => {
    // Confirms the tables are not just present but fully functional after a
    // fresh-install migration — no half-applied schema that silently drops rows.
    const storage = new DatabaseStorage();
    await storage.initialize();

    const conv = await storage.createConversation({
      title: "Fresh-install round-trip",
      model: "gpt-4o",
      connectionId: "conn-fresh",
    });

    await storage.addMessageToConversation(conv.id, {
      id: "msg-fresh-1",
      role: "user",
      content: "Does the fresh schema work?",
      createdAt: new Date().toISOString(),
    });

    const retrieved = await storage.getConversation(conv.id);
    expect(retrieved, "conversation should be retrievable immediately after fresh initialize()").toBeDefined();
    expect(retrieved!.title).toBe("Fresh-install round-trip");
    expect(retrieved!.messages).toHaveLength(1);
    expect(retrieved!.messages[0].content).toBe("Does the fresh schema work?");
  });
});

// ── Incremental migration path ─────────────────────────────────────────────────
//
// Verifies that _runMigrations skips an already-applied migration and only
// executes the new one. This guards against regressions in the runner that
// could silently leave future schema additions unapplied on upgrade.
//
// Strategy:
//   1. Call initialize() so __creatrix_migrations already contains
//      "0000_sweet_red_shift" and every real application table exists.
//   2. Build a synthetic migrations folder whose journal lists BOTH the
//      existing migration and a new "0001_add_test_col" entry.
//   3. Call _runMigrations() (via `as any`) pointing at the synthetic folder.
//   4. Assert the new column was created (proving only the new migration ran)
//      and that both tags are recorded in __creatrix_migrations.

describe("DatabaseStorage – incremental migration (second migration file)", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-incr-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  });

  afterEach(() => {
    if (originalSqlitePath === undefined) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = originalSqlitePath;
    }
    if (existsSync(dbPath)) rmSync(dbPath);
    if (existsSync(tmpMigrationsDir)) rmSync(tmpMigrationsDir, { recursive: true });
  });

  it("skips the already-applied migration and only runs the new one", async () => {
    // Step 1: Full initialize — __creatrix_migrations now contains "0000_sweet_red_shift"
    // and all real application tables exist (including `settings`).
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    // Journal lists both the real first migration and the new synthetic one.
    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 1000000000000, tag: "0000_sweet_red_shift", breakpoints: true },
        { idx: 1, version: "6", when: 2000000000000, tag: "0001_add_test_col",    breakpoints: true },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Migration 0000 SQL adds a sentinel column — if the runner incorrectly
    // re-executes this file the column will appear in the database and the
    // assertion below will catch it.  The runner must skip this file entirely
    // because "0000_sweet_red_shift" is already recorded in __creatrix_migrations.
    writeFileSync(
      join(tmpMigrationsDir, "0000_sweet_red_shift.sql"),
      "ALTER TABLE settings ADD COLUMN migration_zero_ran TEXT"
    );

    // The new migration adds a different column that does not yet exist.
    writeFileSync(
      join(tmpMigrationsDir, "0001_add_test_col.sql"),
      "ALTER TABLE settings ADD COLUMN test_col TEXT"
    );

    // Step 3: Snapshot the migration count BEFORE calling the incremental runner,
    // so we can assert exactly one new row was added (not two) regardless of how
    // many real migrations accumulate in the project over time.
    const client = createClient({ url: `file:${dbPath}` });
    const beforeResult = await client.execute(
      "SELECT COUNT(*) as cnt FROM __creatrix_migrations"
    );
    const countBefore = beforeResult.rows[0]["cnt"] as number;

    // Step 4: Run _runMigrations with the synthetic folder.
    await (storage as any)._runMigrations(tmpMigrationsDir);

    // --- Prove migration 0001 ran: test_col must exist. ---
    // SELECT against it throws if the column is absent.
    await client.execute("SELECT test_col FROM settings LIMIT 0");

    // --- Prove migration 0000 was skipped: migration_zero_ran must NOT exist. ---
    // PRAGMA table_info returns one row per column; none should be named
    // "migration_zero_ran" if the runner correctly skipped the already-applied file.
    const pragmaResult = await client.execute("PRAGMA table_info(settings)");
    const columnNames = pragmaResult.rows.map((r) => r["name"] as string);
    expect(
      columnNames,
      "migration_zero_ran column must NOT exist — proves 0000 was skipped, not re-executed"
    ).not.toContain("migration_zero_ran");

    // --- Prove exactly one new tracking row was added (for 0001 only). ---
    // Using a delta rather than an absolute count keeps the assertion valid as
    // more real migrations are added to the project in future releases.
    const afterResult = await client.execute(
      "SELECT tag FROM __creatrix_migrations"
    );
    const tags = afterResult.rows.map((r) => r["tag"] as string);

    expect(
      tags.length - countBefore,
      "exactly one new migration should have been recorded (0001_add_test_col)"
    ).toBe(1);
    expect(tags).toContain("0000_sweet_red_shift");
    expect(tags).toContain("0001_add_test_col");

    await client.close();
  });
});

// ── Rolled-back tracking path ──────────────────────────────────────────────────
//
// Simulates the scenario where a migration's tracking row was deleted from
// __creatrix_migrations (e.g. by a manual rollback attempt) but the schema
// change (ALTER TABLE ADD COLUMN) was NOT reversed.
//
// _runMigrations will try to re-apply the migration and hit a
// "duplicate column name" error. The idempotency guard must swallow that
// error, record the migration as applied, and leave both the column and the
// tracking row intact.
//
// Strategy:
//   1. Initialize storage so all real application tables exist.
//   2. Build a synthetic migrations folder with a single ADD COLUMN migration.
//   3. Run _runMigrations() to apply it — column created, tracking row inserted.
//   4. Delete the tracking row directly via a raw client.
//   5. Run _runMigrations() again — runner believes the migration is unapplied,
//      tries ALTER TABLE ADD COLUMN, gets "duplicate column name", must NOT throw.
//   6. Assert the column still exists and the tracking row was re-inserted.

describe("DatabaseStorage – rolled-back migration tracking re-applies cleanly", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-rollback-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-rb-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  });

  afterEach(() => {
    if (originalSqlitePath === undefined) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = originalSqlitePath;
    }
    if (existsSync(dbPath)) rmSync(dbPath);
    if (existsSync(tmpMigrationsDir)) rmSync(tmpMigrationsDir, { recursive: true });
  });

  it("swallows duplicate-column error and re-records the tracking row when the column already exists", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a single ADD COLUMN migration.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 3000000000000, tag: "0002_add_rollback_col", breakpoints: true },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    writeFileSync(
      join(tmpMigrationsDir, "0002_add_rollback_col.sql"),
      "ALTER TABLE settings ADD COLUMN rollback_test_col TEXT"
    );

    // Step 3: Apply the migration — column is created and tracking row is inserted.
    await (storage as any)._runMigrations(tmpMigrationsDir);

    const client = createClient({ url: `file:${dbPath}` });

    // Confirm the column was created and the tracking row exists.
    await client.execute("SELECT rollback_test_col FROM settings LIMIT 0");
    const afterFirstRun = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0002_add_rollback_col'"
    );
    expect(
      afterFirstRun.rows.length,
      "tracking row should exist after first run"
    ).toBe(1);

    // Step 4: Delete the tracking row — simulates the rollback scenario.
    await client.execute(
      "DELETE FROM __creatrix_migrations WHERE tag = '0002_add_rollback_col'"
    );
    const afterDelete = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0002_add_rollback_col'"
    );
    expect(
      afterDelete.rows.length,
      "tracking row should be gone after manual delete"
    ).toBe(0);

    // Step 5: Run _runMigrations again — the runner now believes 0002 is unapplied.
    // It will try ALTER TABLE ADD COLUMN, hit "duplicate column name", and must NOT throw.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).resolves.toBeUndefined();

    // Step 6: Both the column and the tracking row must exist afterwards.
    await client.execute("SELECT rollback_test_col FROM settings LIMIT 0");

    const afterSecondRun = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0002_add_rollback_col'"
    );
    expect(
      afterSecondRun.rows.length,
      "tracking row must be re-inserted after the duplicate-column error was swallowed"
    ).toBe(1);
    expect(afterSecondRun.rows[0]["tag"]).toBe("0002_add_rollback_col");

    await client.close();
  });
});
