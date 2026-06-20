/**
 * Substrate health probe cache.
 *
 * Probes are fire-and-forget: the route handler returns the last cached result
 * immediately and triggers a background refresh if the cache is stale.
 * Nothing in the critical chat path touches this.
 */

export type ProbeStatus = "up" | "down" | "unknown";

interface ProbeResult {
  status: "up" | "down";
  latencyMs: number;
  checkedAt: number;
}

const PROBE_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_500;

const cache = new Map<string, ProbeResult>();
const inFlight = new Set<string>();

// Which URL to probe for each substrate key
const PROBE_URLS: Record<string, (endpoint: string) => string> = {
  whisper: (ep) => `${ep.replace(/\/$/, "")}/v1/models`,
  search:  (ep) => `${ep.replace(/\/$/, "")}/`,
};

async function fireProbe(key: string, url: string): Promise<void> {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  const start = Date.now();
  try {
    // Any HTTP response (even 404) means the process is alive.
    // Only a network error or timeout counts as "down".
    await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    cache.set(key, { status: "up", latencyMs: Date.now() - start, checkedAt: Date.now() });
  } catch {
    cache.set(key, { status: "down", latencyMs: PROBE_TIMEOUT_MS, checkedAt: Date.now() });
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Return cached probe result for a substrate, and kick off a background refresh
 * if the cache is stale. Never blocks the caller.
 */
export function querySubstrate(
  key: string,
  endpoint: string | undefined | null
): { status: ProbeStatus; latencyMs: number | null; endpoint: string | null } {
  if (!endpoint) return { status: "unknown", latencyMs: null, endpoint: null };

  const cached = cache.get(key);
  const isStale = !cached || Date.now() - cached.checkedAt > PROBE_TTL_MS;

  if (isStale) {
    const probeUrl = (PROBE_URLS[key] ?? ((ep: string) => ep))(endpoint);
    fireProbe(key, probeUrl); // background — intentionally not awaited
  }

  return {
    status: cached?.status ?? "unknown",
    latencyMs: cached?.latencyMs ?? null,
    endpoint,
  };
}

// ── Coherence computation ─────────────────────────────────────────────────────

/**
 * Which tools depend on which substrate, and whether a fallback exists.
 * fallback: true  → amber when substrate is down (still partially executable)
 * fallback: false → red when substrate is down (tool exposed to model but non-functional)
 */
const TOOL_SUBSTRATES: Record<string, { key: string; fallback: boolean; label: string }> = {
  transcribe_audio: { key: "whisper", fallback: false, label: "Whisper endpoint" },
  web_search:       { key: "search",  fallback: true,  label: "SearXNG endpoint" },
};

export type Coherence = "green" | "amber" | "red";

export function computeCoherence(
  activeToolNames: string[],
  substrates: Record<string, { status: ProbeStatus; endpoint: string | null }>
): { coherence: Coherence; issues: string[] } {
  const issues: string[] = [];
  let coherence: Coherence = "green";

  for (const toolName of activeToolNames) {
    const dep = TOOL_SUBSTRATES[toolName];
    if (!dep) continue; // no substrate dependency — always coherent

    const probe = substrates[dep.key];
    if (!probe?.endpoint) continue; // endpoint not configured — tool active via other means

    if (probe.status === "down") {
      if (dep.fallback) {
        issues.push(`${toolName}: ${dep.label} unreachable — fallback engaged`);
        if (coherence === "green") coherence = "amber";
      } else {
        issues.push(`${toolName}: ${dep.label} unreachable — tool non-functional`);
        coherence = "red";
      }
    } else if (probe.status === "unknown") {
      issues.push(`${toolName}: ${dep.label} — probing`);
      if (coherence === "green") coherence = "amber";
    }
  }

  // Also flag if search fallback is active (searchEndpoint not set — using DDG HTML)
  if (activeToolNames.includes("web_search") && !substrates.search?.endpoint) {
    issues.push("web_search: no SearXNG endpoint configured — using DuckDuckGo fallback");
    if (coherence === "green") coherence = "amber";
  }

  return { coherence, issues };
}
