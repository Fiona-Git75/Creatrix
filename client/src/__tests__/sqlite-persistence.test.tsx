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
 *   5. Project-scoped and conversation-scoped memory entries are not mixed up
 *      with each other or with global entries after a restart.
 *   6. (separate describe) Fresh-install: _runMigrations creates all tables
 *      from scratch on a brand-new empty SQLite file.
 *   7. (separate describe) Rolled-back tracking: duplicate-column error is
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

  // ── 5. Memory scope isolation across restart ─────────────────────────────────

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

  it("getMemoryEntries('project') without scopeId returns empty array (no cross-project leak)", async () => {
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

    // Call with no scopeId — must throw rather than leaking all projects
    await expect(
      storage.getMemoryEntries("project"),
      "omitting scopeId for project scope must throw",
    ).rejects.toThrow("project scope requires a scopeId");

    // Sanity: a correctly-scoped query still returns only the right entry
    const alphaOnly = await storage.getMemoryEntries("project", "proj-alpha");
    expect(alphaOnly.find(e => e.id === entryA.id),
      "scoped query for proj-alpha should find alpha entry").toBeDefined();
    expect(alphaOnly.find(e => e.id === entryB.id),
      "scoped query for proj-alpha must not find beta entry").toBeUndefined();

    // Conversation scope: omitting scopeId must also return empty
    const entryC = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: "conv-one",
      content: "Conversation one context.",
    });

    await expect(
      storage.getMemoryEntries("conversation"),
      "omitting scopeId for conversation scope must throw",
    ).rejects.toThrow("conversation scope requires a scopeId");

    // Correctly-scoped conversation query still works
    const convOne = await storage.getMemoryEntries("conversation", "conv-one");
    expect(convOne.find(e => e.id === entryC.id),
      "scoped query for conv-one should find the entry").toBeDefined();
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

  // ── 7b. clearMemory('global') removes only global entries ───────────────────
  //
  // The global path has no scopeId guard — it deletes every row whose scope
  // equals "global". A bug here would silently wipe project and conversation
  // entries as a side-effect. This test makes that failure visible.

  it("clearMemory('global') removes all global entries and leaves project and conversation entries untouched", async () => {
    const projectId = "proj-global-clear";
    const conversationId = "conv-global-clear";

    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write one entry per scope
    const globalEntry = await storage.createMemoryEntry({
      scope: "global",
      content: "Global: prefer dark mode.",
      summary: "Dark mode",
    });

    const projectEntry = await storage.createMemoryEntry({
      scope: "project",
      projectId,
      content: "Project note: always lint before commit.",
      summary: "Lint rule",
    });

    const conversationEntry = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId,
      content: "Conversation: user wants terse replies.",
      summary: "Terse replies",
    });

    // Confirm all three are present before the clear
    const beforeGlobal = await storage.getMemoryEntries("global");
    const beforeProject = await storage.getMemoryEntries("project", projectId);
    const beforeConversation = await storage.getMemoryEntries("conversation", conversationId);
    expect(beforeGlobal.find(e => e.id === globalEntry.id)).toBeDefined();
    expect(beforeProject.find(e => e.id === projectEntry.id)).toBeDefined();
    expect(beforeConversation.find(e => e.id === conversationEntry.id)).toBeDefined();

    // Clear only the global scope (no scopeId — highest-risk variant)
    const cleared = await storage.clearMemory("global");
    expect(cleared).toBe(true);

    // Global entry must be gone
    const afterGlobal = await storage.getMemoryEntries("global");
    expect(
      afterGlobal.find(e => e.id === globalEntry.id),
      "global entry should be removed after clearMemory('global')",
    ).toBeUndefined();

    // Project entry must survive
    const afterProject = await storage.getMemoryEntries("project", projectId);
    expect(
      afterProject.find(e => e.id === projectEntry.id),
      "project entry must not be affected by clearMemory('global')",
    ).toBeDefined();

    // Conversation entry must survive
    const afterConversation = await storage.getMemoryEntries("conversation", conversationId);
    expect(
      afterConversation.find(e => e.id === conversationEntry.id),
      "conversation entry must not be affected by clearMemory('global')",
    ).toBeDefined();
  });

  // ── 7c. clearMemory('project') without a scopeId is a no-op ─────────────────
  //
  // The guard `scope === "project" && scopeId` in clearMemory means that
  // omitting scopeId must leave every project-scoped row untouched.
  // This test pins that behaviour so a future change that accidentally drops
  // the scopeId check would be caught immediately rather than silently wiping
  // all project memory across every project at once.

  it("clearMemory('project') without a scopeId is a no-op — all project entries survive", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write project-scoped entries for three distinct projects
    const entryAlpha = await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-noop-alpha",
      content: "Alpha: use ESLint with airbnb rules.",
      summary: "ESLint airbnb",
    });

    const entryBeta = await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-noop-beta",
      content: "Beta: deploy to Fly.io staging first.",
      summary: "Fly.io staging",
    });

    const entryGamma = await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-noop-gamma",
      content: "Gamma: all API responses must include a requestId.",
      summary: "requestId convention",
    });

    // Also write a global entry to confirm it is unaffected
    const globalEntry = await storage.createMemoryEntry({
      scope: "global",
      content: "Global: prefer ES modules over CommonJS.",
      summary: "ES modules",
    });

    // Call clearMemory("project") with NO scopeId — must be a no-op
    const result = await storage.clearMemory("project");
    expect(result).toBe(true);

    // All three project-scoped entries must still be present
    const alphaEntries = await storage.getMemoryEntries("project", "proj-noop-alpha");
    expect(
      alphaEntries.find(e => e.id === entryAlpha.id),
      "alpha project entry must survive clearMemory('project') with no scopeId",
    ).toBeDefined();

    const betaEntries = await storage.getMemoryEntries("project", "proj-noop-beta");
    expect(
      betaEntries.find(e => e.id === entryBeta.id),
      "beta project entry must survive clearMemory('project') with no scopeId",
    ).toBeDefined();

    const gammaEntries = await storage.getMemoryEntries("project", "proj-noop-gamma");
    expect(
      gammaEntries.find(e => e.id === entryGamma.id),
      "gamma project entry must survive clearMemory('project') with no scopeId",
    ).toBeDefined();

    // Global entry must also be unaffected
    const globalEntries = await storage.getMemoryEntries("global");
    expect(
      globalEntries.find(e => e.id === globalEntry.id),
      "global entry must not be affected by clearMemory('project') with no scopeId",
    ).toBeDefined();
  });

  // ── 7d. clearMemory('conversation') removes only conversation-scoped entries ──
  //
  // A bug here could silently wipe global or project entries when the caller
  // only intended to clear a single conversation's memory. This test makes
  // that failure visible by writing one entry per scope, calling clearMemory
  // with a specific conversationId, and asserting that only the targeted entry
  // is removed.

  it("clearMemory('conversation') removes only the targeted conversation entry, leaving global and project entries untouched", async () => {
    const projectId = "proj-conv-clear";
    const conversationId = "conv-conv-clear";

    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write one entry per scope into the same database
    const globalEntry = await storage.createMemoryEntry({
      scope: "global",
      content: "Global: always prefer async/await over callbacks.",
      summary: "Async/await preference",
    });

    const projectEntry = await storage.createMemoryEntry({
      scope: "project",
      projectId,
      content: "Project note: keep bundle size under 200 kB.",
      summary: "Bundle size limit",
    });

    const conversationEntry = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId,
      content: "Conversation: user prefers bullet points.",
      summary: "Bullet points",
    });

    // Confirm all three are present before the clear
    const beforeGlobal = await storage.getMemoryEntries("global");
    const beforeProject = await storage.getMemoryEntries("project", projectId);
    const beforeConversation = await storage.getMemoryEntries("conversation", conversationId);
    expect(beforeGlobal.find(e => e.id === globalEntry.id)).toBeDefined();
    expect(beforeProject.find(e => e.id === projectEntry.id)).toBeDefined();
    expect(beforeConversation.find(e => e.id === conversationEntry.id)).toBeDefined();

    // Clear only the conversation scope for this specific conversationId
    const cleared = await storage.clearMemory("conversation", conversationId);
    expect(cleared).toBe(true);

    // Conversation-scoped entry must be gone
    const afterConversation = await storage.getMemoryEntries("conversation", conversationId);
    expect(
      afterConversation.find(e => e.id === conversationEntry.id),
      "conversation entry should be removed after clearMemory('conversation', conversationId)",
    ).toBeUndefined();

    // Global entry must survive
    const afterGlobal = await storage.getMemoryEntries("global");
    expect(
      afterGlobal.find(e => e.id === globalEntry.id),
      "global entry must not be affected by clearMemory('conversation', ...)",
    ).toBeDefined();

    // Project entry must survive
    const afterProject = await storage.getMemoryEntries("project", projectId);
    expect(
      afterProject.find(e => e.id === projectEntry.id),
      "project entry must not be affected by clearMemory('conversation', ...)",
    ).toBeDefined();
  });

  // ── 7e. clearMemory('conversation') without a scopeId is a no-op ─────────────
  //
  // The guard `scope === "conversation" && scopeId` in clearMemory means that
  // omitting scopeId must leave every conversation-scoped row untouched.
  // This test pins that behaviour so a future change that accidentally drops
  // the scopeId check would be caught immediately rather than silently wiping
  // all conversation memory across every conversation at once.

  it("clearMemory('conversation') without a scopeId is a no-op — all conversation entries survive", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write conversation-scoped entries for three distinct conversations
    const entryOne = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: "conv-noop-one",
      content: "Conv one: user prefers concise answers.",
      summary: "Concise answers",
    });

    const entryTwo = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: "conv-noop-two",
      content: "Conv two: user is debugging a Rust borrow-checker error.",
      summary: "Rust borrow-checker",
    });

    const entryThree = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: "conv-noop-three",
      content: "Conv three: user wants all code examples in TypeScript.",
      summary: "TypeScript examples",
    });

    // Also write a global entry and a project entry to confirm they are unaffected
    const globalEntry = await storage.createMemoryEntry({
      scope: "global",
      content: "Global: always cite sources.",
      summary: "Cite sources",
    });

    const projectEntry = await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-noop-sentinel",
      content: "Project: use metric units throughout.",
      summary: "Metric units",
    });

    // Call clearMemory("conversation") with NO scopeId — must be a no-op
    const result = await storage.clearMemory("conversation");
    expect(result).toBe(true);

    // All three conversation-scoped entries must still be present
    const oneEntries = await storage.getMemoryEntries("conversation", "conv-noop-one");
    expect(
      oneEntries.find(e => e.id === entryOne.id),
      "conv-noop-one entry must survive clearMemory('conversation') with no scopeId",
    ).toBeDefined();

    const twoEntries = await storage.getMemoryEntries("conversation", "conv-noop-two");
    expect(
      twoEntries.find(e => e.id === entryTwo.id),
      "conv-noop-two entry must survive clearMemory('conversation') with no scopeId",
    ).toBeDefined();

    const threeEntries = await storage.getMemoryEntries("conversation", "conv-noop-three");
    expect(
      threeEntries.find(e => e.id === entryThree.id),
      "conv-noop-three entry must survive clearMemory('conversation') with no scopeId",
    ).toBeDefined();

    // Global entry must also be unaffected
    const globalEntries = await storage.getMemoryEntries("global");
    expect(
      globalEntries.find(e => e.id === globalEntry.id),
      "global entry must not be affected by clearMemory('conversation') with no scopeId",
    ).toBeDefined();

    // Project entry must also be unaffected
    const projectEntries = await storage.getMemoryEntries("project", "proj-noop-sentinel");
    expect(
      projectEntries.find(e => e.id === projectEntry.id),
      "project entry must not be affected by clearMemory('conversation') with no scopeId",
    ).toBeDefined();
  });

  // ── 7f. clearMemory('conversation') with a mismatched scopeId leaves the bystander untouched ──
  //
  // The WHERE clause in clearMemory must filter on BOTH scope AND conversationId.
  // A regression that drops the conversationId condition would wipe every
  // conversation-scoped entry, not just the targeted one. This test writes
  // entries for two different conversationIds and confirms that only the
  // targeted conversation's entry is removed while the bystander's entry
  // survives intact.

  it("clearMemory('conversation', targetId) removes only the target conversation's entries and leaves the bystander untouched", async () => {
    const targetId = "conv-target";
    const bystanderId = "conv-bystander";

    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write one conversation-scoped entry for each conversationId
    const targetEntry = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: targetId,
      content: "Target conversation: user wants step-by-step explanations.",
      summary: "Step-by-step",
    });

    const bystanderEntry = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: bystanderId,
      content: "Bystander conversation: user prefers code-only responses.",
      summary: "Code-only",
    });

    // Confirm both entries are present before the clear
    const beforeTarget = await storage.getMemoryEntries("conversation", targetId);
    const beforeBystander = await storage.getMemoryEntries("conversation", bystanderId);
    expect(beforeTarget.find(e => e.id === targetEntry.id),
      "target entry should exist before clear").toBeDefined();
    expect(beforeBystander.find(e => e.id === bystanderEntry.id),
      "bystander entry should exist before clear").toBeDefined();

    // Clear only the target conversation's entries
    const cleared = await storage.clearMemory("conversation", targetId);
    expect(cleared).toBe(true);

    // Target entry must be gone
    const afterTarget = await storage.getMemoryEntries("conversation", targetId);
    expect(
      afterTarget.find(e => e.id === targetEntry.id),
      "target conversation entry should be removed after clearMemory('conversation', targetId)",
    ).toBeUndefined();

    // Bystander entry must still be present
    const afterBystander = await storage.getMemoryEntries("conversation", bystanderId);
    expect(
      afterBystander.find(e => e.id === bystanderEntry.id),
      "bystander conversation entry must not be affected by clearMemory targeting a different conversationId",
    ).toBeDefined();
  });

  // ── 7g. clearMemory('global') with a mismatched scopeId still wipes all global entries ──
  //
  // The 'global' branch in clearMemory ignores scopeId entirely — it always
  // deletes every row whose scope equals "global". Passing an unexpected
  // scopeId must NOT turn the clear into a no-op. This test pins that contract
  // so a refactor that accidentally adds a scopeId guard to the 'global' branch
  // would be caught immediately.

  it("clearMemory('global', spuriousId) still wipes all global entries and leaves project and conversation entries untouched", async () => {
    const projectId = "proj-global-mismatch";
    const conversationId = "conv-global-mismatch";

    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write two global entries so we can confirm both are gone
    const globalEntryA = await storage.createMemoryEntry({
      scope: "global",
      content: "Global A: always use Oxford commas.",
      summary: "Oxford comma",
    });

    const globalEntryB = await storage.createMemoryEntry({
      scope: "global",
      content: "Global B: prefer 2-space indentation.",
      summary: "2-space indent",
    });

    const projectEntry = await storage.createMemoryEntry({
      scope: "project",
      projectId,
      content: "Project note: run tests before pushing.",
      summary: "Test before push",
    });

    const conversationEntry = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId,
      content: "Conversation: user wants step-by-step explanations.",
      summary: "Step-by-step",
    });

    // Confirm all four are present before the clear
    const beforeGlobal = await storage.getMemoryEntries("global");
    expect(beforeGlobal.find(e => e.id === globalEntryA.id)).toBeDefined();
    expect(beforeGlobal.find(e => e.id === globalEntryB.id)).toBeDefined();

    // Call clearMemory with a scopeId that has nothing to do with global scope
    const cleared = await storage.clearMemory("global", "some-spurious-id");
    expect(cleared).toBe(true);

    // Both global entries must be gone — the spurious scopeId must not act as a guard
    const afterGlobal = await storage.getMemoryEntries("global");
    expect(
      afterGlobal.find(e => e.id === globalEntryA.id),
      "global entry A should be removed even when a spurious scopeId is passed",
    ).toBeUndefined();
    expect(
      afterGlobal.find(e => e.id === globalEntryB.id),
      "global entry B should be removed even when a spurious scopeId is passed",
    ).toBeUndefined();

    // Project entry must survive
    const afterProject = await storage.getMemoryEntries("project", projectId);
    expect(
      afterProject.find(e => e.id === projectEntry.id),
      "project entry must not be affected by clearMemory('global', spuriousId)",
    ).toBeDefined();

    // Conversation entry must survive
    const afterConversation = await storage.getMemoryEntries("conversation", conversationId);
    expect(
      afterConversation.find(e => e.id === conversationEntry.id),
      "conversation entry must not be affected by clearMemory('global', spuriousId)",
    ).toBeDefined();
  });

  // ── 7h. clearMemory('global') with no scopeId wipes all entries when table has only global entries ──
  //
  // When the table contains exclusively global entries (no project or
  // conversation rows as bystanders), a scoping bug could produce a different
  // code path than the bystander scenario tests above exercise. This test pins
  // the contract for that edge case so such a regression would be caught
  // immediately.

  it("clearMemory('global') with no scopeId wipes all entries when the table has only global entries", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Write two global entries and nothing else
    const globalEntryA = await storage.createMemoryEntry({
      scope: "global",
      content: "Global only A: prefer descriptive variable names.",
      summary: "Descriptive vars",
    });

    const globalEntryB = await storage.createMemoryEntry({
      scope: "global",
      content: "Global only B: always handle promise rejections.",
      summary: "Handle rejections",
    });

    // Confirm both entries are present before the clear
    const before = await storage.getMemoryEntries("global");
    expect(
      before.find(e => e.id === globalEntryA.id),
      "global entry A must be present before clear",
    ).toBeDefined();
    expect(
      before.find(e => e.id === globalEntryB.id),
      "global entry B must be present before clear",
    ).toBeDefined();

    // Call clearMemory("global") with no scopeId
    const cleared = await storage.clearMemory("global");
    expect(cleared).toBe(true);

    // Global scope must be fully empty afterward
    const after = await storage.getMemoryEntries("global");
    expect(
      after.find(e => e.id === globalEntryA.id),
      "global entry A should be removed after clearMemory('global') with no scopeId",
    ).toBeUndefined();
    expect(
      after.find(e => e.id === globalEntryB.id),
      "global entry B should be removed after clearMemory('global') with no scopeId",
    ).toBeUndefined();
    expect(
      after.length,
      "global scope must be fully empty — no entries should remain",
    ).toBe(0);
  });

  // ── 7i. clearMemory('global') returns false when the global scope is already empty ──
  //
  // If the global scope has no entries, clearMemory should return false to
  // signal that nothing was actually deleted. An incorrect `true` here would
  // mislead callers into thinking a deletion occurred when it did not.

  it("clearMemory('global') returns false — not true — when the global scope is already empty", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Confirm no global entries exist on a fresh storage instance
    const before = await storage.getMemoryEntries("global");
    expect(
      before.length,
      "global scope must be empty before the test begins",
    ).toBe(0);

    // Call clearMemory("global") with nothing to delete
    const result = await storage.clearMemory("global");
    expect(
      result,
      "clearMemory('global') must return false when the global scope is already empty",
    ).toBe(false);

    // Global scope must still be empty afterward
    const after = await storage.getMemoryEntries("global");
    expect(
      after.length,
      "global scope must remain empty after clearMemory on an already-empty scope",
    ).toBe(0);
  });

  // ── 7j. clearMemory('project', id) returns false when that project scope is already empty ──
  //
  // The fix that made clearMemory('global') return false when empty was scoped
  // only to the global branch. This test confirms the project branch behaves
  // the same: returning false when no rows exist for the given projectId rather
  // than unconditionally returning true.

  it("clearMemory('project', id) returns false — not true — when that project scope is already empty", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    const emptyProjectId = "project-no-entries-" + Date.now();

    // Confirm no project entries exist for this id
    const before = await storage.getMemoryEntries("project", emptyProjectId);
    expect(
      before.length,
      "project scope must be empty before the test begins",
    ).toBe(0);

    // Call clearMemory with nothing to delete
    const result = await storage.clearMemory("project", emptyProjectId);
    expect(
      result,
      "clearMemory('project', id) must return false when the project scope is already empty",
    ).toBe(false);

    // Project scope must still be empty afterward
    const after = await storage.getMemoryEntries("project", emptyProjectId);
    expect(
      after.length,
      "project scope must remain empty after clearMemory on an already-empty scope",
    ).toBe(0);
  });

  // ── 7k. clearMemory('conversation', id) returns false when that conversation scope is already empty ──
  //
  // Mirrors 7j for the conversation branch: calling clearMemory on a
  // conversationId that has no entries must return false, not true.

  it("clearMemory('conversation', id) returns false — not true — when that conversation scope is already empty", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    const emptyConversationId = "conv-no-entries-" + Date.now();

    // Confirm no conversation entries exist for this id
    const before = await storage.getMemoryEntries("conversation", emptyConversationId);
    expect(
      before.length,
      "conversation scope must be empty before the test begins",
    ).toBe(0);

    // Call clearMemory with nothing to delete
    const result = await storage.clearMemory("conversation", emptyConversationId);
    expect(
      result,
      "clearMemory('conversation', id) must return false when the conversation scope is already empty",
    ).toBe(false);

    // Conversation scope must still be empty afterward
    const after = await storage.getMemoryEntries("conversation", emptyConversationId);
    expect(
      after.length,
      "conversation scope must remain empty after clearMemory on an already-empty scope",
    ).toBe(0);
  });

  // ── 7l. deleteMemoryEntry returns false when the entry does not exist ─────────
  //
  // The original implementation returned true unconditionally. This test
  // confirms that deleting a non-existent id returns false, and that
  // deleting an existing entry still returns true.

  it("deleteMemoryEntry returns false for a non-existent id and true for an existing one", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Deleting an id that was never inserted must return false
    const missingResult = await storage.deleteMemoryEntry("does-not-exist-ever");
    expect(
      missingResult,
      "deleteMemoryEntry must return false when the entry does not exist",
    ).toBe(false);

    // Insert a real entry then delete it — must return true
    const entry = await storage.createMemoryEntry({
      scope: "global",
      content: "delete-me-value",
    });
    const presentResult = await storage.deleteMemoryEntry(entry.id);
    expect(
      presentResult,
      "deleteMemoryEntry must return true when the entry exists and was deleted",
    ).toBe(true);

    // The entry must no longer be retrievable
    const after = await storage.getMemoryEntries("global");
    expect(
      after.find(e => e.id === entry.id),
      "deleted entry must not appear in subsequent getMemoryEntries results",
    ).toBeUndefined();
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

// ── Partial multi-statement migration restart ──────────────────────────────────
//
// Simulates a server crash mid-migration: the migration file contains two
// ADD COLUMN statements separated by --> statement-breakpoint. Statement 1 was
// executed (the column exists) but the server crashed before statement 2 ran,
// so the tracking row was never inserted.
//
// On the next startup _runMigrations re-runs the whole file:
//   - Statement 1 hits "duplicate column name" → swallowed (idempotency guard).
//   - Statement 2 executes successfully → second column created.
//   - Tracking row is recorded after all statements complete.
//
// Strategy:
//   1. Initialize storage so all real application tables exist.
//   2. Build a synthetic migrations folder with a two-statement migration.
//   3. Manually apply ONLY statement 1 via a raw client (no tracking row).
//   4. Call _runMigrations() — must not throw.
//   5. Both columns must exist and the tracking row must be present afterwards.

describe("DatabaseStorage – partial multi-statement migration restarts cleanly", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-partial-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-partial-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("swallows duplicate-column error for stmt 1, applies stmt 2, and records the tracking row", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a two-statement migration.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 4000000000000, tag: "0003_partial_two_stmt", breakpoints: true },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Two-statement migration separated by drizzle's breakpoint marker.
    writeFileSync(
      join(tmpMigrationsDir, "0003_partial_two_stmt.sql"),
      "ALTER TABLE settings ADD COLUMN partial_col_a TEXT\n--> statement-breakpoint\nALTER TABLE settings ADD COLUMN partial_col_b TEXT"
    );

    // Step 3: Manually apply ONLY statement 1 via raw client — simulates the
    // crash-before-statement-2 scenario. No tracking row is inserted.
    const client = createClient({ url: `file:${dbPath}` });
    await client.execute("ALTER TABLE settings ADD COLUMN partial_col_a TEXT");

    // Confirm col_a exists and NO tracking row was recorded.
    await client.execute("SELECT partial_col_a FROM settings LIMIT 0");
    const beforeTracking = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0003_partial_two_stmt'"
    );
    expect(
      beforeTracking.rows.length,
      "tracking row must NOT exist before the restart"
    ).toBe(0);

    // Step 4: Run _runMigrations — must not throw even though col_a already exists.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).resolves.toBeUndefined();

    // Step 5a: col_a must still exist (was not dropped by the runner).
    await client.execute("SELECT partial_col_a FROM settings LIMIT 0");

    // Step 5b: col_b must now exist (statement 2 was applied on this restart).
    await client.execute("SELECT partial_col_b FROM settings LIMIT 0");

    // Step 5c: Tracking row must be present.
    const afterRestart = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0003_partial_two_stmt'"
    );
    expect(
      afterRestart.rows.length,
      "tracking row must be inserted after the partial-apply restart"
    ).toBe(1);
    expect(afterRestart.rows[0]["tag"]).toBe("0003_partial_two_stmt");

    await client.close();
  });
});

