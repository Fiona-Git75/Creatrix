/**
 * Component-level tests for MemoryPanel — project and conversation switching.
 *
 * These tests render MemoryPanel directly, mock global fetch, and verify that:
 *
 *  1. When the panel opens for project A, the fetch request includes
 *     `?scope=project&scopeId=proj-a` — the correct projectId flows from
 *     the prop through buildQueryParams to the API call.
 *
 *  2. When the parent re-renders with projectId="proj-b", a new fetch fires
 *     with `?scope=project&scopeId=proj-b`, and the panel shows project B's
 *     entries rather than project A's.
 *
 *  3. When projectId is null, the component's `enabled: open && !!projectId`
 *     guard prevents any project-scope fetch from firing at all, and the
 *     Project tab is rendered as disabled.
 *
 *  4. Conversation switching: switching conversationId from conv-a to conv-b
 *     causes the correct conversation-scoped entries to be displayed.
 *
 * Isolation strategy:
 *  - A fresh QueryClient (gcTime 0, retry 0) per test so there is no cache
 *    bleed between tests.
 *  - global.fetch is replaced with vi.stubGlobal so every query that calls
 *    fetch is intercepted.  The mock returns different MemoryEntry arrays
 *    based on the URL's scopeId parameter.
 *  - No live server, database, or AI provider is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryPanel } from "../components/MemoryPanel";
import type { MemoryEntry } from "@shared/schema";

// ── jsdom stubs ────────────────────────────────────────────────────────────────

// Radix UI components call matchMedia; stub it so tests don't crash.
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

function makeEntry(overrides: Partial<MemoryEntry> & Pick<MemoryEntry, "id" | "content" | "scope">): MemoryEntry {
  return {
    projectId: undefined,
    conversationId: undefined,
    summary: undefined,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const PROJ_A_ENTRY = makeEntry({
  id: "mem-proj-a-1",
  scope: "project",
  projectId: "proj-a",
  content: "Project A: always use strict TypeScript.",
});

const PROJ_B_ENTRY = makeEntry({
  id: "mem-proj-b-1",
  scope: "project",
  projectId: "proj-b",
  content: "Project B: use Python 3.12+.",
});

const CONV_A_ENTRY = makeEntry({
  id: "mem-conv-a-1",
  scope: "conversation",
  conversationId: "conv-a",
  content: "Conversation A: user wants bullet-point answers.",
});

const CONV_B_ENTRY = makeEntry({
  id: "mem-conv-b-1",
  scope: "conversation",
  conversationId: "conv-b",
  content: "Conversation B: user is debugging a Rust program.",
});

const GLOBAL_ENTRY = makeEntry({
  id: "mem-global-1",
  scope: "global",
  content: "I always prefer concise answers.",
});

// ── Fetch mock factory ────────────────────────────────────────────────────────

/**
 * Build a fetch mock that returns different MemoryEntry arrays depending on
 * the `scope` and `scopeId` query parameters in the URL.
 * Captures all URLs called so tests can assert on them.
 */
