/**
 * Tests that the GREEN summary panel correctly transitions to the repair view
 * when the coherence polling detects a degraded status.
 *
 * Two suites:
 *
 * Suite A — "polling path" (primary)
 *   Exercises the full network + refetchInterval code path.
 *   `fetch` is mocked at the global level so the default QueryFn issues real
 *   network-shaped requests (caught by the stub), and `vi.useFakeTimers` is
 *   used to advance 30 seconds and fire the `refetchInterval` that Setup.tsx
 *   registers on /api/system/coherence.
 *
 *   Concretely this verifies:
 *     1. The refetchInterval wiring in the component actually fires after 30s.
 *     2. The response from the second fetch (AMBER / RED) is consumed correctly.
 *     3. The UI transition is API-driven, not triggered by a manual cache write.
 *
 * Suite B — "cache-update path" (supplemental)
 *   Uses direct QueryClient.setQueryData() updates to confirm the conditional
 *   rendering is correct in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { getQueryFn } from "../lib/queryClient";
import Setup from "../pages/Setup";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH_BOOTSTRAPPED = { bootstrapped: true, user: { username: "kit" } };

const COHERENCE_GREEN = {
  coherent: true,
  overallStatus: "GREEN" as const,
  measuredAt: "2026-06-27T00:00:00.000Z",
  items: [
    { domain: "database", component: "PostgreSQL", actual: "coherent", message: "Connected" },
    { domain: "account",  component: "Admin user", actual: "coherent", message: "Present" },
    { domain: "ai",       component: "Ollama",     actual: "coherent", message: "Reachable" },
  ],
};

const COHERENCE_AMBER = {
  coherent: false,
  overallStatus: "AMBER" as const,
  measuredAt: "2026-06-27T00:01:00.000Z",
  items: [
    {
      domain: "ai",
      component: "Ollama",
      actual: "unreachable",
      message: "Cannot connect to Ollama at localhost:11434",
      action: "Start Ollama with: ollama serve",
    },
  ],
};

const COHERENCE_RED = {
  coherent: false,
  overallStatus: "RED" as const,
  measuredAt: "2026-06-27T00:01:00.000Z",
  items: [
    {
      domain: "database",
      component: "PostgreSQL",
      actual: "unreachable",
      message: "Cannot reach PostgreSQL",
      action: "Check DATABASE_URL and restart the database",
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock fetch function that:
 *   - Returns AUTH_BOOTSTRAPPED for /api/auth/status (always)
 *   - Returns the provided coherenceResponses in order for /api/system/coherence,
 *     using the last element indefinitely once the list is exhausted.
 */
function makeFetch(coherenceResponses: object[]) {
  let coherenceCallIdx = 0;

  return vi.fn().mockImplementation((url: string) => {
    const json = (data: object) =>
      Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    if (typeof url === "string" && url.includes("/api/auth/status")) {
      return json(AUTH_BOOTSTRAPPED);
    }

    if (typeof url === "string" && url.includes("/api/system/coherence")) {
      const idx = Math.min(coherenceCallIdx, coherenceResponses.length - 1);
      coherenceCallIdx++;
      return json(coherenceResponses[idx]);
    }

    // Any other URL: return 404 so it fails loudly rather than silently.
    return Promise.resolve(new Response("Not found", { status: 404 }));
  });
}

/**
 * Build a QueryClient that uses the real getQueryFn so all queries issue actual
 * fetch() calls. This is what exercises the polling path.
 *
 * We set staleTime to 0 so React Query considers data stale immediately after
 * caching, which is required for refetchInterval-triggered polls to actually
 * re-request the endpoint (React Query skips the network call if staleTime
 * hasn't expired).
 */
function buildPollingClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: "returnNull" }),
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
    },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
}

function renderSetup(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Router>
        <Setup />
      </Router>
    </QueryClientProvider>,
  );
}

// ── Suite A: polling path ─────────────────────────────────────────────────────