// ── Three-statement migration: crash between statements 2 and 3 ───────────────
//
// The two-statement test confirms the runner recovers when a crash happens
// between statements 1 and 2. This test exercises the same loop-continue path
// but with three ADD COLUMN statements: statements 1 and 2 are already in the
// DB (simulating a crash after statement 2 but before statement 3), while the
// tracking row was never written.
//
// On the next startup _runMigrations re-runs the whole file:
//   - Statement 1 hits "duplicate column name" → swallowed.
//   - Statement 2 hits "duplicate column name" → swallowed.
//   - Statement 3 executes successfully → third column created.
//   - Tracking row is recorded after all statements complete.
//
// Strategy:
//   1. Initialize storage so all real application tables exist.
//   2. Build a synthetic migrations folder with a three-statement migration.
//   3. Manually apply statements 1 and 2 via a raw client (no tracking row).
//   4. Call _runMigrations() — must not throw.
//   5. All three columns must exist and the tracking row must be present.

describe("DatabaseStorage – three-statement migration restarts cleanly after crash between stmts 2 and 3", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-three-stmt-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-three-stmt-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("swallows duplicate-column errors for stmts 1 and 2, applies stmt 3, and records the tracking row", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a three-statement migration.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 4000000000001, tag: "0004_partial_three_stmt", breakpoints: true },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Three-statement migration separated by drizzle's breakpoint marker.
    writeFileSync(
      join(tmpMigrationsDir, "0004_partial_three_stmt.sql"),
      [
        "ALTER TABLE settings ADD COLUMN three_col_a TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN three_col_b TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN three_col_c TEXT",
      ].join("\n")
    );

    // Step 3: Manually apply statements 1 AND 2 via raw client — simulates the
    // crash-after-statement-2 scenario. No tracking row is inserted.
    const client = createClient({ url: `file:${dbPath}` });
    await client.execute("ALTER TABLE settings ADD COLUMN three_col_a TEXT");
    await client.execute("ALTER TABLE settings ADD COLUMN three_col_b TEXT");

    // Confirm col_a and col_b exist and NO tracking row was recorded.
    await client.execute("SELECT three_col_a FROM settings LIMIT 0");
    await client.execute("SELECT three_col_b FROM settings LIMIT 0");
    const beforeTracking = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0004_partial_three_stmt'"
    );
    expect(
      beforeTracking.rows.length,
      "tracking row must NOT exist before the restart"
    ).toBe(0);

    // Step 4: Run _runMigrations — must not throw even though col_a and col_b already exist.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).resolves.toBeUndefined();

    // Step 5a: col_a must still exist.
    await client.execute("SELECT three_col_a FROM settings LIMIT 0");

    // Step 5b: col_b must still exist.
    await client.execute("SELECT three_col_b FROM settings LIMIT 0");

    // Step 5c: col_c must now exist (statement 3 was applied on this restart).
    await client.execute("SELECT three_col_c FROM settings LIMIT 0");

    // Step 5d: Tracking row must be present.
    const afterRestart = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0004_partial_three_stmt'"
    );
    expect(
      afterRestart.rows.length,
      "tracking row must be inserted after the partial-apply restart"
    ).toBe(1);
    expect(afterRestart.rows[0]["tag"]).toBe("0004_partial_three_stmt");

    await client.close();
  });
});

