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

export type CoherenceDomain = "Identity" | "Persistence" | "Inference" | "Knowledge" | "Media";

export interface CoherenceItem {
  domain: CoherenceDomain;
  component: string;       // clean display label: "Ollama", "Database", "Schema", etc.
  expected: string;
  actual: CoherenceStatus;
  message: string;
  action?: string;
  firstLook?: string;      // first diagnostic command to run
}

export interface CoherenceReport {
  coherent: boolean;
  overallStatus: "GREEN" | "AMBER" | "RED";
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

function providerLabel(provider: string): string {
  if (provider === "ollama") return "Ollama";
  if (provider === "lmstudio") return "LM Studio";
  if (provider === "openai") return "OpenAI";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function firstLookFor(provider: string, type: "unreachable" | "schema" | "db" | "whisper" | "searxng" | "model"): string {
  if (type === "unreachable") {
    if (provider === "ollama") return "systemctl status ollama";
    if (provider === "lmstudio") return "Open LM Studio → Local Server tab";
    if (provider === "openai") return "curl https://api.openai.com/v1/models -H 'Authorization: Bearer $OPENAI_API_KEY'";
    return `curl ${provider}`;
  }
  if (type === "db") return "docker compose ps\necho $DATABASE_URL";
  if (type === "schema") return "npm run db:push";
  if (type === "whisper") return "docker compose ps whisper";
  if (type === "searxng") return "docker compose ps searxng";
  if (type === "model") {
    if (provider === "ollama") return "ollama list";
    return "Check available models in Settings → Connections";
  }
  return "";
}

function overallStatus(items: CoherenceItem[]): "GREEN" | "AMBER" | "RED" {
  if (items.some(i => i.actual === "absent")) return "RED";
  if (items.some(i => i.actual === "degraded")) return "AMBER";
  return "GREEN";
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
      overallStatus: "RED",
      manifest: { bootstrapped: false },
      items: [{
        domain: "Identity",
        component: "Commissioned",
        expected: "completed",
        actual: "absent",
        message: "System has not been commissioned.",
        action: "Complete the setup wizard to establish a coherent baseline.",
        firstLook: "Open Creatrix setup wizard",
      }],
      measuredAt,
    };
  }

  const manifestSummary = {
    bootstrapped: manifest.bootstrapped,
    bootstrapId: manifest.bootstrapId,
    bootstrappedAt: manifest.bootstrappedAt,
    bootstrappedBy: manifest.bootstrappedBy,
  };

