/**
 * Integration test: a chat message streams to the UI when a connection is active.
 *
 * Suite A — SSE pipeline logic (pure, no rendering)
 *   Exercises the SSE parsing algorithm used in Chat.tsx handleSendMessage.
 *   Runs instantly, catches regressions in the stream-reading loop.
 *
 * Suite B — Chat component integration (renders Chat.tsx)
 *   Mounts the real Chat page, mocks global fetch to return a fake SSE
 *   stream, and asserts the assistant reply appears in the rendered DOM.
 *   Covers the full client path:
 *     user types → ChatInput submits → handleSendMessage fetches
 *     → SSE events parsed → conversations cache invalidated → refetch
 *     returns updated conversation → ChatMessage renders the reply.
 *
 * Why the singleton queryClient?
 *   Chat.tsx imports `queryClient` from `@/lib/queryClient` and calls
 *   queryClient.invalidateQueries(...) directly after the stream ends.
 *   To make that invalidation reach the hooks inside the component tree
 *   the same instance must be supplied to <QueryClientProvider>.
 *
 * No live server, database, or AI provider is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import Chat from "../pages/Chat";
import { queryClient } from "../lib/queryClient";
import { ThemeProvider } from "../components/ThemeProvider";

// ── Browser API stubs (not present in jsdom) ──────────────────────────────────

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
  writable: true,
});

Element.prototype.scrollIntoView = vi.fn();

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// ── Suite A: pure SSE pipeline logic ─────────────────────────────────────────

/**
 * Build a ReadableStream<Uint8Array> from an array of byte chunks.
 * Each element is yielded as a separate read to exercise cross-chunk decoding.
 */
function fakeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Encode event objects into SSE-formatted Uint8Array bytes, matching the
 * format written by server/routes.ts:
 *   res.write(`data: ${JSON.stringify(event)}\n\n`)
 */
function encodeEvents(events: object[]): Uint8Array {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new TextEncoder().encode(text);
}

/**
 * Mirror of the SSE parsing loop from Chat.tsx handleSendMessage.
 * Kept here as a standalone function so tests can run without rendering
 * the full page. Must be kept in sync with the algorithm in Chat.tsx.
 */
async function consumeSseStream(stream: ReadableStream<Uint8Array>): Promise<{
  conversationId: string | null;
  content: string;
  done: boolean;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let conversationId: string | null = null;
  let content = "";
  let done = false;

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "conversation_id" && conversationId === null) {
          conversationId = data.id;
        } else if (data.type === "content") {
          content += data.content;
        } else if (data.type === "done") {
          done = true;
        }
      } catch {
        // Malformed event — skip, same as the component does
      }
    }
  }

  return { conversationId, content, done };
}

