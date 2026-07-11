/**
 * Server-side integration test: GET /api/memory scope validation.
 *
 * Verifies that the route returns HTTP 400 — not a 500 — when a scope that
 * requires a scopeId is called without one, and that the global scope still
 * returns 200 normally.
 *
 * What is covered:
 *   - GET /api/memory?scope=project   (no scopeId) → 400 + structured error
 *   - GET /api/memory?scope=conversation (no scopeId) → 400 + structured error
 *   - GET /api/memory?scope=global      (no scopeId) → 200 with entries
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
    getMemoryEntries: vi.fn().mockResolvedValue([
      { id: "m1", scope: "global", scopeId: null, content: "global fact", createdAt: new Date() },
    ]),
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

async function getMemory(params: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/api/memory?${params}`);
  const body = await res.json();
  return { status: res.status, body };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/memory — scope validation", () => {
  it("returns 400 with a structured error when scope=project and scopeId is absent", async () => {
    const { status, body } = await getMemory("scope=project");

    expect(status, "status must be 400, not 500").toBe(400);
    expect(body).toEqual({ error: "project scope requires a scopeId" });
  });

  it("returns 400 with a structured error when scope=conversation and scopeId is absent", async () => {
    const { status, body } = await getMemory("scope=conversation");

    expect(status, "status must be 400, not 500").toBe(400);
    expect(body).toEqual({ error: "conversation scope requires a scopeId" });
  });

  it("returns 200 with entries when scope=global (no scopeId required)", async () => {
    const { status, body } = await getMemory("scope=global");

    expect(status, "global scope must return 200").toBe(200);
    expect(Array.isArray(body), "body must be an array").toBe(true);
    expect(mockStorage.getMemoryEntries).toHaveBeenCalledWith("global", undefined);
  });

  it("returns 200 with entries when scope is omitted (defaults to global)", async () => {
    mockStorage.getMemoryEntries.mockClear();
    const { status, body } = await getMemory("");

    expect(status, "omitted scope must return 200").toBe(200);
    expect(Array.isArray(body), "body must be an array").toBe(true);
    expect(mockStorage.getMemoryEntries).toHaveBeenCalledWith("global", undefined);
  });
});
