/**
 * Tests for the auto-redirect logic in SetupPostBootstrap that is guarded by
 * `wasInRepairView`.
 *
 * These tests render SetupPostBootstrap directly — they are fully decoupled from
 * Setup.tsx and will not break when Setup.tsx gains new imports that rely on
 * browser APIs or backend calls not present in jsdom.
 *
 * The component tracks whether the repair view was ever rendered via a ref. Only
 * when that ref is true AND coherence recovers to GREEN does it navigate to "/".
 * This file verifies three scenarios:
 *
 *   1. First-time setup path  — bootstrapped=true + GREEN from the start.
 *      The repair view never renders, so `wasInRepairView` stays false and no
 *      redirect should fire even though the status is GREEN.
 *
 *   2. AMBER → GREEN recovery — bootstrapped=true + AMBER → bootstrapped=true + GREEN.
 *      The repair view DOES render during the AMBER phase, so `wasInRepairView`
 *      is set to true, and the effect must call setLocation("/") once coherence
 *      returns to GREEN.
 *
 *   3. Transient dip within one batched update — bootstrapped=true + GREEN, then
 *      AMBER and back to GREEN within the same act(). React batches both writes
 *      so the repair view never commits to the DOM, `wasInRepairView` stays false,
 *      and no redirect fires.
 *
 * wouter's `useLocation` is mocked so we can assert whether setLocation was called
 * without needing a real browser navigation environment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock wouter before importing SetupPostBootstrap ───────────────────────────
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
import { SetupPostBootstrap } from "../components/SetupPostBootstrap";

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

function buildClient(coherence: object) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["/api/system/coherence"], coherence);
  return client;
}

function renderComponent(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Router>
        <SetupPostBootstrap authStatus={AUTH_BOOTSTRAPPED} />
      </Router>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SetupPostBootstrap — wasInRepairView redirect guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: first-time setup must NOT redirect ─────────────────────────────
  //
  // Scenario: system appears bootstrapped + GREEN immediately (no repair phase).
  // The repair view was never rendered, so the ref stays false and setLocation
  // must not be called with "/".

  it("does NOT redirect when system appears bootstrapped + GREEN on the very first render", async () => {
    const client = buildClient(COHERENCE_GREEN);

    await act(async () => {
      renderComponent(client);
    });

    expect(mockSetLocation).not.toHaveBeenCalledWith("/");
  });

  // Variant: GREEN coherence arriving slightly after mount (loading → GREEN).
  // Still no repair phase, so no redirect.
  it("does NOT redirect when coherence arrives as GREEN without passing through repair", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });

    renderComponent(client);

    // Coherence arrives GREEN for the first time — no AMBER phase occurred.
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);
    });

    expect(mockSetLocation).not.toHaveBeenCalledWith("/");
  });

  // ── Test 2: AMBER → GREEN recovery MUST redirect ───────────────────────────
  //
  // Sequence: bootstrapped=true + AMBER (repair view renders, sets the ref) →
  // update coherence to GREEN → effect fires → setLocation("/") called.

  it("DOES redirect to '/' when coherence recovers from AMBER to GREEN after the repair view was shown", async () => {
    const client = buildClient(COHERENCE_AMBER);

    // Initial render: bootstrapped=true, AMBER → repair view renders, ref set.
    renderComponent(client);

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

  // ── Test 4: two successive poll cycles — AMBER commits then GREEN recovers ────
  //
  // Sequence: bootstrapped=true + GREEN → first act(): coherence → AMBER (repair
  // panel commits to the DOM, wasInRepairView is set to true) → second act():
  // coherence → GREEN (repair panel is removed). After the second flush the panel
  // must no longer be in the DOM. Because wasInRepairView was set during the AMBER
  // commit, the redirect effect also fires — the test asserts both facts.

  it("hides the repair panel after two rapid poll cycles (AMBER then GREEN) and fires the redirect", async () => {
    const client = buildClient(COHERENCE_GREEN);

    const { queryByTestId } = renderComponent(client);

    // Sanity: starts GREEN, no repair panel.
    expect(queryByTestId("panel-repair-list")).not.toBeInTheDocument();

    // First poll cycle: GREEN → AMBER. React commits this separately, so the
    // repair panel actually mounts and wasInRepairView is set to true.
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_AMBER);
    });

    // waitFor retries until the assertion passes, giving React Query time to
    // propagate the cache update and trigger the re-render.
    await waitFor(() => {
      expect(queryByTestId("panel-repair-list")).toBeInTheDocument();
    });

    // Second poll cycle: AMBER → GREEN. The repair panel is removed from the DOM.
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);
    });

    // Panel must be gone after recovery; waitFor retries until the GREEN render
    // commits, mirroring the same async-flush pattern used for the AMBER phase.
    await waitFor(() => {
      expect(queryByTestId("panel-repair-list")).not.toBeInTheDocument();
    });

    // wasInRepairView was set during the AMBER commit, so the redirect must fire.
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/");
    });
  });

  // ── Test 3: transient dip within one poll cycle must NOT flash the repair view
  //
  // Sequence: bootstrapped=true + GREEN (green panel visible) → within the same
  // React batched update (one act()), coherence briefly becomes AMBER and then
  // immediately returns to GREEN. Because React flushes both writes as a single
  // commit, the AMBER state never reaches the DOM. The repair panel must never
  // appear and wasInRepairView must stay false, so no redirect fires.

  it("never renders the repair panel or redirects when AMBER appears and recovers within the same act()", async () => {
    const client = buildClient(COHERENCE_GREEN);

    const { queryByTestId } = renderComponent(client);

    // Sanity-check: repair panel is absent on the initial GREEN render.
    expect(queryByTestId("panel-repair-list")).not.toBeInTheDocument();

    // Simulate a transient failure that resolves within the same poll cycle.
    // Both setQueryData calls happen inside a single act(), so React batches
    // them into one render pass — the intermediate AMBER state never commits.
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], COHERENCE_AMBER);
      client.setQueryData(["/api/system/coherence"], COHERENCE_GREEN);
    });

    // The repair panel must never have appeared in the DOM.
    expect(queryByTestId("panel-repair-list")).not.toBeInTheDocument();

    // wasInRepairView was never set, so no redirect should have fired.
    expect(mockSetLocation).not.toHaveBeenCalledWith("/");
  });
});