// ── Four-statement migration: crash after last statement, before tracking row ──
//
// Distinct from the three-statement case: here ALL four ADD COLUMN calls have
// already been applied to the DB (simulating a crash after statement 4 executed
// but before the tracking row was written). On the next startup every statement
// in the loop throws a duplicate-column error.
//
// On the next startup _runMigrations re-runs the whole file:
//   - Statement 1 hits "duplicate column name" → swallowed.
//   - Statement 2 hits "duplicate column name" → swallowed.
//   - Statement 3 hits "duplicate column name" → swallowed.
//   - Statement 4 hits "duplicate column name" → swallowed.
//   - Tracking row is recorded after all statements complete.
//
// Strategy:
//   1. Initialize storage so all real application tables exist.
//   2. Build a synthetic migrations folder with a four-statement migration.
//   3. Manually apply all four statements via a raw client (no tracking row).
//   4. Call _runMigrations() — must not throw.
//   5. All four columns must still exist and the tracking row must be present.

describe("DatabaseStorage – four-statement migration restarts cleanly after crash after last statement", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-four-stmt-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-four-stmt-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("swallows duplicate-column errors for all four stmts and records the tracking row", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a four-statement migration.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 4000000000002, tag: "0005_four_stmt_all_applied", breakpoints: true },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Four-statement migration separated by drizzle's breakpoint marker.
    writeFileSync(
      join(tmpMigrationsDir, "0005_four_stmt_all_applied.sql"),
      [
        "ALTER TABLE settings ADD COLUMN four_col_a TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN four_col_b TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN four_col_c TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN four_col_d TEXT",
      ].join("\n")
    );

    // Step 3: Manually apply ALL FOUR statements via raw client — simulates the
    // crash-after-last-statement scenario. No tracking row is inserted.
    const client = createClient({ url: `file:${dbPath}` });
    await client.execute("ALTER TABLE settings ADD COLUMN four_col_a TEXT");
    await client.execute("ALTER TABLE settings ADD COLUMN four_col_b TEXT");
    await client.execute("ALTER TABLE settings ADD COLUMN four_col_c TEXT");
    await client.execute("ALTER TABLE settings ADD COLUMN four_col_d TEXT");

    // Confirm all four columns exist and NO tracking row was recorded.
    await client.execute("SELECT four_col_a FROM settings LIMIT 0");
    await client.execute("SELECT four_col_b FROM settings LIMIT 0");
    await client.execute("SELECT four_col_c FROM settings LIMIT 0");
    await client.execute("SELECT four_col_d FROM settings LIMIT 0");
    const beforeTracking = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0005_four_stmt_all_applied'"
    );
    expect(
      beforeTracking.rows.length,
      "tracking row must NOT exist before the restart"
    ).toBe(0);

    // Step 4: Run _runMigrations — must not throw even though all four columns already exist.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).resolves.toBeUndefined();

    // Step 5a: col_a must still exist.
    await client.execute("SELECT four_col_a FROM settings LIMIT 0");

    // Step 5b: col_b must still exist.
    await client.execute("SELECT four_col_b FROM settings LIMIT 0");

    // Step 5c: col_c must still exist.
    await client.execute("SELECT four_col_c FROM settings LIMIT 0");

    // Step 5d: col_d must still exist.
    await client.execute("SELECT four_col_d FROM settings LIMIT 0");

    // Step 5e: Tracking row must be present.
    const afterRestart = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0005_four_stmt_all_applied'"
    );
    expect(
      afterRestart.rows.length,
      "tracking row must be inserted after all-duplicate restart"
    ).toBe(1);
    expect(afterRestart.rows[0]["tag"]).toBe("0005_four_stmt_all_applied");

    await client.close();
  });
});

