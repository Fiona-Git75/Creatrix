/**
 * Tests for RepairPanel — visual styling branches for RED vs AMBER status.
 *
 * RepairPanel computes two CSS class strings from coherence.overallStatus:
 *
 *   statusColor  — applied to the Wrench icon, each ✗ mark, and the status
 *                  footer span.  RED → text-red-500;  AMBER → text-amber-500.
 *
 *   borderColor  — applied to the data-testid="panel-repair-list" wrapper.
 *                  RED → border-red-900/40 bg-red-950/20
 *                  AMBER → border-amber-900/30 bg-amber-950/20
 *
 * These tests render RepairPanel directly with a minimal coherence prop and
 * assert that the correct Tailwind classes are present — and that the wrong
 * colour's classes are absent — so a future regression where RED accidentally
 * renders in amber is caught immediately.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepairPanel } from "../components/RepairPanel";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COHERENCE_RED = {
  coherent: false,
  overallStatus: "RED" as const,
  measuredAt: "2026-06-28T00:00:00.000Z",
  items: [
    {
      domain: "Persistence",
      component: "PostgreSQL",
      actual: "unreachable",
      message: "Connection refused",
      action: "docker compose up -d postgres",
    },
  ],
};

const COHERENCE_AMBER = {
  coherent: false,
  overallStatus: "AMBER" as const,
  measuredAt: "2026-06-28T00:00:00.000Z",
  items: [
    {
      domain: "Inference",
      component: "Ollama",
      actual: "unreachable",
      message: "Cannot connect to Ollama",
    },
  ],
};

const DEFAULT_PROPS = {
  coherenceIsFetching: false,
  repairCountdown: 30,
  onRecheck: vi.fn(),
};

// ── RED status — positive assertions ─────────────────────────────────────────

describe("RepairPanel — RED status visual treatment", () => {
  it("applies red border and background to the repair list", () => {
    render(<RepairPanel coherence={COHERENCE_RED} {...DEFAULT_PROPS} />);

    const list = screen.getByTestId("panel-repair-list");
    expect(list.className).toContain("border-red-900/40");
    expect(list.className).toContain("bg-red-950/20");
  });

  it("shows the status label in red", () => {
    render(<RepairPanel coherence={COHERENCE_RED} {...DEFAULT_PROPS} />);

    const statusSpan = screen.getByText("RED");
    expect(statusSpan.className).toContain("text-red-500");
  });

  it("renders each ✗ failure mark in red", () => {
    render(<RepairPanel coherence={COHERENCE_RED} {...DEFAULT_PROPS} />);

    const marks = screen.getAllByText("✗");
    expect(marks.length).toBeGreaterThan(0);
    marks.forEach((mark) => {
      expect(mark.className).toContain("text-red-500");
    });
  });
});

// ── AMBER status — positive assertions ───────────────────────────────────────

describe("RepairPanel — AMBER status visual treatment", () => {
  it("applies amber border and background to the repair list", () => {
    render(<RepairPanel coherence={COHERENCE_AMBER} {...DEFAULT_PROPS} />);

    const list = screen.getByTestId("panel-repair-list");
    expect(list.className).toContain("border-amber-900/30");
    expect(list.className).toContain("bg-amber-950/20");
  });

  it("shows the status label in amber", () => {
    render(<RepairPanel coherence={COHERENCE_AMBER} {...DEFAULT_PROPS} />);

    const statusSpan = screen.getByText("AMBER");
    expect(statusSpan.className).toContain("text-amber-500");
  });

  it("renders each ✗ failure mark in amber", () => {
    render(<RepairPanel coherence={COHERENCE_AMBER} {...DEFAULT_PROPS} />);

    const marks = screen.getAllByText("✗");
    expect(marks.length).toBeGreaterThan(0);
    marks.forEach((mark) => {
      expect(mark.className).toContain("text-amber-500");
    });
  });
});

// ── Cross-colour exclusion — RED must not show amber, AMBER must not show red ─

describe("RepairPanel — colour exclusion", () => {
  it("RED status does not apply any amber classes to the repair list", () => {
    render(<RepairPanel coherence={COHERENCE_RED} {...DEFAULT_PROPS} />);

    const list = screen.getByTestId("panel-repair-list");
    expect(list.className).not.toContain("border-amber-900");
    expect(list.className).not.toContain("bg-amber-950");
  });

  it("RED status does not colour the status label amber", () => {
    render(<RepairPanel coherence={COHERENCE_RED} {...DEFAULT_PROPS} />);

    const statusSpan = screen.getByText("RED");
    expect(statusSpan.className).not.toContain("text-amber-500");
  });

  it("AMBER status does not apply any red classes to the repair list", () => {
    render(<RepairPanel coherence={COHERENCE_AMBER} {...DEFAULT_PROPS} />);

    const list = screen.getByTestId("panel-repair-list");
    expect(list.className).not.toContain("border-red-900");
    expect(list.className).not.toContain("bg-red-950");
  });

  it("AMBER status does not colour the status label red", () => {
    render(<RepairPanel coherence={COHERENCE_AMBER} {...DEFAULT_PROPS} />);

    const statusSpan = screen.getByText("AMBER");
    expect(statusSpan.className).not.toContain("text-red-500");
  });
});

// ── Shared UI elements present for both statuses ──────────────────────────────

describe("RepairPanel — shared elements present regardless of status", () => {
  it.each([
    ["RED", COHERENCE_RED],
    ["AMBER", COHERENCE_AMBER],
  ] as const)("%s: heading, countdown, and Re-check button all render", (_label, coherence) => {
    render(<RepairPanel coherence={coherence} {...DEFAULT_PROPS} repairCountdown={15} />);

    expect(screen.getByText("Something needs attention")).toBeInTheDocument();
    expect(screen.getByTestId("text-repair-countdown")).toHaveTextContent("Checking again in 15s");
    expect(screen.getByTestId("button-recheck-now")).toBeInTheDocument();
  });
});
