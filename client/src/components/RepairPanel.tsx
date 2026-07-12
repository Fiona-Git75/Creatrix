import { useState } from "react";
import { Home, Loader2, RefreshCw, Wrench, Copy, Check, Download, Settings, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CoherenceItem {
  domain: string;
  component: string;
  actual: string;
  message: string;
  action?: string;
  firstLook?: string;
}

export interface RepairPanelProps {
  coherence: {
    coherent: boolean;
    overallStatus: "AMBER" | "RED";
    items: CoherenceItem[];
    measuredAt: string;
  };
  coherenceIsFetching: boolean;
  repairCountdown: number;
  onRecheck: () => void;
  onOpenSettings?: () => void;
  onReassignResident?: (residentName: string) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      data-testid="button-copy-command"
      className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function CopyReportButton({ buildReport }: { buildReport: () => string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(buildReport()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      data-testid="button-copy-report"
      className="flex items-center gap-2 flex-1 justify-center py-2 px-3 rounded-md border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border hover:bg-white/5 transition-colors font-mono"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-400" />
          <span className="text-green-400">Report copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy report
        </>
      )}
    </button>
  );
}

function DownloadReportButton({ buildReport }: { buildReport: () => string }) {
  const handleDownload = () => {
    const text = buildReport();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repair-report.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={handleDownload}
      data-testid="button-download-report"
      className="flex items-center gap-2 flex-1 justify-center py-2 px-3 rounded-md border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border hover:bg-white/5 transition-colors font-mono"
    >
      <Download className="h-3.5 w-3.5" />
      Download report
    </button>
  );
}

const DOMAIN_ORDER = ["Identity", "Persistence", "Inference", "Knowledge", "Media"] as const;

export function RepairPanel({ coherence, coherenceIsFetching, repairCountdown, onRecheck, onOpenSettings, onReassignResident }: RepairPanelProps) {
  const degradedItems = coherence.items.filter(i => i.actual !== "coherent");
  const isRed = coherence.overallStatus === "RED";
  const statusColor = isRed ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400";
  const borderColor = isRed ? "border-red-900/40 bg-red-950/20" : "border-amber-900/30 bg-amber-950/20";

  const buildReport = () => {
    const lines: string[] = [`=== System Repair Report (${coherence.overallStatus}) ===`, ""];
    degradedItems.forEach(item => {
      lines.push(`[${item.domain}] ${item.component}`);
      lines.push(`✗ ${item.message}`);
      if (item.action) lines.push(`Fix: ${item.action}`);
      if (item.firstLook) lines.push(`First look: ${item.firstLook}`);
      lines.push("");
    });
    return lines.join("\n").trimEnd();
  };

  const grouped: Array<{ domain: string; items: typeof degradedItems }> = [];
  for (const domain of DOMAIN_ORDER) {
    const group = degradedItems.filter(i => i.domain === domain);
    if (group.length > 0) grouped.push({ domain, items: group });
  }
  const ungrouped = degradedItems.filter(
    i => !DOMAIN_ORDER.includes(i.domain as typeof DOMAIN_ORDER[number])
  );
  if (ungrouped.length > 0) grouped.push({ domain: "Other", items: ungrouped });

  return (
    <div className="space-y-6 max-w-md">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wrench className={`h-5 w-5 ${statusColor}`} />
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Environment status
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSettings}
                className="gap-1.5 text-xs"
                data-testid="button-repair-open-settings"
              >
                <Settings className="h-3 w-3" />
                Settings
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={coherenceIsFetching}
              onClick={onRecheck}
              className="gap-1.5 text-xs"
              data-testid="button-recheck-now"
            >
              {coherenceIsFetching
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
              Re-check now
            </Button>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Getting your environment ready
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {degradedItems.length === 1 ? "One thing isn't" : "A few things aren't"} available yet.
          Here's what's happening and where to start.
        </p>
      </div>

      <div className={`border rounded-md overflow-hidden font-mono text-xs ${borderColor}`} data-testid="panel-repair-list">
        {grouped.map(({ domain, items }) => (
          <div key={domain} className="border-b border-border/30 last:border-b-0">
            <div className="px-4 py-2 bg-background/30 border-b border-border/20">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                {domain}
              </span>
            </div>
            <div className="divide-y divide-border/20">
              {items.map((item, idx) => (
                <div key={idx} className="px-4 py-3 space-y-1.5" data-testid={`repair-item-${item.component}`}>
                  <div className="flex items-center gap-2">
                    <span className={statusColor}>✗</span>
                    <span className="font-semibold text-foreground">{item.component}</span>
                  </div>
                  <p className="text-foreground/70 pl-4">{item.message}</p>
                  {item.action && (
                    <div className="pl-4 space-y-0.5">
                      <p className="text-muted-foreground">Fix:</p>
                      <div className="flex items-start gap-1.5">
                        <p className="text-foreground/90 whitespace-pre-wrap flex-1">
                          <span className="font-medium text-foreground/60">{item.component}: </span>{item.action}
                        </p>
                        <CopyButton text={item.action} />
                      </div>
                      {onReassignResident && item.domain === "Inference" && item.actual === "absent" && item.component.endsWith(" connection") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReassignResident(item.component.replace(/ connection$/, ""))}
                          className="mt-1.5 gap-1.5 text-xs"
                          data-testid={`button-reassign-${item.component.replace(/ connection$/, "").toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <UserCog className="h-3 w-3" />
                          Reassign resident
                        </Button>
                      )}
                    </div>
                  )}
                  {item.firstLook && (
                    <div className="pl-4 space-y-0.5">
                      <p className="text-muted-foreground">First place to look:</p>
                      <div className="flex items-start gap-1.5">
                        <p className="text-foreground/80 whitespace-pre-wrap flex-1">
                          <span className="font-medium text-foreground/60">{item.component}: </span>{item.firstLook}
                        </p>
                        <CopyButton text={item.firstLook} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <CopyReportButton buildReport={buildReport} />
        <DownloadReportButton buildReport={buildReport} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { window.location.href = "/"; }}
          className="gap-2 text-muted-foreground hover:text-foreground"
          data-testid="button-repair-return-to-app"
        >
          <Home className="h-4 w-4" />
          Return to app
        </Button>
        <p className="text-xs text-muted-foreground font-mono">
          Status: <span className={statusColor}>{coherence.overallStatus}</span>
        </p>
      </div>

      <p className="text-xs text-muted-foreground font-mono text-center" data-testid="text-repair-countdown">
        Checking again in {repairCountdown}s…
      </p>
    </div>
  );
}
