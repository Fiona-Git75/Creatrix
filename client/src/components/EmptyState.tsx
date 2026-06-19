import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface StatusResponse {
  greeting: string;
  localAI: { found: boolean; name: string | null; models: string[] };
  library: { available: boolean };
  connectionsCount: number;
}

interface EmptyStateProps {
  onStartChatting: () => void;
  onOpenSettings?: () => void;
}

const STORAGE_KEY = "resident:last-models";

export function EmptyState({ onStartChatting, onOpenSettings }: EmptyStateProps) {
  const { data, isLoading } = useQuery<StatusResponse>({
    queryKey: ["/api/status"],
    retry: false,
    staleTime: 0,
  });

  const [modelChange, setModelChange] = useState<{ before: string[]; now: string[] } | null>(null);

  useEffect(() => {
    if (!data?.localAI) return;
    const now = data.localAI.models;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const before: string[] = JSON.parse(raw);
        const changed =
          now.length !== before.length ||
          now.some(m => !before.includes(m)) ||
          before.some(m => !now.includes(m));
        if (changed) setModelChange({ before, now });
      }
    } catch {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(now));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-sm text-muted-foreground font-mono tracking-wide">Scanning…</p>
      </div>
    );
  }

  const aiFound = data?.localAI.found;
  const aiName = data?.localAI.name;
  const modelCount = data?.localAI.models.length ?? 0;

  return (
    <div className="flex flex-col items-center justify-center h-full px-4" data-testid="empty-state-briefing">
      <div className="w-full max-w-sm space-y-8">

        <p className="text-2xl font-light tracking-tight">{data?.greeting}.</p>

        {modelChange ? (
          <div className="space-y-4 font-mono text-sm">
            <p className="text-muted-foreground">Model list changed since last session.</p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase tracking-widest text-[10px]">Before</p>
                {modelChange.before.map(m => (
                  <p key={m} className="text-muted-foreground">· {m}</p>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase tracking-widest text-[10px]">Now</p>
                {modelChange.now.map(m => (
                  <p key={m}>· {m}</p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 font-mono text-sm">
            {aiFound ? (
              <div className="flex items-baseline gap-2">
                <span className="text-green-500 text-xs">✓</span>
                <span>{aiName} — {modelCount} {modelCount === 1 ? "model" : "models"} ready</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">○</span>
                  <span className="text-muted-foreground">No local AI found</span>
                </div>
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="ml-4 text-xs underline underline-offset-2 hover:opacity-60 transition-opacity text-foreground"
                    data-testid="button-open-settings-from-briefing"
                  >
                    Add a connection
                  </button>
                )}
              </div>
            )}
            {data?.library.available && (
              <div className="flex items-baseline gap-2">
                <span className="text-green-500 text-xs">✓</span>
                <span>Notes available</span>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground font-mono">
          {aiFound ? "Ready." : "Start Ollama or LM Studio, then reload."}
        </p>

      </div>
    </div>
  );
}