// ── Five-statement migration: only the last statement is missing ───────────────
//
// Scenario: a migration with five statements was partially applied before a crash.
// Statements 1–4 were applied but the process died before stmt 5 ran.
// Because no tracking row was written, _runMigrations re-runs the whole file on
// the next startup:
//   - Statement 1 hits "duplicate column name" → swallowed.
//   - Statement 2 hits "duplicate column name" → swallowed.
//   - Statement 3 hits "duplicate column name" → swallowed.
//   - Statement 4 hits "duplicate column name" → swallowed.
//   - Statement 5 has never run → applied cleanly.
//   - Tracking row is recorded after all statements complete.
//
// This is a distinct edge from the four-statement all-duplicate case: the runner
// must reach and successfully execute the final statement rather than swallowing
// every statement and moving on.
//
// Strategy:
//   1. Initialize storage so all real application tables exist.
//   2. Build a synthetic migrations folder with a five-statement migration.
//   3. Manually apply only statements 1–4 via a raw client (no tracking row).
//   4. Call _runMigrations() — must not throw.
//   5. Columns 1–4 still exist, column 5 is newly created, tracking row is present.

describe("DatabaseStorage – five-statement migration applies only the missing last statement", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-five-stmt-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-five-stmt-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("swallows duplicate-column errors for stmts 1–4, applies stmt 5, and records the tracking row", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a five-statement migration.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 4000000000003, tag: "0006_five_stmt_last_missing", breakpoints: true },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Five-statement migration separated by drizzle's breakpoint marker.
    writeFileSync(
      join(tmpMigrationsDir, "0006_five_stmt_last_missing.sql"),
      [
        "ALTER TABLE settings ADD COLUMN five_col_a TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN five_col_b TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN five_col_c TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN five_col_d TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN five_col_e TEXT",
      ].join("\n")
    );

    // Step 3: Manually apply only stmts 1–4 via raw client — simulates a crash
    // between stmt 4 and stmt 5. No tracking row is inserted.
    const client = createClient({ url: `file:${dbPath}` });
    await client.execute("ALTER TABLE settings ADD COLUMN five_col_a TEXT");
    await client.execute("ALTER TABLE settings ADD COLUMN five_col_b TEXT");
    await client.execute("ALTER TABLE settings ADD COLUMN five_col_c TEXT");
    await client.execute("ALTER TABLE settings ADD COLUMN five_col_d TEXT");

    // Confirm stmts 1–4 are present, stmt 5 is absent, no tracking row.
    await client.execute("SELECT five_col_a FROM settings LIMIT 0");
    await client.execute("SELECT five_col_b FROM settings LIMIT 0");
    await client.execute("SELECT five_col_c FROM settings LIMIT 0");
    await client.execute("SELECT five_col_d FROM settings LIMIT 0");
    await expect(
      client.execute("SELECT five_col_e FROM settings LIMIT 0"),
      "five_col_e must not exist before _runMigrations"
    ).rejects.toThrow();
    const beforeTracking = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0006_five_stmt_last_missing'"
    );
    expect(
      beforeTracking.rows.length,
      "tracking row must NOT exist before the restart"
    ).toBe(0);

    // Step 4: Run _runMigrations — must not throw even though stmts 1–4 already exist.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).resolves.toBeUndefined();

    // Step 5a: col_a must still exist (was already there).
    await client.execute("SELECT five_col_a FROM settings LIMIT 0");

    // Step 5b: col_b must still exist.
    await client.execute("SELECT five_col_b FROM settings LIMIT 0");

    // Step 5c: col_c must still exist.
    await client.execute("SELECT five_col_c FROM settings LIMIT 0");

    // Step 5d: col_d must still exist.
    await client.execute("SELECT five_col_d FROM settings LIMIT 0");

    // Step 5e: col_e must now exist (was newly created by _runMigrations).
    await expect(
      client.execute("SELECT five_col_e FROM settings LIMIT 0"),
      "five_col_e must exist after _runMigrations applies stmt 5"
    ).resolves.toBeDefined();

    // Step 5f: Tracking row must be present.
    const afterRestart = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0006_five_stmt_last_missing'"
    );
    expect(
      afterRestart.rows.length,
      "tracking row must be inserted after _runMigrations completes"
    ).toBe(1);
    expect(afterRestart.rows[0]["tag"]).toBe("0006_five_stmt_last_missing");

    await client.close();
  });
});

// ── Missing SQL file path ──────────────────────────────────────────────────────
//
// Verifies that _runMigrations surfaces a clear, readable error — rather than
// silently swallowing or propagating a raw SyntaxError — when _journal.json is
// corrupted or truncated (e.g. a partial write during deployment).
//
// Strategy:
//   1. Initialize storage so __creatrix_migrations exists and is stable.
//   2. Build a synthetic migrations folder whose _journal.json is truncated /
//      malformed so that JSON.parse will throw a SyntaxError.
//   3. Call _runMigrations() and assert the promise rejects with an error that
//      mentions the journal path (making the failure actionable).
//   4. Query __creatrix_migrations directly and confirm it was NOT modified —
//      a parse failure must not leave any partial state behind.

describe("DatabaseStorage – corrupted journal file", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-corrupted-journal-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-corrupted-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("rejects with a readable error and does NOT modify __creatrix_migrations when the journal is malformed", async () => {
    // Step 1: Full initialize so the DB and __creatrix_migrations already exist
    // in a clean, stable state.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Record the existing row count so we can confirm nothing is added.
    const clientBefore = createClient({ url: `file:${dbPath}` });
    const countBefore = await clientBefore.execute(
      "SELECT COUNT(*) AS n FROM __creatrix_migrations"
    );
    const rowsBefore = Number((countBefore.rows[0] as any)["n"]);
    await clientBefore.close();

    // Step 2: Build a synthetic migrations folder with a truncated (unparseable)
    // _journal.json.  The file is cut off mid-object so JSON.parse will throw.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      join(metaDir, "_journal.json"),
      '{"version":"7","dialect":"sqlite","entries":[{"idx":0'  // truncated — no closing brackets
    );

    // Step 3: _runMigrations must reject with an error that mentions the path,
    // making the failure immediately actionable for an operator.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).rejects.toThrow(/_journal\.json/);

    // Step 4: __creatrix_migrations must be completely unchanged — a parse
    // failure must never leave partial state in the tracking table.
    const clientAfter = createClient({ url: `file:${dbPath}` });
    const countAfter = await clientAfter.execute(
      "SELECT COUNT(*) AS n FROM __creatrix_migrations"
    );
    const rowsAfter = Number((countAfter.rows[0] as any)["n"]);
    await clientAfter.close();

    expect(
      rowsAfter,
      "__creatrix_migrations row count must be unchanged after a journal parse failure",
    ).toBe(rowsBefore);
  });
});

// Verifies that _runMigrations surfaces a clear error — rather than silently
// swallowing it or emitting a misleading message — when a journal entry's tag
// has no corresponding .sql file on disk.  This can happen after a partial
// deployment where the journal was updated but the SQL file was not copied.
//
// Strategy:
//   1. Initialize storage so __creatrix_migrations exists and is stable.
//   2. Build a synthetic migrations folder whose journal references a tag
//      ("0099_ghost_migration") for which no .sql file is written.
//   3. Call _runMigrations() and assert the promise rejects with an error
//      that mentions the missing tag/path.
//   4. Query __creatrix_migrations directly and confirm the ghost tag was
//      NOT recorded (the failure must not leave a partial record behind).

