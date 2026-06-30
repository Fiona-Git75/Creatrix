import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

// ── Provenance ────────────────────────────────────────────────────────────────
// canonical:   client/src/components/RuntimeCoherencePanel.tsx
// derives:     /api/system/coherence → server/runtime/coherence.ts
// contract:    two modes:
//              GREEN  — collapsible domain summary; load once, no auto-poll
//              AMBER/RED — always expanded; polls every 30s until recovery
//              Clicking the panel header opens the system log for detail.
// consumed-by: AppSidebar (footer, replaces System Log button + health indicator)

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

interface RuntimeCoherencePanelProps {
  onOpenSystemLog?: () => void;
}

export function RuntimeCoherencePanel({ onOpenSystemLog }: RuntimeCoherencePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  const { data: report } = useQuery<CoherenceReport>({
    queryKey: ["/api/system/coherence"],
    // GREEN: load once at startup, never auto-refetch (nothing to act on).
    // AMBER/RED: re-check every 30s so recovery is detected automatically.
    refetchInterval: (query) => {
      const d = query.state.data as CoherenceReport | undefined;
      if (!d || d.overallStatus !== "GREEN") return 30_000;
      return false;
    },
  });

  // When a new coherence check completes after dismissal, re-show the panel.
  useEffect(() => {
    if (dismissed && report && report.measuredAt !== dismissedAt) {
      setDismissed(false);
    }
  }, [report?.measuredAt]);

  if (!report || report.items.length === 0) return null;
  if (dismissed && report.overallStatus !== "GREEN") return null;

  const isHealthy = report.overallStatus === "GREEN";
  const degradedItems = report.items.filter(i => i.actual !== "coherent");
  const coherentItems = report.items.filter(i => i.actual === "coherent");

  // ── GREEN mode ─────────────────────────────────────────────────────────────
  if (isHealthy) {
    const domains = groupByDomain(report.items);
    return (
      <div
        className="font-mono text-xs border rounded-md bg-card border-border/40 overflow-hidden"
        data-testid="panel-runtime-coherence"
      >
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors text-left"
          title={expanded ? "Collapse coherence summary" : "Expand coherence summary"}
          data-testid="button-coherence-toggle"
        >
          <span className={`font-semibold ${statusColor("GREEN")}`}>
            Runtime coherence: GREEN
          </span>
          <span className="text-muted-foreground text-[10px]">{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <div className="px-3 pb-2 space-y-1.5 border-t border-border/30">
            {Array.from(domains.entries()).map(([domain, items]) => (
              <div key={domain} className="pt-1.5">
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
            {onOpenSystemLog && (
              <button
                onClick={onOpenSystemLog}
                className="text-muted-foreground hover:text-foreground transition-colors pt-1 block"
                data-testid="button-coherence-open-log"
              >
                View system log →
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── AMBER / RED mode — always expanded ────────────────────────────────────
  const degradedDomains = Array.from(new Set(degradedItems.map(i => i.domain)));

  return (
    <div
      className={`px-3 py-2 font-mono text-xs border rounded-md ${
        report.overallStatus === "RED"
          ? "bg-red-950/20 border-red-900/40"
          : "bg-amber-950/20 border-amber-900/30"
      }`}
      data-testid="panel-runtime-coherence"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-muted-foreground">The runtime says:</div>
        <button
          onClick={() => { setDismissed(true); setDismissedAt(report.measuredAt); }}
          title="Dismiss until next check"
          data-testid="button-coherence-dismiss"
          className="text-muted-foreground hover:text-foreground transition-colors -mr-1 p-0.5 rounded hover:bg-white/10"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

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

      {degradedItems.some(i => i.firstLook) && (
        <div className="mb-2">
          <div className="text-muted-foreground mb-0.5">First place to look:</div>
          {degradedItems.filter(i => i.firstLook).map(item => (
            item.domain === "Identity" ? (
              <button
                key={item.component}
                className="pl-1 text-foreground/80 underline underline-offset-2 hover:text-foreground text-left block"
                onClick={() => { window.location.href = "/setup"; }}
                data-testid={`button-coherence-run-repair-${item.component}`}
              >
                <span className="font-medium text-foreground/60">{item.component}: </span>View repair steps →
              </button>
            ) : (
              <div key={item.component} className="pl-1 text-foreground/80 whitespace-pre-wrap">
                <span className="font-medium text-foreground/60">{item.component}: </span>{item.firstLook}
              </div>
            )
          ))}
        </div>
      )}

      {onOpenSystemLog && (
        <button
          onClick={onOpenSystemLog}
          className="text-muted-foreground hover:text-foreground transition-colors mt-1 block"
          data-testid="button-coherence-open-log"
        >
          View system log →
        </button>
      )}
    </div>
  );
}
