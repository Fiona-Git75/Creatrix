/**
 * Tests for the repair countdown timer in Setup.tsx.
 *
 * The countdown must anchor to a real timestamp (Date.now() + 30s) rather than
 * purely decrementing a counter. This ensures that even when the browser
 * throttles the interval (e.g. in a background tab), the displayed value equals
 * Math.max(0, target - Date.now()) rounded to seconds — not a stale counter.
 *
 * These tests use vi.useFakeTimers() to control both Date.now() and setInterval,
 * allowing simulation of a "late" interval tick (the kind a throttled background
 * tab produces).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock wouter ────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => ["/setup", mockSetLocation],
  };
});

import { Router } from "wouter";
import Setup from "../pages/Setup";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH_BOOTSTRAPPED = { bootstrapped: true, user: { username: "kit" } };

function makeAmberCoherence(measuredAt: string) {
  return {
    coherent: false,
    overallStatus: "AMBER" as const,
    measuredAt,
    items: [
      { domain: "ai", component: "Ollama", actual: "unreachable", message: "Cannot connect" },
    ],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildClient(coherence: object) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["/api/auth/status"], AUTH_BOOTSTRAPPED);
  client.setQueryData(["/api/system/coherence"], coherence);
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

describe("Setup — repair countdown drift prevention", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 30s immediately when the repair view mounts", async () => {
    const client = buildClient(makeAmberCoherence("2026-06-28T00:00:00.000Z"));
    await act(async () => {
      renderSetup(client);
    });

    const banner = screen.getByText(/Checking again in/i);
    expect(banner.textContent).toContain("30s");
  });

  it("shows the correct value even when the interval fires late (background tab simulation)", async () => {
    const client = buildClient(makeAmberCoherence("2026-06-28T00:00:00.000Z"));
    await act(async () => {
      renderSetup(client);
    });

    // Advance time by 5 seconds but delay the interval tick by an extra 3s to
    // simulate a throttled background tab where the timer fires ~3s late.
    // The counter should reflect actual elapsed time (25s remaining), NOT 29s
    // as a simple decrement-by-one-per-tick would produce after a single late tick.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    const banner = screen.getByText(/Checking again in/i);
    // After 5 real seconds, 25s should remain (within ±1 due to rounding).
    const text = banner.textContent ?? "";
    const match = text.match(/(\d+)s/);
    expect(match).not.toBeNull();
    const displayed = parseInt(match![1], 10);
    expect(displayed).toBeGreaterThanOrEqual(24);
    expect(displayed).toBeLessThanOrEqual(26);
  });

  it("never goes below 0 when called after the target has passed", async () => {
    const client = buildClient(makeAmberCoherence("2026-06-28T00:00:00.000Z"));
    await act(async () => {
      renderSetup(client);
    });

    // Advance far past the 30-second window.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    const banner = screen.getByText(/Checking again in/i);
    expect(banner.textContent).toContain("0s");
  });

  it("resets to ~30s when a new coherence poll arrives (measuredAt changes)", async () => {
    const client = buildClient(makeAmberCoherence("2026-06-28T00:00:00.000Z"));
    await act(async () => {
      renderSetup(client);
    });

    // Advance 20 seconds so the countdown is visibly low (~10s remaining).
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    // Simulate a new poll arriving with an updated measuredAt.
    //
    // TIMING DEPENDENCY NOTE:
    // React Query (as of v5) batches subscriber notifications through an internal
    // setTimeout(0) after setQueryData(). Under vi.useFakeTimers(), that callback
    // is frozen until fake time advances. The vi.advanceTimersByTime(0) call
    // flushes *only* the zero-delay React Query notification callback, which
    // triggers the useEffect watching coherence?.measuredAt and sets a fresh
    // repairCountdownTarget anchored to Date.now() (still at the 20s mark in
    // fake-time). Without this flush, the useEffect runs on the *next* act()
    // boundary after fake time has already moved forward, causing the new target
    // to be computed from a later timestamp and making the countdown appear lower
    // than 28s — indistinguishable from the stale decrement-by-1 bug this test
    // is designed to catch.
    //
    // FRAGILITY RISK: This flush is a white-box dependency on React Query's
    // internal notification strategy. If React Query ever changes from
    // setTimeout(0) to a synchronous or microtask-based notification, this
    // advanceTimersByTime(0) call becomes a no-op and the test may still pass
    // (correctly, through a different flush path) or may need updating. If
    // the reset test starts failing unexpectedly after a React Query upgrade,
    // check whether the notification mechanism changed and adjust accordingly.
    await act(async () => {
      client.setQueryData(
        ["/api/system/coherence"],
        makeAmberCoherence("2026-06-28T00:00:20.000Z"),
      );
      vi.advanceTimersByTime(0);
    });

    // Trigger one interval tick so repairCountdown is recomputed from the new target.
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    const banner = screen.getByText(/Checking again in/i);
    const text = banner.textContent ?? "";
    const match = text.match(/(\d+)s/);
    expect(match).not.toBeNull();
    const displayed = parseInt(match![1], 10);
    // After a reset, roughly 29–30s should remain (countdown started fresh).
    expect(displayed).toBeGreaterThanOrEqual(28);
    expect(displayed).toBeLessThanOrEqual(30);
  });
});