describe("DatabaseStorage – missing SQL file for a journal tag", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-missing-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("rejects with a readable error and does NOT record the tag when the SQL file is missing", async () => {
    // Step 1: Full initialize so the DB, __creatrix_migrations, and all real
    // application tables already exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder.  The journal lists a single
    // tag whose .sql file is intentionally not written to disk.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 9000000000000, tag: "0099_ghost_migration", breakpoints: true },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));
    // Intentionally do NOT write "0099_ghost_migration.sql" — that is the point.

    // Step 3: _runMigrations must reject.  The error is the Node.js ENOENT
    // thrown by readFileSync, which includes the file path and therefore the
    // tag name — making it readable and actionable.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).rejects.toThrow(/0099_ghost_migration/);

    // Step 4: The ghost tag must NOT appear in __creatrix_migrations.
    // A failed migration must never be recorded as applied.
    const client = createClient({ url: `file:${dbPath}` });
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0099_ghost_migration'"
    );
    expect(
      result.rows.length,
      "__creatrix_migrations must NOT have a row for the ghost tag after a failed migration",
    ).toBe(0);
    await client.close();
  });
});

// ── Memory panel: project-switching isolation ─────────────────────────────────
//
// The MemoryPanel component issues a separate React Query request for each
// scope.  The project-scope query is gated by `enabled: open && !!projectId`
// and carries `scopeId: projectId` in its query key, so a fresh fetch fires
// whenever the active project changes.  On the server side, `getMemoryEntries`
// requires a scopeId for project/conversation scopes (returns [] when it is
// absent) to prevent cross-project memory leaks.
//
// These tests confirm the full path:
//   • Each project sees only its own entries when the panel queries with its id.
//   • Switching from project A → B → A returns the correct entries at each step.
//   • A null projectId (the `enabled` guard is falsy) maps to the no-scopeId
//     code path and returns [] rather than leaking every project's memory.
//   • The same isolation applies to conversation-scoped entries.

describe("MemoryPanel – project and conversation switching isolation", () => {
  let dbPath: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(async () => {
    dbPath = makeTempPath();
    await applySchema(dbPath);
    process.env.SQLITE_PATH = dbPath;
  });

  afterEach(() => {
    if (originalSqlitePath === undefined) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = originalSqlitePath;
    }
    if (existsSync(dbPath)) rmSync(dbPath);
  });

  it("switching from project A to project B shows only that project's entries each time", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    const projA = "proj-panel-alpha";
    const projB = "proj-panel-beta";

    // Seed entries for both projects
    const entryA1 = await storage.createMemoryEntry({
      scope: "project",
      projectId: projA,
      content: "Project A: always use strict TypeScript.",
    });
    const entryA2 = await storage.createMemoryEntry({
      scope: "project",
      projectId: projA,
      content: "Project A: tests go in __tests__ directory.",
    });
    const entryB1 = await storage.createMemoryEntry({
      scope: "project",
      projectId: projB,
      content: "Project B: use Python 3.12+.",
    });

    // ── Simulated panel open for project A ───────────────────────────────────
    const viewA = await storage.getMemoryEntries("project", projA);
    expect(viewA.map(e => e.id), "project A query returns both A entries")
      .toEqual(expect.arrayContaining([entryA1.id, entryA2.id]));
    expect(viewA.find(e => e.id === entryB1.id),
      "project A query must not include project B entries").toBeUndefined();

    // ── Simulated panel switch to project B ──────────────────────────────────
    const viewB = await storage.getMemoryEntries("project", projB);
    expect(viewB.map(e => e.id), "project B query returns B entry")
      .toEqual(expect.arrayContaining([entryB1.id]));
    expect(viewB.find(e => e.id === entryA1.id),
      "project B query must not include project A entries").toBeUndefined();
    expect(viewB.find(e => e.id === entryA2.id),
      "project B query must not include project A entries").toBeUndefined();

    // ── Round-trip back to project A ─────────────────────────────────────────
    const viewAAgain = await storage.getMemoryEntries("project", projA);
    expect(viewAAgain.map(e => e.id), "round-trip back to project A returns same entries")
      .toEqual(expect.arrayContaining([entryA1.id, entryA2.id]));
    expect(viewAAgain.find(e => e.id === entryB1.id),
      "round-trip must still exclude project B entries").toBeUndefined();
  });

  it("null projectId (panel enabled guard is falsy) returns empty array, not a data leak", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Seed entries for several projects
    await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-leak-one",
      content: "Secret preference for project one.",
    });
    await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-leak-two",
      content: "Secret preference for project two.",
    });

    // The MemoryPanel component gates its project-scope query with
    // `enabled: open && !!projectId`, so when projectId is null the fetch
    // never fires.  At the storage layer this maps to calling
    // getMemoryEntries("project") with no scopeId.  The guard must throw an
    // explicit error so that if something bypasses the `enabled` gate the
    // mistake is immediately visible rather than silently returning nothing.
    await expect(
      storage.getMemoryEntries("project"),
      "missing scopeId for project scope must throw (no cross-project leak)",
    ).rejects.toThrow("project scope requires a scopeId");
  });

  it("switching from conversation A to conversation B shows only that conversation's entries", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    const convA = "conv-panel-alpha";
    const convB = "conv-panel-beta";

    const entryA = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: convA,
      content: "Conversation A: user wants bullet-point answers.",
    });
    const entryB = await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: convB,
      content: "Conversation B: user is debugging a Rust program.",
    });

    // Panel open for conversation A
    const viewA = await storage.getMemoryEntries("conversation", convA);
    expect(viewA.find(e => e.id === entryA.id),
      "conversation A query must find entry A").toBeDefined();
    expect(viewA.find(e => e.id === entryB.id),
      "conversation A query must not include conversation B entry").toBeUndefined();

    // Panel switched to conversation B
    const viewB = await storage.getMemoryEntries("conversation", convB);
    expect(viewB.find(e => e.id === entryB.id),
      "conversation B query must find entry B").toBeDefined();
    expect(viewB.find(e => e.id === entryA.id),
      "conversation B query must not include conversation A entry").toBeUndefined();
  });

  it("null conversationId returns empty array for conversation scope (mirrors the enabled guard)", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    await storage.createMemoryEntry({
      scope: "conversation",
      conversationId: "conv-guard-test",
      content: "Context for a specific conversation.",
    });

    await expect(
      storage.getMemoryEntries("conversation"),
      "missing scopeId for conversation scope must throw",
    ).rejects.toThrow("conversation scope requires a scopeId");
  });

  it("global scope is always returned regardless of projectId and does not bleed into project scope", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    const globalEntry = await storage.createMemoryEntry({
      scope: "global",
      content: "I always prefer concise answers.",
    });
    const projectEntry = await storage.createMemoryEntry({
      scope: "project",
      projectId: "proj-global-bleed",
      content: "Project note: use spaces not tabs.",
    });

    // Global queries return global entries regardless of which project is active
    const globals = await storage.getMemoryEntries("global");
    expect(globals.find(e => e.id === globalEntry.id),
      "global entry must appear in global scope").toBeDefined();
    expect(globals.find(e => e.id === projectEntry.id),
      "project entry must not appear in global scope").toBeUndefined();

    // Project query for the scoped project does not include global entries
    const projectEntries = await storage.getMemoryEntries("project", "proj-global-bleed");
    expect(projectEntries.find(e => e.id === projectEntry.id),
      "project entry appears for correct scopeId").toBeDefined();
    expect(projectEntries.find(e => e.id === globalEntry.id),
      "global entry must not appear in project scope query").toBeUndefined();
  });
});

// ── Tracking row ordering contract ────────────────────────────────────────────
//
// The INSERT into __creatrix_migrations MUST happen only after every statement
// in the migration file has succeeded (or been swallowed by the idempotency
// guard). If a future refactor accidentally moves the INSERT inside the
// per-statement loop — or before the loop — a crash mid-migration would leave
// the tracking row recorded while a later statement was never applied. On the
// next restart the runner would skip the whole file and the second column would
// silently never exist.
//
// This test catches that regression by verifying that _runMigrations does NOT
// record the tracking row when the migration file contains an intentionally
// failing second statement (ALTER TABLE on a non-existent table). The first
// statement's effect must be present, the second must not, and the tracking row
// must be absent — proving the INSERT ran after the loop, not before or inside it.
//
// Strategy:
//   1. Initialize storage so all real application tables exist.
//   2. Build a synthetic migrations folder with a two-statement migration:
//        stmt 1: ALTER TABLE settings ADD COLUMN guard_col_a TEXT  (succeeds)
//        stmt 2: ALTER TABLE no_such_table ADD COLUMN x TEXT       (throws)
//   3. Call _runMigrations() — must throw.
//   4. Assert guard_col_a EXISTS (stmt 1 ran).
//   5. Assert the tracking row is ABSENT (INSERT never reached).

// ── Malformed SQL file ────────────────────────────────────────────────────────
//
// Verifies that _runMigrations surfaces a clear, actionable error — including
// the SQL file path — when a migration file contains a syntactically invalid
// statement that the database driver cannot parse or execute.  This can happen
// after a partial write (e.g. a deploy that truncated mid-statement) or a
// merge conflict that left sentinel markers in the file.
//
// Strategy:
//   1. Initialize storage so all real application tables and __creatrix_migrations
//      already exist in a stable state.
//   2. Build a synthetic migrations folder with a journal that references a single
//      tag ("0006_malformed_sql") and write an SQL file containing a statement
//      that is syntactically invalid (guaranteed to be rejected by the driver).
//   3. Call _runMigrations() — must reject.
//   4. Assert the rejection message includes the SQL file path so operators can
//      locate and fix the file without digging through logs.
//   5. Query __creatrix_migrations directly and confirm the failed tag was NOT
//      recorded — a syntactically invalid migration must never be marked applied.

describe("DatabaseStorage – malformed SQL file", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-malformed-sql-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-malformed-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("rejects with an error that includes the SQL file path and does NOT record the tag", async () => {
    // Step 1: Full initialize — DB and __creatrix_migrations exist in a clean state.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder.
    //   - The journal references a single tag: "0006_malformed_sql".
    //   - The corresponding .sql file contains a statement that is syntactically
    //     invalid so the driver is guaranteed to reject it (not a semantic error
    //     like a missing table, but a parse-level failure).
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 6000000000000,
          tag: "0006_malformed_sql",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Write an intentionally malformed SQL file — a bare keyword with no valid
    // syntax following it.  The driver will reject this at parse time.
    writeFileSync(
      join(tmpMigrationsDir, "0006_malformed_sql.sql"),
      "THIS IS NOT VALID SQL AT ALL ;;; GARBAGE <<<>>>"
    );

    // Step 3 & 4: _runMigrations must reject, and the error message must include
    // the SQL file path so an operator can immediately find the broken file.
    const expectedPathFragment = "0006_malformed_sql.sql";
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).rejects.toThrow(expectedPathFragment);

    // Step 5: The tag must NOT appear in __creatrix_migrations.
    // A failed migration must never be recorded as applied, or the next restart
    // would skip it silently and the schema corruption would become permanent.
    const client = createClient({ url: `file:${dbPath}` });
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0006_malformed_sql'"
    );
    expect(
      result.rows.length,
      "__creatrix_migrations must NOT have a row for the tag when the SQL file is malformed",
    ).toBe(0);
    await client.close();
  });
});

