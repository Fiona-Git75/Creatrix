// ── Whisper Service Definition ────────────────────────────────────────────────
// canonical:   server/runtime/services/whisper.ts
// contract:    SINGLE SOURCE OF TRUTH for the Whisper integration.
//              Everything needed to understand, probe, call, and troubleshoot
//              this service lives here — including the HTTP client used at
//              runtime (callWhisper). capabilities/media.ts imports that function
//              and wraps it in an AI tool definition; no Whisper HTTP logic
//              lives there.
//
// probe:       Two-stage. First tries GET /v1/models (OpenAI-compatible servers
//              such as faster-whisper-server expose this and return the loaded
//              model name — ideal). If that returns 404, falls back to a plain
//              reachability check (GET / or GET /health) because many Whisper
//              implementations (whisper.cpp, openai-whisper-asr-webservice) are
//              transcription-only and have no model-registry endpoint. "Server
//              responds" is sufficient readiness for those; /v1/models is a bonus.
//              The endpoint is normalised: callWhisper() may be given a base URL
//              or a full /audio/transcriptions path; baseEndpoint() strips the
//              suffix so both the probe and the call use the same normalisation.
//
// ready means: /v1/models HTTP 200 with data[] entry  (OpenAI-compat servers)
//              OR server reachable at / or /health      (other implementations)
//              "Server running, data[] empty" is degraded (model not loaded).
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
    const start = Date.now();

    // ── Stage 1: /v1/models (OpenAI-compatible servers) ──────────────────────
    let modelsRes: Response | null = null;
    try {
      modelsRes = await fetch(`${base}/v1/models`, {
        signal: AbortSignal.timeout(8000),
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

    if (modelsRes.ok) {
      // OpenAI-compatible server — parse model list
      const latencyMs = Date.now() - start;
      let body: any;
      try { body = await modelsRes.json(); } catch { body = null; }

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
        detail: `model ${modelId} loaded`,
        latencyMs,
      };
    }

    // ── Stage 2: reachability fallback (non-OpenAI servers) ──────────────────
    // /v1/models returned non-200 (commonly 404). Many Whisper implementations
    // (whisper.cpp, openai-whisper-asr-webservice) are transcription-only and
    // expose no model registry. Try / and /health — if either responds the
    // server is up and we treat it as ready.
    if (modelsRes.status !== 404) {
      // A non-404 error from /v1/models is a real problem, not a missing endpoint
      const latencyMs = Date.now() - start;
      return {
        ready: false,
        status: "unreachable",
        detail: `GET /v1/models: HTTP ${modelsRes.status}`,
        latencyMs,
        action:
          "Check Whisper server output:\n" +
          "  ps aux | grep whisper\n" +
          "  journalctl -u faster-whisper --since '5 minutes ago'",
        firstLook: `curl -sv ${base}/v1/models 2>&1 | tail -10`,
      };
    }

    for (const path of ["/health", "/"]) {
      try {
        const r = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
        if (r.ok || r.status < 500) {
          const latencyMs = Date.now() - start;
          return {
            ready: true,
            status: "ready",
            detail: `server reachable (no /v1/models — transcription-only implementation)`,
            latencyMs,
          };
        }
      } catch {
        // try next path
      }
    }

    const latencyMs = Date.now() - start;
    return {
      ready: false,
      status: "unreachable",
      detail: `Server did not respond at /v1/models, /health, or /`,
      latencyMs,
      action:
        "Whisper server is not running or not reachable at the configured URL.\n" +
        "  faster-whisper-server --model base --host 0.0.0.0 --port 9000\n" +
        "  or: sudo systemctl start faster-whisper",
      firstLook: `curl -sv ${base}/ 2>&1 | tail -10`,
    };
  },
};

// ── Runtime call ──────────────────────────────────────────────────────────────
// callWhisper is the HTTP client used every time the transcribe_audio tool fires.
// It lives here — alongside the probe — so the full Whisper contract is in one
// place: how to check it, how to call it, and what to do when it breaks.
//
// Note: baseEndpoint() is shared between the probe and the call so both always
// normalise the configured URL identically.
//
// consumed-by: server/capabilities/media.ts → transcribe_audio tool handler

export type TranscriptionResult = { url: string; transcript: string; engine: string };

export async function callWhisper(
  endpoint: string,
  audioUrl: string,
  language?: string
): Promise<TranscriptionResult> {
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30000) });
  if (!audioRes.ok) throw new Error(`Failed to fetch audio: HTTP ${audioRes.status}`);

  const buffer = await audioRes.arrayBuffer();
  const ext = audioUrl.split("?")[0].split(".").pop()?.toLowerCase() || "mp3";
  const contentType = audioRes.headers.get("content-type") || "audio/mpeg";

  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: contentType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  if (language) formData.append("language", language);

  const base = baseEndpoint(endpoint);
  const transcribeUrl = base.endsWith("/audio/transcriptions")
    ? base
    : `${base}/audio/transcriptions`;

  const response = await fetch(transcribeUrl, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${err.slice(0, 200)}`);
  }

  const result = await response.json() as any;
  return {
    url: audioUrl,
    transcript: result.text,
    engine: "Whisper (local)",
  };
}