  const { expects } = manifest;
  if (!expects) {
    return { coherent: true, overallStatus: "GREEN", manifest: manifestSummary, items: [], measuredAt };
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  items.push({
    domain: "Identity",
    component: "Commissioned",
    expected: "completed",
    actual: "coherent",
    message: `Commissioned by ${manifest.bootstrappedBy ?? "unknown"} on ${manifest.bootstrappedAt?.slice(0, 10) ?? "unknown date"}.`,
  });

  // ── Persistence: Database ──────────────────────────────────────────────────
  let dbOk = false;
  try {
    await storage.getSettings();
    dbOk = true;
    items.push({
      domain: "Persistence",
      component: "Database",
      expected: "reachable",
      actual: "coherent",
      message: "Database is reachable.",
    });
  } catch (err: any) {
    items.push({
      domain: "Persistence",
      component: "Database",
      expected: "reachable",
      actual: "absent",
      message: `Database unreachable: ${err?.message ?? "unknown error"}`,
      action: "Check DATABASE_URL and ensure Postgres is running.",
      firstLook: firstLookFor("", "db"),
    });
  }

  // ── Persistence: Schema ────────────────────────────────────────────────────
  if (dbOk) {
    try {
      await storage.getConnections();
      items.push({
        domain: "Persistence",
        component: "Schema",
        expected: "applied",
        actual: "coherent",
        message: "Schema is applied and readable.",
      });
    } catch (err: any) {
      items.push({
        domain: "Persistence",
        component: "Schema",
        expected: "applied",
        actual: "degraded",
        message: "Database is reachable but schema appears incomplete.",
        action: "Apply the schema: `npm run db:push`",
        firstLook: firstLookFor("", "schema"),
      });
    }
  }

  // ── Inference: AI connections ──────────────────────────────────────────────
  const providerStatus = await getProvidersStatus(false).catch(() => null);

  if (expects.aiConnections.length === 0) {
    items.push({
      domain: "Inference",
      component: "AI Connection",
      expected: "at least one commissioned",
      actual: "absent",
      message: "No AI connection was registered during commissioning.",
      action: "Add a connection in Settings → Connections.",
      firstLook: "Settings → Connections",
    });
  } else {
    for (const expected of expects.aiConnections) {
      const label = providerLabel(expected.provider);
      const found = providerStatus?.providers.find(
        p => normaliseEndpoint(p.endpoint) === normaliseEndpoint(expected.endpoint),
      );

      if (!found) {
        items.push({
          domain: "Inference",
          component: label,
          expected: "commissioned connection present",
          actual: "absent",
          message: `${label} was commissioned at ${expected.endpoint} but is no longer in Connections.`,
          action: "Re-add the connection in Settings → Connections.",
          firstLook: "Settings → Connections",
        });
      } else if (found.status === "offline") {
        items.push({
          domain: "Inference",
          component: label,
          expected: "commissioned and reachable",
          actual: "degraded",
          message: `${label} was commissioned but is currently unreachable.`,
          action: expected.provider === "ollama"
            ? "Run `ollama serve` in a terminal."
            : expected.provider === "lmstudio"
            ? "Open LM Studio and start the local server."
            : "Check that the service is running and the endpoint is correct.",
          firstLook: firstLookFor(expected.provider, "unreachable"),
        });
      } else {
        // Provider is up — check for commissioned model
        items.push({
          domain: "Inference",
          component: label,
          expected: "commissioned and reachable",
          actual: "coherent",
          message: `${label} online — ${found.models.length} model(s) available.`,
        });

        const modelPresent = found.models.some(m => m.id === expected.model);
        items.push({
          domain: "Inference",
          component: "Default model",
          expected: expected.model,
          actual: modelPresent ? "coherent" : "degraded",
          message: modelPresent
            ? `Commissioned model "${expected.model}" is present.`
            : `Commissioned model "${expected.model}" is no longer available.`,
          action: modelPresent
            ? undefined
            : expected.provider === "ollama"
            ? `Run \`ollama pull ${expected.model}\` to restore it.`
            : `Restore model "${expected.model}" in your provider.`,
          firstLook: modelPresent ? undefined : firstLookFor(expected.provider, "model"),
        });
      }
    }
  }

  // ── Knowledge: SearXNG ─────────────────────────────────────────────────────
  if (expects.services.searxng.configured && expects.services.searxng.endpoint) {
    const ep = expects.services.searxng.endpoint;
    const reachable = await probeUrl(ep);
    items.push({
      domain: "Knowledge",
      component: "Search",
      expected: "commissioned and reachable",
      actual: reachable ? "coherent" : "degraded",
      message: reachable
        ? "SearXNG is reachable."
        : "SearXNG was commissioned but is currently unreachable.",
      action: reachable ? undefined : "Start SearXNG: `docker compose up searxng`",
      firstLook: reachable ? undefined : firstLookFor("", "searxng"),
    });
  }

  // ── Media: Whisper ─────────────────────────────────────────────────────────
  if (expects.services.whisper.configured && expects.services.whisper.endpoint) {
    const ep = expects.services.whisper.endpoint;
    const reachable = await probeUrl(`${ep.replace(/\/$/, "")}/health`);
    items.push({
      domain: "Media",
      component: "Whisper",
      expected: "commissioned and reachable",
      actual: reachable ? "coherent" : "degraded",
      message: reachable
        ? "Whisper is reachable."
        : "Whisper was commissioned but is currently unreachable.",
      action: reachable ? undefined : "Start Whisper: `docker compose up whisper`",
      firstLook: reachable ? undefined : firstLookFor("", "whisper"),
    });
  }

  const status = overallStatus(items);

  return {
    coherent: status === "GREEN",
    overallStatus: status,
    manifest: manifestSummary,
    items,
    measuredAt,
  };
}
