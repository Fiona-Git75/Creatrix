import { storage } from "../storage";
import { createProvider } from "./index";
import type { Connection } from "@shared/schema";

export type ToolSupport = "native" | "text" | "limited" | "none";

export interface ModelEntry {
  id: string;
  name: string;
  size?: string;
  toolSupport?: ToolSupport;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
  notes?: string[];
}

export interface ProviderStatus {
  connectionId: string;
  name: string;
  type: string;
  endpoint: string;
  status: "online" | "offline";
  models: ModelEntry[];
}

export interface SuggestedProvider {
  name: string;
  type: string;
  endpoint: string;
  models: string[];
}

export interface ProvidersStatusResponse {
  providers: ProviderStatus[];
  suggested: SuggestedProvider[];
  scannedAt: string;
}

// ── Tool support classification ───────────────────────────────────────────────

function parseSizeB(paramSizeStr: string): number {
  const m = paramSizeStr?.match(/^(\d+(?:\.\d+)?)\s*([BMT])/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  return unit === "T" ? n * 1000 : unit === "B" ? n : n / 1000;
}

function classifyToolSupport(template: string, paramSizeStr: string): ToolSupport {
  const sizeB = parseSizeB(paramSizeStr);
  if (sizeB > 0 && sizeB <= 3) return "none";

  if (!template) return "text";

  const isJinja = /\{%-?\s|{%-/.test(template);
  const hasToolMarkers = /tool[_\s]?call|ToolCalls|python_tag|\btools\b/i.test(template);

  if (hasToolMarkers && isJinja) return "limited";
  if (hasToolMarkers) return "text";
  return "text";
}

function buildNotes(toolSupport: ToolSupport, isJinja: boolean): string[] {
  if (toolSupport === "none") {
    return ["Parameter size too small for reliable tool use — tools disabled for this model"];
  }
  if (toolSupport === "limited") {
    return [
      "Chat template uses Jinja — Ollama applies a translation layer",
      "Tool invocations may be less reliable; use a larger native-format model if tools are critical",
    ];
  }
  if (isJinja) {
    return ["Jinja template — Ollama translates to its internal format"];
  }
  return [];
}

// ── Per-model profile cache ───────────────────────────────────────────────────

const _profileCache = new Map<string, { profile: Partial<ModelEntry>; fetchedAt: number }>();
const PROFILE_CACHE_TTL = 10 * 60_000;

async function fetchOllamaModelProfile(endpoint: string, modelId: string): Promise<Partial<ModelEntry>> {
  const key = `${endpoint}::${modelId}`;
  const cached = _profileCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < PROFILE_CACHE_TTL) return cached.profile;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(`${endpoint}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelId }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!r.ok) return {};

    const data = await r.json();
    const template: string = data.template || "";
    const details = data.details || {};
    const paramSize: string = details.parameter_size || "";
    const quantization: string = details.quantization_level || "";
    const rawFamilies = details.families ?? (details.family ? [details.family] : []);
    const family: string = (Array.isArray(rawFamilies) ? rawFamilies[0] : rawFamilies) || "";
    const contextLength: number =
      data.model_info?.["general.context_length"] ||
      data.model_info?.["llama.context_length"] ||
      0;

    const isJinja = /\{%-?\s|{%-/.test(template);
    const toolSupport = classifyToolSupport(template, paramSize);
    const notes = buildNotes(toolSupport, isJinja);

    const profile: Partial<ModelEntry> = {
      toolSupport,
      family: family || undefined,
      parameterSize: paramSize || undefined,
      quantization: quantization || undefined,
      contextLength: contextLength || undefined,
      notes: notes.length > 0 ? notes : undefined,
    };

    _profileCache.set(key, { profile, fetchedAt: Date.now() });
    return profile;
  } catch {
    clearTimeout(t);
    return {};
  }
}

// Public: unified profile fetch for any connection type
export async function fetchModelProfile(connection: Connection, modelId: string): Promise<Partial<ModelEntry>> {
  if (connection.provider === "openai") {
    return { toolSupport: "native", notes: undefined };
  }
  if (connection.provider === "ollama") {
    return fetchOllamaModelProfile(connection.endpoint, modelId);
  }
  // LM Studio / custom: assume text protocol, unknown details
  return { toolSupport: "text" };
}

// ── Connection scanner ────────────────────────────────────────────────────────

async function probeEndpoint(url: string, parse: (d: any) => string[]): Promise<string[] | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return parse(await r.json());
  } catch {
    clearTimeout(t);
    return null;
  }
}

// Probe multiple candidate URLs in parallel and return the first that responds.
// Used so the scanner works both natively (localhost) and inside Docker
// (host.docker.internal, which resolves to the host gateway via extra_hosts).
async function probeFirstAvailable(
  urls: string[],
  parse: (d: any) => string[],
): Promise<{ endpoint: string; models: string[] } | null> {
  const results = await Promise.all(
    urls.map(async url => {
      const models = await probeEndpoint(url, parse);
      return models !== null ? { endpoint: url, models } : null;
    }),
  );
  return results.find(r => r !== null) ?? null;
}

async function scanConnection(connection: Connection): Promise<ProviderStatus> {
  try {
    const provider = createProvider(connection);
    const result = await provider.listModelsWithStatus();
    const online = result.status === "ok" || result.models.length > 0;

    const models: ModelEntry[] = await Promise.all(
      result.models.map(async (m): Promise<ModelEntry> => {
        const base: ModelEntry = { id: m.id, name: m.name, size: m.size };
        const profile = await fetchModelProfile(connection, m.id);
        return { ...base, ...profile };
      })
    );

    return {
      connectionId: connection.id,
      name: connection.name,
      type: connection.provider,
      endpoint: connection.endpoint,
      status: online ? "online" : "offline",
      models,
    };
  } catch {
    return {
      connectionId: connection.id,
      name: connection.name,
      type: connection.provider,
      endpoint: connection.endpoint,
      status: "offline",
      models: [],
    };
  }
}

// ── Cache + refresh ───────────────────────────────────────────────────────────

let _cache: ProvidersStatusResponse | null = null;
let _cacheTime = 0;
const CACHE_TTL = 30_000;

export async function getProvidersStatus(forceRefresh = false): Promise<ProvidersStatusResponse> {
  if (!forceRefresh && _cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  const connections = await storage.getConnections();
  const providers = await Promise.all(connections.map(scanConnection));

  const configuredEndpoints = new Set(connections.map(c => c.endpoint.replace(/\/$/, "")));
  const suggested: SuggestedProvider[] = [];

  // Probe each candidate address in parallel so discovery works whether the
  // app is running natively (localhost) or inside Docker (host.docker.internal,
  // which is mapped to the host gateway via extra_hosts in docker-compose.yml).
  const ollamaCandidates = [
    "http://localhost:11434",
    "http://host.docker.internal:11434",
  ].filter(ep => !configuredEndpoints.has(ep));

  const lmCandidates = [
    "http://localhost:1234/v1",
    "http://host.docker.internal:1234/v1",
  ].filter(ep => !configuredEndpoints.has(ep) && !configuredEndpoints.has(ep.replace("/v1", "")));

  const [ollamaResult, lmResult] = await Promise.all([
    ollamaCandidates.length
      ? probeFirstAvailable(
          ollamaCandidates.map(ep => `${ep}/api/tags`),
          d => (d.models || []).map((m: any) => m.name || m.id).filter(Boolean),
        )
      : Promise.resolve(null),
    lmCandidates.length
      ? probeFirstAvailable(
          lmCandidates.map(ep => `${ep}/models`),
          d => (d.data || []).map((m: any) => m.id).filter(Boolean),
        )
      : Promise.resolve(null),
  ]);

  if (ollamaResult) {
    // Strip the /api/tags path suffix to get the base endpoint
    const base = ollamaResult.endpoint.replace("/api/tags", "");
    suggested.push({ name: "Ollama", type: "ollama", endpoint: base, models: ollamaResult.models });
  }
  if (lmResult && lmResult.models.length > 0) {
    // Strip /models to get the base v1 endpoint
    const base = lmResult.endpoint.replace("/models", "");
    suggested.push({ name: "LM Studio", type: "lmstudio", endpoint: base, models: lmResult.models });
  }

  const result: ProvidersStatusResponse = { providers, suggested, scannedAt: new Date().toISOString() };
  _cache = result;
  _cacheTime = Date.now();
  return result;
}

// ── Resolution + background refresh ──────────────────────────────────────────

export function resolveModelToProvider(modelId: string, providers: ProviderStatus[]): ProviderStatus | null {
  return providers.find(p => p.status === "online" && p.models.some(m => m.id === modelId)) ?? null;
}

let _refreshInterval: ReturnType<typeof setInterval> | null = null;
export function startBackgroundRefresh(intervalMs = 120_000) {
  if (_refreshInterval) return;
  _refreshInterval = setInterval(() => {
    getProvidersStatus(true).catch(() => {});
  }, intervalMs);
}
