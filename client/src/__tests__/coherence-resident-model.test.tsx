/**
 * Unit tests for the resident-model coherence check in measureCoherence.
 *
 * Resident connections (those with a residentName set) are added after
 * commissioning and are not recorded in the bootstrap manifest. The
 * manifest-based check therefore misses them — if their defaultModel is not
 * installed in Ollama the chat fails at inference time with no prior warning.
 *
 * These tests verify that measureCoherence:
 *   - returns AMBER when a resident connection's defaultModel is missing
 *   - includes a clear repair message and pull instruction
 *   - does NOT degrade status when the model IS installed
 *   - does NOT flag non-resident connections through this path
 *
 * No live database or Ollama server is needed. All I/O is mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProviderStatus } from "@server/providers/discovery";

// ── Shared mock handles ───────────────────────────────────────────────────────

const { mockGetConnections, mockGetSettings, mockGetProvidersStatus, mockGetServiceState } =
  vi.hoisted(() => {
    return {
      mockGetConnections: vi.fn(),
      mockGetSettings: vi.fn(),
      mockGetProvidersStatus: vi.fn(),
      mockGetServiceState: vi.fn(),
    };
  });

vi.mock("@server/storage", () => ({
  storage: {
    getConnections: mockGetConnections,
    getSettings: mockGetSettings,
    getSystemLogs: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@server/providers/discovery", () => ({
  getProvidersStatus: mockGetProvidersStatus,
}));

vi.mock("@server/runtime/service-runtime", () => ({
  getServiceState: mockGetServiceState,
}));

import { measureCoherence } from "@server/runtime/coherence";
import type { RuntimeManifest } from "@server/runtime/manifest";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOOTSTRAPPED_MANIFEST: RuntimeManifest = {
  bootstrapped: true,
  bootstrapId: "boot-001",
  bootstrappedAt: "2026-07-01T00:00:00.000Z",
  bootstrappedBy: "kit",
  expects: {
    database: { required: true },
    aiConnections: [],
    services: {
      whisper: { configured: false },
      searxng: { configured: false },
    },
  },
};

const RESIDENT_CONNECTION = {
  id: "conn-resident-1",
  name: "Aria (Ollama)",
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  apiKey: null,
  defaultModel: "llama3.2:3b",
  isDefault: false,
  maxImageSizeMb: null,
  orderIndex: 0,
  residentName: "Aria",
  residentRole: "Assistant",
  residentDescription: "A helpful assistant",
  residentEmoji: "🤖",
};

const NON_RESIDENT_CONNECTION = {
  ...RESIDENT_CONNECTION,
  id: "conn-plain-1",
  name: "Ollama (plain)",
  residentName: null,
  residentRole: null,
  residentDescription: null,
  residentEmoji: null,
};

const PROVIDER_ONLINE_WITH_MODEL = {
  connectionId: "conn-resident-1",
  name: "Ollama",
  type: "ollama",
  endpoint: "http://127.0.0.1:11434",
  status: "online" as const,
  models: [{ id: "llama3.2:3b", name: "llama3.2:3b" }],
};

const PROVIDER_ONLINE_WITHOUT_MODEL = {
  ...PROVIDER_ONLINE_WITH_MODEL,
  models: [], // model not installed
};

const PROVIDER_OFFLINE = {
  ...PROVIDER_ONLINE_WITH_MODEL,
  status: "offline" as const,
  models: [],
};

function makeProvidersStatus(providers: ProviderStatus[]) {
  return {
    providers,
    suggested: [],
    scannedAt: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("measureCoherence — resident model check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue({});
    mockGetServiceState.mockReturnValue(null);
  });

  it("returns AMBER when a resident connection's model is not installed", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([PROVIDER_ONLINE_WITHOUT_MODEL]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    expect(report.overallStatus).toBe("AMBER");
  });

  it("includes a coherence item for the missing resident model", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([PROVIDER_ONLINE_WITHOUT_MODEL]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    const item = report.items.find(i => i.component === "Aria model");
    expect(item).toBeDefined();
    expect(item!.actual).toBe("degraded");
    expect(item!.expected).toBe("llama3.2:3b");
    expect(item!.message).toContain("Aria");
    expect(item!.message).toContain("llama3.2:3b");
  });

  it("includes an ollama pull instruction in the action field", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([PROVIDER_ONLINE_WITHOUT_MODEL]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    const item = report.items.find(i => i.component === "Aria model");
    expect(item!.action).toContain("ollama pull llama3.2:3b");
  });

  it("returns GREEN when a resident connection's model IS installed", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([PROVIDER_ONLINE_WITH_MODEL]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    const residentItem = report.items.find(i => i.component === "Aria model");
    expect(residentItem).toBeUndefined(); // no degraded item added
    expect(report.overallStatus).toBe("GREEN");
  });

  it("does not flag a non-resident connection through the resident check path", async () => {
    mockGetConnections.mockResolvedValue([NON_RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([
        { ...PROVIDER_ONLINE_WITHOUT_MODEL, connectionId: "conn-plain-1" },
      ]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    // The resident check should be skipped entirely for non-resident connections
    const residentItem = report.items.find(i =>
      i.component.endsWith(" model") && i.actual === "degraded",
    );
    expect(residentItem).toBeUndefined();
  });

  it("does not flag a resident connection whose provider is offline", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([{ ...PROVIDER_OFFLINE, connectionId: "conn-resident-1" }]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    // Provider offline — not our problem to flag here, skip silently
    const residentModelItem = report.items.find(i => i.component === "Aria model");
    expect(residentModelItem).toBeUndefined();
  });

  it("returns RED when a resident connection is absent from providerStatus", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    // providerStatus has no entry for this resident's connectionId
    mockGetProvidersStatus.mockResolvedValue(makeProvidersStatus([]));

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    expect(report.overallStatus).toBe("RED");
  });

  it("includes an absent coherence item when the resident's provider connection is missing", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(makeProvidersStatus([]));

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    const item = report.items.find(i => i.component === "Aria connection");
    expect(item).toBeDefined();
    expect(item!.actual).toBe("absent");
    expect(item!.domain).toBe("Inference");
    expect(item!.message).toContain("Aria");
    expect(item!.action).toContain("Settings → Connections");
  });

  it("does not emit an absent-connection item for a resident whose connection is present and online", async () => {
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([PROVIDER_ONLINE_WITH_MODEL]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    const item = report.items.find(i => i.component === "Aria connection");
    expect(item).toBeUndefined();
  });

  it("clears the AMBER item when the model is pulled (round-trip AMBER → GREEN)", async () => {
    // ── First poll: model not yet installed ────────────────────────────────────
    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([PROVIDER_ONLINE_WITHOUT_MODEL]),
    );

    const amberReport = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    expect(amberReport.overallStatus).toBe("AMBER");
    const amberItem = amberReport.items.find(i => i.component === "Aria model");
    expect(amberItem).toBeDefined();
    expect(amberItem!.actual).toBe("degraded");

    // ── Second poll: user ran `ollama pull llama3.2:3b`, model now present ─────
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([PROVIDER_ONLINE_WITH_MODEL]),
    );

    const greenReport = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    expect(greenReport.overallStatus).toBe("GREEN");
    const greenItem = greenReport.items.find(i => i.component === "Aria model");
    expect(greenItem).toBeUndefined(); // AMBER item is gone after pull
  });

  it("flags multiple resident connections independently", async () => {
    const secondResident = {
      ...RESIDENT_CONNECTION,
      id: "conn-resident-2",
      residentName: "Beacon",
      defaultModel: "gemma3:4b",
    };

    mockGetConnections.mockResolvedValue([RESIDENT_CONNECTION, secondResident]);
    mockGetProvidersStatus.mockResolvedValue(
      makeProvidersStatus([
        { ...PROVIDER_ONLINE_WITHOUT_MODEL, connectionId: "conn-resident-1" },
        {
          connectionId: "conn-resident-2",
          name: "Ollama",
          type: "ollama",
          endpoint: "http://127.0.0.1:11434",
          status: "online" as const,
          models: [], // gemma3:4b also missing
        },
      ]),
    );

    const report = await measureCoherence(BOOTSTRAPPED_MANIFEST);

    expect(report.overallStatus).toBe("AMBER");

    const ariaItem = report.items.find(i => i.component === "Aria model");
    const beaconItem = report.items.find(i => i.component === "Beacon model");
    expect(ariaItem).toBeDefined();
    expect(beaconItem).toBeDefined();
    expect(ariaItem!.actual).toBe("degraded");
    expect(beaconItem!.actual).toBe("degraded");
  });
});
