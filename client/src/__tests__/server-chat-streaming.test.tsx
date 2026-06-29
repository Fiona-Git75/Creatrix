/**
 * Server-side integration test: /api/chat emits correct SSE events.
 *
 * This file lives in client/src/__tests__/ so it is picked up by the same
 * web-bundler pipeline that handles .tsx files (required for the oxc jsx
 * transform to work).  Despite the location, the test exercises the real
 * Express route in server/routes.ts — imported via the @server alias —
 * wired up with a mock ModelProvider and an in-memory storage stub.
 *
 * What is covered:
 *   - HTTP response carries Content-Type: text/event-stream
 *   - First SSE event is  data: {"type":"conversation_id",...}
 *   - Content chunks arrive as  data: {"type":"content",...}  events
 *   - Final SSE event is  data: {"type":"done",...}
 *   - Provider stream error becomes  data: {"type":"error",...}
 *   - Missing message field returns HTTP 400
 *
 * No live database, AI provider, or browser DOM is required.
 */

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
// StreamChunk is used only in the mockGenerateStream type annotation below.
// We define a local alias to avoid coupling the test to the server module's
// exact import path — the shape is what matters for typing the mock.
type StreamChunk = {
  type: "content" | "done" | "error" | "tool_call";
  content?: string;
  error?: string;
  toolCall?: { name: string; args: Record<string, unknown> };
};

// ── Shared mock handles (created before module factories run) ─────────────────

