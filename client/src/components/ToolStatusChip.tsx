import { useState } from "react";
import { Wrench, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";
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

function toolLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

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

  const activeCount = data?.active.length ?? 0;
  const inactiveCount = data?.inactive.length ?? 0;
  const hasInactive = inactiveCount > 0;

  const summary = data
    ? hasInactive
      ? `${activeCount} active · ${inactiveCount} inactive`
      : `${activeCount} active`
    : "Loading…";

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
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              hasInactive
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-green-500/15 text-green-600 dark:text-green-400"
            )}
          >
            {summary}
          </span>
        )}
        {expanded
          ? <ChevronUp className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        }
      </Button>

      {/* Expanded panel */}
      {expanded && data && (
        <div className="mx-1 mb-1 rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
          <ScrollArea className="max-h-72">
            <div className="p-2 space-y-3">

              {/* Active tools */}
              {data.active.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50 px-1 mb-1">
                    Active
                  </p>
                  <div className="space-y-0.5">
                    {data.active.map(tool => (
                      <div
                        key={tool.name}
                        className="flex items-start gap-2 px-1.5 py-1 rounded-md"
                        data-testid={`tool-active-${tool.name}`}
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground/80 leading-tight">
                            {toolLabel(tool.name)}
                            {tool.requiresConfirmation && (
                              <span className="ml-1 text-[10px] text-muted-foreground/50">(confirm)</span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5 line-clamp-2">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive tools */}
              {data.inactive.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50 px-1 mb-1">
                    Not configured
                  </p>
                  <div className="space-y-0.5">
                    {data.inactive.map(tool => (
                      <div
                        key={tool.name}
                        className="flex items-start gap-2 px-1.5 py-1 rounded-md"
                        data-testid={`tool-inactive-${tool.name}`}
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/25 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground/50 leading-tight">
                            {toolLabel(tool.name)}
                          </p>
                          <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 leading-tight mt-0.5">
                            {tool.reason.split("—")[1]?.trim() ?? tool.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-2 w-full text-[10px] text-muted-foreground/60 hover:text-foreground/70 transition-colors text-left px-1.5"
                    onClick={() => { setExpanded(false); onOpenSettings(); }}
                    data-testid="button-tools-open-settings"
                  >
                    Open Settings to configure →
                  </button>
                </div>
              )}

              {/* All active, no inactive */}
              {data.inactive.length === 0 && (
                <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-green-600/70 dark:text-green-400/60">
                  <CheckCircle2 className="h-3 w-3" />
                  All tools configured
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
