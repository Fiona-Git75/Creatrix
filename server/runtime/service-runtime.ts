// ── Service Runtime Manager ───────────────────────────────────────────────────
// canonical:   server/runtime/service-runtime.ts
// contract:    polls each service definition, maintains live state, emits a
//              single system state object that the rest of Creatrix reads.
//
//              Creatrix never probes services directly — it reads from here.
//              Services are probed in parallel; failures in one do not block others.
//
// consumed-by: server/runtime/coherence.ts  (SearXNG + Whisper domains)
//              server/routes.ts              (/api/services/state + /api/substrate/health)
//              server/index.ts               (startup probe kick-off)

import type { ServiceDefinition, ServiceStatus, ReadinessResult, LogEntry } from "./services/index";
import { PostgresService } from "./services/postgres";
import { SearXNGService } from "./services/searxng";
import { WhisperService } from "./services/whisper";

export type { ServiceStatus, LogEntry };

export interface ServiceRuntimeState {
  key: string;
  name: string;
  description: string;
  capabilities: string[];
  troubleshooting: ServiceDefinition["troubleshooting"];
  // live state
  status: ServiceStatus;
  detail: string;
  latencyMs: number | null;
  endpoint: string | null;
  checkedAt: number | null;
  ready: boolean;
  action?: string;
  firstLook?: string;
  log: LogEntry[];
}

export interface SystemServiceState {
  services: Record<string, ServiceRuntimeState>;
  lastUpdatedAt: number;
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const SERVICES: ServiceDefinition[] = [
  PostgresService,
  SearXNGService,
  WhisperService,
];

// ── Module-level state ────────────────────────────────────────────────────────
const MAX_LOG = 25;
const PROBE_INTERVAL_MS = 30_000;

const _state = new Map<string, ServiceRuntimeState>();
let _timer: ReturnType<typeof setInterval> | null = null;

// ── Internal helpers ──────────────────────────────────────────────────────────
function blank(svc: ServiceDefinition, endpoint: string | null): ServiceRuntimeState {
  return {
    key: svc.key,
    name: svc.name,
    description: svc.description,
    capabilities: [...svc.capabilities],
    troubleshooting: svc.troubleshooting,
    status: "probing",
    detail: "Awaiting first probe…",
    latencyMs: null,
    endpoint,
    checkedAt: null,
    ready: false,
    log: [],
  };
}

function appendLog(key: string, msg: string): void {
  const s = _state.get(key);
  if (!s) return;
  const entry: LogEntry = { ts: new Date().toISOString(), msg };
  s.log = [...s.log.slice(-(MAX_LOG - 1)), entry];
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Live state for a single service, or null if not yet probed. */
export function getServiceState(key: string): ServiceRuntimeState | null {
  return _state.get(key) ?? null;
}

/** All live service states as a plain object. */
export function getAllServiceStates(): Record<string, ServiceRuntimeState> {
  return Object.fromEntries(_state);
}

/**
 * Probe a single service and update state.
 * Called at startup and by the background timer.
 */
export async function probeService(
  svc: ServiceDefinition,
  endpoint: string | null,
): Promise<void> {
  // Ensure a state entry exists before logging
  if (!_state.has(svc.key)) {
    _state.set(svc.key, blank(svc, endpoint));
  } else {
    const cur = _state.get(svc.key)!;
    _state.set(svc.key, { ...cur, status: "probing", endpoint });
  }

  appendLog(svc.key, `→ probing${endpoint ? ` ${endpoint}` : "…"}`);

  let result: ReadinessResult;
  try {
    result = await svc.checkReady(endpoint);
  } catch (err: any) {
    result = {
      ready: false,
      status: "unreachable",
      detail: err?.message ?? "Probe threw an exception",
      latencyMs: null,
    };
  }

  const cur = _state.get(svc.key)!;
  _state.set(svc.key, {
    ...cur,
    status: result.status,
    detail: result.detail,
    latencyMs: result.latencyMs,
    endpoint,
    checkedAt: Date.now(),
    ready: result.ready,
    action: result.action,
    firstLook: result.firstLook,
  });

  const icon = result.ready ? "✓" : result.status === "not_configured" ? "–" : "✗";
  const ms   = result.latencyMs != null ? ` (${result.latencyMs}ms)` : "";
  appendLog(svc.key, `${icon} ${result.status} — ${result.detail}${ms}`);
}

/**
 * Probe all services concurrently.
 * endpointMap keys must match ServiceDefinition.key values.
 */
export async function probeAll(
  endpointMap: Record<string, string | null>,
): Promise<void> {
  await Promise.allSettled(
    SERVICES.map(svc => probeService(svc, endpointMap[svc.key] ?? null)),
  );
}

/**
 * Start the background probe loop.
 * getEndpoints is called each interval to pick up settings changes.
 * Safe to call multiple times — only one timer runs.
 */
export function startBackgroundProbes(
  getEndpoints: () => Promise<Record<string, string | null>>,
): void {
  if (_timer) return;
  _timer = setInterval(async () => {
    try {
      const endpoints = await getEndpoints();
      await probeAll(endpoints);
    } catch {
      // Background probe failure must never crash the server
    }
  }, PROBE_INTERVAL_MS);
  // Don't keep the process alive just for probes
  if (typeof _timer === "object" && _timer !== null && "unref" in _timer) {
    (_timer as any).unref();
  }
}
