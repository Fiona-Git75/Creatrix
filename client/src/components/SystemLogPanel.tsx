import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, CheckCircle2, Info, Trash2,
  RefreshCw, Loader2, XCircle, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  category: string;
  message: string;
  detail?: string;
}

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  db: boolean;
  uptime: number;
  logCount: number;
  recentErrors: number;
}

interface SystemLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function levelIcon(level: LogEntry["level"]) {
  if (level === "error") return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (level === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "chat": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "tool": return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    case "connection": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    case "notion": return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
    case "filesystem": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "web": return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function HealthBar({ health }: { health: HealthStatus }) {
  const ok = health.status === "ok";
  const degraded = health.status === "degraded";
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-md border text-sm ${
      ok ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900"
        : degraded ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"
        : "bg-destructive/5 border-destructive/30"
    }`}>
      {ok
        ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        : degraded
        ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        : <XCircle className="h-4 w-4 text-destructive shrink-0" />
      }
      <div className="flex-1 flex flex-wrap gap-x-4 gap-y-0.5">
        <span className="font-medium">
          {ok ? "System healthy" : degraded ? "System degraded" : "System error"}
        </span>
        <span className="text-muted-foreground">
          DB {health.db ? "✓" : "✗"}
        </span>
        <span className="text-muted-foreground">
          Uptime {Math.floor(health.uptime / 60)}m
        </span>
        {health.recentErrors > 0 && (
          <span className="text-destructive font-medium">
            {health.recentErrors} recent error{health.recentErrors !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export function SystemLogPanel({ open, onOpenChange }: SystemLogPanelProps) {
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: health, isLoading: healthLoading } = useQuery<HealthStatus>({
    queryKey: ["/api/system/health"],
    refetchInterval: open ? 10000 : false,
    enabled: open,
  });

  const { data: logs = [], isLoading: logsLoading, refetch } = useQuery<LogEntry[]>({
    queryKey: ["/api/system/logs", levelFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (levelFilter !== "all") params.set("level", levelFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/system/logs?${params}`);
      return res.json();
    },
    refetchInterval: open ? 5000 : false,
    enabled: open,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/system/logs"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/health"] });
      toast({ title: "Logs cleared" });
    },
  });

  const categories = ["all", "system", "chat", "tool", "connection", "notion", "filesystem", "web"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Log
          </DialogTitle>
          <DialogDescription>
            Live event log and system health monitor.
          </DialogDescription>
        </DialogHeader>

        {healthLoading ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : health ? (
          <HealthBar health={health} />
        ) : null}

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="h-8 w-28" data-testid="select-log-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-36" data-testid="select-log-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "all" ? "All categories" : c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => refetch()}
            data-testid="button-refresh-logs"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            data-testid="button-clear-logs"
            title="Clear logs"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 h-[420px]">
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No log entries yet</p>
              <p className="text-xs mt-1">Events will appear here as you use the app.</p>
            </div>
          ) : (
            <div className="space-y-0.5 font-mono text-xs pr-2">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors ${
                    entry.level === "error" ? "bg-destructive/5" : ""
                  }`}
                  data-testid={`log-entry-${entry.id}`}
                >
                  <span className="text-muted-foreground shrink-0 tabular-nums mt-0.5">
                    {formatTime(entry.timestamp)}
                  </span>
                  {levelIcon(entry.level)}
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1 py-0 h-4 shrink-0 font-normal ${categoryColor(entry.category)}`}
                  >
                    {entry.category}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className={entry.level === "error" ? "text-destructive" : entry.level === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground"}>
                      {entry.message}
                    </span>
                    {entry.detail && (
                      <span className="text-muted-foreground ml-2 break-all">{entry.detail}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
