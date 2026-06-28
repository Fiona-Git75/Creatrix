/**
 * Playwright end-to-end test: GREEN summary page → repair view transition
 *
 * Verifies that when /api/system/coherence returns GREEN on the first poll
 * and AMBER (or RED) on the next poll, the GREEN summary panel unmounts and
 * the repair view appears — all within the same browser session, without any
 * full page reload.
 *
 * Strategy for triggering the 30-second poll deterministically:
 *   - page.clock.install() installs fake clocks before navigation so that
 *     React Query's setInterval (used by refetchInterval) is intercepted.
 *   - page.clock.fastForward(30_000) advances virtual time by 30 s, which
 *     fires the interval and triggers a second fetch of /api/system/coherence.
 *   - page.route() intercepts all API calls so no real backend is needed.
 *
 * Selectors used:
 *   [data-testid="panel-already-configured"]  — GREEN summary panel root
 *   [data-testid="panel-repair-list"]         — repair view component list
 *   [data-testid="badge-system-status"]       — "System healthy" badge
 *   [data-testid="repair-item-Ollama"]        — individual degraded component row
 */

import { test, expect } from "@playwright/test";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH_BOOTSTRAPPED = { bootstrapped: true, user: { username: "kit" } };

const COHERENCE_GREEN = {
  coherent: true,
  overallStatus: "GREEN",
  measuredAt: new Date().toISOString(),
  items: [
    { domain: "database", component: "PostgreSQL", actual: "coherent", message: "Connected" },
    { domain: "account",  component: "Admin user", actual: "coherent", message: "Present" },
    { domain: "ai",       component: "Ollama",     actual: "coherent", message: "Reachable" },
  ],
};

const COHERENCE_AMBER = {
  coherent: false,
  overallStatus: "AMBER",
  measuredAt: new Date(Date.now() + 30_000).toISOString(),
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
  overallStatus: "RED",
  measuredAt: new Date(Date.now() + 30_000).toISOString(),
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
 * Install routes for auth and coherence endpoints, then navigate to /setup.
 *
 * `coherenceSequence` is consumed in order; the last element is used for all
 * subsequent calls once the sequence is exhausted.
 */
async function setupRoutes(
  page: import("@playwright/test").Page,
  coherenceSequence: object[],
) {
  let coherenceCallIdx = 0;

  await page.route("**/api/auth/status", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTH_BOOTSTRAPPED),
    });
  });

  await page.route("**/api/system/coherence", (route) => {
    const idx = Math.min(coherenceCallIdx, coherenceSequence.length - 1);
    coherenceCallIdx++;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(coherenceSequence[idx]),
    });
  });

  // Catch-all: pass any other requests through to the real dev server
  // (static assets, JS bundles, etc.).
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Setup — GREEN panel to repair view transition on coherence drop", () => {

  test("shows the GREEN summary panel when /api/system/coherence returns GREEN", async ({ page }) => {
    await page.clock.install();
    await setupRoutes(page, [COHERENCE_GREEN]);
    await page.goto("/setup");

    await expect(page.getByTestId("panel-already-configured")).toBeVisible();
    await expect(page.getByTestId("badge-system-status")).toContainText("System healthy");
    await expect(page.getByTestId("panel-repair-list")).not.toBeVisible();
  });

  test("transitions to repair view without page reload when poll returns AMBER", async ({ page }) => {
    // Install fake clock before navigation so the refetchInterval setInterval
    // call in React Query is intercepted from the moment the page loads.
    await page.clock.install();
    await setupRoutes(page, [COHERENCE_GREEN, COHERENCE_AMBER]);
    await page.goto("/setup");

    // Confirm the GREEN panel is displayed after the initial fetch.
    await expect(page.getByTestId("panel-already-configured")).toBeVisible();

    // Record the root node identity before triggering the transition.
    // The element must be the same node after the transition (no reload).
    const rootHandle = await page.locator("body > *").first().elementHandle();

    // Advance virtual time by 30 s — fires the React Query refetchInterval and
    // causes a second fetch to /api/system/coherence which returns AMBER.
    await page.clock.fastForward(30_000);

    // The GREEN guard block no longer matches → it unmounts and the repair
    // view renders in its place.
    await expect(page.getByTestId("panel-already-configured")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("panel-repair-list")).toBeVisible();

    // Confirm root node identity — proves no full page reload occurred.
    const rootHandleAfter = await page.locator("body > *").first().elementHandle();
    expect(await rootHandle?.evaluate((el) => el.isSameNode(rootHandleAfter as unknown as Node))).toBe(true);
  });

  test("transitions to repair view without page reload when poll returns RED", async ({ page }) => {
    await page.clock.install();
    await setupRoutes(page, [COHERENCE_GREEN, COHERENCE_RED]);
    await page.goto("/setup");

    await expect(page.getByTestId("panel-already-configured")).toBeVisible();

    await page.clock.fastForward(30_000);

    await expect(page.getByTestId("panel-already-configured")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("panel-repair-list")).toBeVisible();
  });

  test("shows the degraded component row in the repair list after AMBER poll", async ({ page }) => {
    await page.clock.install();
    await setupRoutes(page, [COHERENCE_GREEN, COHERENCE_AMBER]);
    await page.goto("/setup");

    await expect(page.getByTestId("panel-already-configured")).toBeVisible();

    await page.clock.fastForward(30_000);

    await expect(page.getByTestId("repair-item-Ollama")).toBeVisible({ timeout: 5_000 });
  });

  test("does not transition before the 30-second interval has elapsed", async ({ page }) => {
    await page.clock.install();
    await setupRoutes(page, [COHERENCE_GREEN, COHERENCE_AMBER]);
    await page.goto("/setup");

    await expect(page.getByTestId("panel-already-configured")).toBeVisible();

    // Advance only 15 seconds — poll has not fired yet.
    await page.clock.fastForward(15_000);

    await expect(page.getByTestId("panel-already-configured")).toBeVisible();
    await expect(page.getByTestId("panel-repair-list")).not.toBeVisible();
  });
});
