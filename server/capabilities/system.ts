// ── system.ts — Creatrix self-awareness capabilities ──────────────────────────
// check_services lets the model inspect live service state before attempting
// tool calls, or in response to user questions about why something isn't working.
// The handler reads from the service-runtime's cached probe results — no new
// network calls, no latency, just the current truth Creatrix already knows.

import type { CapabilityDefinition } from "./index";
import { getAllServiceStates } from "../runtime/service-runtime";

function statusIcon(status: string): string {
  switch (status) {
    case "ready":          return "✓";
    case "degraded":       return "⚠";
    case "not_configured": return "–";
    case "probing":        return "…";
    default:               return "✗";  // unreachable
  }
}

export const systemCapabilities: CapabilityDefinition[] = [
  {
    name: "check_services",
    description:
      "Check the live readiness of Creatrix's backing services (PostgreSQL, SearXNG web search, Whisper transcription). " +
      "Returns each service's status (ready/degraded/unreachable/not_configured), what Creatrix found when it last probed, " +
      "and the exact action to take if anything is not ready. " +
      "Call this proactively when: (1) the user asks why something isn't working, (2) before invoking a tool that may depend " +
      "on an external service, (3) at the start of a session if the user mentions connectivity or setup. " +
      "Do not wait for a tool to fail — use this first so you can give the user a specific answer instead of a generic error.",
    argsSchema: {},
    handler: async () => {
      const states = getAllServiceStates();

      const services = Object.values(states).map(s => {
        const entry: Record<string, unknown> = {
          name:          s.name,
          key:           s.key,
          status:        s.status,
          ready:         s.ready,
          summary:       `${statusIcon(s.status)} ${s.detail}`,
          capabilities:  s.capabilities,
          checkedSecondsAgo:
            s.checkedAt != null
              ? Math.round((Date.now() - s.checkedAt) / 1000)
              : null,
        };

        if (!s.ready) {
          if (s.action)    entry.action    = s.action;
          if (s.firstLook) entry.firstLook = s.firstLook;
        }

        return entry;
      });

      const readyCount    = services.filter(s => s.ready).length;
      const totalCount    = services.length;
      const notReadyCount = totalCount - readyCount;

      return {
        summary:
          notReadyCount === 0
            ? `All ${totalCount} services are ready.`
            : `${readyCount} of ${totalCount} services ready — ${notReadyCount} need attention.`,
        services,
      };
    },
  },
];
