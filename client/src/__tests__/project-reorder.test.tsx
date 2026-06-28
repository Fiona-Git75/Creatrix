/**
 * Server-side integration test: project drag-to-reorder persistence.
 *
 * Verifies that:
 *  (a) POST /api/projects/reorder changes the order returned by GET /api/projects
 *  (b) The new order persists across subsequent GET /api/projects calls (simulated
 *      "reload" — fresh fetches read from the same in-memory store, no client cache)
 *  (c) A project created AFTER a reorder is appended at the end, not inserted
 *      by creation time or alphabetical order
 *  (d) POST /api/projects/reorder rejects a non-array body with HTTP 400
 *
 * Uses real MemStorage (not a mock) so orderIndex logic in createProject /
 * reorderProjects / getProjects is exercised under actual conditions.
 * No live database, AI provider, or browser DOM required.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

// ── Module mocks ──────────────────────────────────────────────────────────────
//
// We mock the @server/storage module but substitute the real MemStorage class as
// the storage singleton.  Using importOriginal inside vi.mock lets us access the
// actual class without the vi.hoisted / import-timing restrictions.

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
  return { status: res.status, body: (await res.json()) as Record<string, unknown>[] };
}

async function apiPost(path: string, payload: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

async function createProject(name: string): Promise<{ id: string; name: string; orderIndex: number }> {
  const { body } = await apiPost("/api/projects", {
    name,
    description: "",
    systemPrompt: "",
    folderPath: "",
  });
  return body as { id: string; name: string; orderIndex: number };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("POST /api/projects/reorder — drag-to-reorder persistence", () => {
  it("rejects a non-array orderedIds body with HTTP 400", async () => {
    const { status } = await apiPost("/api/projects/reorder", {
      orderedIds: "not-an-array",
    });
    expect(status).toBe(400);
  });

  it("returns HTTP 200 and { ok: true } for a valid reorder request", async () => {
    const alpha = await createProject("ValidAlpha");
    const { status, body } = await apiPost("/api/projects/reorder", {
      orderedIds: [alpha.id],
    });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  describe("drag-to-reorder flow with two existing projects", () => {
    let alphaId: string;
    let betaId: string;

    beforeAll(async () => {
      // Alpha created first → lower orderIndex; Beta created second → higher orderIndex
      const alpha = await createProject("FlowAlpha");
      const beta = await createProject("FlowBeta");
      alphaId = alpha.id;
      betaId = beta.id;
    });

    it("(a) GET /api/projects returns Alpha before Beta before reorder", async () => {
      const { body } = await apiGet("/api/projects");
      const names = body.map((p) => p["name"] as string);
      expect(names.indexOf("FlowAlpha")).toBeLessThan(names.indexOf("FlowBeta"));
    });

    it("(a) POST /api/projects/reorder with Beta first flips the order", async () => {
      // Simulate dragging Beta above Alpha
      const { status } = await apiPost("/api/projects/reorder", {
        orderedIds: [betaId, alphaId],
      });
      expect(status).toBe(200);

      const { body } = await apiGet("/api/projects");
      const names = body.map((p) => p["name"] as string);
      expect(names.indexOf("FlowBeta")).toBeLessThan(names.indexOf("FlowAlpha"));
    });

    it("(b) new order persists on a subsequent GET /api/projects (simulated page reload)", async () => {
      // Second independent fetch — no client cache — Beta must still come first
      const { body } = await apiGet("/api/projects");
      const names = body.map((p) => p["name"] as string);
      expect(names.indexOf("FlowBeta")).toBeLessThan(names.indexOf("FlowAlpha"));
    });

    it("(c) a project created after a reorder is appended at the end", async () => {
      // After the reorder (Beta=0, Alpha=1), Gamma should get the next orderIndex (2)
      const gamma = await createProject("FlowGamma");
      expect(gamma.id).toBeTruthy();

      const { body } = await apiGet("/api/projects");
      const names = body.map((p) => p["name"] as string);

      const gammaPos = names.indexOf("FlowGamma");
      const betaPos = names.indexOf("FlowBeta");
      const alphaPos = names.indexOf("FlowAlpha");

      // Gamma must appear after both Beta and Alpha
      expect(gammaPos).toBeGreaterThan(betaPos);
      expect(gammaPos).toBeGreaterThan(alphaPos);
    });
  });
});
