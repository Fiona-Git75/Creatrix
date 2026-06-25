import { storage } from "../storage";
import { getProvidersStatus } from "../providers/discovery";
import type { RuntimeManifest } from "./manifest";

// ── Runtime Coherence ─────────────────────────────────────────────────────────
// Measures current system state against the RuntimeManifest.
//
// Health asks: "is X up?"
// Coherence asks: "was X commissioned, and is it still in the expected relationship?"
//
// The difference matters at 2 a.m.: coherence tells you what was expected,
// what changed, and exactly what to do — not just that something is offline.

export type CoherenceStatus = "coherent" | "degraded" | "absent";

export interface CoherenceItem {
  component: string;
  expected: string;
  actual: CoherenceStatus;
  message: string;
  action?: string;
}

export interface CoherenceReport {
  coherent: boolean;
  manifest: Pick<RuntimeManifest, "bootstrapped" | "bootstrapId" | "bootstrappedAt" | "bootstrappedBy">;
  items: CoherenceItem[];
  measuredAt: string;
}

async function probeUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    return r.ok || r.status < 500;
  } catch {
    clearTimeout(t);
    return false;
  }
}

function actionHint(provider: string): string {
  if (provider === "ollama") return "Run `ollama serve` in a terminal.";
  if (provider === "lmstudio") return "Open LM Studio and start the local server.";
  return "Check that the service is running and the endpoint is correct.";
}

function normaliseEndpoint(ep: string): string {
  return ep.replace(/\/$/, "").replace("//localhost", "//127.0.0.1");
}

export async function measureCoherence(manifest: RuntimeManifest): Promise<CoherenceReport> {
  const items: CoherenceItem[] = [];
  const measuredAt = new Date().toISOString();

  if (!manifest.bootstrapped) {
    return {
      coherent: false,
      manifest: { bootstrapped: false },
      items: [{
        component: "Commissioning",
        expected: "completed",
        actual: "absent",
        message: "System has not been commissioned.",
        action: "Complete the setup wizard to establish a coherent baseline.",
      }],
      measuredAt,
    };
  }

  const { expects } = manifest;
  if (!expects) {
    return {
      coherent: true,
      manifest: {
        bootstrapped: manifest.bootstrapped,
        bootstrapId: manifest.bootstrapId,
        bootstrappedAt: manifest.bootstrappedAt,
        bootstrappedBy: manifest.bootstrappedBy,
      },
      items: [],
      measuredAt,
    };
  }

  // ── 1. Database ────────────────────────────────────────────────────────────
  try {
    await storage.getSettings();
    items.push({
      component: "Database",
      expected: "writable and schema applied",
      actual: "coherent",
      message: "Database is reachable.",
    });
  } catch (err: any) {
    items.push({
      component: "Database",
      expected: "writable and schema applied",
      actual: "absent",
      message: `Database unreachable: ${err?.message ?? "unknown error"}`,
      action: "Check DATABASE_URL and ensure Postgres is running.",
    });
  }

  // ── 2. AI connections ──────────────────────────────────────────────────────
  const providerStatus = await getProvidersStatus(false).catch(() => null);

  if (expects.aiConnections.length === 0) {
    items.push({
      component: "AI Connection",
      expected: "at least one commissioned",
      actual: "absent",
      message: "No AI connection was registered during commissioning.",
      action: "Add a connection in Settings → Connections.",
    });
  } else {
    for (const expected of expects.aiConnections) {
      const found = providerStatus?.providers.find(
        p => normaliseEndpoint(p.endpoint) === normaliseEndpoint(expected.endpoint),
      );

      if (!found) {
        items.push({
          component: `${expected.provider} (${expected.endpoint})`,
          expected: "commissioned connection present",
          actual: "absent",
          message: `${expected.provider} was commissioned at ${expected.endpoint} but is no longer in Connections.`,
          action: "Re-add the connection in Settings → Connections.",
        });
      } else if (found.status === "offline") {
        items.push({
          component: `${expected.provider} (${expected.endpoint})`,
          expected: "commissioned and reachable",
          actual: "degraded",
          message: `${expected.provider} was commissioned but is currently unreachable.`,
          action: actionHint(expected.provider),
        });
      } else {
        const modelPresent = found.models.some(m => m.id === expected.model);
        items.push({
          component: `${expected.provider} (${expected.endpoint})`,
          expected: `online · model ${expected.model}`,
          actual: modelPresent ? "coherent" : "degraded",
          message: modelPresent
            ? `${expected.provider} online — ${found.models.length} model(s) available.`
            : `${expected.provider} online but commissioned model "${expected.model}" is no longer present.`,
          action: modelPresent
            ? undefined
            : `Run \`ollama pull ${expected.model}\` to restore it.`,
        });
      }
    }
  }

  // ── 3. Services (only checked if commissioned) ─────────────────────────────
  if (expects.services.whisper.configured && expects.services.whisper.endpoint) {
    const ep = expects.services.whisper.endpoint;
    const reachable = await probeUrl(`${ep.replace(/\/$/, "")}/health`);
    items.push({
      component: `Whisper (${ep})`,
      expected: "commissioned and reachable",
      actual: reachable ? "coherent" : "degraded",
      message: reachable
        ? "Whisper is reachable."
        : "Whisper was commissioned but is currently unreachable.",
      action: reachable ? undefined : "Start Whisper: `docker compose up whisper`",
    });
  }

  if (expects.services.searxng.configured && expects.services.searxng.endpoint) {
    const ep = expects.services.searxng.endpoint;
    const reachable = await probeUrl(ep);
    items.push({
      component: `SearXNG (${ep})`,
      expected: "commissioned and reachable",
      actual: reachable ? "coherent" : "degraded",
      message: reachable
        ? "SearXNG is reachable."
        : "SearXNG was commissioned but is currently unreachable.",
      action: reachable ? undefined : "Start SearXNG: `docker compose up searxng`",
    });
  }

  const coherent = items.every(i => i.actual === "coherent");

  return {
    coherent,
    manifest: {
      bootstrapped: manifest.bootstrapped,
      bootstrapId: manifest.bootstrapId,
      bootstrappedAt: manifest.bootstrappedAt,
      bootstrappedBy: manifest.bootstrappedBy,
    },
    items,
    measuredAt,
  };
}
