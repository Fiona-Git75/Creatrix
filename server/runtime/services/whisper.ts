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
//
// native run:  faster-whisper-server --model base --host 0.0.0.0 --port 9000
//              openai-whisper-asr-webservice: uvicorn app.webservice:app \
//                --host 0.0.0.0 --port 9000

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
      "curl -s http://localhost:9000/v1/models",
      "ps aux | grep -E 'whisper|faster-whisper'",
      "systemctl status faster-whisper      # if installed as a systemd service",
      "journalctl -u faster-whisper --since '5 minutes ago'",
    ],
    commonIssues: [
      {
        symptom: "Server responds but data[] is empty",
        action:
          "The model has not finished loading or failed to start. Check server output:\n" +
          "  ps aux | grep whisper\n" +
          "  journalctl -u faster-whisper --since '10 minutes ago'",
      },
      {
        symptom: "Connection refused",
        action:
          "Whisper server is not running. Start it natively:\n" +
          "  faster-whisper-server:  faster-whisper-server --model base --host 0.0.0.0 --port 9000\n" +
          "  whisper-asr-webservice: uvicorn app.webservice:app --host 0.0.0.0 --port 9000\n" +
          "  systemd:               sudo systemctl start faster-whisper",
      },
      {
        symptom: "Probe times out",
        action:
          "Server is still downloading or loading the model — this can take several minutes on first run.\n" +
          "  ps aux | grep whisper   # confirm the process is alive\n" +
          "  curl http://localhost:9000/v1/models   # retry manually",
      },
      {
        symptom: "HTTP 404 on /v1/models",
        action:
          "Wrong endpoint base — configure just the server root (e.g. http://localhost:9000), " +
          "not the /audio/transcriptions path.",
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
        firstLook: "curl -s http://localhost:9000/v1/models",
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
          ? "Model may still be loading (can take several minutes on first run).\n" +
            "  ps aux | grep whisper\n" +
            "  curl http://localhost:9000/v1/models"
          : "Whisper server is not running. Start it:\n" +
            "  faster-whisper-server --model base --host 0.0.0.0 --port 9000\n" +
            "  or: sudo systemctl start faster-whisper",
        firstLook: `curl -s ${base}/v1/models`,
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
            : "Check Whisper server output:\n" +
              "  ps aux | grep whisper\n" +
              "  journalctl -u faster-whisper --since '5 minutes ago'",
        firstLook: `curl -sv ${base}/v1/models 2>&1 | tail -10`,
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
        action: "Check server output — it may be in an error state:\n" +
          "  ps aux | grep whisper",
        firstLook: `curl -s ${base}/v1/models | head -c 300`,
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
          "The Whisper model has not finished loading or failed to start.\n" +
          "  ps aux | grep whisper\n" +
          "  journalctl -u faster-whisper --since '5 minutes ago'",
        firstLook: `curl -s ${base}/v1/models`,
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
