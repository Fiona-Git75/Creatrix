import { useQuery } from "@tanstack/react-query";

// ── Provenance ────────────────────────────────────────────────────────────────
// canonical:   client/src/components/RuntimeCoherencePanel.tsx
// derives:     /api/system/coherence → server/runtime/coherence.ts
// contract:    two modes:
//              GREEN  — domain summary, all ✓
//              AMBER/RED — "The runtime says:" diagnostic view
//                          Expected (coherent items) / Observed (degraded items)
//                          + first place to look
// consumed-by: AppSidebar (footer, above nav buttons)

type CoherenceStatus = "coherent" | "degraded" | "absent";
type CoherenceDomain = "Identity" | "Persistence" | "Inference" | "Knowledge" | "Media";

interface CoherenceItem {
  domain: CoherenceDomain;
  component: string;
  expected: string;
  actual: CoherenceStatus;
  message: string;
  action?: string;
  firstLook?: string;
}

interface CoherenceReport {
  coherent: boolean;
  overallStatus: "GREEN" | "AMBER" | "RED";
  items: CoherenceItem[];
  measuredAt: string;
}

const DOMAIN_ORDER: CoherenceDomain[] = ["Identity", "Persistence", "Inference", "Knowledge", "Media"];

function groupByDomain(items: CoherenceItem[]): Map<CoherenceDomain, CoherenceItem[]> {
  const map = new Map<CoherenceDomain, CoherenceItem[]>();
  for (const domain of DOMAIN_ORDER) {
    const group = items.filter(i => i.domain === domain);
    if (group.length > 0) map.set(domain, group);
  }
  return map;
}

function statusColor(status: "GREEN" | "AMBER" | "RED") {
  if (status === "GREEN") return "text-green-600 dark:text-green-400";
  if (status === "AMBER") return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function shortObserved(item: CoherenceItem): string {
  if (item.actual === "absent") return `${item.component} missing`;
  if (item.actual === "degraded") return `${item.component} unreachable`;
  return item.component;
}

export function RuntimeCoherencePanel() {
  const { data: report } = useQuery<CoherenceReport>({
    queryKey: ["/api/system/coherence"],
    refetchInterval: 30_000,
  });

  if (!report || report.items.length === 0) return null;

  const isHealthy = report.overallStatus === "GREEN";
  const degradedItems = report.items.filter(i => i.actual !== "coherent");
  const coherentItems = report.items.filter(i => i.actual === "coherent");

  // ── GREEN mode: compact domain summary ────────────────────────────────────
  if (isHealthy) {
    const domains = groupByDomain(report.items);
    return (
      <div
        className="px-3 py-2 font-mono text-xs border rounded-md bg-card border-border/40"
        data-testid="panel-runtime-coherence"
      >
        <div className={`mb-2 font-semibold ${statusColor("GREEN")}`}>
          Runtime coherence: GREEN
        </div>
        <div className="space-y-1.5">
          {Array.from(domains.entries()).map(([domain, items]) => (
            <div key={domain}>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">
                {domain}
              </div>
              {items.map(item => (
                <div key={item.component} className="text-foreground/80 pl-1">
                  <span className="text-green-600 dark:text-green-400 mr-1">✓</span>
                  {item.component}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── AMBER / RED mode: diagnostic view ─────────────────────────────────────
  const degradedDomains = [...new Set(degradedItems.map(i => i.domain))];
  const firstDegraded = degradedItems[0];

  return (
    <div
      className={`px-3 py-2 font-mono text-xs border rounded-md ${
        report.overallStatus === "RED"
          ? "bg-red-950/20 border-red-900/40 dark:bg-red-950/30"
          : "bg-amber-950/20 border-amber-900/30 dark:bg-amber-950/20"
      }`}
      data-testid="panel-runtime-coherence"
    >
      <div className="text-muted-foreground mb-2">The runtime says:</div>

      <div className={`font-semibold mb-2 ${statusColor(report.overallStatus)}`}>
        Runtime coherence: {report.overallStatus}
      </div>

      {degradedDomains.map(domain => (
        <div key={domain} className="text-foreground/90 mb-2">
          {domain} relationship degraded.
        </div>
      ))}

      {coherentItems.length > 0 && (
        <div className="mb-2">
          <div className="text-muted-foreground mb-0.5">Expected:</div>
          {coherentItems.map(item => (
            <div key={item.component} className="pl-1 text-foreground/70">
              <span className="text-green-600 dark:text-green-400 mr-1">✓</span>
              {item.component}
            </div>
          ))}
        </div>
      )}

      <div className="mb-2">
        <div className="text-muted-foreground mb-0.5">Observed:</div>
        {degradedItems.map(item => (
          <div key={item.component} className="pl-1 text-foreground/90">
            <span className={`mr-1 ${report.overallStatus === "RED" ? "text-red-500" : "text-amber-500"}`}>
              ✗
            </span>
            {shortObserved(item)}
          </div>
        ))}
      </div>

      {firstDegraded?.firstLook && (
        <div>
          <div className="text-muted-foreground mb-0.5">First place to look:</div>
          <div className="pl-1 text-foreground/80 whitespace-pre-wrap">
            {firstDegraded.firstLook}
          </div>
        </div>
      )}
    </div>
  );
}
