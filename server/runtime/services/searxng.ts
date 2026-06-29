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
      "curl -s 'http://localhost:8080/search?q=test&format=json' | head -c 200",
      "systemctl status searxng             # Linux (systemd install)",
      "ps aux | grep searxng",
      "journalctl -u searxng --since '5 minutes ago'  # systemd logs",
    ],
    commonIssues: [
      {
        symptom: "HTTP 400 on /search?format=json",
        action:
          "Add 'json' to the 'formats' list in searxng/settings.yml, then restart SearXNG:\n" +
          "  sudo systemctl restart searxng",
      },
      {
        symptom: "HTTP 200 but no results consistently",
        action:
          "At least one search engine must be enabled in searxng/settings.yml under 'engines'.",
      },
      {
        symptom: "Connection refused on the configured port",
        action:
          "SearXNG is not running. Start it:\n" +
          "  systemd:  sudo systemctl start searxng\n" +
          "  manual:   cd /path/to/searxng && python searx/webapp.py",
      },
      {
        symptom: "HTTP 200 but response is HTML instead of JSON",
        action:
          "Ensure 'json' is listed under 'search.formats' in searxng/settings.yml and the service was restarted.",
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
        firstLook: "curl -s 'http://localhost:8080/search?q=test&format=json' | head -c 200",
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
          ? "SearXNG is not responding — check it started fully:\n" +
            "  ps aux | grep searxng\n" +
            "  journalctl -u searxng --since '5 minutes ago'"
          : "SearXNG is not running. Start it:\n" +
            "  sudo systemctl start searxng",
        firstLook: `curl -s '${base}/search?q=test&format=json' | head -c 200`,
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
          "Add 'json' to the 'formats' list in searxng/settings.yml, then restart:\n" +
          "  sudo systemctl restart searxng",
        firstLook: `curl -sv '${base}/search?q=test&format=json' 2>&1 | tail -5`,
      };
    }

    if (!res.ok) {
      return {
        ready: false,
        status: "unreachable",
        detail: `GET /search: HTTP ${res.status}`,
        latencyMs,
        action: "Check SearXNG logs for errors:\n" +
          "  journalctl -u searxng --since '5 minutes ago'",
        firstLook: `curl -sv '${base}/search?q=test&format=json' 2>&1 | tail -10`,
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
          "Ensure 'json' is in the 'formats' list in searxng/settings.yml and restart the service.",
        firstLook: `curl -s '${base}/search?q=test&format=json' | head -c 200`,
      };
    }

    if (!("results" in body)) {
      return {
        ready: false,
        status: "degraded",
        detail: "GET /search: HTTP 200 but no 'results' key in response",
        latencyMs,
        action: "Check SearXNG config — at least one search engine must be enabled in settings.yml.",
        firstLook: `curl -s '${base}/search?q=test&format=json' | head -c 500`,
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
