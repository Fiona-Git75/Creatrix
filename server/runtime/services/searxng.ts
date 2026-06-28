// ── SearXNG Service Definition ────────────────────────────────────────────────
// canonical:   server/runtime/services/searxng.ts
// contract:    self-contained readiness check for SearXNG.
//              Everything needed to understand, probe, and troubleshoot this
//              service lives here.
//
// probe:       GET /search?q=test&format=json — the exact request path that
//              capabilities/web.ts → searchViaSearXNG() sends at runtime.
//              If that endpoint works, the service is ready. If it doesn't,
//              the tool call will fail the same way the probe does.
//
// ready means: HTTP 200 AND response body contains a "results" key.
//              "Results empty" is OK — it means the engine ran and returned nothing
//              for "test", not that the engine is broken.
//              HTTP 400 typically means json format is not enabled in settings.yml.

import type { ServiceDefinition, ReadinessResult } from "./index";

const TEST_QUERY = "test";

export const SearXNGService: ServiceDefinition = {
  key: "searxng",
  name: "SearXNG",
  description:
    "Self-hosted web search — powers the web_search tool with private, " +
    "aggregated results. Without it Creatrix falls back to DuckDuckGo HTML scraping.",
  capabilities: ["web_search"],

  troubleshooting: {
    commands: [
      "docker compose ps searxng",
      "docker compose logs searxng --tail=30",
      "curl -s 'http://localhost:8080/search?q=test&format=json' | head -c 200",
    ],
    commonIssues: [
      {
        symptom: "HTTP 400 on /search?format=json",
        action:
          "Add 'json' to the 'formats' list in searxng/settings.yml, then: docker compose restart searxng",
      },
      {
        symptom: "HTTP 200 but no results consistently",
        action:
          "At least one search engine must be enabled in searxng/settings.yml under 'engines'",
      },
      {
        symptom: "Connection refused on the configured port",
        action: "Start container: docker compose up -d searxng",
      },
      {
        symptom: "Container running but returns HTML instead of JSON",
        action:
          "Ensure 'json' is listed under 'search.formats' in searxng/settings.yml",
      },
    ],
  },

  async checkReady(endpoint: string | null): Promise<ReadinessResult> {
    if (!endpoint) {
      return {
        ready: false,
        status: "not_configured",
        detail: "No SearXNG endpoint configured",
        latencyMs: null,
        action: "Add your SearXNG URL in Settings → Search Endpoint (e.g. http://localhost:8080)",
        firstLook: "docker compose ps searxng",
      };
    }

    const base = endpoint.replace(/\/$/, "");
    const url = `${base}/search?q=${encodeURIComponent(TEST_QUERY)}&format=json&categories=general`;
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": "Creatrix/1.0 health-probe", Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
    } catch (err: any) {
      const msg: string = err?.message ?? "Fetch failed";
      const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("Timeout");
      return {
        ready: false,
        status: "unreachable",
        detail: isTimeout ? `Timed out after 6s (${base})` : `${msg} (${base})`,
        latencyMs: null,
        action: isTimeout
          ? "SearXNG is not responding — check it started fully: docker compose logs searxng --tail=20"
          : "Start container: docker compose up -d searxng",
        firstLook: "docker compose ps searxng",
      };
    }

    const latencyMs = Date.now() - start;

    if (res.status === 400) {
      return {
        ready: false,
        status: "degraded",
        detail: `GET /search: HTTP 400 — json format likely not enabled`,
        latencyMs,
        action:
          "Add 'json' to the 'formats' list in searxng/settings.yml, then restart the container.",
        firstLook: "docker compose logs searxng --tail=30",
      };
    }

    if (!res.ok) {
      return {
        ready: false,
        status: "unreachable",
        detail: `GET /search: HTTP ${res.status}`,
        latencyMs,
        action: "Check SearXNG container logs for errors.",
        firstLook: "docker compose logs searxng --tail=30",
      };
    }

    let body: any;
    try {
      body = await res.json();
    } catch {
      return {
        ready: false,
        status: "degraded",
        detail: "GET /search: HTTP 200 but response is not valid JSON",
        latencyMs,
        action:
          "Ensure 'json' is in the 'formats' list in searxng/settings.yml.",
        firstLook: `curl -s '${base}/search?q=test&format=json' | head -c 200`,
      };
    }

    if (!("results" in body)) {
      return {
        ready: false,
        status: "degraded",
        detail: "GET /search: HTTP 200 but no 'results' key in response",
        latencyMs,
        action: "Check SearXNG config — at least one search engine must be enabled.",
        firstLook: "docker compose logs searxng --tail=30",
      };
    }

    const count: number = Array.isArray(body.results) ? body.results.length : 0;
    return {
      ready: true,
      status: "ready",
      detail: `GET /search: 200 OK, ${count} result${count !== 1 ? "s" : ""}`,
      latencyMs,
    };
  },
};
