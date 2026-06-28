/**
 * Tests for the Re-check button in the repair view.
 *
 * Suite A — RepairPanel in isolation
 *   Verifies the button's visual state: present in the repair view, enabled
 *   with a RefreshCw icon at rest, and disabled with a Loader2 spinner while
 *   coherenceIsFetching=true. Also verifies the transition back to idle state.
 *
 * Suite B — SetupPostBootstrap integration
 *   Verifies that clicking Re-check calls queryClient.invalidateQueries for
 *   /api/system/coherence, that the repair panel disappears in-place when the
 *   subsequent fetch resolves to GREEN, and that the wasInRepairView redirect
 *   fires without a full page refresh.
 *
 * wouter's useLocation is mocked so redirect assertions don't need a real
 * browser navigation environment. All other wouter exports pass through
 * untouched so Router can still wrap the component tree.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RepairPanel } from "../components/RepairPanel";

// ── Mock wouter before importing SetupPostBootstrap ───────────────────────────
// Spread the real module so Router, Link, useRoute, etc. still work inside the
// component tree; only useLocation is replaced with a spy-friendly stub.

const mockSetLocation = vi.fn();

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => ["/setup", mockSetLocation],
  };
});

import { Router } from "wouter";
import { SetupPostBootstrap } from "../components/SetupPostBootstrap";

// ── navigator.clipboard stub ──────────────────────────────────────────────────
// RepairPanel renders CopyButton / CopyReportButton which call
// navigator.clipboard.writeText. jsdom does not provide this API, so we stub
// it out here to prevent runtime errors during mount.

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
  writable: true,
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH_BOOTSTRAPPED = { bootstrapped: true, user: { username: "kit" } };

const AMBER_COHERENCE = {
  coherent: false,
  overallStatus: "AMBER" as const,
  measuredAt: "2026-06-27T00:00:00.000Z",
  items: [
    {
      domain: "Inference",
      component: "Ollama",
      actual: "unreachable",
      message: "Cannot connect to Ollama at localhost:11434",
      action: "Start Ollama with: ollama serve",
    },
  ],
};

const GREEN_COHERENCE = {
  coherent: true,
  overallStatus: "GREEN" as const,
  measuredAt: "2026-06-27T00:01:00.000Z",
  items: [
    { domain: "database", component: "PostgreSQL", actual: "coherent", message: "Connected" },
    { domain: "account",  component: "Admin user", actual: "coherent", message: "Present" },
    { domain: "Inference", component: "Ollama",    actual: "coherent", message: "Reachable" },
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

function renderSetup(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Router>
        <SetupPostBootstrap authStatus={AUTH_BOOTSTRAPPED} />
      </Router>
    </QueryClientProvider>,
  );
}

// ── Suite A: RepairPanel in isolation — visual state of the Re-check button ───

describe("RepairPanel — Re-check button visual state", () => {
  const BASE_COHERENCE = {
    coherent: false,
    overallStatus: "AMBER" as const,
    measuredAt: "2026-06-27T00:00:00.000Z",
    items: [
      { domain: "Inference", component: "Ollama", actual: "unreachable", message: "Cannot connect" },
    ],
  };

  it("renders the Re-check now button when the repair panel is visible", () => {
    render(
      <RepairPanel
        coherence={BASE_COHERENCE}
        coherenceIsFetching={false}
        repairCountdown={30}
        onRecheck={vi.fn()}
      />,
    );

    const button = screen.getByTestId("button-recheck-now");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Re-check now");
  });

  it("is enabled and shows no spinner when coherenceIsFetching is false", () => {
    render(
      <RepairPanel
        coherence={BASE_COHERENCE}
        coherenceIsFetching={false}
        repairCountdown={30}
        onRecheck={vi.fn()}
      />,
    );

    const button = screen.getByTestId("button-recheck-now");
    expect(button).not.toBeDisabled();
    expect(button.querySelector(".animate-spin")).toBeNull();
  });

  it("is disabled and shows a spinner while coherenceIsFetching is true", () => {
    render(
      <RepairPanel
        coherence={BASE_COHERENCE}
        coherenceIsFetching={true}
        repairCountdown={30}
        onRecheck={vi.fn()}
      />,
    );

    const button = screen.getByTestId("button-recheck-now");
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).not.toBeNull();
  });

  it("transitions from spinner back to idle state when fetching stops", () => {
    const { rerender } = render(
      <RepairPanel
        coherence={BASE_COHERENCE}
        coherenceIsFetching={true}
        repairCountdown={30}
        onRecheck={vi.fn()}
      />,
    );

    // While fetching: disabled + spinner.
    const button = screen.getByTestId("button-recheck-now");
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).not.toBeNull();

    // Fetching complete: enabled + no spinner.
    rerender(
      <RepairPanel
        coherence={BASE_COHERENCE}
        coherenceIsFetching={false}
        repairCountdown={30}
        onRecheck={vi.fn()}
      />,
    );

    expect(button).not.toBeDisabled();
    expect(button.querySelector(".animate-spin")).toBeNull();
  });

  it("calls onRecheck when the button is clicked", async () => {
    const onRecheck = vi.fn();

    render(
      <RepairPanel
        coherence={BASE_COHERENCE}
        coherenceIsFetching={false}
        repairCountdown={30}
        onRecheck={onRecheck}
      />,
    );

    await act(async () => {
      screen.getByTestId("button-recheck-now").click();
    });

    expect(onRecheck).toHaveBeenCalledTimes(1);
  });
});

// ── Suite B: SetupPostBootstrap — Re-check integration ────────────────────────

describe("SetupPostBootstrap — Re-check button triggers recovery correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clicking Re-check now calls invalidateQueries for /api/system/coherence", async () => {
    const client = buildClient(AMBER_COHERENCE);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    renderSetup(client);

    await waitFor(() => {
      expect(screen.getByTestId("button-recheck-now")).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTestId("button-recheck-now").click();
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["/api/system/coherence"] }),
    );
  });

  it("repair panel disappears in the same render tree when coherence resolves to GREEN", async () => {
    const client = buildClient(AMBER_COHERENCE);

    const { queryByTestId } = renderSetup(client);

    // Repair panel is visible initially (coherence is AMBER).
    await waitFor(() => {
      expect(queryByTestId("panel-repair-list")).toBeInTheDocument();
    });

    // Simulate recheck response arriving as GREEN (in-place cache update).
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], GREEN_COHERENCE);
    });

    // Panel must be gone — no page reload required.
    await waitFor(() => {
      expect(queryByTestId("panel-repair-list")).not.toBeInTheDocument();
    });
  });

  it("fires the wasInRepairView redirect to '/' when coherence recovers to GREEN after recheck", async () => {
    const client = buildClient(AMBER_COHERENCE);

    renderSetup(client);

    // Wait for repair view to render (sets wasInRepairView ref to true).
    await waitFor(() => {
      expect(screen.getByTestId("panel-repair-list")).toBeInTheDocument();
    });

    // Simulate the recheck fetch returning GREEN.
    await act(async () => {
      client.setQueryData(["/api/system/coherence"], GREEN_COHERENCE);
    });

    // wasInRepairView was true → redirect effect must fire to "/".
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/");
    });
  });

  it("does NOT redirect when coherence is GREEN from the start (no repair view rendered)", async () => {
    const client = buildClient(GREEN_COHERENCE);

    renderSetup(client);

    await act(async () => {});

    // wasInRepairView is false because the repair panel never rendered.
    expect(mockSetLocation).not.toHaveBeenCalledWith("/");
  });
});
