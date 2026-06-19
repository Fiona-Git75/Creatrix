import { storage } from "../storage";
import { createProvider } from "./index";
import type { Connection } from "@shared/schema";

export interface ProviderStatus {
  connectionId: string;
  name: string;
  type: string;
  endpoint: string;
  status: "online" | "offline";
  models: { id: string; name: string; size?: string }[];
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

let _cache: ProvidersStatusResponse | null = null;
let _cacheTime = 0;
const CACHE_TTL = 30_000;

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

async function scanConnection(connection: Connection): Promise<ProviderStatus> {
  try {
    const provider = createProvider(connection);
    const result = await provider.listModelsWithStatus();
    const online = result.status === "ok" || result.models.length > 0;
    return {
      connectionId: connection.id,
      name: connection.name,
      type: connection.provider,
      endpoint: connection.endpoint,
      status: online ? "online" : "offline",
      models: result.models.map(m => ({ id: m.id, name: m.name, size: m.size })),
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

export async function getProvidersStatus(forceRefresh = false): Promise<ProvidersStatusResponse> {
  if (!forceRefresh && _cache && Date.now() - _cacheTime < CACHE_TTL) {
    return _cache;
  }

  const connections = await storage.getConnections();
  const providers = await Promise.all(connections.map(scanConnection));

  // Auto-discover known local ports not already configured
  const configuredEndpoints = new Set(connections.map(c => c.endpoint.replace(/\/$/, "")));
  const suggested: SuggestedProvider[] = [];

  const [ollamaModels, lmModels] = await Promise.all([
    configuredEndpoints.has("http://localhost:11434")
      ? Promise.resolve(null)
      : probeEndpoint("http://localhost:11434/api/tags", d =>
          (d.models || []).map((m: any) => m.name || m.id).filter(Boolean)),
    configuredEndpoints.has("http://localhost:1234/v1") || configuredEndpoints.has("http://localhost:1234")
      ? Promise.resolve(null)
      : probeEndpoint("http://localhost:1234/v1/models", d =>
          (d.data || []).map((m: any) => m.id).filter(Boolean)),
  ]);

  if (ollamaModels !== null) {
    suggested.push({ name: "Ollama", type: "ollama", endpoint: "http://localhost:11434", models: ollamaModels });
  }
  if (lmModels !== null && lmModels.length > 0) {
    suggested.push({ name: "LM Studio", type: "lmstudio", endpoint: "http://localhost:1234/v1", models: lmModels });
  }

  const result: ProvidersStatusResponse = { providers, suggested, scannedAt: new Date().toISOString() };
  _cache = result;
  _cacheTime = Date.now();
  return result;
}

// C — Resolution layer: given a model id, find which configured connection has it
export function resolveModelToProvider(
  modelId: string,
  providers: ProviderStatus[]
): ProviderStatus | null {
  return providers.find(p => p.status === "online" && p.models.some(m => m.id === modelId)) ?? null;
}

let _refreshInterval: ReturnType<typeof setInterval> | null = null;
export function startBackgroundRefresh(intervalMs = 120_000) {
  if (_refreshInterval) return;
  _refreshInterval = setInterval(() => {
    getProvidersStatus(true).catch(() => {});
  }, intervalMs);
}
