/**
 * Tests for the skipped-account banner in Setup.
 *
 * When an already-authenticated user navigates to /setup, the component
 * detects the existing session, skips step 0 (account creation), jumps to
 * step 2, and shows an informational banner.  The banner auto-dismisses
 * after SKIPPED_BANNER_TIMEOUT_MS (currently 6 000 ms) and can also be
 * closed manually via its dismiss button.
 *
 * Timing is controlled with vi.useFakeTimers() — render is wrapped in
 * `await act(async () => {...})` (same pattern as setup-repair-countdown.test.tsx)
 * so React's scheduler flushes all pending effects without relying on
 * waitFor's internal setTimeout polling, which fake timers would otherwise block.
 *
 * Auth state: { bootstrapped: false, user: { username: "kit" } }
 *   - bootstrapped: false → Setup renders its own step-based UI (not SetupPostBootstrap)
 *   - user present        → the auto-skip useEffect fires and jumps to step 2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock wouter before importing Setup ────────────────────────────────────────

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

const AUTH_WITH_EXISTING_USER = {
  bootstrapped: false,
  user: { username: "kit" },
};

// Must match SKIPPED_BANNER_TIMEOUT_MS in Setup.tsx.
const TIMEOUT_MS = 6000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["/api/auth/status"], AUTH_WITH_EXISTING_USER);
  return client;
}

async function renderSetup(client: QueryClient) {
  let result!: ReturnType<typeof render>;
  // Wrap in act so all synchronous React effects (including the auto-skip
  // useEffect) are flushed before the assertion runs.  This is required when
  // fake timers are active because waitFor's internal polling uses setTimeout,
  // which would never fire.
  await act(async () => {
    result = render(
      <QueryClientProvider client={client}>
        <Router>
          <Setup />
        </Router>
      </QueryClientProvider>,
    );
  });
  return result;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Setup — skipped-account banner visibility and auto-dismiss", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("banner is visible immediately after the auto-skip to step 2", async () => {
    const client = buildClient();
    await renderSetup(client);

    expect(screen.getByTestId("banner-skipped-account")).toBeInTheDocument();
  });

  it("banner stays visible just before the timeout elapses", async () => {
    const client = buildClient();
    const { queryByTestId } = await renderSetup(client);

    expect(queryByTestId("banner-skipped-account")).toBeInTheDocument();

    // One millisecond before the deadline — setTimeout has not fired yet.
    await act(async () => {
      vi.advanceTimersByTime(TIMEOUT_MS - 1);
    });

    expect(queryByTestId("banner-skipped-account")).toBeInTheDocument();
  });

  it("banner disappears after SKIPPED_BANNER_TIMEOUT_MS elapses", async () => {
    const client = buildClient();
    const { queryByTestId } = await renderSetup(client);

    // Banner must be visible before the timeout.
    expect(queryByTestId("banner-skipped-account")).toBeInTheDocument();

    // Advance past the full timeout — the dismissBanner setTimeout fires.
    await act(async () => {
      vi.advanceTimersByTime(TIMEOUT_MS + 1);
    });

    expect(queryByTestId("banner-skipped-account")).not.toBeInTheDocument();
  });

  it("dismiss button hides the banner immediately without waiting for the timeout", async () => {
    const client = buildClient();
    await renderSetup(client);

    expect(screen.getByTestId("button-dismiss-skipped-banner")).toBeInTheDocument();

    // Click × — skippedBannerVisible → false immediately.
    await act(async () => {
      screen.getByTestId("button-dismiss-skipped-banner").click();
    });

    expect(screen.queryByTestId("banner-skipped-account")).not.toBeInTheDocument();
  });
});
