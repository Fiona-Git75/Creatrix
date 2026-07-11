/**
 * Server-side integration test: DELETE /api/memory/:id
 *
 * Verifies that:
 *   1. The route passes the exact URL :id param to deleteMemoryEntry — not a
 *      stale or wrong value.
 *   2. The route returns HTTP 404 when deleteMemoryEntry returns false (entry
 *      does not exist), rather than silently responding 200/204.
 *   3. The route returns HTTP 204 (no body) when deleteMemoryEntry returns true.
 *
 * No live database, AI provider, or browser DOM is required.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

// ── Shared mock handles ───────────────────────────────────────────────────────

const { mockStorage } = vi.hoisted(() => {
  const mockStorage = {
    listUsers: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue(undefined),
    getUserByUsername: vi.fn().mockResolvedValue(undefined),
    createUser: vi.fn(),
    getConnections: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue(undefined),
    getDefaultConnection: vi.fn().mockResolvedValue(null),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn(),
    reorderConnections: vi.fn(),
    countConversationsByConnection: vi.fn().mockResolvedValue(0),
    getProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    reorderProjects: vi.fn(),
    getConversations: vi.fn().mockResolvedValue([]),
    getConversation: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    addMessageToConversation: vi.fn(),
    getMemoryEntries: vi.fn().mockResolvedValue([]),
    createMemoryEntry: vi.fn(),
    deleteMemoryEntry: vi.fn(),
    clearMemory: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({
      rootFolder: null,
      libraryPaths: [],
      whisperEndpoint: null,
    }),
    updateSettings: vi.fn(),
    unifiedSearch: vi.fn().mockResolvedValue({
      conversations: [],
      memories: [],
    }),
    getLibraryFolders: vi.fn().mockResolvedValue([]),
    getLibraryFolder: vi.fn().mockResolvedValue(undefined),
    createLibraryFolder: vi.fn(),
    updateLibraryFolder: vi.fn(),
    deleteLibraryFolder: vi.fn(),
    getLibraryItems: vi.fn().mockResolvedValue([]),
    getLibraryItem: vi.fn().mockResolvedValue(undefined),
    getRecentLibraryItems: vi.fn().mockResolvedValue([]),
    createLibraryItem: vi.fn(),
    updateLibraryItem: vi.fn(),
    deleteLibraryItem: vi.fn(),
    searchLibraryItems: vi.fn().mockResolvedValue([]),
    getJournalEntries: vi.fn().mockResolvedValue([]),
    getJournalEntry: vi.fn().mockResolvedValue(undefined),
    createJournalEntry: vi.fn().mockResolvedValue({ id: "j1" }),
    updateJournalEntry: vi.fn(),
    getJournalEntriesSince: vi.fn().mockResolvedValue([]),
    getWorkspaceDocs: vi.fn().mockResolvedValue([]),
    getWorkspaceDoc: vi.fn().mockResolvedValue(undefined),
    getWorkspaceDocByTitle: vi.fn().mockResolvedValue(undefined),
    createWorkspaceDoc: vi.fn(),
    updateWorkspaceDoc: vi.fn(),
    deleteWorkspaceDoc: vi.fn(),
    addSystemLog: vi.fn().mockResolvedValue(undefined),
    getSystemLogs: vi.fn().mockResolvedValue([]),
    clearSystemLogs: vi.fn(),
    pruneSystemLogs: vi.fn().mockResolvedValue(undefined),
    getConsultants: vi.fn().mockResolvedValue([]),
    getConsultant: vi.fn().mockResolvedValue(undefined),
    createConsultant: vi.fn(),
    updateConsultant: vi.fn(),
    deleteConsultant: vi.fn(),
  };

  return { mockStorage };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@server/storage", () => ({ storage: mockStorage }));

vi.mock("@server/providers", () => ({
  createProvider: vi.fn(() => ({
    name: "mock-provider",
    generateStream: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    listModelsWithStatus: vi.fn().mockResolvedValue({ status: "ok", models: [] }),
    healthCheck: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("@server/providers/discovery", () => ({
  startBackgroundRefresh: vi.fn(),
  fetchModelProfile: vi.fn().mockResolvedValue({ toolSupport: "none" }),
  getProvidersStatus: vi.fn().mockResolvedValue({ providers: [] }),
  resolveModelToProvider: vi.fn().mockResolvedValue(null),
  scanConnection: vi.fn().mockResolvedValue({ status: "ok", models: [] }),
  scanConnectionLite: vi.fn().mockResolvedValue({ status: "ok" }),
}));

vi.mock("@server/capabilities", () => ({
  listCapabilities: vi.fn().mockReturnValue([]),
  invokeCapability: vi.fn(),
  getCapability: vi.fn().mockReturnValue(null),
}));

vi.mock("@server/capabilities/notion", () => ({
  probeNotionConnected: vi.fn().mockResolvedValue(false),
}));

vi.mock("@server/runtime/service-runtime", () => ({
  getServiceState: vi.fn().mockReturnValue({ status: "green" }),
  getAllServiceStates: vi.fn().mockReturnValue([]),
}));

vi.mock("@server/syslog", () => ({
  syslog: vi.fn(),
  getLogs: vi.fn().mockReturnValue([]),
  clearLogs: vi.fn(),
  setLogPersist: vi.fn(),
}));

vi.mock("@server/health", () => ({
  measureCoherence: vi.fn().mockResolvedValue({
    coherent: true,
    overallStatus: "GREEN",
    items: [],
  }),
}));

// ── Test server lifecycle ─────────────────────────────────────────────────────

import { registerRoutes } from "@server/routes";

let baseUrl: string;
let httpServer: Server;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  httpServer?.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMemory(
  params: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${baseUrl}/api/memory?${qs}` : `${baseUrl}/api/memory`;
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  const body = text.length > 0 ? JSON.parse(text) : null;
  return { status: res.status, body };
}

async function deleteMemory(id: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/api/memory/${id}`, { method: "DELETE" });
  const text = await res.text();
  const body = text.length > 0 ? JSON.parse(text) : null;
  return { status: res.status, body };
}

async function clearMemory(
  params: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${baseUrl}/api/memory?${qs}` : `${baseUrl}/api/memory`;
  const res = await fetch(url, { method: "DELETE" });
  const text = await res.text();
  const body = text.length > 0 ? JSON.parse(text) : null;
  return { status: res.status, body };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DELETE /api/memory/:id", () => {
  it("returns 404 with a structured error when the entry does not exist", async () => {
    mockStorage.deleteMemoryEntry.mockResolvedValueOnce(false);

    const { status, body } = await deleteMemory("nonexistent-id");

    expect(status, "status must be 404, not 200 or 204").toBe(404);
    expect(body).toEqual({ error: "Memory entry not found" });
  });

  it("calls deleteMemoryEntry with exactly the id from the URL — not a stale or wrong value", async () => {
    mockStorage.deleteMemoryEntry.mockResolvedValueOnce(false);
    mockStorage.deleteMemoryEntry.mockClear();

    const targetId = "memory-abc-123";
    await deleteMemory(targetId);

    expect(mockStorage.deleteMemoryEntry).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteMemoryEntry).toHaveBeenCalledWith(targetId);
  });

  it("uses the id from each individual request — not a cached value from a previous call", async () => {
    const firstId = "first-entry-id";
    const secondId = "second-entry-id";

    mockStorage.deleteMemoryEntry
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await deleteMemory(firstId);
    await deleteMemory(secondId);

    const calls = mockStorage.deleteMemoryEntry.mock.calls;
    expect(calls[calls.length - 2][0], "first call must use firstId").toBe(firstId);
    expect(calls[calls.length - 1][0], "second call must use secondId").toBe(secondId);
  });

  it("returns 204 with no body when the entry exists and is deleted", async () => {
    mockStorage.deleteMemoryEntry.mockResolvedValueOnce(true);

    const { status, body } = await deleteMemory("existing-entry-id");

    expect(status, "status must be 204 on successful delete").toBe(204);
    expect(body, "body must be null/empty for 204").toBeNull();
  });

  it("returns 500 with a structured error body when deleteMemoryEntry throws — not a silent crash", async () => {
    mockStorage.deleteMemoryEntry.mockRejectedValueOnce(
      new Error("database connection lost"),
    );

    const { status, body } = await deleteMemory("any-id");

    expect(status, "status must be 500 when the db throws").toBe(500);
    expect(body, "body must contain an error field").toMatchObject({
      error: expect.any(String),
    });
  });
});

// ── Bulk clear route ──────────────────────────────────────────────────────────

describe("DELETE /api/memory (bulk clear by scope)", () => {
  it("returns 404 with a structured error when clearMemory returns false (nothing matched)", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(false);

    const { status, body } = await clearMemory({ scope: "global" });

    expect(status, "status must be 404, not 204, when nothing was cleared").toBe(404);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 404 even without an explicit scope query param (defaults to 'global')", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(false);

    const { status, body } = await clearMemory();

    expect(status, "omitting ?scope should still yield 404 when clearMemory returns false").toBe(404);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("calls clearMemory with the scope and scopeId from the query string", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(true);
    mockStorage.clearMemory.mockClear();

    await clearMemory({ scope: "project", scopeId: "proj-xyz" });

    expect(mockStorage.clearMemory).toHaveBeenCalledTimes(1);
    expect(mockStorage.clearMemory).toHaveBeenCalledWith("project", "proj-xyz");
  });

  it("returns 204 with no body when clearMemory returns true (entries were cleared)", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(true);

    const { status, body } = await clearMemory({ scope: "global" });

    expect(status, "status must be 204 on a successful bulk clear").toBe(204);
    expect(body, "body must be null/empty for 204").toBeNull();
  });

  it("returns 500 with a structured error body when clearMemory throws — not a silent crash", async () => {
    mockStorage.clearMemory.mockRejectedValueOnce(new Error("db error"));

    const { status, body } = await clearMemory({ scope: "global" });

    expect(status, "status must be 500 when clearMemory throws").toBe(500);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 404 when clearMemory returns false for a project scope with a scopeId", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(false);

    const { status, body } = await clearMemory({ scope: "project", scopeId: "missing-project-id" });

    expect(status, "status must be 404 when no entries matched the project scope").toBe(404);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 404 when clearMemory returns false for a conversation scope with a scopeId", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(false);

    const { status, body } = await clearMemory({ scope: "conversation", scopeId: "missing-conversation-id" });

    expect(status, "status must be 404 when no entries matched the conversation scope").toBe(404);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("calls clearMemory with the decoded scopeId when it contains a URL-encoded slash (%2F)", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(true);
    mockStorage.clearMemory.mockClear();

    const encodedScopeId = "projects%2Fmy-project%2Fsub";
    const decodedScopeId = "projects/my-project/sub";

    const qs = `scope=project&scopeId=${encodedScopeId}`;
    const res = await fetch(`${baseUrl}/api/memory?${qs}`, { method: "DELETE" });
    await res.text();

    expect(mockStorage.clearMemory).toHaveBeenCalledTimes(1);
    expect(
      mockStorage.clearMemory.mock.calls[0][1],
      "scopeId must be the decoded string, not the raw %2F-encoded form",
    ).toBe(decodedScopeId);
  });

  it("calls clearMemory with the decoded scopeId when it contains a literal space (encoded as +)", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(true);
    mockStorage.clearMemory.mockClear();

    const qs = `scope=project&scopeId=my+project+name`;
    const res = await fetch(`${baseUrl}/api/memory?${qs}`, { method: "DELETE" });
    await res.text();

    expect(mockStorage.clearMemory).toHaveBeenCalledTimes(1);
    expect(
      mockStorage.clearMemory.mock.calls[0][1],
      "scopeId encoded with + must arrive as a space-separated string",
    ).toBe("my project name");
  });

  it("calls clearMemory with the decoded scopeId when it contains a %20-encoded space", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(true);
    mockStorage.clearMemory.mockClear();

    const qs = `scope=conversation&scopeId=conv%20with%20spaces`;
    const res = await fetch(`${baseUrl}/api/memory?${qs}`, { method: "DELETE" });
    await res.text();

    expect(mockStorage.clearMemory).toHaveBeenCalledTimes(1);
    expect(
      mockStorage.clearMemory.mock.calls[0][1],
      "scopeId encoded with %20 must arrive as a string with literal spaces",
    ).toBe("conv with spaces");
  });

  it("calls clearMemory with the decoded scopeId when it contains multiple mixed special characters", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(true);
    mockStorage.clearMemory.mockClear();

    const qs = `scope=project&scopeId=team%2Fq4+planning%2Freview`;
    const res = await fetch(`${baseUrl}/api/memory?${qs}`, { method: "DELETE" });
    await res.text();

    expect(mockStorage.clearMemory).toHaveBeenCalledTimes(1);
    expect(
      mockStorage.clearMemory.mock.calls[0][1],
      "scopeId with mixed %2F and + encoding must be fully decoded",
    ).toBe("team/q4 planning/review");
  });

  it("calls clearMemory with the decoded scope value when scope itself is URL-encoded (%67%6C%6F%62%61%6C → 'global')", async () => {
    mockStorage.clearMemory.mockResolvedValueOnce(true);
    mockStorage.clearMemory.mockClear();

    const encodedScope = "%67%6C%6F%62%61%6C";
    const res = await fetch(`${baseUrl}/api/memory?scope=${encodedScope}`, { method: "DELETE" });
    await res.text();

    expect(mockStorage.clearMemory).toHaveBeenCalledTimes(1);
    expect(
      mockStorage.clearMemory.mock.calls[0][0],
      "scope must be the decoded string 'global', not the raw percent-encoded form",
    ).toBe("global");
  });

  it("returns 400 with a structured error when a URL-encoded scope decodes to an invalid value (%62%61%64 → 'bad')", async () => {
    mockStorage.clearMemory.mockClear();

    const encodedBadScope = "%62%61%64";
    const res = await fetch(`${baseUrl}/api/memory?scope=${encodedBadScope}`, { method: "DELETE" });
    const text = await res.text();
    const body = text.length > 0 ? JSON.parse(text) : null;

    expect(res.status, "status must be 400, not 204 or 500, for an unrecognised scope").toBe(400);
    expect(body, "body must contain a structured error field").toMatchObject({ error: expect.any(String) });
    expect(mockStorage.clearMemory, "clearMemory must not be called when the scope is invalid").not.toHaveBeenCalled();
  });
});

// ── POST /api/memory scope validation ────────────────────────────────────────

async function postMemory(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text.length > 0 ? JSON.parse(text) : null;
  return { status: res.status, body: parsed };
}

describe("POST /api/memory (scope validation)", () => {
  it("returns 400 with a structured error when scope is an unrecognised value", async () => {
    mockStorage.createMemoryEntry.mockClear();

    const { status, body } = await postMemory({ content: "test", scope: "bad" });

    expect(status, "status must be 400, not 201, for an invalid scope").toBe(400);
    expect(body, "body must contain a structured error field").toMatchObject({ error: expect.any(String) });
    expect(mockStorage.createMemoryEntry, "createMemoryEntry must not be called when the scope is invalid").not.toHaveBeenCalled();
  });

  it("does not call createMemoryEntry when scope is invalid", async () => {
    mockStorage.createMemoryEntry.mockClear();

    await postMemory({ content: "test", scope: "invalid-scope" });

    expect(mockStorage.createMemoryEntry).not.toHaveBeenCalled();
  });

  it("returns 201 and calls createMemoryEntry when scope is 'global'", async () => {
    const fakeEntry = { id: "m1", content: "test", scope: "global" };
    mockStorage.createMemoryEntry.mockResolvedValueOnce(fakeEntry);
    mockStorage.createMemoryEntry.mockClear();

    const { status } = await postMemory({ content: "test", scope: "global" });

    expect(status, "status must be 201 for a valid scope").toBe(201);
    expect(mockStorage.createMemoryEntry).toHaveBeenCalledTimes(1);
  });

  it("returns 201 and calls createMemoryEntry when scope is 'project'", async () => {
    const fakeEntry = { id: "m2", content: "test", scope: "project" };
    mockStorage.createMemoryEntry.mockResolvedValueOnce(fakeEntry);
    mockStorage.createMemoryEntry.mockClear();

    const { status } = await postMemory({ content: "test", scope: "project", scopeId: "proj-1" });

    expect(status, "status must be 201 for scope=project").toBe(201);
    expect(mockStorage.createMemoryEntry).toHaveBeenCalledTimes(1);
  });

  it("returns 201 and calls createMemoryEntry when scope is 'conversation'", async () => {
    const fakeEntry = { id: "m3", content: "test", scope: "conversation" };
    mockStorage.createMemoryEntry.mockResolvedValueOnce(fakeEntry);
    mockStorage.createMemoryEntry.mockClear();

    const { status } = await postMemory({ content: "test", scope: "conversation", scopeId: "conv-1" });

    expect(status, "status must be 201 for scope=conversation").toBe(201);
    expect(mockStorage.createMemoryEntry).toHaveBeenCalledTimes(1);
  });

  it("returns 201 and calls createMemoryEntry when scope is 'resident'", async () => {
    const fakeEntry = { id: "m4", content: "test", scope: "resident" };
    mockStorage.createMemoryEntry.mockResolvedValueOnce(fakeEntry);
    mockStorage.createMemoryEntry.mockClear();

    const { status } = await postMemory({ content: "test", scope: "resident" });

    expect(status, "status must be 201 for scope=resident").toBe(201);
    expect(mockStorage.createMemoryEntry).toHaveBeenCalledTimes(1);
  });

  it("returns 201 and calls createMemoryEntry when no scope field is provided", async () => {
    const fakeEntry = { id: "m5", content: "test" };
    mockStorage.createMemoryEntry.mockResolvedValueOnce(fakeEntry);
    mockStorage.createMemoryEntry.mockClear();

    const { status } = await postMemory({ content: "test" });

    expect(status, "status must be 201 when scope is omitted").toBe(201);
    expect(mockStorage.createMemoryEntry).toHaveBeenCalledTimes(1);
  });
});

// ── GET /api/memory scope validation ─────────────────────────────────────────

describe("GET /api/memory (scope validation)", () => {
  it("returns 400 with a structured error when scope is an unrecognised value", async () => {
    mockStorage.getMemoryEntries.mockClear();

    const { status, body } = await getMemory({ scope: "bad" });

    expect(status, "status must be 400, not 200, for an invalid scope").toBe(400);
    expect(body, "body must contain a structured error field").toMatchObject({ error: expect.any(String) });
    expect(mockStorage.getMemoryEntries, "getMemoryEntries must not be called when the scope is invalid").not.toHaveBeenCalled();
  });

  it("returns 400 when a URL-encoded scope decodes to an invalid value (%62%61%64 → 'bad')", async () => {
    mockStorage.getMemoryEntries.mockClear();

    const encodedBadScope = "%62%61%64";
    const res = await fetch(`${baseUrl}/api/memory?scope=${encodedBadScope}`, { method: "GET" });
    const text = await res.text();
    const body = text.length > 0 ? JSON.parse(text) : null;

    expect(res.status, "status must be 400 for a percent-encoded invalid scope").toBe(400);
    expect(body, "body must contain a structured error field").toMatchObject({ error: expect.any(String) });
    expect(mockStorage.getMemoryEntries, "getMemoryEntries must not be called when the scope is invalid").not.toHaveBeenCalled();
  });

  it("returns 200 and calls getMemoryEntries when scope is valid ('global')", async () => {
    mockStorage.getMemoryEntries.mockResolvedValueOnce([]);
    mockStorage.getMemoryEntries.mockClear();

    const { status } = await getMemory({ scope: "global" });

    expect(status, "status must be 200 for a valid scope").toBe(200);
    expect(mockStorage.getMemoryEntries).toHaveBeenCalledTimes(1);
  });

  it("returns 200 and calls getMemoryEntries when no scope param is provided (defaults to global)", async () => {
    mockStorage.getMemoryEntries.mockResolvedValueOnce([]);
    mockStorage.getMemoryEntries.mockClear();

    const { status } = await getMemory();

    expect(status, "omitting ?scope should still return 200").toBe(200);
    expect(mockStorage.getMemoryEntries).toHaveBeenCalledTimes(1);
  });
});
