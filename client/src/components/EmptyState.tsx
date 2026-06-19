import { useEffect, useState, RefObject } from "react";
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
        <p className="text-sm text-muted-foreground font-mono">Looking around…</p>
      </div>
    );
  }

  const checks = [
    data?.localAI.found
      ? { ok: true, text: `${data.localAI.name} — ${data.localAI.models.length} ${data.localAI.models.length === 1 ? "model" : "models"} ready`, action: null }
      : { ok: false, text: "No local AI found", action: onOpenSettings ? { label: "Open Settings", fn: onOpenSettings } : null },
    ...(data?.library.available ? [{ ok: true, text: "Notes available" }] : []),
  ];

  const allHealthy = checks.length > 0 && checks.every(c => c.ok);

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-full max-w-xs space-y-5 font-mono text-sm" data-testid="empty-state-briefing">
        <p>{data?.greeting}.</p>

        {modelChange ? (
          <div className="space-y-4">
            <p className="text-muted-foreground">Something changed.</p>
            <div className="space-y-3 text-xs">
              <div className="space-y-0.5">
                <p className="text-muted-foreground mb-1">Yesterday:</p>
                {modelChange.before.map(m => (
                  <p key={m} className="text-muted-foreground">• {m}</p>
                ))}
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground mb-1">Today:</p>
                {modelChange.now.map(m => (
                  <p key={m}>• {m}</p>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">I updated the model list.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-muted-foreground">I looked around.</p>
            <div className="space-y-1.5">
              {checks.map((c, i) => (
                <div key={i} className="space-y-0.5">
                  <p className={c.ok ? "" : "text-muted-foreground"}>
                    {c.ok ? "✓" : "○"} {c.text}
                  </p>
                  {!c.ok && c.action && (
                    <button
                      onClick={c.action.fn}
                      className="text-xs text-foreground underline underline-offset-2 hover:opacity-60 transition-opacity ml-4"
                      data-testid="button-open-settings-from-briefing"
                    >
                      {c.action.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {allHealthy && (
              <p className="text-muted-foreground">Everything looks good.</p>
            )}
          </div>
        )}

        <button
          onClick={onStartChatting}
          className="text-foreground underline underline-offset-4 hover:opacity-60 transition-opacity text-left"
          data-testid="button-start-chatting"
        >
          [Start chatting]
        </button>
      </div>
    </div>
  );
}
