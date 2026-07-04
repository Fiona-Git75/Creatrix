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
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseStorage } from "@server/storage";
import { rmSync, existsSync } from "fs";
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
});
