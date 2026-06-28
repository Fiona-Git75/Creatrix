/**
 * Tests for connection card drag-handle hover-reveal and drag-to-reorder.
 *
 * Split into two suites:
 *
 *  1. CSS structure — source-code assertions that confirm the drag handle element
 *     has the correct Tailwind classes (opacity-0 + group-hover:opacity-100) and
 *     that the parent Card carries the `group` modifier.  This is sufficient:
 *     every browser applies these rules automatically; no pointer simulation needed.
 *
 *  2. Server-side reorder API — integration test against the real
 *     POST /api/connections/reorder route (same pattern as project-reorder.test.tsx).
 *     Verifies that drag-to-reorder persists correctly and survives a simulated
 *     "page reload" (a second fetch with no client cache).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

// ── Module mocks (required for server import) ─────────────────────────────────

vi.mock("@server/storage", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@server/storage")>();
  return { ...mod, storage: new mod.MemStorage() };
});

vi.mock("@server/providers", () => ({
  createProvider: vi.fn(() => ({
    name: "mock-provider",
    generateStream: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    listModelsWithStatus: vi.fn().mockResolvedValue({ status: "ok", models: [] }),
    healthCheck: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("@server/providers/discovery", () => ({
  startBackgroundRefresh: vi.fn(),
  fetchModelProfile: vi.fn().mockResolvedValue({ toolSupport: "none" }),
  getProvidersStatus: vi.fn().mockResolvedValue({ providers: [] }),
  resolveModelToProvider: vi.fn().mockResolvedValue(null),
  scanConnection: vi.fn().mockResolvedValue({ status: "ok", models: [] }),
  scanConnectionLite: vi.fn().mockResolvedValue({ status: "ok" }),
}));

vi.mock("@server/capabilities", () => ({
  listCapabilities: vi.fn().mockReturnValue([]),
  invokeCapability: vi.fn(),
  getCapability: vi.fn().mockReturnValue(null),
}));

vi.mock("@server/capabilities/notion", () => ({
  probeNotionConnected: vi.fn().mockResolvedValue(false),
}));

vi.mock("@server/runtime/service-runtime", () => ({
  getServiceState: vi.fn().mockReturnValue({ status: "green" }),
  getAllServiceStates: vi.fn().mockReturnValue([]),
}));

vi.mock("@server/syslog", () => ({
  syslog: vi.fn(),
  getLogs: vi.fn().mockReturnValue([]),
  clearLogs: vi.fn(),
  setLogPersist: vi.fn(),
}));

vi.mock("@server/health", () => ({
  measureCoherence: vi.fn().mockResolvedValue({
    coherent: true,
    overallStatus: "GREEN",
    items: [],
  }),
}));

// ── Test server lifecycle ─────────────────────────────────────────────────────

import { registerRoutes } from "@server/routes";

let baseUrl: string;
let httpServer: Server;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve)
  );
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  httpServer?.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiGet(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

async function apiPost(path: string, payload: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

async function createConnection(name: string): Promise<{ id: string; name: string; orderIndex: number }> {
  const { body } = await apiPost("/api/connections", {
    name,
    provider: "ollama",
    endpoint: `http://localhost:11434/${name}`,
    defaultModel: "llama3",
    isDefault: false,
    orderIndex: 0,
  });
  return body as { id: string; name: string; orderIndex: number };
}

// ── Suite 1: drag handle CSS structure (source-code assertions) ───────────────
//
// The hover-reveal behaviour is driven entirely by Tailwind utility classes in
// the JSX source.  We verify those classes exist in the file rather than
// rendering the component tree, which avoids the full React-Query / dnd-kit /
// Radix-UI stub surface while still giving us a meaningful regression guard.
//
// If any of these classes are accidentally removed or renamed, the test fails.

const DIALOG_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../components/ConnectionsDialog.tsx"),
  "utf8"
);

describe("drag handle — CSS hover-reveal structure (source assertions)", () => {
  it("parent Card element carries the 'group' class so group-hover activates", () => {
    // The SortableConnectionCard renders: <Card className="p-4 group">
    expect(DIALOG_SOURCE).toMatch(/Card[^>]*className=["'][^"']*\bgroup\b/);
  });

  it("drag handle has 'opacity-0' so it is invisible by default", () => {
    expect(DIALOG_SOURCE).toContain("opacity-0");
  });

  it("drag handle has 'group-hover:opacity-100' so it appears on card hover", () => {
    expect(DIALOG_SOURCE).toContain("group-hover:opacity-100");
  });

  it("drag handle has 'transition-opacity' for a smooth reveal animation", () => {
    expect(DIALOG_SOURCE).toContain("transition-opacity");
  });

  it("all three hover-reveal classes appear together on the same element", () => {
    // Find the className string that contains the drag handle classes; they must
    // all be present in a single className attribute, not scattered across
    // unrelated elements.
    const classAttrPattern = /className=["'][^"']*opacity-0[^"']*group-hover:opacity-100[^"']*transition-opacity[^"']*["']/;
    expect(DIALOG_SOURCE).toMatch(classAttrPattern);
  });

  it("drag handle has a data-testid prefixed with 'drag-handle-'", () => {
    expect(DIALOG_SOURCE).toContain('data-testid={`drag-handle-${connection.id}`}');
  });
});

// ── Suite 2: POST /api/connections/reorder — drag-to-reorder persistence ─────

describe("POST /api/connections/reorder — drag-to-reorder persistence", () => {
  it("rejects a non-array orderedIds body with HTTP 400", async () => {
    const { status } = await apiPost("/api/connections/reorder", {
      orderedIds: "not-an-array",
    });
    expect(status).toBe(400);
  });

  it("returns HTTP 200 and { ok: true } for a valid reorder request", async () => {
    const alpha = await createConnection("ReorderAlpha");
    const { status, body } = await apiPost("/api/connections/reorder", {
      orderedIds: [alpha.id],
    });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  describe("drag-to-reorder flow with two connections", () => {
    let alphaId: string;
    let betaId: string;

    beforeAll(async () => {
      const alpha = await createConnection("DragAlpha");
      const beta = await createConnection("DragBeta");
      alphaId = alpha.id;
      betaId = beta.id;
    });

    it("(a) GET /api/connections returns Alpha before Beta before any reorder", async () => {
      const { body } = await apiGet("/api/connections");
      const connections = body as { id: string; name: string }[];
      const names = connections.map((c) => c.name);
      expect(names.indexOf("DragAlpha")).toBeLessThan(names.indexOf("DragBeta"));
    });

    it("(b) POST /api/connections/reorder with Beta first flips the order", async () => {
      const { status } = await apiPost("/api/connections/reorder", {
        orderedIds: [betaId, alphaId],
      });
      expect(status).toBe(200);

      const { body } = await apiGet("/api/connections");
      const connections = body as { id: string; name: string }[];
      const names = connections.map((c) => c.name);
      expect(names.indexOf("DragBeta")).toBeLessThan(names.indexOf("DragAlpha"));
    });

    it("(c) new order persists on a subsequent GET (simulated page reload)", async () => {
      const { body } = await apiGet("/api/connections");
      const connections = body as { id: string; name: string }[];
      const names = connections.map((c) => c.name);
      expect(names.indexOf("DragBeta")).toBeLessThan(names.indexOf("DragAlpha"));
    });

    it("(d) a connection created after a reorder is appended at the end", async () => {
      const gamma = await createConnection("DragGamma");
      expect(gamma.id).toBeTruthy();

      const { body } = await apiGet("/api/connections");
      const connections = body as { id: string; name: string }[];
      const names = connections.map((c) => c.name);

      const gammaPos = names.indexOf("DragGamma");
      const betaPos = names.indexOf("DragBeta");
      const alphaPos = names.indexOf("DragAlpha");

      expect(gammaPos).toBeGreaterThan(betaPos);
      expect(gammaPos).toBeGreaterThan(alphaPos);
    });
  });
});
