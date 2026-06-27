/**
 * Tests for the GREEN summary panel in Setup.tsx.
 *
 * These tests render the guard block that appears when:
 *   authStatus.bootstrapped === true  AND
 *   coherence.overallStatus === "GREEN"
 *
 * They run entirely in jsdom — no live database or Ollama connection needed.
 * Query responses are pre-seeded into a fresh QueryClient so no real HTTP
 * requests are made.
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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import Setup from "../pages/Setup";

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

function buildClient(overrides: { authStatus?: object; coherence?: object } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  client.setQueryData(
    ["/api/auth/status"],
    overrides.authStatus ?? AUTH_STATUS_GREEN,
  );
  client.setQueryData(
    ["/api/system/coherence"],
    overrides.coherence ?? COHERENCE_GREEN,
  );

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

function setDarkMode(on: boolean) {
  if (on) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Setup — GREEN guard panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDarkMode(false);
  });

  afterEach(() => {
    setDarkMode(false);
  });

  // ── Structural / content ────────────────────────────────────────────────────

  it("renders the 'already configured' panel when the system is GREEN", () => {
    renderSetup(buildClient());

    expect(
      screen.getByTestId("panel-already-configured"),
    ).toBeInTheDocument();
  });

  it("shows the System healthy badge", () => {
    renderSetup(buildClient());

    const badge = screen.getByTestId("badge-system-status");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("System healthy");
  });

  it("shows the coherence summary panel with GREEN label", () => {
    renderSetup(buildClient());

    const panel = screen.getByTestId("panel-coherence-summary");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("GREEN");
  });

  it("renders a coherence item for every component returned by the API", () => {
    renderSetup(buildClient());

    for (const item of COHERENCE_GREEN.items) {
      expect(
        screen.getByTestId(`coherence-item-${item.component}`),
      ).toBeInTheDocument();
    }
  });

  it("displays the signed-in username", () => {
    renderSetup(buildClient());

    const userEl = screen.getByTestId("text-signed-in-user");
    expect(userEl).toHaveTextContent("kit");
  });

  it("renders the Return to app button", () => {
    renderSetup(buildClient());

    expect(
      screen.getByTestId("button-return-to-app"),
    ).toBeInTheDocument();
  });

  it("renders the link to Settings", () => {
    renderSetup(buildClient());

    expect(
      screen.getByTestId("link-settings"),
    ).toBeInTheDocument();
  });

  it("does NOT show the GREEN panel when coherence is not GREEN", () => {
    const client = buildClient({
      coherence: { ...COHERENCE_GREEN, overallStatus: "RED" },
    });
    renderSetup(client);

    expect(
      screen.queryByTestId("panel-already-configured"),
    ).not.toBeInTheDocument();
  });

  it("does NOT show the GREEN panel when system is not bootstrapped", () => {
    const client = buildClient({
      authStatus: { bootstrapped: false, user: null },
    });
    renderSetup(client);

    expect(
      screen.queryByTestId("panel-already-configured"),
    ).not.toBeInTheDocument();
  });

  it("renders correctly without a logged-in user (anonymous bootstrap)", () => {
    const client = buildClient({
      authStatus: { bootstrapped: true, user: null },
    });
    renderSetup(client);

    expect(
      screen.getByTestId("panel-already-configured"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("text-signed-in-user"),
    ).not.toBeInTheDocument();
  });

  it("groups coherence items by domain", () => {
    renderSetup(buildClient());

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
      renderSetup(buildClient());

      expect(document.documentElement).not.toHaveClass("dark");
    });

    it("badge carries light-mode green background and text classes", () => {
      renderSetup(buildClient());

      const badge = screen.getByTestId("badge-system-status");
      expect(badge.className).toContain("bg-green-100");
      expect(badge.className).toContain("text-green-800");
      expect(badge.className).toContain("border-green-200");
    });

    it("badge carries the dark-variant classes in its markup for future dark activation", () => {
      renderSetup(buildClient());

      const badge = screen.getByTestId("badge-system-status");
      expect(badge.className).toContain("dark:bg-green-900");
      expect(badge.className).toContain("dark:text-green-300");
    });

    it("panel renders all coherence items in light mode", () => {
      renderSetup(buildClient());

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
      renderSetup(buildClient());

      expect(document.documentElement).toHaveClass("dark");
    });

    it("badge still renders with System healthy text in dark mode", () => {
      renderSetup(buildClient());

      const badge = screen.getByTestId("badge-system-status");
      expect(badge).toHaveTextContent("System healthy");
    });

    it("badge carries dark-mode green background and text classes", () => {
      renderSetup(buildClient());

      const badge = screen.getByTestId("badge-system-status");
      expect(badge.className).toContain("dark:bg-green-900");
      expect(badge.className).toContain("dark:text-green-300");
      expect(badge.className).toContain("dark:border-green-800");
    });

    it("panel renders all coherence items in dark mode", () => {
      renderSetup(buildClient());

      for (const item of COHERENCE_GREEN.items) {
        expect(
          screen.getByTestId(`coherence-item-${item.component}`),
        ).toBeInTheDocument();
      }
    });

    it("Return to app button and Settings link remain present in dark mode", () => {
      renderSetup(buildClient());

      expect(screen.getByTestId("button-return-to-app")).toBeInTheDocument();
      expect(screen.getByTestId("link-settings")).toBeInTheDocument();
    });

    it("username footer still displays in dark mode", () => {
      renderSetup(buildClient());

      expect(screen.getByTestId("text-signed-in-user")).toHaveTextContent("kit");
    });
  });
});