describe("Setup — GREEN → repair transition via refetchInterval polling (network path)", () => {
  beforeEach(() => {
    // Fake only setInterval / clearInterval (React Query's refetchInterval
    // mechanism) and Date.  We deliberately leave setTimeout real so that
    // waitFor() — which polls via setTimeout — continues to work normally.
    // Faking all timers would deadlock: waitFor can never advance its own
    // timeout when setTimeout is also fake.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("transitions to the repair view when the 30-second poll returns AMBER", async () => {
    // First fetch → GREEN, subsequent fetches → AMBER
    vi.stubGlobal("fetch", makeFetch([COHERENCE_GREEN, COHERENCE_AMBER]));

    const client = buildPollingClient();

    // Render and let the initial fetch settle (microtasks, not timers).
    await act(async () => {
      renderSetup(client);
    });

    // After the initial fetch the GREEN summary panel must be visible.
    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("panel-repair-list")).not.toBeInTheDocument();

    // Advance fake timers by 30 seconds — this fires the refetchInterval that
    // Setup.tsx registered on /api/system/coherence, triggering a real fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    // The second fetch returns AMBER.  React Query updates its cache, which
    // causes a re-render: the GREEN guard no longer matches → repair view appears.
    await waitFor(() => {
      expect(screen.queryByTestId("panel-already-configured")).not.toBeInTheDocument();
      expect(screen.getByTestId("panel-repair-list")).toBeInTheDocument();
    });
  });

  it("transitions to the repair view when the 30-second poll returns RED", async () => {
    vi.stubGlobal("fetch", makeFetch([COHERENCE_GREEN, COHERENCE_RED]));

    const client = buildPollingClient();

    await act(async () => {
      renderSetup(client);
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("panel-already-configured")).not.toBeInTheDocument();
      expect(screen.getByTestId("panel-repair-list")).toBeInTheDocument();
    });
  });

  it("shows the correct degraded component in the repair list after the AMBER poll", async () => {
    vi.stubGlobal("fetch", makeFetch([COHERENCE_GREEN, COHERENCE_AMBER]));

    const client = buildPollingClient();

    await act(async () => {
      renderSetup(client);
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("repair-item-Ollama")).toBeInTheDocument();
    });
  });

  it("does not transition before the 30-second interval elapses", async () => {
    vi.stubGlobal("fetch", makeFetch([COHERENCE_GREEN, COHERENCE_AMBER]));

    const client = buildPollingClient();

    await act(async () => {
      renderSetup(client);
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    });

    // Advance only 15 seconds — not enough to trigger refetchInterval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    // GREEN panel must still be present.
    expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-repair-list")).not.toBeInTheDocument();
  });

  it("repair panel appears in the same render tree — no page reload", async () => {
    vi.stubGlobal("fetch", makeFetch([COHERENCE_GREEN, COHERENCE_AMBER]));

    const client = buildPollingClient();

    let container!: HTMLElement;

    await act(async () => {
      ({ container } = renderSetup(client));
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    });

    const rootNode = container.firstChild;
    expect(rootNode).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-repair-list")).toBeInTheDocument();
    });

    // Same root DOM node → no unmount/remount (no page reload).
    expect(container.firstChild).toBe(rootNode);
  });

  it("GREEN panel re-appears and repair panel does not persist after AMBER → GREEN recovery", async () => {
    // Sequence: GREEN (initial) → AMBER (first poll) → GREEN (second poll)
    vi.stubGlobal("fetch", makeFetch([COHERENCE_GREEN, COHERENCE_AMBER, COHERENCE_GREEN]));

    const client = buildPollingClient();

    await act(async () => {
      renderSetup(client);
    });

    // Initial fetch → GREEN panel visible.
    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("panel-repair-list")).not.toBeInTheDocument();

    // First 30-second poll → AMBER; repair view should appear.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-repair-list")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("panel-already-configured")).not.toBeInTheDocument();

    // Second 30-second poll → GREEN; GREEN panel should return, repair panel must not persist.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
      expect(screen.queryByTestId("panel-repair-list")).not.toBeInTheDocument();
    });
  });
});

// ── Suite B: cache-update path (supplemental conditional-rendering checks) ───

describe("Setup — GREEN → repair transition via cache update (rendering logic)", () => {
  it("shows the GREEN summary panel on initial render when coherence is GREEN", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    client.setQueryData(["/api/auth/status"], AUTH_BOOTSTRAPPED);
    client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);

    await act(async () => {
      renderSetup(client);
    });

    expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-repair-list")).not.toBeInTheDocument();
  });

  it("GREEN panel disappears and repair panel appears when cache is updated to AMBER", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    client.setQueryData(["/api/auth/status"], AUTH_BOOTSTRAPPED);
    client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);

    renderSetup(client);

    expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();

    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_AMBER);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("panel-already-configured")).not.toBeInTheDocument();
      expect(screen.getByTestId("panel-repair-list")).toBeInTheDocument();
    });
  });

  it("GREEN panel disappears and repair panel appears when cache is updated to RED", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    client.setQueryData(["/api/auth/status"], AUTH_BOOTSTRAPPED);
    client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);

    renderSetup(client);

    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_RED);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("panel-already-configured")).not.toBeInTheDocument();
      expect(screen.getByTestId("panel-repair-list")).toBeInTheDocument();
    });
  });

  it("GREEN panel re-appears and repair panel does not persist when cache oscillates AMBER then back to GREEN", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    client.setQueryData(["/api/auth/status"], AUTH_BOOTSTRAPPED);
    client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);

    renderSetup(client);

    expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-repair-list")).not.toBeInTheDocument();

    // Dip to AMBER then immediately recover to GREEN within a single act().
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_AMBER);
      client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);
    });

    // After the batch settles the GREEN panel must be present and repair panel must be absent.
    await waitFor(() => {
      expect(screen.getByTestId("panel-already-configured")).toBeInTheDocument();
      expect(screen.queryByTestId("panel-repair-list")).not.toBeInTheDocument();
    });
  });
});
