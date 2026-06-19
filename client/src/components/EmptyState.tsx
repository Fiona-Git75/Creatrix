import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface ProviderStatusItem {
  connectionId: string;
  name: string;
  type: string;
  endpoint: string;
  status: "online" | "offline";
  models: { id: string; name: string; size?: string }[];
}

interface SuggestedProvider {
  name: string;
  type: string;
  endpoint: string;
  models: string[];
}

interface ProvidersStatusResponse {
  providers: ProviderStatusItem[];
  suggested: SuggestedProvider[];
  scannedAt: string;
}

interface StatusResponse {
  greeting: string;
  library: { available: boolean };
}

interface EmptyStateProps {
  onStartChatting: () => void;
  onOpenSettings?: () => void;
}

const STORAGE_KEY = "resident:last-models";

export function EmptyState({ onStartChatting, onOpenSettings }: EmptyStateProps) {
  const { data: status, isLoading: statusLoading } = useQuery<StatusResponse>({
    queryKey: ["/api/status"],
    retry: false,
    staleTime: 0,
  });

  const { data: providerStatus, isLoading: providersLoading } = useQuery<ProvidersStatusResponse>({
    queryKey: ["/api/providers/status"],
    retry: false,
    staleTime: 0,
  });

  const [modelChange, setModelChange] = useState<{ before: string[]; now: string[] } | null>(null);

  useEffect(() => {
    if (!providerStatus) return;
    const now = providerStatus.providers
      .filter(p => p.status === "online")
      .flatMap(p => p.models.map(m => m.id));
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
  }, [providerStatus]);

  const isLoading = statusLoading || providersLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-sm text-muted-foreground font-mono tracking-wide">Scanning…</p>
      </div>
    );
  }

  const onlineProviders = providerStatus?.providers.filter(p => p.status === "online") ?? [];
  const offlineProviders = providerStatus?.providers.filter(p => p.status === "offline") ?? [];
  const suggested = providerStatus?.suggested ?? [];
  const anyOnline = onlineProviders.length > 0;

  return (
    <div className="flex flex-col items-center justify-center h-full px-4" data-testid="empty-state-briefing">
      <div className="w-full max-w-sm space-y-8">

        <p className="text-2xl font-light tracking-tight">{status?.greeting}.</p>

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
            {onlineProviders.map(p => (
              <div key={p.connectionId} className="flex items-baseline gap-2">
                <span className="text-green-500 text-xs">✓</span>
                <span>
                  {p.name} — {p.models.length} {p.models.length === 1 ? "model" : "models"} ready
                </span>
              </div>
            ))}
            {offlineProviders.map(p => (
              <div key={p.connectionId} className="flex items-baseline gap-2">
                <span className="text-muted-foreground text-xs">○</span>
                <span className="text-muted-foreground">{p.name} — offline</span>
              </div>
            ))}
            {suggested.map(s => (
              <div key={s.endpoint} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-yellow-500 text-xs">△</span>
                  <span className="text-muted-foreground">
                    {s.name} found — {s.models.length} {s.models.length === 1 ? "model" : "models"}, not configured
                  </span>
                </div>
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="ml-4 text-xs underline underline-offset-2 hover:opacity-60 transition-opacity text-foreground"
                    data-testid="button-open-settings-from-briefing"
                  >
                    Add connection
                  </button>
                )}
              </div>
            ))}
            {!anyOnline && suggested.length === 0 && (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">○</span>
                  <span className="text-muted-foreground">No AI found</span>
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
            {status?.library.available && (
              <div className="flex items-baseline gap-2">
                <span className="text-green-500 text-xs">✓</span>
                <span>Notes available</span>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground font-mono">
          {anyOnline ? "Ready." : "Start Ollama or LM Studio, then reload."}
        </p>

      </div>
    </div>
  );
}
