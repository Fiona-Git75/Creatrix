/**
 * Tests for the auto-redirect logic in Setup.tsx that is guarded by `wasInRepairView`.
 *
 * The component tracks whether the repair view was ever rendered via a ref. Only
 * when that ref is true AND coherence recovers to GREEN does it navigate to "/".
 * This file verifies two scenarios:
 *
 *   1. First-time setup path  — bootstrapped=false → bootstrapped=true + GREEN.
 *      The repair view never renders, so `wasInRepairView` stays false and no
 *      redirect should fire even though the final status is GREEN.
 *
 *   2. AMBER → GREEN recovery — bootstrapped=true + AMBER → bootstrapped=true + GREEN.
 *      The repair view DOES render during the AMBER phase, so `wasInRepairView`
 *      is set to true, and the effect must call setLocation("/") once coherence
 *      returns to GREEN.
 *
 * wouter's `useLocation` is mocked so we can assert whether setLocation was called
 * without needing a real browser navigation environment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock wouter before importing Setup ────────────────────────────────────────
// We replace useLocation so we can spy on the setLocation call that the
// redirect effect issues. All other wouter exports (Router, Link, useRoute …)
// are passed through from the real module so the component tree stays intact.

const mockSetLocation = vi.fn();

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => ["/setup", mockSetLocation],
  };
});

// Import AFTER the mock is registered so the mock is in effect.
import { Router } from "wouter";
import Setup from "../pages/Setup";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH_NOT_BOOTSTRAPPED = { bootstrapped: false, user: null };
const AUTH_BOOTSTRAPPED = { bootstrapped: true, user: { username: "kit" } };

const COHERENCE_GREEN = {
  coherent: true,
  overallStatus: "GREEN" as const,
  measuredAt: "2026-06-27T00:00:00.000Z",
  items: [
    { domain: "database", component: "PostgreSQL", actual: "ok", message: "Connected" },
    { domain: "account",  component: "Admin user", actual: "ok", message: "Present" },
    { domain: "ai",       component: "Ollama",     actual: "ok", message: "Reachable" },
  ],
};

const COHERENCE_AMBER = {
  coherent: false,
  overallStatus: "AMBER" as const,
  measuredAt: "2026-06-27T00:00:00.000Z",
  items: [
    { domain: "ai", component: "Ollama", actual: "unreachable", message: "Cannot connect" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildClient(opts: { authStatus: object; coherence: object }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["/api/auth/status"], opts.authStatus);
  client.setQueryData(["/api/system/coherence"], opts.coherence);
  return client;
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Setup — wasInRepairView redirect guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: first-time setup must NOT redirect ─────────────────────────────
  //
  // Sequence: bootstrapped=false (wizard visible) → update to bootstrapped=true
  // with GREEN coherence. The repair view was never rendered, so the ref stays
  // false and setLocation must not be called with "/".

  it("does NOT redirect when bootstrapped=false transitions directly to bootstrapped=true + GREEN (normal first-time setup)", async () => {
    const client = buildClient({
      authStatus: AUTH_NOT_BOOTSTRAPPED,
      coherence: COHERENCE_GREEN,
    });

    renderSetup(client);

    // Simulate first-time setup completing: system becomes bootstrapped with
    // GREEN coherence without ever passing through the repair view.
    await act(async () => {
      client.setQueryData(["/api/auth/status"], AUTH_BOOTSTRAPPED);
      // coherence was already GREEN — no AMBER phase occurred
    });

    // The redirect effect must not fire: wasInRepairView was never set true.
    expect(mockSetLocation).not.toHaveBeenCalledWith("/");
  });

  // Variant: even if data arrives simultaneously bootstrapped + GREEN on first
  // render, the repair view never shows so there must be no redirect.
  it("does NOT redirect when system appears bootstrapped + GREEN on the very first render", async () => {
    const client = buildClient({
      authStatus: AUTH_BOOTSTRAPPED,
      coherence: COHERENCE_GREEN,
    });

    await act(async () => {
      renderSetup(client);
    });

    expect(mockSetLocation).not.toHaveBeenCalledWith("/");
  });

  // ── Test 2: AMBER → GREEN recovery MUST redirect ───────────────────────────
  //
  // Sequence: bootstrapped=true + AMBER (repair view renders, sets the ref) →
  // update coherence to GREEN → effect fires → setLocation("/") called.

  it("DOES redirect to '/' when coherence recovers from AMBER to GREEN after the repair view was shown", async () => {
    const client = buildClient({
      authStatus: AUTH_BOOTSTRAPPED,
      coherence: COHERENCE_AMBER,
    });

    // Initial render: bootstrapped=true, AMBER → repair view renders, ref set.
    renderSetup(client);

    // Simulate coherence recovering to GREEN.
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);
    });

    // waitFor retries until the assertion passes or the timeout expires, giving
    // React Query time to propagate the cache update and trigger the effect.
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/");
    });
  });
});
