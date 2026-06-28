// ── Whisper Service Definition ────────────────────────────────────────────────
// canonical:   server/runtime/services/whisper.ts
// contract:    self-contained readiness check for the Whisper transcription server.
//              Everything needed to understand, probe, and troubleshoot this
//              service lives here.
//
// probe:       GET /v1/models — checks that the server is running AND that at
//              least one model is loaded. A server that responds but has no
//              models will fail every transcription call; this probe catches that.
//              The endpoint is normalised: capabilities/media.ts may be given
//              a base URL or a full /audio/transcriptions path; we strip the
//              suffix and probe /v1/models on the base.
//
// ready means: HTTP 200 AND data[] has at least one model entry.
//              "Server running, no model loaded" is degraded, not ready.

import type { ServiceDefinition, ReadinessResult } from "./index";

function baseEndpoint(ep: string): string {
  return ep
    .replace(/\/audio\/transcriptions\/?$/, "")
    .replace(/\/v1\/?$/, "")
    .replace(/\/$/, "")
    .replace(/\/\/localhost\b/gi, "//127.0.0.1");
}

export const WhisperService: ServiceDefinition = {
  key: "whisper",
  name: "Whisper",
  description:
    "Local speech-to-text server (faster-whisper-server / whisper.cpp). " +
    "Powers the transcribe_audio tool. The model must be loaded, not just the server started.",
  capabilities: ["transcribe_audio"],

  troubleshooting: {
    commands: [
      "docker compose ps whisper",
      "docker compose logs whisper --tail=30",
      "curl -s http://localhost:9000/v1/models | jq .data",
    ],
    commonIssues: [
      {
        symptom: "Server responds but data[] is empty",
        action:
          "The model is still downloading or failed to load. " +
          "Check: docker compose logs whisper --tail=30",
      },
      {
        symptom: "Connection refused",
        action: "Start container: docker compose up -d whisper",
      },
      {
        symptom: "Probe times out",
        action:
          "Container may be starting up — model download can take several minutes on first run. " +
          "Check: docker compose logs whisper --tail=10",
      },
      {
        symptom: "HTTP 404 on /v1/models",
        action:
          "Wrong endpoint base — check the URL configured in Settings → Whisper Endpoint. " +
          "It should be the server root (e.g. http://localhost:9000), not the transcription path.",
      },
    ],
  },

  async checkReady(endpoint: string | null): Promise<ReadinessResult> {
    if (!endpoint) {
      return {
        ready: false,
        status: "not_configured",
        detail: "No Whisper endpoint configured",
        latencyMs: null,
        action:
          "Add your Whisper server URL in Settings → Whisper Endpoint (e.g. http://localhost:9000)",
        firstLook: "docker compose ps whisper",
      };
    }

    const base = baseEndpoint(endpoint);
    const url = `${base}/v1/models`;
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(8000), // model loading can make the first response slow
      });
    } catch (err: any) {
      const msg: string = err?.message ?? "Fetch failed";
      const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("Timeout");
      return {
        ready: false,
        status: "unreachable",
        detail: isTimeout
          ? `GET /v1/models timed out after 8s — server may still be loading model`
          : `${msg} (${base})`,
        latencyMs: null,
        action: isTimeout
          ? "Model may still be downloading. Check: docker compose logs whisper --tail=10"
          : "Start container: docker compose up -d whisper",
        firstLook: "docker compose ps whisper",
      };
    }

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        ready: false,
        status: "unreachable",
        detail: `GET /v1/models: HTTP ${res.status}`,
        latencyMs,
        action:
          res.status === 404
            ? "Wrong base URL — configure just the server root, not the /audio/transcriptions path."
            : "Check container logs: docker compose logs whisper --tail=30",
        firstLook: "docker compose logs whisper --tail=30",
      };
    }

    let body: any;
    try {
      body = await res.json();
    } catch {
      return {
        ready: false,
        status: "degraded",
        detail: "GET /v1/models: HTTP 200 but response is not valid JSON",
        latencyMs,
        action: "Check container logs — server may be in an error state.",
        firstLook: "docker compose logs whisper --tail=30",
      };
    }

    const models: any[] = Array.isArray(body?.data) ? body.data : [];
    if (models.length === 0) {
      return {
        ready: false,
        status: "degraded",
        detail: "GET /v1/models: server running but no model loaded",
        latencyMs,
        action:
          "The Whisper model has not finished loading or failed. " +
          "Check: docker compose logs whisper --tail=30",
        firstLook: "docker compose logs whisper --tail=30",
      };
    }

    const modelId: string = models[0]?.id ?? "unknown";
    return {
      ready: true,
      status: "ready",
      detail: `GET /v1/models: model ${modelId} loaded`,
      latencyMs,
    };
  },
};