const { mockGenerateStream, mockStorage } = vi.hoisted(() => {
  const conv = {
    id: "conv-test-123",
    title: "test",
    model: "test-model",
    projectId: null,
    connectionId: "conn-test-1",
    messages: [{ id: "msg-u1", role: "user" as const, content: "hello" }],
    createdAt: new Date(),
  };

  const mockStorage = {
    listUsers: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue(undefined),
    getUserByUsername: vi.fn().mockResolvedValue(undefined),
    createUser: vi.fn(),
    getConnections: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue({
      id: "conn-test-1",
      name: "Test",
      provider: "ollama",
      endpoint: "http://localhost:11434",
      apiKey: null,
      defaultModel: "test-model",
      isDefault: true,
      orderIndex: 0,
    }),
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
    getConversation: vi.fn().mockResolvedValue(conv),
    createConversation: vi.fn().mockResolvedValue(conv),
    updateConversation: vi.fn().mockResolvedValue(conv),
    deleteConversation: vi.fn(),
    addMessageToConversation: vi.fn().mockResolvedValue(conv),
    getMemoryEntries: vi.fn().mockResolvedValue([]),
    createMemoryEntry: vi.fn(),
    deleteMemoryEntry: vi.fn(),
    clearMemory: vi.fn(),
    getKnowledgeDocuments: vi.fn().mockResolvedValue([]),
    getKnowledgeDocument: vi.fn().mockResolvedValue(undefined),
    createKnowledgeDocument: vi.fn(),
    updateKnowledgeDocument: vi.fn(),
    deleteKnowledgeDocument: vi.fn(),
    searchDocuments: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({
      rootFolder: null,
      libraryPaths: [],
      whisperEndpoint: null,
    }),
    updateSettings: vi.fn(),
    unifiedSearch: vi.fn().mockResolvedValue({
      conversations: [],
      documents: [],
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

  // Untyped vi.fn — implementation type is enforced at each mockImplementationOnce call site.
  const mockGenerateStream = vi.fn();

  return { mockGenerateStream, mockStorage };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@server/storage", () => ({ storage: mockStorage }));

vi.mock("@server/providers", () => ({
  createProvider: vi.fn(() => ({
    name: "mock-provider",
    generateStream: mockGenerateStream,
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
import { createProvider } from "@server/providers";
import { invokeCapability } from "@server/capabilities";

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

const TEST_CONN_ID = "conn-test-1";
const TEST_MODEL = "test-model";

const CHAT_BODY = {
  message: "hello",
  connectionId: TEST_CONN_ID,
  model: TEST_MODEL,
};

async function postChat(body: Record<string, unknown>): Promise<{
  status: number;
  contentType: string | null;
  body: string;
}> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get("content-type"), body: text };
}

/** Parse SSE text into an array of JSON event objects. */
function parseSseEvents(body: string): Record<string, unknown>[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

/** Reset storage mocks to stable defaults. Called in beforeEach after clearAllMocks. */
function resetStorageMocks() {
  const conv = {
    id: "conv-test-123",
    title: "test",
    model: TEST_MODEL,
    projectId: null,
    connectionId: TEST_CONN_ID,
    messages: [{ id: "msg-u1", role: "user", content: "hello" }],
    createdAt: new Date(),
  };
  mockStorage.listUsers.mockResolvedValue([]);
  mockStorage.getConnection.mockResolvedValue({
    id: TEST_CONN_ID,
    name: "Test",
    provider: "ollama",
    endpoint: "http://localhost:11434",
    apiKey: null,
    defaultModel: TEST_MODEL,
    isDefault: true,
    orderIndex: 0,
  });
  mockStorage.createConversation.mockResolvedValue(conv);
  mockStorage.getConversation.mockResolvedValue(conv);
  mockStorage.addMessageToConversation.mockResolvedValue(conv);
  mockStorage.updateConversation.mockResolvedValue(conv);
  mockStorage.getMemoryEntries.mockResolvedValue([]);
  mockStorage.searchDocuments.mockResolvedValue([]);
  mockStorage.getSettings.mockResolvedValue({
    rootFolder: null,
    libraryPaths: [],
    whisperEndpoint: null,
  });
  mockStorage.getConsultants.mockResolvedValue([]);
  mockStorage.pruneSystemLogs.mockResolvedValue(undefined);
  mockStorage.addSystemLog.mockResolvedValue(undefined);
  mockStorage.getProject.mockResolvedValue(undefined);
  mockStorage.createJournalEntry.mockResolvedValue({ id: "j1" });
  mockStorage.getDefaultConnection.mockResolvedValue(null);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("/api/chat SSE streaming — server route emits correct event format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorageMocks();
  });

  it("responds with Content-Type: text/event-stream", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "hi" });
    });

    const { status, contentType } = await postChat(CHAT_BODY);
    expect(status).toBe(200);
    expect(contentType).toMatch(/text\/event-stream/);
  });

  it("emits conversation_id as the first SSE event", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "hi" });
    });

    const { body } = await postChat(CHAT_BODY);
    const events = parseSseEvents(body);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ type: "conversation_id" });
    expect(typeof (events[0] as { id: unknown }).id).toBe("string");
  });

  it("emits the provider content in 'data: {type,content}' format", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "Hello" });
      onChunk({ type: "content", content: ", " });
      onChunk({ type: "content", content: "world!" });
    });

    const { body } = await postChat(CHAT_BODY);
    const events = parseSseEvents(body);

    // The route buffers all content chunks then emits one content event
    const contentEvents = events.filter((e) => e.type === "content");
    const accumulated = contentEvents.map((e) => (e as { content: string }).content).join("");
    expect(accumulated).toBe("Hello, world!");
  });

  it("emits a done event as the last SSE event after the stream completes", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "response text" });
    });

    const { body } = await postChat(CHAT_BODY);
    const events = parseSseEvents(body);

    const lastEvent = events[events.length - 1];
    expect(lastEvent).toMatchObject({ type: "done" });
    expect(typeof (lastEvent as { messageId: unknown }).messageId).toBe("string");
  });

  it("every SSE line is formatted as 'data: {valid JSON}'", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "ok" });
    });

    const { body } = await postChat(CHAT_BODY);

    const dataLines = body.split("\n").filter((l) => l.trim() !== "");
    expect(dataLines.length).toBeGreaterThan(0);
    for (const line of dataLines) {
      expect(line).toMatch(/^data: /);
      const payload = line.slice("data: ".length);
      expect(() => JSON.parse(payload)).not.toThrow();
    }
  });

  it("emits a typed error event when the provider stream signals an error", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "error", error: "connection refused" });
    });

    const { body } = await postChat(CHAT_BODY);
    const events = parseSseEvents(body);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(typeof (errorEvent as { message: unknown }).message).toBe("string");
  });

  it("returns HTTP 400 when the message field is absent", async () => {
    const { status } = await postChat({ connectionId: TEST_CONN_ID });
    expect(status).toBe(400);
  });

  it("emits a done event after the provider delivers a tool_call chunk", async () => {
    // First iteration: provider emits a native tool_call chunk (Ollama structured path).
    // The route must collect it, invoke the capability, push results into message
    // history, and loop — without throwing or silently dropping the chunk.
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({
        type: "tool_call",
        toolCall: { name: "web_search", args: { query: "test query" } },
      });
    });

    // invokeCapability must return a structured result so runTool does not throw
    // when it reads invocation.status.  An "error" status is the safest stub
    // because it skips the createJournalEntry branch in the success path.
    vi.mocked(invokeCapability).mockResolvedValueOnce({
      capability: "web_search" as const,
      args: { query: "test query" },
      status: "error" as const,
      error: "capability not available in test environment",
    });

    // Second iteration: provider returns plain content with no tool call,
    // so the loop exits and the route writes the final done event.
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "tool result processed" });
    });

    const { body, status } = await postChat(CHAT_BODY);
    expect(status).toBe(200);

    const events = parseSseEvents(body);

    // generateStream must have been called twice: once for the tool-call
    // iteration and once for the follow-up that returns plain content.
    // If it was only called once the loop did not continue after tool execution.
    expect(mockGenerateStream).toHaveBeenCalledTimes(2);

    // invokeCapability must have been called with the exact tool name and args
    // from the tool_call chunk — confirming the branch was executed, not skipped.
    expect(vi.mocked(invokeCapability)).toHaveBeenCalledWith(
      "web_search",
      { query: "test query" },
      expect.any(Object),
    );

    // Stream must end with a done event — confirming the route completed
    // normally rather than crashing or stalling on the tool_call chunk.
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toMatchObject({ type: "done" });
    expect(typeof (lastEvent as { messageId: unknown }).messageId).toBe("string");
  });
});