describe("DatabaseStorage – tracking row is NOT recorded when a mid-migration statement fails", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-tracking-order-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-tracking-order-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("does not insert the tracking row when the second statement fails with a non-swallowed error", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a two-statement migration.
    //   - Statement 1 succeeds: adds a new column to the real `settings` table.
    //   - Statement 2 fails:    tries to ALTER a table that does not exist;
    //     the error is NOT in the swallowed set, so it propagates.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 5000000000000,
          tag: "0005_tracking_order_guard",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    writeFileSync(
      join(tmpMigrationsDir, "0005_tracking_order_guard.sql"),
      [
        "ALTER TABLE settings ADD COLUMN guard_col_a TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE no_such_table_xyz ADD COLUMN guard_col_b TEXT",
      ].join("\n")
    );

    // Step 3: _runMigrations must throw because stmt 2 targets a non-existent table.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).rejects.toThrow();

    const client = createClient({ url: `file:${dbPath}` });

    // Step 4: guard_col_a must exist — stmt 1 ran before the failure.
    // SELECT against it throws if the column is absent.
    await client.execute("SELECT guard_col_a FROM settings LIMIT 0");

    // Step 5: The tracking row must NOT exist — the INSERT runs after the loop,
    // so a mid-loop failure must leave it absent.  This is the core ordering
    // contract: a tracking row present here would mean the file is permanently
    // skipped on the next restart, silently losing stmt 2 forever.
    const trackingResult = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0005_tracking_order_guard'"
    );
    expect(
      trackingResult.rows.length,
      "tracking row must NOT be recorded when a mid-migration statement fails — " +
        "the INSERT must only run after all statements succeed or are swallowed"
    ).toBe(0);

    await client.close();
  });
});

// ── Retry on next restart after a mid-migration failure ───────────────────────
//
// The tracking-row ordering test confirms the row is absent after a
// mid-migration failure.  But it doesn't verify what happens on the *next*
// startup: the runner must retry the entire file, swallow the now-duplicate
// first statement (idempotency guard), and successfully apply the previously-
// failing second statement.
//
// Without a test for this round-trip, a regression that records the tracking
// row on the first failure (and then skips the file forever) could still slip
// through undetected.
//
// Strategy:
//   1. Initialize storage so all real application tables exist.
//   2. Build a two-statement migration:
//        stmt 1: ALTER TABLE settings ADD COLUMN retry_col_a TEXT  (succeeds)
//        stmt 2: ALTER TABLE no_such_table_xyz ADD COLUMN x TEXT    (fails)
//   3. Call _runMigrations() — must throw.
//   4. Assert retry_col_a EXISTS (stmt 1 ran).
//   5. Assert the tracking row is ABSENT (INSERT never reached).
//   6. Fix the SQL file: replace stmt 2 with a valid ADD COLUMN on settings.
//   7. Call _runMigrations() again — must NOT throw.
//   8. Assert retry_col_a still exists (stmt 1 was swallowed, not dropped).
//   9. Assert retry_col_b now exists (the previously-failing stmt 2 succeeded).
//  10. Assert the tracking row IS now recorded.

describe("DatabaseStorage – retry on next restart after mid-migration failure", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-retry-restart-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-retry-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("retries the whole file on the next restart, swallows the already-applied first statement, and applies the fixed second statement", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a two-statement migration.
    //   - Statement 1 succeeds: adds retry_col_a to the real `settings` table.
    //   - Statement 2 fails:    targets a non-existent table; the error is NOT
    //     in the swallowed set so it propagates and the runner throws.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000001,
          tag: "0006_retry_after_failure",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    const sqlFilePath = join(tmpMigrationsDir, "0006_retry_after_failure.sql");

    // Initial (broken) migration file — stmt 2 targets a table that does not exist.
    writeFileSync(
      sqlFilePath,
      [
        "ALTER TABLE settings ADD COLUMN retry_col_a TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE no_such_table_xyz ADD COLUMN retry_col_b TEXT",
      ].join("\n")
    );

    // Step 3: First run — must throw because stmt 2 fails.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).rejects.toThrow();

    const client = createClient({ url: `file:${dbPath}` });

    // Step 4: retry_col_a must exist — stmt 1 ran before the failure.
    await client.execute("SELECT retry_col_a FROM settings LIMIT 0");

    // Step 5: The tracking row must NOT exist — the failed run must never record
    // the migration, or the next restart would skip it silently and retry_col_b
    // would be lost forever.
    const beforeRetry = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0006_retry_after_failure'"
    );
    expect(
      beforeRetry.rows.length,
      "tracking row must be absent after the first (failing) run"
    ).toBe(0);

    // Step 6: Fix the SQL file — replace the bad stmt 2 with a valid ADD COLUMN.
    // This simulates a developer shipping a corrected migration in the next release.
    writeFileSync(
      sqlFilePath,
      [
        "ALTER TABLE settings ADD COLUMN retry_col_a TEXT",
        "--> statement-breakpoint",
        "ALTER TABLE settings ADD COLUMN retry_col_b TEXT",
      ].join("\n")
    );

    // Step 7: Second run (simulated next restart) — must NOT throw.
    //   - stmt 1 hits "duplicate column name" for retry_col_a → swallowed.
    //   - stmt 2 (now valid) executes successfully → retry_col_b is created.
    //   - Tracking row is inserted after the loop completes.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir)
    ).resolves.toBeUndefined();

    // Step 8: retry_col_a must still exist (was swallowed, not dropped).
    await client.execute("SELECT retry_col_a FROM settings LIMIT 0");

    // Step 9: retry_col_b must now exist — the previously-failing stmt 2 succeeded.
    await client.execute("SELECT retry_col_b FROM settings LIMIT 0");

    // Step 10: The tracking row must now be recorded — the retry completed fully.
    const afterRetry = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0006_retry_after_failure'"
    );
    expect(
      afterRetry.rows.length,
      "tracking row must be recorded after the successful retry run"
    ).toBe(1);
    expect(afterRetry.rows[0]["tag"]).toBe("0006_retry_after_failure");

    await client.close();
  });
});

// ── Mid-migration failure with empty error message still names the SQL file ───
//
// The error wrapping in _runMigrations uses:
//   throw new Error(`Migration failed in ${sqlPath}: ${msg || String(err)}`);
//
// If a driver version surfaces an error whose `.message` is an empty string,
// `msg` is "" (falsy) so the fallback `String(err)` is used.  Either way,
// `sqlPath` is always the fixed prefix of the thrown message — the file name
// is present regardless of what the driver puts in `.message`.
//
// This test injects exactly that error (message === "") by monkey-patching
// `_client.execute` for the migration SQL statement only, then confirms the
// rejection still carries the SQL file path fragment.

describe("DatabaseStorage – mid-migration failure with empty error message still names the file", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-empty-msg-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-empty-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  // ── Empty-message error is re-thrown, not swallowed ─────────────────────────
  //
  // The idempotency checks in _runMigrations all call `msg.includes(...)` where
  // `msg = err?.message ?? ""`.  When msg is "" every includes() call returns
  // false, so no guard fires and the catch block falls through to:
  //
  //   throw new Error(`Migration failed in ${sqlPath}: ${msg || String(err)}`);
  //
  // A future maintainer might add a seemingly harmless guard like `if (!msg)
  // continue` to silence opaque errors.  That would silently swallow every
  // error whose .message is "" — hiding real database failures.
  //
  // This test locks that door: inject an error whose .message === "" and assert
  // _runMigrations rejects.  The idempotency conditions are all false for "",
  // so the runner MUST re-throw rather than continuing silently.

  it("does not silently swallow an error whose .message is empty string — runner rejects", async () => {
    // Step 1: Full initialize — all real application tables (including
    // settings) and the __creatrix_migrations tracking table exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a single-statement
    // migration.  The SQL itself is valid; the driver error is injected below.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000004,
          tag: "0009_empty_msg_swallow_guard",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));
    writeFileSync(
      join(tmpMigrationsDir, "0009_empty_msg_swallow_guard.sql"),
      "ALTER TABLE settings ADD COLUMN swallow_guard_col TEXT"
    );

    // Step 3: Monkey-patch _client.execute so that the migration SQL statement
    // throws an Error with .message === "".  Calls that touch
    // __creatrix_migrations are forwarded to the real driver so the runner can
    // reach the statement loop in the first place.
    const realClient = (storage as any)._client;
    const realExecute = realClient.execute.bind(realClient);

    (storage as any)._client.execute = async (stmt: any) => {
      const sql: string = typeof stmt === "string" ? stmt : (stmt?.sql ?? "");
      if (sql.includes("__creatrix_migrations")) {
        return realExecute(stmt);
      }
      // Inject an error whose .message is exactly "".
      // The idempotency guards (duplicate column name / table already exists /
      // index already exists) are all false for "", so the runner must re-throw.
      throw Object.assign(new Error(""), { message: "" });
    };

    // Step 4: _runMigrations must REJECT — the empty-message error is not
    // swallowed by any idempotency guard.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "_runMigrations must reject when the driver throws an error with message === ''"
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejection message includes the SQL file path even when err.message is empty string", async () => {
    // Step 1: Full initialize — all real application tables (including settings) exist.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder with a single-statement migration.
    // The SQL itself is valid; the driver error is injected artificially below.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000002,
          tag: "0007_empty_msg_guard",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    const sqlFileName = "0007_empty_msg_guard.sql";
    writeFileSync(
      join(tmpMigrationsDir, sqlFileName),
      "ALTER TABLE settings ADD COLUMN empty_msg_col TEXT"
    );

    // Step 3: Monkey-patch _client.execute so that when it is called with the
    // migration SQL (anything that does NOT reference __creatrix_migrations), it
    // throws an Error whose .message is an empty string — simulating a future
    // driver that surfaces opaque error objects.
    //
    // Calls that reference __creatrix_migrations (the tracking-table CREATE and
    // the applied-tag SELECT) are forwarded to the real client so the runner can
    // reach the statement loop.
    const realClient = (storage as any)._client;
    const realExecute = realClient.execute.bind(realClient);

    (storage as any)._client.execute = async (stmt: any) => {
      const sql: string = typeof stmt === "string" ? stmt : (stmt?.sql ?? "");
      if (sql.includes("__creatrix_migrations")) {
        return realExecute(stmt);
      }
      // Inject an error with an empty .message to exercise the fallback path.
      const err = new Error("");
      throw err;
    };

    // Step 4: _runMigrations must reject.
    const rejection = await (storage as any)
      ._runMigrations(tmpMigrationsDir)
      .catch((e: unknown) => e);

    expect(rejection).toBeInstanceOf(Error);

    // Step 5: The error message must contain the SQL file name — confirming that
    // the `sqlPath` prefix is always present regardless of what the driver
    // returns in err.message.
    expect(
      (rejection as Error).message,
      "error must name the SQL file even when err.message is empty string"
    ).toContain(sqlFileName);
  });
});

