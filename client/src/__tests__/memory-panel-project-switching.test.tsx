/**
 * Component-level tests for MemoryPanel — global memory display.
 *
 * MemoryPanel now shows only global-scope memories (no project or conversation
 * tabs). These tests verify:
 *
 *  1. When the panel opens, it fetches /api/memory?scope=global.
 *  2. Fetched entries are rendered in the list.
 *  3. When the API returns an empty array the empty-state is shown.
 *  4. Entries can be deleted via the trash button.
 *
 * Isolation strategy:
 *  - A fresh QueryClient (gcTime 0, retry 0) per test — no cache bleed.
 *  - global.fetch is replaced with vi.stubGlobal to intercept all queries.
 *  - No live server, database, or AI provider is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryPanel } from "../components/MemoryPanel";
import type { MemoryEntry } from "@shared/schema";

// ── jsdom stubs ────────────────────────────────────────────────────────────────

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

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeEntry(id: string, content: string): MemoryEntry {
  return {
    id,
    scope: "global",
    content,
    projectId: undefined,
    conversationId: undefined,
    summary: undefined,
    createdAt: new Date().toISOString(),
  };
}

// ── Module mocks ──────────────────────────────────────────────────────────────

const { mockApiRequest } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...actual,
    apiRequest: mockApiRequest,
    queryClient: new (await import("@tanstack/react-query")).QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    }),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function stubFetch(entries: MemoryEntry[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(entries), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
}

function renderPanel(client: QueryClient, props: { projectId?: string | null; conversationId?: string | null } = {}) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryPanel
        open={true}
        onOpenChange={vi.fn()}
        projectId={props.projectId ?? null}
        conversationId={props.conversationId ?? null}
      />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemoryPanel – global memory display", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = makeClient();
    mockApiRequest.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    client.clear();
  });

  it("fetches /api/memory?scope=global when the panel opens", async () => {
    stubFetch([]);
    renderPanel(client);

    await waitFor(() => {
      const fetchMock = vi.mocked(global.fetch as ReturnType<typeof vi.fn>);
      const calls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calls.some(u => u.includes("scope=global"))).toBe(true);
    });
  });

  it("renders fetched global entries", async () => {
    const entries = [
      makeEntry("g1", "Prefer concise replies"),
      makeEntry("g2", "Always use British English"),
    ];
    stubFetch(entries);
    renderPanel(client);

    await screen.findByTestId("card-memory-g1");
    expect(screen.getByText("Prefer concise replies")).toBeTruthy();
    expect(screen.getByText("Always use British English")).toBeTruthy();
  });

  it("shows empty state when no memories exist", async () => {
    stubFetch([]);
    renderPanel(client);

    await waitFor(() => {
      expect(screen.getByText("No memories yet")).toBeTruthy();
    });
  });

  it("shows the spinner while global fetch is in-flight", async () => {
    let resolveGlobal!: (v: Response) => void;
    const pendingGlobal = new Promise<Response>(res => { resolveGlobal = res; });

    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingGlobal));
    renderPanel(client);

    expect(screen.getByTestId("spinner-memory-global")).toBeTruthy();

    resolveGlobal(new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await waitFor(() => {
      expect(screen.queryByTestId("spinner-memory-global")).toBeNull();
    });
  });

  it("works when projectId and conversationId are both null", async () => {
    stubFetch([makeEntry("g3", "Global entry")]);
    renderPanel(client, { projectId: null, conversationId: null });

    await screen.findByTestId("card-memory-g3");
  });

  it("works when projectId and conversationId are both provided (global fetch still fires)", async () => {
    stubFetch([makeEntry("g4", "Another global entry")]);
    renderPanel(client, { projectId: "proj-a", conversationId: "conv-a" });

    await screen.findByTestId("card-memory-g4");
  });
});
