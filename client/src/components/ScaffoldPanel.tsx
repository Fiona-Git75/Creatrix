import { useState, useEffect, useCallback } from "react";
import { X, RefreshCw, Loader2, Wind, Anchor, GitBranch, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScaffoldData {
  inTheAir: string[];
  landed: string[];
  connections: string[];
  holdingTension: string[];
  updatedAt?: string;
}

interface ScaffoldPanelProps {
  conversationId: string;
  onClose: () => void;
}

interface Section {
  key: keyof Omit<ScaffoldData, "updatedAt">;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

const SECTIONS: Section[] = [
  {
    key: "inTheAir",
    label: "In the air",
    icon: Wind,
    description: "Active threads, still being worked",
    color: "text-blue-500",
  },
  {
    key: "landed",
    label: "Landed",
    icon: Anchor,
    description: "What's been figured out",
    color: "text-green-500",
  },
  {
    key: "connections",
    label: "Connections formed",
    icon: GitBranch,
    description: "Relationships between things that arrived separately",
    color: "text-purple-500",
  },
  {
    key: "holdingTension",
    label: "Holding tension",
    icon: Zap,
    description: "Unresolved, but still exerting pressure",
    color: "text-amber-500",
  },
];

export function ScaffoldPanel({ conversationId, onClose }: ScaffoldPanelProps) {
  const [scaffold, setScaffold] = useState<ScaffoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScaffold = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/scaffold`);
      const data = await res.json();
      if (res.ok) {
        setScaffold(data.scaffold ?? null);
      } else {
        setError(data.error ?? "Failed to load scaffold");
      }
    } catch {
      setError("Could not reach server");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  const requestGenerate = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/conversations/${conversationId}/scaffold`, { method: "POST" });
      setTimeout(() => fetchScaffold(true), 3000);
    } catch {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchScaffold();
    const interval = setInterval(() => fetchScaffold(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchScaffold]);

  const isEmpty = !scaffold || SECTIONS.every(s => !scaffold[s.key]?.length);

  return (
    <div className="flex flex-col h-full bg-background border-l border-border overflow-hidden w-80 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/30">
        <div>
          <h3 className="text-sm font-semibold">Session Scaffold</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Live field map of this conversation</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={requestGenerate}
            disabled={refreshing}
            data-testid="button-scaffold-refresh"
            title="Request scaffold update"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            data-testid="button-scaffold-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-xs">Reading conversation…</p>
          </div>
        ) : error ? (
          <div className="text-xs text-destructive px-1">{error}</div>
        ) : isEmpty ? (
          <div className="flex flex-col gap-3 py-8 px-1 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              The scaffold builds automatically every 15 messages. You can also request one now.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={requestGenerate}
              disabled={refreshing}
              data-testid="button-scaffold-generate"
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Build scaffold now
            </Button>
          </div>
        ) : (
          SECTIONS.map(({ key, label, icon: Icon, description, color }) => {
            const items = scaffold?.[key] ?? [];
            if (!items.length) return null;
            return (
              <div key={key} data-testid={`scaffold-section-${key}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
                </div>
                <div className="space-y-1.5 pl-5">
                  {items.map((item, i) => (
                    <p key={i} className="text-xs text-foreground leading-relaxed" data-testid={`scaffold-item-${key}-${i}`}>
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer — timestamp */}
      {scaffold?.updatedAt && (
        <div className="shrink-0 px-4 py-2 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground">
            Updated {new Date(scaffold.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}
    </div>
  );
}