describe("SSE streaming pipeline (Chat.tsx handleSendMessage logic)", () => {
  it("accumulates content chunks into a single string", async () => {
    const stream = fakeStream([
      encodeEvents([
        { type: "conversation_id", id: "conv-1" },
        { type: "content", content: "Hello" },
        { type: "content", content: ", " },
        { type: "content", content: "world!" },
        { type: "done" },
      ]),
    ]);

    const result = await consumeSseStream(stream);
    expect(result.content).toBe("Hello, world!");
  });

  it("captures the conversation_id from the first event", async () => {
    const stream = fakeStream([
      encodeEvents([
        { type: "conversation_id", id: "abc-123" },
        { type: "content", content: "Hi" },
        { type: "done" },
      ]),
    ]);

    const result = await consumeSseStream(stream);
    expect(result.conversationId).toBe("abc-123");
  });

  it("sets done=true when a done event is received", async () => {
    const stream = fakeStream([
      encodeEvents([
        { type: "conversation_id", id: "conv-2" },
        { type: "content", content: "Test response." },
        { type: "done" },
      ]),
    ]);

    const result = await consumeSseStream(stream);
    expect(result.done).toBe(true);
  });

  it("works when events arrive across multiple stream chunks", async () => {
    const firstChunk = encodeEvents([
      { type: "conversation_id", id: "chunked-conv" },
      { type: "content", content: "Part one " },
    ]);
    const secondChunk = encodeEvents([
      { type: "content", content: "part two." },
      { type: "done" },
    ]);

    const result = await consumeSseStream(fakeStream([firstChunk, secondChunk]));
    expect(result.conversationId).toBe("chunked-conv");
    expect(result.content).toBe("Part one part two.");
    expect(result.done).toBe(true);
  });

  it("ignores non-SSE lines and malformed JSON without throwing", async () => {
    const encoder = new TextEncoder();
    const raw =
      "data: {\"type\":\"conversation_id\",\"id\":\"conv-3\"}\n\n" +
      "this line has no data prefix and should be ignored\n" +
      "data: not-valid-json\n\n" +
      "data: {\"type\":\"content\",\"content\":\"Safe\"}\n\n" +
      "data: {\"type\":\"done\"}\n\n";

    const result = await consumeSseStream(fakeStream([encoder.encode(raw)]));
    expect(result.conversationId).toBe("conv-3");
    expect(result.content).toBe("Safe");
    expect(result.done).toBe(true);
  });

  it("returns empty content and null id when stream carries only a done event", async () => {
    const result = await consumeSseStream(
      fakeStream([encodeEvents([{ type: "done" }])]),
    );
    expect(result.conversationId).toBeNull();
    expect(result.content).toBe("");
    expect(result.done).toBe(true);
  });

  it("does not overwrite the first conversation_id with a second one", async () => {
    const result = await consumeSseStream(
      fakeStream([
        encodeEvents([
          { type: "conversation_id", id: "first-id" },
          { type: "conversation_id", id: "second-id" },
          { type: "done" },
        ]),
      ]),
    );
    expect(result.conversationId).toBe("first-id");
  });
});

// ── Suite B: Chat component integration ──────────────────────────────────────

const CONN_ID = "conn-test-1";
const CONV_ID = "conv-test-new";
const MODEL_ID = "llama3";

const TEST_CONNECTION = {
  id: CONN_ID,
  name: "Ollama (test)",
  provider: "ollama",
  endpoint: "http://localhost:11434",
  apiKey: null,
  defaultModel: MODEL_ID,
  isDefault: true,
  orderIndex: 0,
};

// Conversation returned by the /api/conversations refetch after stream ends.
const UPDATED_CONVERSATION = {
  id: CONV_ID,
  title: "ping",
  model: MODEL_ID,
  projectId: null,
  connectionId: CONN_ID,
  createdAt: new Date().toISOString(),
  messages: [
    { id: "msg-user-1", role: "user", content: "ping" },
    { id: "msg-asst-1", role: "assistant", content: "pong from Ollama" },
  ],
};

function makeSseStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events = [
    { type: "conversation_id", id: CONV_ID },
    { type: "content", content: "pong from Ollama" },
    { type: "done" },
  ];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      }
      controller.close();
    },
  });
}