// ── Provider-resolution suite ─────────────────────────────────────────────────
//
// The previous suite confirms SSE event format but treats the provider as an
// opaque mock.  These tests verify that the route's provider-resolution
// plumbing is correctly wired: createProvider must be called with the
// connection matching the request's connectionId, and the provider it returns
// must be the one that actually generates the stream.
//
// The "swap" test confirms that swapping to a different connection (with a
// different provider type) still routes through the same resolution path —
// guarding against regressions where a new provider type silently bypasses
// createProvider and ends up using a stale or wrong provider instance.

describe("/api/chat SSE streaming — provider resolution is wired end-to-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorageMocks();
  });

  it("calls createProvider with the connection matching the request connectionId", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "resolved" });
    });

    await postChat(CHAT_BODY);

    // createProvider must have been called exactly once with the connection
    // that storage returned for TEST_CONN_ID — confirming the resolution path
    // ran rather than a cached or hard-coded provider being used.
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: TEST_CONN_ID }),
    );
  });

  it("the provider returned by createProvider is the one that streams the chunks", async () => {
    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "from-mock" });
    });

    const { body } = await postChat(CHAT_BODY);
    const events = parseSseEvents(body);

    // mockGenerateStream is the generateStream method on the object returned by
    // the createProvider mock — if the route resolved and used the provider
    // correctly, it must have been called exactly once.
    expect(mockGenerateStream).toHaveBeenCalledTimes(1);

    // And the content it emitted must appear in the SSE response, proving the
    // provider's output travels through the route all the way to the client.
    const contentEvents = events.filter((e) => e.type === "content");
    const accumulated = contentEvents
      .map((e) => (e as { content: string }).content)
      .join("");
    expect(accumulated).toBe("from-mock");
  });

  it("streaming still works after swapping to an OpenAI connection", async () => {
    // Override the storage mock so the route resolves a different connection —
    // one with provider: "openai" — simulating the user switching connections.
    const OPENAI_CONN_ID = "conn-openai-99";
    const openaiConnection = {
      id: OPENAI_CONN_ID,
      name: "OpenAI GPT-4",
      provider: "openai",
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-test",
      defaultModel: "gpt-4",
      isDefault: false,
      orderIndex: 1,
    };
    mockStorage.getConnection.mockResolvedValueOnce(openaiConnection);

    mockGenerateStream.mockImplementationOnce(async (_msgs, _model, onChunk) => {
      onChunk({ type: "content", content: "openai-response" });
    });

    const { body } = await postChat({
      message: "hello",
      connectionId: OPENAI_CONN_ID,
      model: "gpt-4",
    });
    const events = parseSseEvents(body);

    // createProvider must have been called with the OpenAI connection, not the
    // default Ollama one — confirming provider resolution re-runs per request.
    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: OPENAI_CONN_ID, provider: "openai" }),
    );

    // The mock provider (returned by createProvider regardless of provider type)
    // must still be the source of the streamed chunks.
    expect(mockGenerateStream).toHaveBeenCalledTimes(1);
    const accumulated = events
      .filter((e) => e.type === "content")
      .map((e) => (e as { content: string }).content)
      .join("");
    expect(accumulated).toBe("openai-response");
  });
});
