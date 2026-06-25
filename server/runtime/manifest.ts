import { storage } from "../storage";

// ── Runtime Manifest ──────────────────────────────────────────────────────────
// Reads the bootstrap record sealed during setup and constructs a stable
// description of what "operational" means for this specific installation.
//
// This is the declaration the health check is measured against.
// Not: "is Ollama up?" but: "was Ollama commissioned, and is it still there?"

export interface CommissionedConnection {
  provider: string;
  endpoint: string;
  model: string;
}

export interface CommissionedServices {
  whisper: { configured: boolean; endpoint?: string };
  searxng: { configured: boolean; endpoint?: string };
}

export interface ManifestExpectations {
  database: { required: true };
  aiConnections: CommissionedConnection[];
  services: CommissionedServices;
}

export interface RuntimeManifest {
  bootstrapped: boolean;
  bootstrapId?: string;
  bootstrappedAt?: string;
  bootstrappedBy?: string;
  expects?: ManifestExpectations;
}

function parseServices(detail: string): CommissionedServices {
  const whisperMatch = detail.match(/Whisper:\s*(https?:\/\/[^\s·]+)/);
  const searxngMatch = detail.match(/SearXNG:\s*(https?:\/\/[^\s·]+)/);
  return {
    whisper: { configured: !!whisperMatch, endpoint: whisperMatch?.[1] },
    searxng: { configured: !!searxngMatch, endpoint: searxngMatch?.[1] },
  };
}

function parseAiConnection(detail: string): CommissionedConnection | null {
  const match = detail.match(/^(\w+)\s*@\s*(.+?)\s*[—\-]\s*model:\s*(.+)$/i);
  if (!match) return null;
  return {
    provider: match[1].toLowerCase(),
    endpoint: match[2].trim(),
    model: match[3].trim(),
  };
}

export async function loadManifest(): Promise<RuntimeManifest> {
  try {
    const logs = await storage.getSystemLogs({ category: "bootstrap", limit: 50 });
    const completionLog = logs.find(l => l.message.includes("BOOTSTRAP COMPLETE"));
    if (!completionLog?.detail) return { bootstrapped: false };

    let detail: any = {};
    try { detail = JSON.parse(completionLog.detail); } catch { return { bootstrapped: false }; }

    const steps: Array<{ step: number; component: string; result: string; detail: string }> =
      detail.steps ?? [];

    const accountStep = steps.find(s => s.component === "Database + Account");
    const usernameMatch = accountStep?.detail?.match(/Account created:\s*(.+)/);
    const username = usernameMatch?.[1]?.trim() ?? "unknown";

    const aiStep = steps.find(s => s.component === "AI Endpoint");
    const aiConnections: CommissionedConnection[] = [];
    if (aiStep?.result === "OK" && aiStep.detail) {
      const conn = parseAiConnection(aiStep.detail);
      if (conn) aiConnections.push(conn);
    }

    const servicesStep = steps.find(s => s.component === "Services");
    const services = servicesStep
      ? parseServices(servicesStep.detail ?? "")
      : { whisper: { configured: false }, searxng: { configured: false } };

    return {
      bootstrapped: true,
      bootstrapId: detail.bootstrap_id,
      bootstrappedAt: detail.completed_at,
      bootstrappedBy: username,
      expects: {
        database: { required: true },
        aiConnections,
        services,
      },
    };
  } catch {
    return { bootstrapped: false };
  }
}
