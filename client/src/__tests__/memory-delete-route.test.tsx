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

// ── Helper ────────────────────────────────────────────────────────────────────

async function deleteMemory(id: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/api/memory/${id}`, { method: "DELETE" });
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
});
