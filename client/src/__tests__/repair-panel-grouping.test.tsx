/**
 * Tests for domain-grouping in RepairPanel.
 *
 * The repair panel must group degraded items under domain header rows rather
 * than repeating the domain name on each item. This test covers the core
 * multi-domain, multi-item scenario the grouping logic was designed for —
 * a regression here would silently flatten the list back to per-item labels.
 *
 * The component groups by DOMAIN_ORDER = ["Identity", "Persistence",
 * "Inference", "Knowledge", "Media"], placing anything else under "Other".
 *
 * These tests render RepairPanel directly — fully decoupled from Setup.tsx.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RepairPanel } from "../components/RepairPanel";

// navigator.clipboard is not available in jsdom; stub it out so CopyButton
// does not throw when the component mounts.
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
  writable: true,
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCoherence(items: Array<{
  domain: string;
  component: string;
  actual: string;
  message: string;
}>) {
  return {
    coherent: false,
    overallStatus: "AMBER" as const,
    measuredAt: "2026-06-28T00:00:00.000Z",
    items,
  };
}

const TWO_DOMAIN_ITEMS = [
  { domain: "Identity",  component: "Admin user",  actual: "missing",     message: "No admin account found" },
  { domain: "Identity",  component: "Session key", actual: "misconfigured", message: "SESSION_SECRET is not set" },
  { domain: "Inference", component: "Ollama",      actual: "unreachable", message: "Cannot connect to Ollama" },
  { domain: "Inference", component: "LM Studio",   actual: "unreachable", message: "Cannot connect to LM Studio" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(
  items = TWO_DOMAIN_ITEMS,
  overallStatus: "AMBER" | "RED" = "AMBER",
) {
  const coherence = {
    ...makeCoherence(items),
    overallStatus,
  };
  return render(
    <RepairPanel
      coherence={coherence}
      coherenceIsFetching={false}
      repairCountdown={30}
      onRecheck={vi.fn()}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RepairPanel — domain grouping", () => {

  it("renders exactly one domain header row per domain when two domains each have multiple items", () => {
    renderPanel();

    // Each domain label appears as a <span> with uppercase tracking text.
    // getAllByText uses a case-insensitive regex to be resilient to display
    // casing while still being strict enough to catch regressions.
    const identityHeaders = screen.getAllByText(/^identity$/i);
    const inferenceHeaders = screen.getAllByText(/^inference$/i);

    expect(identityHeaders).toHaveLength(1);
    expect(inferenceHeaders).toHaveLength(1);
  });

  it("places each item under its correct domain header", () => {
    renderPanel();

    const repairList = screen.getByTestId("panel-repair-list");

    // Find the Identity group: get the section containing "Identity" header.
    // We assert that both Identity items are in that same section and that
    // the Inference items are NOT.
    const identityHeader = within(repairList).getByText(/^identity$/i);
    // Walk up to the group wrapper (parent of parent of the header span).
    const identityGroup = identityHeader.closest("[data-testid='panel-repair-list'] > div") as HTMLElement;
    expect(identityGroup).not.toBeNull();

    expect(within(identityGroup).getByTestId("repair-item-Admin user")).toBeInTheDocument();
    expect(within(identityGroup).getByTestId("repair-item-Session key")).toBeInTheDocument();
    expect(within(identityGroup).queryByTestId("repair-item-Ollama")).not.toBeInTheDocument();
    expect(within(identityGroup).queryByTestId("repair-item-LM Studio")).not.toBeInTheDocument();

    // Find the Inference group.
    const inferenceHeader = within(repairList).getByText(/^inference$/i);
    const inferenceGroup = inferenceHeader.closest("[data-testid='panel-repair-list'] > div") as HTMLElement;
    expect(inferenceGroup).not.toBeNull();

    expect(within(inferenceGroup).getByTestId("repair-item-Ollama")).toBeInTheDocument();
    expect(within(inferenceGroup).getByTestId("repair-item-LM Studio")).toBeInTheDocument();
    expect(within(inferenceGroup).queryByTestId("repair-item-Admin user")).not.toBeInTheDocument();
    expect(within(inferenceGroup).queryByTestId("repair-item-Session key")).not.toBeInTheDocument();
  });

  it("does not show a standalone per-item domain label inside each item row", () => {
    renderPanel();

    // Each repair item card should NOT contain a text node that reads the
    // domain name — that label belongs only in the group header. If a
    // regression re-adds domain labels to individual items, this will catch it.
    const adminCard = screen.getByTestId("repair-item-Admin user");
    expect(within(adminCard).queryByText(/identity/i)).not.toBeInTheDocument();

    const ollamaCard = screen.getByTestId("repair-item-Ollama");
    expect(within(ollamaCard).queryByText(/inference/i)).not.toBeInTheDocument();
  });

  it("all four items appear in the DOM exactly once", () => {
    renderPanel();

    expect(screen.getByTestId("repair-item-Admin user")).toBeInTheDocument();
    expect(screen.getByTestId("repair-item-Session key")).toBeInTheDocument();
    expect(screen.getByTestId("repair-item-Ollama")).toBeInTheDocument();
    expect(screen.getByTestId("repair-item-LM Studio")).toBeInTheDocument();

    // Also verify there is no duplication.
    expect(screen.getAllByTestId("repair-item-Admin user")).toHaveLength(1);
    expect(screen.getAllByTestId("repair-item-Ollama")).toHaveLength(1);
  });

  it("renders domain headers in DOMAIN_ORDER order (Identity before Inference)", () => {
    renderPanel();

    const repairList = screen.getByTestId("panel-repair-list");
    // The group divs are direct children of panel-repair-list.
    const groupDivs = repairList.querySelectorAll(":scope > div");

    // First group should be Identity, second should be Inference.
    const firstGroupText  = groupDivs[0]?.textContent ?? "";
    const secondGroupText = groupDivs[1]?.textContent ?? "";

    expect(firstGroupText.toLowerCase()).toContain("identity");
    expect(secondGroupText.toLowerCase()).toContain("inference");
  });

  it("renders correctly with RED status (same grouping, different color class)", () => {
    renderPanel(TWO_DOMAIN_ITEMS, "RED");

    // Grouping must work identically regardless of status color.
    expect(screen.getAllByText(/^identity$/i)).toHaveLength(1);
    expect(screen.getAllByText(/^inference$/i)).toHaveLength(1);
    expect(screen.getByTestId("repair-item-Admin user")).toBeInTheDocument();
    expect(screen.getByTestId("repair-item-Ollama")).toBeInTheDocument();
  });

});
