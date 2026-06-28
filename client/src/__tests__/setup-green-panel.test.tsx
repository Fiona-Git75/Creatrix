/**
 * Tests for the GREEN summary panel (GreenSummaryPanel component).
 *
 * These tests render GreenSummaryPanel directly — they are fully decoupled from
 * Setup.tsx and will not break when Setup.tsx gains new imports that rely on
 * browser APIs or backend calls not present in jsdom.
 *
 * The panel is displayed when:
 *   authStatus.bootstrapped === true  AND
 *   coherence.overallStatus === "GREEN"
 *
 * They run entirely in jsdom — no live database or Ollama connection needed.
 *
 * Theme (light/dark) is verified by toggling the `.dark` class on
 * `document.documentElement` (the same mechanism the app's ThemeProvider uses)
 * and asserting that the correct Tailwind utility classes are present in the
 * rendered markup. jsdom does not evaluate CSS, so we assert class *presence*
 * rather than computed styles — this confirms the right classes ship to the
 * browser for each theme.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { GreenSummaryPanel } from "../components/GreenSummaryPanel";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AUTH_STATUS_GREEN = {
  bootstrapped: true,
  user: { username: "kit" },
};

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(
  authStatus = AUTH_STATUS_GREEN,
  coherence = COHERENCE_GREEN,
) {
  return render(
    <Router>
      <GreenSummaryPanel authStatus={authStatus} coherence={coherence} />
    </Router>,
  );
}

function setDarkMode(on: boolean) {
  if (on) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GreenSummaryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDarkMode(false);
  });

  afterEach(() => {
    setDarkMode(false);
  });

  // ── Structural / content ────────────────────────────────────────────────────

  it("renders the 'already configured' panel", () => {
    renderPanel();

    expect(
      screen.getByTestId("panel-already-configured"),
    ).toBeInTheDocument();
  });

  it("shows the System healthy badge", () => {
    renderPanel();

    const badge = screen.getByTestId("badge-system-status");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("System healthy");
  });

  it("shows the coherence summary panel with GREEN label", () => {
    renderPanel();

    const panel = screen.getByTestId("panel-coherence-summary");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("GREEN");
  });

  it("renders a coherence item for every component returned by the API", () => {
    renderPanel();

    for (const item of COHERENCE_GREEN.items) {
      expect(
        screen.getByTestId(`coherence-item-${item.component}`),
      ).toBeInTheDocument();
    }
  });

  it("displays the signed-in username", () => {
    renderPanel();

    const userEl = screen.getByTestId("text-signed-in-user");
    expect(userEl).toHaveTextContent("kit");
  });

  it("renders the Return to app button", () => {
    renderPanel();

    expect(
      screen.getByTestId("button-return-to-app"),
    ).toBeInTheDocument();
  });

  it("renders the link to Settings", () => {
    renderPanel();

    expect(
      screen.getByTestId("link-settings"),
    ).toBeInTheDocument();
  });

  it("renders correctly without a logged-in user (anonymous bootstrap)", () => {
    renderPanel(
      { bootstrapped: true, user: null },
      COHERENCE_GREEN,
    );

    expect(
      screen.getByTestId("panel-already-configured"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("text-signed-in-user"),
    ).not.toBeInTheDocument();
  });

  it("groups coherence items by domain", () => {
    renderPanel();

    const panel = screen.getByTestId("panel-coherence-summary");
    expect(panel).toHaveTextContent("database");
    expect(panel).toHaveTextContent("account");
    expect(panel).toHaveTextContent("ai");
  });

  // ── Light mode theme classes ────────────────────────────────────────────────
  // jsdom does not evaluate CSS, so we assert class *presence*: these are the
  // Tailwind utility classes that make the panel look correct in a light browser.

  describe("light mode (no .dark on <html>)", () => {
    beforeEach(() => setDarkMode(false));

    it("root element does not carry the dark class", () => {
      renderPanel();

      expect(document.documentElement).not.toHaveClass("dark");
    });

    it("badge carries light-mode green background and text classes", () => {
      renderPanel();

      const badge = screen.getByTestId("badge-system-status");
      expect(badge.className).toContain("bg-green-100");
      expect(badge.className).toContain("text-green-800");
      expect(badge.className).toContain("border-green-200");
    });

    it("badge carries the dark-variant classes in its markup for future dark activation", () => {
      renderPanel();

      const badge = screen.getByTestId("badge-system-status");
      expect(badge.className).toContain("dark:bg-green-900");
      expect(badge.className).toContain("dark:text-green-300");
    });

    it("panel renders all coherence items in light mode", () => {
      renderPanel();

      for (const item of COHERENCE_GREEN.items) {
        expect(
          screen.getByTestId(`coherence-item-${item.component}`),
        ).toBeInTheDocument();
      }
    });
  });

  // ── Dark mode theme classes ─────────────────────────────────────────────────
  // The app activates dark mode by adding `.dark` to <html>. We mirror that
  // here and verify the panel still renders all required elements, and that the
  // same element carries the dark-specific Tailwind classes that a browser
  // would apply via CSS.

  describe("dark mode (.dark on <html>)", () => {
    beforeEach(() => setDarkMode(true));

    it("root element carries the dark class", () => {
      renderPanel();

      expect(document.documentElement).toHaveClass("dark");
    });

    it("badge still renders with System healthy text in dark mode", () => {
      renderPanel();

      const badge = screen.getByTestId("badge-system-status");
      expect(badge).toHaveTextContent("System healthy");
    });

    it("badge carries dark-mode green background and text classes", () => {
      renderPanel();

      const badge = screen.getByTestId("badge-system-status");
      expect(badge.className).toContain("dark:bg-green-900");
      expect(badge.className).toContain("dark:text-green-300");
      expect(badge.className).toContain("dark:border-green-800");
    });

    it("panel renders all coherence items in dark mode", () => {
      renderPanel();

      for (const item of COHERENCE_GREEN.items) {
        expect(
          screen.getByTestId(`coherence-item-${item.component}`),
        ).toBeInTheDocument();
      }
    });

    it("Return to app button and Settings link remain present in dark mode", () => {
      renderPanel();

      expect(screen.getByTestId("button-return-to-app")).toBeInTheDocument();
      expect(screen.getByTestId("link-settings")).toBeInTheDocument();
    });

    it("username footer still displays in dark mode", () => {
      renderPanel();

      expect(screen.getByTestId("text-signed-in-user")).toHaveTextContent("kit");
    });
  });
});
