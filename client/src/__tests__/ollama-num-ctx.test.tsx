/**
 * Unit tests for OllamaProvider.generateStream — num_ctx injection.
 *
 * Guards the contract that a per-resident context-window override (numCtx) is
 * forwarded to Ollama as `options: { num_ctx }` in the request body.  If that
 * line is accidentally removed or the field is renamed, Ollama silently falls
 * back to its built-in default of 4 096 tokens and the user has no indication
 * their setting was ignored.
 *
 * Isolation strategy: global `fetch` is replaced with a vi.fn() spy that
 * captures the serialised request body and returns a minimal streaming
 * response.  No real network calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "@server/providers/index";
import type { Connection } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a minimal Connection fixture for an Ollama endpoint. */
function makeConn(numCtx?: number | null): Connection {
  return {
    id: "test-ollama",
    name: "Test Ollama",
    provider: "ollama",
    endpoint: "http://localhost:11434",
    defaultModel: "llama3.2:3b",
    isDefault: false,
    orderIndex: 0,
    numCtx: numCtx ?? undefined,
  };
}

/**
 * Returns a fetch mock that responds with a single Ollama-format NDJSON line
 * (`{ done: true }`) and captures the serialised request body for inspection.
 */
function makeFetchSpy(): { fetchMock: ReturnType<typeof vi.fn>; getBody: () => Record<string, unknown> } {
  let capturedBody: Record<string, unknown> = {};

  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse((init?.body as string) ?? "{}");

    const chunk = new TextEncoder().encode(JSON.stringify({ done: true }) + "\n");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  });

  return { fetchMock, getBody: () => capturedBody };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OllamaProvider.generateStream — num_ctx injection", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("includes options.num_ctx in the request body when numCtx is a positive integer", async () => {
    const { fetchMock, getBody } = makeFetchSpy();
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OllamaProvider(makeConn(32768));
    await provider.generateStream(
      [{ role: "user", content: "hello" }],
      "llama3.2:3b",
      () => {},
      undefined,
      32768,
    );

    const body = getBody();
    expect(body.options).toEqual({ num_ctx: 32768 });
  });

  it("sets num_ctx to the exact value passed — not a default or fallback", async () => {
    const { fetchMock, getBody } = makeFetchSpy();
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OllamaProvider(makeConn(8192));
    await provider.generateStream(
      [{ role: "user", content: "ping" }],
      "llama3.2:3b",
      () => {},
      undefined,
      8192,
    );

    expect(getBody().options).toEqual({ num_ctx: 8192 });
  });

  it("omits options entirely when numCtx is undefined", async () => {
    const { fetchMock, getBody } = makeFetchSpy();
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OllamaProvider(makeConn(undefined));
    await provider.generateStream(
      [{ role: "user", content: "hello" }],
      "llama3.2:3b",
      () => {},
      undefined,
      undefined,
    );

    expect(getBody()).not.toHaveProperty("options");
  });

  it("omits options entirely when numCtx is null", async () => {
    const { fetchMock, getBody } = makeFetchSpy();
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OllamaProvider(makeConn(null));
    await provider.generateStream(
      [{ role: "user", content: "hello" }],
      "llama3.2:3b",
      () => {},
      undefined,
      null as unknown as undefined,
    );

    expect(getBody()).not.toHaveProperty("options");
  });

  it("omits options when numCtx is zero (Ollama would ignore it anyway)", async () => {
    const { fetchMock, getBody } = makeFetchSpy();
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OllamaProvider(makeConn(0));
    await provider.generateStream(
      [{ role: "user", content: "hello" }],
      "llama3.2:3b",
      () => {},
      undefined,
      0,
    );

    // numCtx = 0 is not > 0, so the guard `numCtx != null && numCtx > 0` is false
    expect(getBody()).not.toHaveProperty("options");
  });

  it("still sends the request to the correct Ollama chat endpoint", async () => {
    const { fetchMock } = makeFetchSpy();
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new OllamaProvider(makeConn(16384));
    await provider.generateStream(
      [{ role: "user", content: "hello" }],
      "llama3.2:3b",
      () => {},
      undefined,
      16384,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/api/chat");
  });
});
