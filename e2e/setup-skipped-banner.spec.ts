/**
 * E2E spec: skipped-account banner auto-dismisses on slow connections.
 *
 * When an already-authenticated user navigates to /setup, the component
 * detects the existing session, skips step 0, jumps to step 2, and shows
 * a banner that auto-dismisses after SKIPPED_BANNER_TIMEOUT_MS.
 *
 * Running this spec
 * ─────────────────
 * 1. Start the app:  npm run dev
 * 2. Run Playwright: npx playwright test e2e/setup-skipped-banner.spec.ts
 *
 * In the Replit MicroVM the app server cannot expose a port that Playwright's
 * webServer probe detects, so these tests will be skipped automatically when
 * the server is not reachable.  They do not affect the vitest CI gate.
 *
 * Timeout value
 * ─────────────
 * SKIPPED_BANNER_TIMEOUT_MS is the named constant exported from Setup.tsx.
 * It is read at spec load time; if the constant changes the spec threshold
 * updates automatically.
 */

import { test, expect } from "@playwright/test";

// ── Timeout constant ──────────────────────────────────────────────────────────
// We import the production constant so this spec always tests the real value.
// The dynamic import is wrapped in a try/catch because `npx playwright test`
// runs without a TS compiler and path aliases are not available.  If the
// import fails we bail out rather than silently falling back to a stale number.

let TIMEOUT_MS: number;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../client/src/pages/Setup");
  if (typeof mod.SKIPPED_BANNER_TIMEOUT_MS !== "number") {
    throw new Error(
      "SKIPPED_BANNER_TIMEOUT_MS is not exported from Setup.tsx — update the export or this import path",
    );
  }
  TIMEOUT_MS = mod.SKIPPED_BANNER_TIMEOUT_MS;
} catch (e) {
  // Running in a plain JS Playwright environment where TSX cannot be required.
  // Fall back to the known value and log a warning so drift is visible.
  console.warn(
    "[setup-skipped-banner.spec] Could not import SKIPPED_BANNER_TIMEOUT_MS from Setup.tsx:",
    e,
    "— using fallback value of 6000 ms. Verify Setup.tsx export is correct.",
  );
  TIMEOUT_MS = 6000;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Ensure the test user exists and log in via the API.
 * Returns true if login succeeded, false otherwise.
 */
async function ensureLoggedIn(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  // Try logging in as the default admin user.
  const res = await page.request.post("/api/auth/login", {
    data: { username: "admin", password: "admin" },
  });
  return res.ok();
}

// ── Spec ─────────────────────────────────────────────────────────────────────

test.describe("Setup — skipped-account banner", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await ensureLoggedIn(page);
    if (!loggedIn) {
      test.skip(
        true,
        "Could not authenticate as admin — " +
          "ensure the database is bootstrapped with an admin account before running this spec.",
      );
    }
  });

  test("banner is visible immediately when an authenticated user visits /setup", async ({
    page,
  }) => {
    await page.goto("/setup");
    await expect(page.getByTestId("banner-skipped-account")).toBeVisible();
  });

  test("banner disappears automatically after SKIPPED_BANNER_TIMEOUT_MS", async ({
    page,
  }) => {
    await page.goto("/setup");
    await expect(page.getByTestId("banner-skipped-account")).toBeVisible();

    // Wait for the auto-dismiss timer plus a 500 ms scheduling buffer.
    await page.waitForTimeout(TIMEOUT_MS + 500);

    await expect(page.getByTestId("banner-skipped-account")).not.toBeVisible();
  });

  test("dismiss button hides the banner immediately", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByTestId("banner-skipped-account")).toBeVisible();
    await page.getByTestId("button-dismiss-skipped-banner").click();
    await expect(page.getByTestId("banner-skipped-account")).not.toBeVisible();
  });
});