function renderChat() {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Chat />
        </Router>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("Chat component — message streams to the UI when a connection is active", () => {
  beforeEach(() => {
    // Fresh cache so each test is independent.
    queryClient.clear();

    // Pre-select the test connection via localStorage so the component
    // skips its providerStatus fallback logic.
    localStorage.setItem("creatrix:selectedConnectionId", CONN_ID);
    localStorage.setItem("creatrix:selectedModel", MODEL_ID);

    // Seed the query cache.  staleTime: Infinity (the default) means the
    // component will use these values and NOT issue fetch requests for them.
    queryClient.setQueryData(["/api/connections"], [TEST_CONNECTION]);
    queryClient.setQueryData(["/api/conversations"], []);
    queryClient.setQueryData(["/api/settings"], {
      morningOrientationEnabled: false,
    });
    queryClient.setQueryData(["/api/providers/status"], {
      providers: [
        {
          connectionId: CONN_ID,
          name: "Ollama (test)",
          status: "online",
          models: [{ id: MODEL_ID, name: "Llama 3" }],
        },
      ],
    });
    // Sidebar sub-components (RuntimeCoherencePanel, ToolStatusChip)
    queryClient.setQueryData(["/api/system/coherence"], {
      coherent: true,
      overallStatus: "GREEN",
      items: [
        { domain: "Inference", component: "Ollama", actual: "coherent", message: "ok" },
      ],
      measuredAt: new Date().toISOString(),
    });
    queryClient.setQueryData(["/api/tools/status"], { active: [], inactive: [] });
    queryClient.setQueryData(["/api/substrate/health"], {
      coherence: "green",
      substrates: {},
      issues: [],
      checkedAt: Date.now(),
    });
    // Project list used by AppSidebar
    queryClient.setQueryData(["/api/projects"], []);

    // Mock global fetch.
    // Return correctly-shaped responses for every URL that any sub-component
    // might fetch, so the component tree doesn't crash even if a query
    // bypasses the cache and hits the network mock.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const json = (data: unknown) =>
          Promise.resolve(
            new Response(JSON.stringify(data), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );

        // Streaming chat endpoint — must return an SSE stream
        if (url === "/api/chat") {
          return Promise.resolve(
            new Response(makeSseStream(), {
              status: 200,
              headers: { "Content-Type": "text/event-stream" },
            }),
          );
        }

        // Conversations list — post-done refetch returns the updated conversation
        if (String(url).includes("/api/conversations")) {
          return json([UPDATED_CONVERSATION]);
        }

        // Provider status — must have { providers: [...] } shape
        if (String(url).includes("/api/providers/status")) {
          return json({
            providers: [
              {
                connectionId: CONN_ID,
                name: "Ollama (test)",
                status: "online",
                models: [{ id: MODEL_ID, name: "Llama 3" }],
              },
            ],
          });
        }

        // Coherence report — must have { items: [...] } shape
        if (String(url).includes("/api/system/coherence")) {
          return json({
            coherent: true,
            overallStatus: "GREEN",
            items: [{ domain: "Inference", component: "Ollama", actual: "coherent", message: "ok" }],
            measuredAt: new Date().toISOString(),
          });
        }

        // Tool capability status
        if (String(url).includes("/api/tools/status")) {
          return json({ active: [], inactive: [] });
        }

        // Substrate health
        if (String(url).includes("/api/substrate/health")) {
          return json({ coherence: "green", substrates: {}, issues: [], checkedAt: Date.now() });
        }

        // /api/status (EmptyState)
        if (String(url).includes("/api/status")) {
          return json({ status: "ok", version: "test" });
        }

        // Default: return an empty array for list endpoints, empty object for others
        return json([]);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders the assistant reply in the message list after the stream ends", async () => {
    renderChat();

    // Wait for the chat input to mount.
    const textarea = await screen.findByTestId("input-chat-message");
    expect(textarea).toBeTruthy();

    // Type and send a message.
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "ping" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("button-send-message"));
    });

    // The assistant reply appears either as:
    //   (a) streaming content  → message-assistant-streaming
    //   (b) permanent message  → message-assistant-msg-asst-1 (after refetch)
    // Either way the text "pong from Ollama" must be visible.
    await waitFor(
      () => {
        expect(screen.getByText("pong from Ollama")).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it("sends a POST to /api/chat with the correct message in the body", async () => {
    renderChat();

    const textarea = await screen.findByTestId("input-chat-message");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hello world" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("button-send-message"));
    });

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const chatCall = fetchMock.mock.calls.find(([url]) => url === "/api/chat");
      expect(chatCall).toBeTruthy();
      const body = JSON.parse((chatCall![1] as RequestInit).body as string);
      expect(body.message).toBe("hello world");
      expect(body.connectionId).toBe(CONN_ID);
    });
  });
});