// ── Comment-only / whitespace-only migration file ──────────────────────────────
//
// A SQL file that contains only SQL comments (-- ...) or pure whitespace is
// valid UTF-8 text but has no executable statements.
//
// _runMigrations detects this case: after splitting on the breakpoint marker
// and trimming each segment, it strips all `-- …` lines and checks whether any
// executable content remains.  If every segment is blank or comment-only the
// file is treated as a no-op placeholder — all segments are skipped and the tag
// IS recorded in __creatrix_migrations so the runner never retries it.
//
// Without this guard the runner would call _client.execute("-- only a comment"),
// which raises SQLITE_UNKNOWN_0 ("not an error"), re-throw as "Migration failed
// in <path>: …", and leave the tag unrecorded — permanently blocking every
// subsequent migration in the journal on every restart.
//
// Strategy:
//   1. Initialize storage so all real application tables and the tracking table exist.
//   2. Build a synthetic migrations folder with one migration whose SQL file
//      contains only comments and whitespace — no actual DDL/DML.
//   3. Call _runMigrations() — must RESOLVE (not throw).
//   4. Assert the tag IS recorded in __creatrix_migrations so it is never retried.
//   5. Assert a second call with a real migration after the comment-only one
//      also applies correctly, proving the journal is not blocked.

describe("DatabaseStorage – comment-only migration file is skipped and tag is recorded", () => {
  let dbPath: string;
  let tmpMigrationsDir: string;
  const originalSqlitePath = process.env.SQLITE_PATH;

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `creatrix-comment-only-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.SQLITE_PATH = dbPath;
    tmpMigrationsDir = join(
      tmpdir(),
      `creatrix-migrations-comment-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it("resolves and records the tag when the SQL file contains only comments and whitespace", async () => {
    // Step 1: Full initialize — all real application tables and the tracking
    // table __creatrix_migrations exist and are populated with real migrations.
    const storage = new DatabaseStorage();
    await storage.initialize();

    // Step 2: Build a synthetic migrations folder whose single SQL file contains
    // only SQL line-comments and blank lines — no DDL or DML at all.
    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000003,
          tag: "0008_comment_only_placeholder",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // The SQL file is valid UTF-8 text but contains no executable statements.
    // It uses a variety of comment and whitespace forms to be thorough.
    const commentOnlySql = [
      "-- This migration is intentionally left as a placeholder.",
      "-- No schema changes are introduced here.",
      "",
      "   ",
      "-- Another comment line.",
      "",
    ].join("\n");

    const sqlFileName = "0008_comment_only_placeholder.sql";
    writeFileSync(join(tmpMigrationsDir, sqlFileName), commentOnlySql);

    // Step 3: _runMigrations must RESOLVE — comment-only segments are skipped
    // without calling the driver, so no SQLITE_UNKNOWN_0 is raised.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "comment-only migration file should resolve without throwing"
    ).resolves.toBeUndefined();

    // Step 4: The tag MUST be recorded so the runner never retries it on the
    // next restart.  Leaving it unrecorded would block every later migration
    // in the journal permanently.
    const client = createClient({ url: `file:${dbPath}` });
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0008_comment_only_placeholder'"
    );
    expect(
      result.rows.length,
      "tag must be recorded after a comment-only migration is skipped"
    ).toBe(1);
    expect(result.rows[0]["tag"]).toBe("0008_comment_only_placeholder");

    await client.close();
  });

  it("resolves and records the tag when the SQL file contains only block comments (/* ... */) and whitespace", async () => {
    // Block comments are the second comment form SQL supports.  The earlier
    // guard only stripped "-- …" line comments; a file made entirely of
    // /* ... */ spans would previously bypass the filter and be sent to
    // @libsql/client, raising SQLITE_UNKNOWN_0 and permanently blocking the
    // migration journal.  This test confirms the updated guard handles both.
    const storage = new DatabaseStorage();
    await storage.initialize();

    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000009,
          tag: "0009_block_comment_only_placeholder",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // The SQL file is valid UTF-8 text but contains no executable statements.
    // It uses only block-comment spans and whitespace to exercise the new path.
    const blockCommentOnlySql = [
      "/* This migration is intentionally left as a placeholder. */",
      "",
      "/*",
      " * Multi-line block comment.",
      " * No schema changes are introduced here.",
      " */",
      "",
      "   ",
      "/* Another single-line block comment. */",
      "",
    ].join("\n");

    const sqlFileName = "0009_block_comment_only_placeholder.sql";
    writeFileSync(join(tmpMigrationsDir, sqlFileName), blockCommentOnlySql);

    // _runMigrations must RESOLVE — block-comment-only segments are skipped
    // without calling the driver, so no SQLITE_UNKNOWN_0 is raised.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "block-comment-only migration file should resolve without throwing"
    ).resolves.toBeUndefined();

    // The tag MUST be recorded so the runner never retries it on the next restart.
    const client = createClient({ url: `file:${dbPath}` });
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0009_block_comment_only_placeholder'"
    );
    expect(
      result.rows.length,
      "tag must be recorded after a block-comment-only migration is skipped"
    ).toBe(1);
    expect(result.rows[0]["tag"]).toBe("0009_block_comment_only_placeholder");

    await client.close();
  });

  it("applies the real DDL when a single segment begins with comment lines then contains a real ALTER TABLE", async () => {
    // This confirms the comment-stripping logic is not too aggressive: a segment
    // that has comment lines at the top but also contains real DDL must still
    // execute.  There is NO breakpoint inside the file — the whole file is one
    // segment with mixed content.
    const storage = new DatabaseStorage();
    await storage.initialize();

    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000020,
          tag: "0020_mixed_comment_and_ddl",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Single segment: comment lines at the top, then a real ALTER TABLE.
    // No "--> statement-breakpoint" marker — the whole file is one segment.
    const mixedSql = [
      "-- This migration adds a guard column.",
      "-- It intentionally starts with comment lines.",
      "",
      "ALTER TABLE settings ADD COLUMN mixed_comment_guard_col TEXT",
    ].join("\n");

    writeFileSync(
      join(tmpMigrationsDir, "0020_mixed_comment_and_ddl.sql"),
      mixedSql
    );

    // _runMigrations must resolve — the real ALTER TABLE must not be dropped.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "mixed-content migration should resolve without throwing"
    ).resolves.toBeUndefined();

    // The column from the ALTER TABLE must exist.
    const client = createClient({ url: `file:${dbPath}` });
    await expect(
      client.execute("SELECT mixed_comment_guard_col FROM settings LIMIT 0"),
      "column added by the real ALTER TABLE inside the mixed segment must exist"
    ).resolves.toBeDefined();

    // The tag must be recorded so the runner never retries it.
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0020_mixed_comment_and_ddl'"
    );
    expect(
      result.rows.length,
      "tag must be recorded after a mixed-content migration is applied"
    ).toBe(1);
    expect(result.rows[0]["tag"]).toBe("0020_mixed_comment_and_ddl");

    await client.close();
  });

  it("applies the real DDL when a single segment begins with block comments then contains a real ALTER TABLE", async () => {
    // Block-comment parallel of the 0020_mixed_comment_and_ddl test above.
    // Confirms that stripping /* ... */ block comments only affects the
    // emptiness check — the actual SQL sent to the driver still contains the
    // real ALTER TABLE statement so the column is created.
    const storage = new DatabaseStorage();
    await storage.initialize();

    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000021,
          tag: "0021_mixed_block_comment_and_ddl",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Single segment: block-comment spans at the top, then a real ALTER TABLE.
    // No "--> statement-breakpoint" marker — the whole file is one segment.
    const mixedSql = [
      "/* This migration adds a guard column. */",
      "",
      "/*",
      " * It intentionally starts with block comments",
      " * before the real DDL statement.",
      " */",
      "",
      "ALTER TABLE settings ADD COLUMN mixed_block_comment_guard_col TEXT",
    ].join("\n");

    writeFileSync(
      join(tmpMigrationsDir, "0021_mixed_block_comment_and_ddl.sql"),
      mixedSql
    );

    // _runMigrations must resolve — the real ALTER TABLE must not be dropped.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "mixed block-comment + DDL migration should resolve without throwing"
    ).resolves.toBeUndefined();

    // The column from the ALTER TABLE must exist.
    const client = createClient({ url: `file:${dbPath}` });
    await expect(
      client.execute("SELECT mixed_block_comment_guard_col FROM settings LIMIT 0"),
      "column added by the real ALTER TABLE inside the block-comment segment must exist"
    ).resolves.toBeDefined();

    // The tag must be recorded so the runner never retries it.
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0021_mixed_block_comment_and_ddl'"
    );
    expect(
      result.rows.length,
      "tag must be recorded after a mixed block-comment + DDL migration is applied"
    ).toBe(1);
    expect(result.rows[0]["tag"]).toBe("0021_mixed_block_comment_and_ddl");

    await client.close();
  });

  it("applies both DDL statements when a block comment is interleaved between two ALTER TABLE calls at the file level", async () => {
    // This is the interleaved variant: instead of a block comment appearing only
    // at the top of a segment (before any DDL), the comment sits between two
    // ALTER TABLE calls at the file level — trailing the first DDL in segment 1
    // and preceding the second DDL in segment 2 (separated by a statement-breakpoint).
    // The stripping regex /\/\*[\s\S]*?\*\//g must not eat into either ALTER TABLE.
    const storage = new DatabaseStorage();
    await storage.initialize();

    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000022,
          tag: "0022_interleaved_block_comment_ddl",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Two segments separated by "--> statement-breakpoint", with a multi-line
    // block comment appearing between the two DDL calls at the file level:
    //
    //   ALTER TABLE … ADD COLUMN col1      ← segment 1 DDL
    //   /* interleaved comment */          ← block comment trailing segment 1
    //   --> statement-breakpoint
    //   ALTER TABLE … ADD COLUMN col2      ← segment 2 DDL
    //
    // Segment 1 ends with the block comment *after* the DDL — the inverse of the
    // existing "leading block comment then DDL" test.  The emptiness check must
    // still see the ALTER TABLE as executable (i.e. stripping the trailing comment
    // must not accidentally eat the DDL text).
    const interleavedSql = [
      "ALTER TABLE settings ADD COLUMN interleaved_block_col_1 TEXT",
      "",
      "/* This block comment is interleaved between the two DDL statements.",
      "   It trails the first ALTER TABLE and precedes the statement-breakpoint.",
      "   The [\\ s\\S]*? path in the stripping regex must leave the DDL intact. */",
      "--> statement-breakpoint",
      "ALTER TABLE settings ADD COLUMN interleaved_block_col_2 TEXT",
    ].join("\n");

    writeFileSync(
      join(tmpMigrationsDir, "0022_interleaved_block_comment_ddl.sql"),
      interleavedSql
    );

    // _runMigrations must resolve — both ALTER TABLE statements must execute.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "interleaved block-comment migration should resolve without throwing"
    ).resolves.toBeUndefined();

    const client = createClient({ url: `file:${dbPath}` });

    // Both columns from the two ALTER TABLE calls must exist.
    await expect(
      client.execute("SELECT interleaved_block_col_1 FROM settings LIMIT 0"),
      "first column (before the interleaved comment) must exist"
    ).resolves.toBeDefined();

    await expect(
      client.execute("SELECT interleaved_block_col_2 FROM settings LIMIT 0"),
      "second column (after the interleaved comment) must exist"
    ).resolves.toBeDefined();

    // The tag must be recorded so the runner never retries it.
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0022_interleaved_block_comment_ddl'"
    );
    expect(
      result.rows.length,
      "tag must be recorded after interleaved block-comment migration is applied"
    ).toBe(1);
    expect(result.rows[0]["tag"]).toBe("0022_interleaved_block_comment_ddl");

    await client.close();
  });

  it("does not block a subsequent real migration that follows a comment-only entry in the journal", async () => {
    // This confirms the comment-only entry does not permanently brick the runner:
    // a second migration with real DDL applies correctly on the same run.
    const storage = new DatabaseStorage();
    await storage.initialize();

    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000010,
          tag: "0010_comment_only_blocker",
          breakpoints: true,
        },
        {
          idx: 1,
          version: "6",
          when: 9999000000011,
          tag: "0011_real_migration_after_comment",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // First entry: comment-only placeholder.
    writeFileSync(
      join(tmpMigrationsDir, "0010_comment_only_blocker.sql"),
      [
        "-- Reserved for future use.",
        "-- No statements here.",
      ].join("\n")
    );

    // Second entry: a real ALTER TABLE that adds a column we can verify.
    writeFileSync(
      join(tmpMigrationsDir, "0011_real_migration_after_comment.sql"),
      "ALTER TABLE settings ADD COLUMN comment_block_guard_col TEXT"
    );

    // Both must apply without throwing.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "runner must not throw when a real migration follows a comment-only one"
    ).resolves.toBeUndefined();

    // The real column must exist.
    const client = createClient({ url: `file:${dbPath}` });
    await expect(
      client.execute("SELECT comment_block_guard_col FROM settings LIMIT 0"),
      "column added by the real migration must exist"
    ).resolves.toBeDefined();

    // Both tags must be recorded.
    const tags = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag IN ('0010_comment_only_blocker','0011_real_migration_after_comment') ORDER BY tag"
    );
    expect(tags.rows.length, "both tags must be recorded").toBe(2);

    await client.close();
  });

  // ── Two DDL statements in one segment, no breakpoint ───────────────────────
  //
  // When a migration file contains two semicolon-terminated DDL statements in a
  // single segment (i.e. no "--> statement-breakpoint" separates them), the
  // original code would send the entire segment as one execute() call.
  // @libsql/client rejects multi-statement strings with "near 'ALTER': syntax
  // error", silently dropping both columns and permanently blocking the journal.
  //
  // The fix splits each segment on ";" and executes sub-statements individually.
  // This test confirms both columns are created and the tag is recorded.

  it("applies both DDL statements when two ALTER TABLE calls share a segment with no statement-breakpoint", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000023,
          tag: "0023_two_ddl_no_breakpoint",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // Two ALTER TABLE statements in a single segment — no statement-breakpoint.
    // A naive execute() of this string would raise "near 'ALTER': syntax error"
    // in @libsql/client and silently skip both columns.
    const twoStatementSql = [
      "ALTER TABLE settings ADD COLUMN no_breakpoint_col_a TEXT;",
      "ALTER TABLE settings ADD COLUMN no_breakpoint_col_b TEXT",
    ].join("\n");

    writeFileSync(
      join(tmpMigrationsDir, "0023_two_ddl_no_breakpoint.sql"),
      twoStatementSql
    );

    // Must resolve — both sub-statements must be executed without error.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "migration with two DDL statements in one segment should resolve without throwing"
    ).resolves.toBeUndefined();

    const client = createClient({ url: `file:${dbPath}` });

    // Both columns from the two ALTER TABLE calls must exist.
    await expect(
      client.execute("SELECT no_breakpoint_col_a FROM settings LIMIT 0"),
      "first column (no_breakpoint_col_a) must exist after two-statement segment migration"
    ).resolves.toBeDefined();

    await expect(
      client.execute("SELECT no_breakpoint_col_b FROM settings LIMIT 0"),
      "second column (no_breakpoint_col_b) must exist after two-statement segment migration"
    ).resolves.toBeDefined();

    // The tag must be recorded so the runner never retries it.
    const result = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0023_two_ddl_no_breakpoint'"
    );
    expect(
      result.rows.length,
      "tag must be recorded after two-statement segment migration is applied"
    ).toBe(1);
    expect(result.rows[0]["tag"]).toBe("0023_two_ddl_no_breakpoint");

    await client.close();
  });

  // ── Semicolon inside a string literal in a DEFAULT clause ──────────────────
  //
  // The segment splitter uses a string-literal-aware parser so that a semicolon
  // embedded inside a single-quoted value (e.g. DEFAULT 'a;b') is NOT treated
  // as a statement boundary.  A naive .split(";") would break the ALTER TABLE
  // into two invalid fragments: one with an unclosed string literal and one with
  // orphaned text, causing a syntax error and silently dropping the column.
  //
  // This test confirms the splitter sees the semicolon as part of the literal,
  // executes the single statement correctly, and that the column is created with
  // the right default value.

  it("does not split on a semicolon embedded inside a string literal in a DEFAULT clause", async () => {
    const storage = new DatabaseStorage();
    await storage.initialize();

    const metaDir = join(tmpMigrationsDir, "meta");
    mkdirSync(metaDir, { recursive: true });

    const journal = {
      version: "7",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 9999000000024,
          tag: "0024_semicolon_in_string_literal",
          breakpoints: true,
        },
      ],
    };
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(journal));

    // The DEFAULT value contains a semicolon inside a single-quoted string.
    // A naive split(";") would treat this semicolon as a statement boundary,
    // producing two broken fragments and raising a syntax error.
    const sql = "ALTER TABLE settings ADD COLUMN semicolon_default_col TEXT DEFAULT 'a;b'";

    writeFileSync(
      join(tmpMigrationsDir, "0024_semicolon_in_string_literal.sql"),
      sql
    );

    // The string-literal-aware splitter must not break on the embedded semicolon.
    await expect(
      (storage as any)._runMigrations(tmpMigrationsDir),
      "migration with a semicolon inside a string literal should resolve without throwing"
    ).resolves.toBeUndefined();

    const client = createClient({ url: `file:${dbPath}` });

    // The column must exist.
    await expect(
      client.execute("SELECT semicolon_default_col FROM settings LIMIT 0"),
      "column with semicolon-containing DEFAULT must exist after migration"
    ).resolves.toBeDefined();

    // The default value must be the full literal 'a;b', not a truncated fragment.
    await client.execute(
      "INSERT INTO settings (id) VALUES ('semicolon-default-test') ON CONFLICT(id) DO NOTHING"
    );
    const row = await client.execute(
      "SELECT semicolon_default_col FROM settings WHERE id = 'semicolon-default-test'"
    );
    expect(
      row.rows[0]["semicolon_default_col"],
      "default value must be the full literal 'a;b' — not truncated at the semicolon"
    ).toBe("a;b");

    // The tag must be recorded so the runner never retries it.
    const tagResult = await client.execute(
      "SELECT tag FROM __creatrix_migrations WHERE tag = '0024_semicolon_in_string_literal'"
    );
    expect(
      tagResult.rows.length,
      "tag must be recorded after semicolon-in-literal migration is applied"
    ).toBe(1);
    expect(tagResult.rows[0]["tag"]).toBe("0024_semicolon_in_string_literal");

    await client.close();
  });
});
