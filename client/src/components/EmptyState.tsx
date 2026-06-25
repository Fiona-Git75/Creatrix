import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type ModelRole = "conversation" | "vision" | "embeddings";

interface StoredModel { id: string; supportsVision?: boolean; }

interface ModelEntry { id: string; name: string; size?: string; supportsVision?: boolean; }

interface ProviderStatusItem {
  connectionId: string;
  name: string;
  type: string;
  endpoint: string;
  status: "online" | "offline";
  models: ModelEntry[];
}

interface SuggestedProvider { name: string; type: string; endpoint: string; models: string[]; }

interface ProvidersStatusResponse {
  providers: ProviderStatusItem[];
  suggested: SuggestedProvider[];
  scannedAt: string;
}

interface StatusResponse { greeting: string; library: { available: boolean }; }

interface EmptyStateProps { onStartChatting: () => void; onOpenSettings?: () => void; }

const STORAGE_KEY = "resident:last-models-v2";

const ROLE_LABEL: Record<ModelRole, string> = {
  conversation: "Conversation",
  vision: "Vision",
  embeddings: "Embeddings",
};

const ROLE_ORDER: ModelRole[] = ["conversation", "vision", "embeddings"];

function classifyModel(id: string, supportsVision?: boolean): ModelRole {
  if (/embed/i.test(id)) return "embeddings";
  if (supportsVision || /moondream|llava|bakllava|minicpm.?v|qwen.?vl|phi.?vision|cogvlm|internvl/i.test(id)) return "vision";
  return "conversation";
}

function groupByRole(models: StoredModel[]): Partial<Record<ModelRole, StoredModel[]>> {
  const groups: Partial<Record<ModelRole, StoredModel[]>> = {};
  for (const m of models) {
    const role = classifyModel(m.id, m.supportsVision);
    if (!groups[role]) groups[role] = [];
    groups[role]!.push(m);
  }
  return groups;
}

interface ModelDiff {
  isFirst: boolean;
  added: StoredModel[];
  removed: StoredModel[];
  unchanged: StoredModel[];
  now: StoredModel[];
}

export function EmptyState({ onStartChatting: _onStartChatting, onOpenSettings }: EmptyStateProps) {
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

  const [diff, setDiff] = useState<ModelDiff | null>(null);

  useEffect(() => {
    if (!providerStatus) return;
    const now: StoredModel[] = providerStatus.providers
      .filter(p => p.status === "online")
      .flatMap(p => p.models.map(m => ({ id: m.id, supportsVision: m.supportsVision })));

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setDiff({ isFirst: true, added: [], removed: [], unchanged: [], now });
      } else {
        const before: StoredModel[] = JSON.parse(raw);
        const added = now.filter(m => !before.some(b => b.id === m.id));
        const removed = before.filter(b => !now.some(n => n.id === b.id));
        const unchanged = now.filter(m => before.some(b => b.id === m.id));
        if (added.length > 0 || removed.length > 0) {
          setDiff({ isFirst: false, added, removed, unchanged, now });
        } else {
          setDiff(null);
        }
      }
    } catch {
      setDiff({ isFirst: true, added: [], removed: [], unchanged: [], now });
    }
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

  const allProviders = providerStatus?.providers ?? [];
  const onlineProviders = allProviders.filter(p => p.status === "online");
  const offlineProviders = allProviders.filter(p => p.status === "offline");
  const suggested = providerStatus?.suggested ?? [];
  const anyOnline = onlineProviders.length > 0;
  const anyConfigured = allProviders.length > 0;

  const groups = diff ? groupByRole(diff.now) : {};
  const activeRoles = ROLE_ORDER.filter(r => groups[r]?.length);

  return (
    <div className="flex flex-col items-center justify-center h-full px-4" data-testid="empty-state-briefing">
      <div className="w-full max-w-sm space-y-6">

        <p className="text-2xl font-light tracking-tight">{status?.greeting ?? "Good morning"}.</p>

        {diff?.isFirst ? (
          <div className="space-y-4 font-mono">
            <p className="text-sm text-muted-foreground">First model inventory.</p>
            {diff.now.length > 0 ? (
              <div className="space-y-3">
                {activeRoles.map(role => (
                  <div key={role} className="space-y-1">
                    <p className="text-muted-foreground uppercase tracking-widest text-[10px]">{ROLE_LABEL[role]}</p>
                    {groups[role]!.map(m => (
                      <p key={m.id} className="text-xs">· {m.id}</p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No models detected yet.</p>
            )}
          </div>
        ) : diff && !diff.isFirst ? (
          <div className="space-y-3 font-mono">
            <p className="text-sm text-muted-foreground">Model inventory changed.</p>
            {diff.added.length > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase tracking-widest text-[10px]">Added</p>
                {diff.added.map(m => (
                  <p key={m.id} className="text-xs text-emerald-600 dark:text-emerald-400">+ {m.id}</p>
                ))}
              </div>
            )}
            {diff.removed.length > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase tracking-widest text-[10px]">Removed</p>
                {diff.removed.map(m => (
                  <p key={m.id} className="text-xs text-destructive">- {m.id}</p>
                ))}
              </div>
            )}
            {diff.unchanged.length > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase tracking-widest text-[10px]">Unchanged</p>
                {diff.unchanged.map(m => (
                  <p key={m.id} className="text-xs text-muted-foreground">✓ {m.id}</p>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground font-mono">
          {anyOnline
            ? "….Ready"
            : anyConfigured
              ? (
                <>
                  {offlineProviders.map((p, i) => (
                    <span key={p.connectionId}>
                      {i > 0 && " · "}
                      {p.name} — offline
                    </span>
                  ))}
                  {onOpenSettings && (
                    <>
                      {" "}
                      <button
                        onClick={onOpenSettings}
                        className="underline underline-offset-2 hover:opacity-60 transition-opacity text-foreground"
                        data-testid="button-open-settings-from-briefing"
                      >
                        Check settings
                      </button>
                    </>
                  )}
                </>
              )
              : suggested.length > 0
                ? (
                  <>
                    {suggested[0].name} found but not configured.{" "}
                    {onOpenSettings && (
                      <button
                        onClick={onOpenSettings}
                        className="underline underline-offset-2 hover:opacity-60 transition-opacity text-foreground"
                        data-testid="button-open-settings-from-briefing"
                      >
                        Add connection
                      </button>
                    )}
                  </>
                )
                : (
                  <>
                    No AI found.{" "}
                    {onOpenSettings && (
                      <button
                        onClick={onOpenSettings}
                        className="underline underline-offset-2 hover:opacity-60 transition-opacity text-foreground"
                        data-testid="button-open-settings-from-briefing"
                      >
                        Add a connection
                      </button>
                    )}
                  </>
                )
          }
        </p>

      </div>
    </div>
  );
}