function makeFetchMock() {
  const calledUrls: string[] = [];

  const mock = vi.fn().mockImplementation((url: string) => {
    calledUrls.push(url);
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    const scope = params.get("scope");
    const scopeId = params.get("scopeId");

    let data: MemoryEntry[] = [];

    if (scope === "global") {
      data = [GLOBAL_ENTRY];
    } else if (scope === "project" && scopeId === "proj-a") {
      data = [PROJ_A_ENTRY];
    } else if (scope === "project" && scopeId === "proj-b") {
      data = [PROJ_B_ENTRY];
    } else if (scope === "conversation" && scopeId === "conv-a") {
      data = [CONV_A_ENTRY];
    } else if (scope === "conversation" && scopeId === "conv-b") {
      data = [CONV_B_ENTRY];
    }

    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  return { mock, calledUrls };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

interface PanelProps {
  projectId?: string | null;
  conversationId?: string | null;
}

function renderPanel(
  client: QueryClient,
  { projectId = null, conversationId = null }: PanelProps = {},
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryPanel
        open={true}
        onOpenChange={vi.fn()}
        projectId={projectId ?? null}
        conversationId={conversationId ?? null}
      />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemoryPanel — fetch requests carry the correct scopeId", () => {
  let client: QueryClient;
  let calledUrls: string[];

  beforeEach(() => {
    client = makeClient();
    const fetchMock = makeFetchMock();
    calledUrls = fetchMock.calledUrls;
    vi.stubGlobal("fetch", fetchMock.mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    client.clear();
  });

  it("fetches with scopeId=proj-a when the panel opens for project A", async () => {
    renderPanel(client, { projectId: "proj-a" });

    await waitFor(() => {
      const projectFetches = calledUrls.filter(u =>
        u.includes("scope=project") && u.includes("scopeId=proj-a"),
      );
      expect(projectFetches.length, "must have fetched project scope with scopeId=proj-a")
        .toBeGreaterThan(0);
    });
  });

  it("does NOT fetch a project-scope URL when projectId is null", async () => {
    renderPanel(client, { projectId: null });

    // Wait for global fetch to fire (we know it fires unconditionally)
    await waitFor(() => {
      expect(calledUrls.some(u => u.includes("scope=global"))).toBe(true);
    });

    const projectFetches = calledUrls.filter(u => u.includes("scope=project"));
    expect(
      projectFetches,
      "no project-scope fetch must fire when projectId is null",
    ).toHaveLength(0);
  });

  it("the Project tab is disabled when projectId is null", async () => {
    renderPanel(client, { projectId: null });

    const projectTab = await screen.findByTestId("tab-memory-project");
    expect(projectTab).toBeDisabled();
  });

  it("the Project tab is enabled when projectId is provided", async () => {
    renderPanel(client, { projectId: "proj-a" });

    const projectTab = await screen.findByTestId("tab-memory-project");
    expect(projectTab).not.toBeDisabled();
  });

  it("does NOT fetch a conversation-scope URL when conversationId is null", async () => {
    renderPanel(client, { conversationId: null });

    await waitFor(() => {
      expect(calledUrls.some(u => u.includes("scope=global"))).toBe(true);
    });

    const convFetches = calledUrls.filter(u => u.includes("scope=conversation"));
    expect(
      convFetches,
      "no conversation-scope fetch must fire when conversationId is null",
    ).toHaveLength(0);
  });
});

describe("MemoryPanel — switching projects shows isolated entries", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = makeClient();
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock.mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    client.clear();
  });

  it("panel for project A shows project A entries and not project B entries", async () => {
    renderPanel(client, { projectId: "proj-a" });

    // The panel opens on the global tab; switch to project tab to see entries.
    const projectTab = await screen.findByTestId("tab-memory-project");
    await userEvent.click(projectTab);

    await waitFor(() => {
      expect(screen.queryByText(PROJ_A_ENTRY.content)).not.toBeNull();
    });

    expect(
      screen.queryByText(PROJ_B_ENTRY.content),
      "project B entry must not appear when viewing project A",
    ).toBeNull();
  });

  it("panel for project B shows project B entries and not project A entries", async () => {
    renderPanel(client, { projectId: "proj-b" });

    const projectTab = await screen.findByTestId("tab-memory-project");
    await userEvent.click(projectTab);

    await waitFor(() => {
      expect(screen.queryByText(PROJ_B_ENTRY.content)).not.toBeNull();
    });

    expect(
      screen.queryByText(PROJ_A_ENTRY.content),
      "project A entry must not appear when viewing project B",
    ).toBeNull();
  });

  it("re-rendering with a new projectId fetches and shows that project's entries", async () => {
    const { rerender } = renderPanel(client, { projectId: "proj-a" });

    // Switch to project tab while on project A
    const projectTab = await screen.findByTestId("tab-memory-project");
    await userEvent.click(projectTab);

    await waitFor(() => {
      expect(screen.queryByText(PROJ_A_ENTRY.content)).not.toBeNull();
    });

    // Switch parent to project B — the tab state is preserved across rerenders
    rerender(
      <QueryClientProvider client={client}>
        <MemoryPanel
          open={true}
          onOpenChange={vi.fn()}
          projectId="proj-b"
          conversationId={null}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(PROJ_B_ENTRY.content)).not.toBeNull();
    });

    expect(
      screen.queryByText(PROJ_A_ENTRY.content),
      "project A entry must not appear after switching to project B",
    ).toBeNull();
  });

  it("post-switch fetch uses scopeId=proj-b, not scopeId=proj-a", async () => {
    const calledUrls: string[] = [];
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        calledUrls.push(url);
        const params = new URLSearchParams(url.split("?")[1] ?? "");
        const scope = params.get("scope");
        const scopeId = params.get("scopeId");
        let data: MemoryEntry[] = [];
        if (scope === "global") data = [GLOBAL_ENTRY];
        else if (scope === "project" && scopeId === "proj-a") data = [PROJ_A_ENTRY];
        else if (scope === "project" && scopeId === "proj-b") data = [PROJ_B_ENTRY];
        return Promise.resolve(
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const { rerender } = renderPanel(client, { projectId: "proj-a" });

    // Wait for proj-a fetch to fire
    await waitFor(() => {
      expect(calledUrls.some(u => u.includes("scopeId=proj-a"))).toBe(true);
    });

    // Switch to project B
    rerender(
      <QueryClientProvider client={client}>
        <MemoryPanel
          open={true}
          onOpenChange={vi.fn()}
          projectId="proj-b"
          conversationId={null}
        />
      </QueryClientProvider>,
    );

    // A new fetch for proj-b must fire with the correct scopeId
    await waitFor(() => {
      const projBFetches = calledUrls.filter(
        u => u.includes("scope=project") && u.includes("scopeId=proj-b"),
      );
      expect(
        projBFetches.length,
        "must have fired a project fetch with scopeId=proj-b after switching",
      ).toBeGreaterThan(0);
    });
  });

  it("stale project A content is not visible while the project B fetch is in-flight", async () => {
    // Use a deferred promise so we control when proj-b's response resolves.
    let resolveProjB!: (entries: MemoryEntry[]) => void;
    const projBPending = new Promise<MemoryEntry[]>(res => { resolveProjB = res; });

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const params = new URLSearchParams(url.split("?")[1] ?? "");
        const scope = params.get("scope");
        const scopeId = params.get("scopeId");

        // proj-b project fetch is artificially delayed
        if (scope === "project" && scopeId === "proj-b") {
          return projBPending.then(data =>
            new Response(JSON.stringify(data), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        // All other fetches resolve immediately
        let data: MemoryEntry[] = [];
        if (scope === "global") data = [GLOBAL_ENTRY];
        else if (scope === "project" && scopeId === "proj-a") data = [PROJ_A_ENTRY];
        return Promise.resolve(
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const { rerender } = renderPanel(client, { projectId: "proj-a" });

    // Navigate to project tab and confirm proj-a content is visible
    const projectTab = await screen.findByTestId("tab-memory-project");
    await userEvent.click(projectTab);
    await waitFor(() => {
      expect(screen.queryByText(PROJ_A_ENTRY.content)).not.toBeNull();
    });

    // Switch to project B — proj-b fetch is intentionally still pending
    rerender(
      <QueryClientProvider client={client}>
        <MemoryPanel
          open={true}
          onOpenChange={vi.fn()}
          projectId="proj-b"
          conversationId={null}
        />
      </QueryClientProvider>,
    );

    // Immediately after the prop change and before proj-b resolves, proj-a content
    // must NOT be visible — the panel must show a loading/empty state instead.
    expect(
      screen.queryByText(PROJ_A_ENTRY.content),
      "project A entry must not be visible while project B fetch is in-flight",
    ).toBeNull();

    // Positive assertion: the loading spinner must be present for the project tab.
    expect(
      screen.queryByTestId("spinner-memory-project"),
      "loading spinner must be shown for the project tab while project B fetch is in-flight",
    ).not.toBeNull();

    // Now resolve proj-b and confirm its content appears
    resolveProjB([PROJ_B_ENTRY]);
    await waitFor(() => {
      expect(screen.queryByText(PROJ_B_ENTRY.content)).not.toBeNull();
    });

    expect(
      screen.queryByText(PROJ_A_ENTRY.content),
      "project A entry must not appear after project B data arrives",
    ).toBeNull();
  });
});

describe("MemoryPanel — switching conversations shows isolated entries", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = makeClient();
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock.mock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    client.clear();
  });

  it("panel for conversation A shows conv-A entries and not conv-B entries", async () => {
    renderPanel(client, { conversationId: "conv-a" });

    // Switch to conversation (Chat) tab
    const convTab = await screen.findByTestId("tab-memory-conversation");
    await userEvent.click(convTab);

    await waitFor(() => {
      expect(screen.queryByText(CONV_A_ENTRY.content)).not.toBeNull();
    });

    expect(
      screen.queryByText(CONV_B_ENTRY.content),
      "conversation B entry must not appear when viewing conversation A",
    ).toBeNull();
  });

  it("re-rendering with a new conversationId fetches and shows that conversation's entries", async () => {
    const { rerender } = renderPanel(client, { conversationId: "conv-a" });

    // Switch to conversation tab while on conv-a
    const convTab = await screen.findByTestId("tab-memory-conversation");
    await userEvent.click(convTab);

    await waitFor(() => {
      expect(screen.queryByText(CONV_A_ENTRY.content)).not.toBeNull();
    });

    // Switch parent to conv-b
    rerender(
      <QueryClientProvider client={client}>
        <MemoryPanel
          open={true}
          onOpenChange={vi.fn()}
          projectId={null}
          conversationId="conv-b"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(CONV_B_ENTRY.content)).not.toBeNull();
    });

    expect(
      screen.queryByText(CONV_A_ENTRY.content),
      "conv-A entry must not appear after switching to conversation B",
    ).toBeNull();
  });
});
