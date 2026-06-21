import { useState } from "react";
import { Wrench, ChevronDown, ChevronUp, CheckCircle2, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ToolEntry {
  name: string;
  description: string;
  requiresConfirmation?: boolean;
}

interface InactiveEntry {
  name: string;
  description: string;
  reason: string;
}

interface ToolsStatus {
  active: ToolEntry[];
  inactive: InactiveEntry[];
}

interface SubstrateHealth {
  coherence: "green" | "amber" | "red";
  substrates: Record<string, { status: "up" | "down" | "unknown"; endpoint: string | null; latencyMs: number | null }>;
  issues: string[];
  checkedAt: number;
}

function toolLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Category groupings ────────────────────────────────────────────────────────
const GROUPS: { label: string; names: string[] }[] = [
  {
    label: "Files & Folders",
    names: ["list_directory", "read_file", "write_file", "append_file", "create_note", "create_folder", "copy_file", "move_file", "delete_file"],
  },
  {
    label: "Web",
    names: ["web_search", "retrieve_url"],
  },
  {
    label: "Library",
    names: ["search_library", "save_conversation"],
  },
  {
    label: "Notion",
    names: ["notion_search", "notion_get_page", "notion_create_page", "notion_query_database", "notion_append_block"],
  },
  {
    label: "Media",
    names: ["get_youtube_transcript", "transcribe_audio", "ocr_image", "analyze_image"],
  },
  {
    label: "Documents",
    names: ["list_docs", "read_doc", "write_doc", "edit_doc"],
  },
  {
    label: "System",
    names: ["run_command"],
  },
];

interface ToolStatusChipProps {
  onOpenSettings: () => void;
}

export function ToolStatusChip({ onOpenSettings }: ToolStatusChipProps) {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery<ToolsStatus>({
    queryKey: ["/api/tools/status"],
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: health } = useQuery<SubstrateHealth>({
    queryKey: ["/api/substrate/health"],
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const activeCount   = data?.active.length   ?? 0;
  const inactiveCount = data?.inactive.length  ?? 0;
  const hasInactive   = inactiveCount > 0;
  const coherence     = health?.coherence ?? (hasInactive ? "amber" : "green");
  const hasIssues     = (health?.issues?.length ?? 0) > 0;

  const badgeColor =
    coherence === "red"
      ? "bg-red-500/15 text-red-600 dark:text-red-400"
      : coherence === "amber" || hasInactive
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : "bg-green-500/15 text-green-600 dark:text-green-400";

  const summary = data
    ? `${activeCount} active · ${inactiveCount} available`
    : "Loading…";

  // Merge all tools into a lookup for quick status checks
  const activeMap = new Map(data?.active.map(t => [t.name, t]) ?? []);
  const inactiveMap = new Map(data?.inactive.map(t => [t.name, t]) ?? []);

  return (
    <div className="flex flex-col">
      {/* Chip trigger */}
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-xs h-8 px-3"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-tool-status"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left font-normal">Tools</span>
        {data && (
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", badgeColor)}>
            {summary}
          </span>
        )}
        {expanded
          ? <ChevronUp   className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        }
      </Button>

      {/* Expanded panel */}
      {expanded && data && (
        <div className="mx-1 mb-1 rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
          <ScrollArea className="max-h-[420px]">
            <div className="p-2 space-y-3">

              {/* System truth coherence issues */}
              {hasIssues && health && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50 px-1 mb-1">
                    System
                  </p>
                  <div className="space-y-0.5">
                    {health.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 px-1.5 py-1 rounded-md">
                        <span className={cn(
                          "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
                          health.coherence === "red" ? "bg-red-500" : "bg-amber-500"
                        )} />
                        <p className="text-[10px] text-muted-foreground/60 leading-tight">{issue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tool catalog grouped by category */}
              {GROUPS.map(group => {
                const tools = group.names.filter(n => activeMap.has(n) || inactiveMap.has(n));
                if (tools.length === 0) return null;
                return (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/40 px-1 mb-1">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {tools.map(name => {
                        const active = activeMap.get(name);
                        const inactive = inactiveMap.get(name);
                        const entry = active ?? inactive!;
                        const isActive = !!active;
                        return (
                          <div
                            key={name}
                            className={cn(
                              "flex items-start gap-2 px-1.5 py-1.5 rounded-md",
                              !isActive && "opacity-60"
                            )}
                            data-testid={`tool-${isActive ? "active" : "inactive"}-${name}`}
                          >
                            <span className={cn(
                              "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
                              isActive ? "bg-green-500" : "bg-muted-foreground/25"
                            )} />
                            <div className="min-w-0 flex-1">
                              <p className={cn(
                                "text-xs font-medium leading-tight",
                                isActive ? "text-foreground/80" : "text-foreground/50"
                              )}>
                                {toolLabel(name)}
                                {active?.requiresConfirmation && (
                                  <span className="ml-1 text-[10px] text-muted-foreground/50">(confirm)</span>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5">
                                {entry.description}
                              </p>
                              {!isActive && inactive?.reason && (
                                <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 leading-tight mt-0.5">
                                  {inactive.reason.split("—")[1]?.trim() ?? inactive.reason}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* All green */}
              {!hasInactive && !hasIssues && (
                <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-green-600/70 dark:text-green-400/60">
                  <CheckCircle2 className="h-3 w-3" />
                  All tools active and substrates healthy
                </div>
              )}

              {/* Settings link if anything needs configuring */}
              {hasInactive && (
                <button
                  className="flex items-center gap-1.5 w-full text-[10px] text-muted-foreground/50 hover:text-foreground/60 transition-colors px-1.5 pt-1 border-t border-border/30 mt-1"
                  onClick={() => { setExpanded(false); onOpenSettings(); }}
                  data-testid="button-tools-open-settings"
                >
                  <Settings className="h-3 w-3" />
                  Configure in Settings
                </button>
              )}

            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
