// ── Service Runtime Contract ──────────────────────────────────────────────────
// canonical:   server/runtime/services/index.ts
// contract:    defines what it means to be a service in the Creatrix runtime.
//              Every service is self-describing: it knows its own probe logic,
//              failure modes, diagnostic commands, and firstLook hints.
//              Nothing about a service lives outside its own file.

export type ServiceStatus =
  | "ready"
  | "degraded"       // responding but not fully functional (e.g. model not loaded)
  | "unreachable"    // can't connect at all
  | "not_configured" // no endpoint / env var set
  | "probing";       // check in flight

export interface ReadinessResult {
  ready: boolean;
  status: Exclude<ServiceStatus, "probing">;
  detail: string;        // what the check found: "SELECT 1 → OK" / "GET /v1/models: no model loaded"
  latencyMs: number | null;
  action?: string;       // what to do if not ready
  firstLook?: string;    // first command to run for diagnosis
}

export interface LogEntry {
  ts: string;   // ISO timestamp
  msg: string;
}

export interface ServiceDefinition {
  readonly key: string;          // machine key: "postgres" | "searxng" | "whisper"
  readonly name: string;         // display name
  readonly description: string;  // what Creatrix needs this for
  readonly capabilities: string[]; // tool names that depend on this service

  readonly troubleshooting: {
    readonly commands: string[];
    readonly commonIssues: ReadonlyArray<{
      symptom: string;
      action: string;
    }>;
  };

  // endpoint: null if not configured or not applicable.
  // The runtime manager resolves endpoints from settings/env and passes them here.
  checkReady(endpoint: string | null): Promise<ReadinessResult>;
}
