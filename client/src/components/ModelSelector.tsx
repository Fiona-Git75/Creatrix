import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Sparkles, Loader2, Download, AlertCircle, RefreshCw, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { queryClient } from "@/lib/queryClient";
import type { Connection } from "@shared/schema";

export type ToolSupport = "native" | "text" | "limited" | "none";

export interface Model {
  id: string;
  name: string;
  size?: string;
  toolSupport?: ToolSupport;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
  notes?: string[];
}

function toolSupportLabel(support?: ToolSupport): { symbol: string; label: string; className: string } {
  switch (support) {
    case "native":  return { symbol: "✓", label: "native",   className: "text-green-500" };
    case "text":    return { symbol: "✓", label: "tools",    className: "text-green-500/70" };
    case "limited": return { symbol: "⚠", label: "limited",  className: "text-yellow-500" };
    case "none":    return { symbol: "✗", label: "no tools", className: "text-muted-foreground" };
    default:        return { symbol: "·", label: "",          className: "text-muted-foreground/40" };
  }
}

// ── Tool display helpers ──────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search", retrieve_url: "Read URLs",
  search_library: "Library Search", save_conversation: "Save Chats",
  read_file: "Read Files", write_file: "Write Files", list_files: "List Files",
  create_file: "Create Files", delete_file: "Delete Files",
  run_command: "Terminal", transcribe: "Transcription",
  notion_search: "Notion Search", notion_read: "Notion Pages", notion_create: "Notion Write",
};

function toLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function groupByCategory(tools: { name: string }[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const add = (g: string, n: string) => { if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(n); };
  for (const t of tools) {
    if (t.name.startsWith("notion"))                                                     add("Notes", t.name);
    else if (t.name === "web_search" || t.name === "retrieve_url")                       add("Web", t.name);
    else if (t.name === "search_library")                                                add("Library", t.name);
    else if (t.name === "run_command")                                                   add("Terminal", t.name);
    else if (["read_file","write_file","list_files","create_file","delete_file"].includes(t.name)) add("Files", t.name);
    else if (t.name === "transcribe" || t.name.includes("audio") || t.name.includes("whisper")) add("Transcription", t.name);
    else if (t.name === "save_conversation")                                             add("Memory", t.name);
    else                                                                                 add(toLabel(t.name), t.name);
  }
  return groups;
}

function groupInactiveReasons(tools: { name: string; reason: string }[]): Map<string, string> {
  const seen = new Map<string, string>();
  for (const t of tools) {
    const label =
      t.reason.includes("root folder") ? "Files" :
      t.reason.includes("Notion")      ? "Notes" :
      t.reason.includes("Whisper")     ? "Transcription" :
      toLabel(t.name);
    if (!seen.has(label)) seen.set(label, t.reason.split("—")[0].trim());
  }
  return seen;
}

const CAPABILITY_INFO: Record<ToolSupport, { label: string; description: string; className: string }> = {
  native:  { label: "Native tools",  className: "bg-green-500/10 text-green-700 dark:text-green-400",  description: "Full structured tool API — reliable invocation" },
  text:    { label: "Text tools",    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",    description: "Text-based protocol — should work, may occasionally misformat" },
  limited: { label: "Limited tools", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400", description: "Jinja translation layer active — tools less reliable than native" },
  none:    { label: "No tools",      className: "bg-red-500/10 text-red-700 dark:text-red-400",       description: "Parameter size too small — tool calls disabled for this model" },
};

interface ToolsStatusResponse {
  active:   { name: string; description: string }[];
  inactive: { name: string; description: string; reason: string }[];
}

// ── Model profile card ────────────────────────────────────────────────────────

function ModelProfileCard({ model, connection }: { model: Model; connection: Connection }) {
  const { data: toolsStatus, isLoading: toolsLoading } = useQuery<ToolsStatusResponse>({
    queryKey: ["/api/tools/status"],
    staleTime: 60_000,
  });

  const canUseTools = model.toolSupport !== "none";
  const capInfo = CAPABILITY_INFO[model.toolSupport ?? "text"];

  const activeGroups   = groupByCategory(toolsStatus?.active ?? []);
  const inactiveGroups = groupInactiveReasons(toolsStatus?.inactive ?? []);

  const verdict =
    !canUseTools              ? { label: "TOOLS DISABLED",     className: "text-red-600 dark:text-red-400" } :
    model.toolSupport === "limited" ? { label: "LIMITED",      className: "text-amber-600 dark:text-amber-400" } :
    activeGroups.size === 0   ? { label: "NO TOOLS CONFIGURED",className: "text-amber-600 dark:text-amber-400" } :
                                { label: "READY",              className: "text-green-600 dark:text-green-400" };

  const hostLabel =
    connection.provider === "ollama"   ? "Ollama · local" :
    connection.provider === "lmstudio" ? "LM Studio · local" :
    connection.provider === "openai"   ? "OpenAI" :
    connection.endpoint;

  return (
    <div className="space-y-4 text-sm" data-testid="model-profile-card">

      {/* Identity */}
      <div>
        <p className="font-semibold truncate mb-2">{model.name}</p>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
          <span className="text-muted-foreground">Host</span><span>{hostLabel}</span>
          {model.family      && <><span className="text-muted-foreground">Family</span><span>{model.family}</span></>}
          {model.parameterSize && <><span className="text-muted-foreground">Parameters</span><span>{model.parameterSize}</span></>}
          {model.quantization  && <><span className="text-muted-foreground">Quantization</span><span>{model.quantization}</span></>}
          {model.contextLength  ? <><span className="text-muted-foreground">Context</span><span>{model.contextLength.toLocaleString()} tokens</span></> : null}
        </div>
      </div>

      {/* Tool capability level */}
      <div className="space-y-1.5">
        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded tracking-wide ${capInfo.className}`}>
          {capInfo.label.toUpperCase()}
        </span>
        <p className="text-xs text-muted-foreground leading-snug">{capInfo.description}</p>
      </div>

      {/* Creatrix tool compatibility */}
      <div className="border-t pt-3 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Creatrix tools
        </p>

        {toolsLoading && (
          <p className="text-xs text-muted-foreground">Checking tools…</p>
        )}

        {/* Active tool groups */}
        {Array.from(activeGroups.entries()).map(([group]) => (
          <div key={group} className="flex items-center justify-between text-xs">
            <span>{group}</span>
            {!canUseTools ? (
              <span className="text-red-500 font-medium">✗</span>
            ) : model.toolSupport === "limited" ? (
              <span className="text-amber-500">⚠</span>
            ) : (
              <span className="text-green-500">✓</span>
            )}
          </div>
        ))}

        {/* Inactive tool groups (not configured) */}
        {Array.from(inactiveGroups.entries()).map(([group, reason]) => (
          <div key={group} className="flex items-center justify-between text-xs text-muted-foreground/50" title={reason}>
            <span>{group}</span>
            <span>—</span>
          </div>
        ))}

        {!toolsLoading && activeGroups.size === 0 && inactiveGroups.size === 0 && (
          <p className="text-xs text-muted-foreground">No tools available</p>
        )}

        {/* Model-level tool block explanation */}
        {!canUseTools && activeGroups.size > 0 && (
          <p className="text-xs text-red-600/70 dark:text-red-400/70 pt-1">
            ↳ Tools are configured but this model cannot use them
          </p>
        )}
      </div>

      {/* Warnings from model profile */}
      {model.notes && model.notes.length > 0 && (
        <div className="border-t pt-3 space-y-1">
          {model.notes.map((n, i) => (
            <p key={i} className="text-xs text-muted-foreground leading-snug">↳ {n}</p>
          ))}
        </div>
      )}

      {/* Overall verdict */}
      <div className="border-t pt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Overall</span>
        <span className={`text-xs font-bold tracking-widest ${verdict.className}`}>{verdict.label}</span>
      </div>
    </div>
  );
}

interface ModelsResponse {
  status: "ok" | "offline" | "empty" | "error";
  message?: string;
  models: Model[];
}

interface CatalogModel {
  id: string;
  name: string;
  description: string;
  size: string;
  tags: string[];
}

interface ModelSelectorProps {
  selectedModel: string;
  connectionId: string | null;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, connectionId, onModelChange }: ModelSelectorProps) {
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ status: string; percent: number } | null>(null);

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: providerStatus, isLoading, refetch } = useQuery<{
    providers: { connectionId: string; name: string; type: string; status: "online" | "offline"; models: Model[] }[];
  }>({
    queryKey: ["/api/providers/status"],
    staleTime: 30_000,
  });

  const { data: catalog = [] } = useQuery<CatalogModel[]>({
    queryKey: ["/api/models/catalog"],
  });

  const activeConnection = connectionId
    ? connections.find((c) => c.id === connectionId)
    : connections.find((c) => c.isDefault) || connections[0];

  const activeProvider = providerStatus?.providers.find(
    p => p.connectionId === (connectionId ?? activeConnection?.id)
  );

  const status: "ok" | "offline" | "empty" | "error" =
    !activeProvider ? "offline" :
    activeProvider.status === "offline" ? "offline" :
    activeProvider.models.length === 0 ? "empty" : "ok";
  const models: Model[] = activeProvider?.models ?? [];
  const statusMessage = "";

  const currentModel = models.find((m) => m.id === selectedModel) || models[0];

  // Self-correct: if stored selectedModel isn't in the live list, adopt the resolved model
  useEffect(() => {
    if (!models.length || !currentModel) return;
    if (currentModel.id !== selectedModel) {
      onModelChange(currentModel.id);
    }
  }, [models.length, currentModel?.id]);

  const handleDownloadModel = async (modelId: string) => {
    if (!activeConnection) return;
    
    setDownloadingModel(modelId);
    setDownloadProgress({ status: "Starting download...", percent: 0 });

    let lastPercent = 0;

    try {
      const response = await fetch(`/api/connections/${activeConnection.id}/models/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: modelId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start download");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.status === "success") {
                setDownloadProgress({ status: "Download complete!", percent: 100 });
                queryClient.invalidateQueries({ queryKey: ["/api/providers/status"] });
                onModelChange(modelId);
                setTimeout(() => {
                  setDownloadDialogOpen(false);
                  setDownloadingModel(null);
                  setDownloadProgress(null);
                }, 1500);
                return;
              } else if (data.status === "error") {
                throw new Error(data.message);
              } else if (data.total && data.completed) {
                const percent = Math.round((data.completed / data.total) * 100);
                lastPercent = percent;
                setDownloadProgress({ status: data.status || "Downloading...", percent });
              } else {
                setDownloadProgress({ status: data.status || "Downloading...", percent: lastPercent });
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // Process any remaining buffer content
      if (buffer.startsWith("data: ")) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (data.status === "success") {
            setDownloadProgress({ status: "Download complete!", percent: 100 });
            queryClient.invalidateQueries({ queryKey: ["/api/connections", activeConnection.id, "models"] });
            onModelChange(modelId);
            setTimeout(() => {
              setDownloadDialogOpen(false);
              setDownloadingModel(null);
              setDownloadProgress(null);
            }, 1500);
            return;
          }
        } catch {
          // Ignore
        }
      }
    } catch (error: any) {
      setDownloadProgress({ status: `Error: ${error.message}`, percent: 0 });
      setTimeout(() => {
        setDownloadingModel(null);
        setDownloadProgress(null);
      }, 3000);
    }
  };

  if (isLoading || !activeConnection) {
    return (
      <Button variant="outline" className="w-full gap-2" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading models...
      </Button>
    );
  }

  // Offline state - show helpful guidance
  if (status === "offline") {
    return (
      <div className="space-y-2">
        <Button 
          variant="outline" 
          className="w-full gap-2 border-destructive/50" 
          onClick={() => refetch()}
          data-testid="button-model-offline"
        >
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm truncate">{activeConnection.provider === "ollama" ? "Ollama Offline" : "Connection Failed"}</span>
          <RefreshCw className="h-3 w-3 ml-auto" />
        </Button>
        <p className="text-xs text-muted-foreground px-1">
          {activeConnection.provider === "ollama" && (
            <>Start Ollama on your system to continue</>
          )}
          {activeConnection.provider === "lmstudio" && (
            <>Start LM Studio and enable the local server</>
          )}
        </p>
      </div>
    );
  }

  // Empty state - show download options for Ollama
  if (status === "empty") {
    return (
      <div className="space-y-2">
        {activeConnection.provider === "ollama" ? (
          <>
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={() => setDownloadDialogOpen(true)}
              data-testid="button-download-model"
            >
              <Download className="h-4 w-4" />
              <span className="text-sm">Download a Model</span>
            </Button>
            <p className="text-xs text-muted-foreground px-1">
              No models installed. Download one to get started.
            </p>
          </>
        ) : (
          <>
            <Button variant="outline" className="w-full gap-2" disabled>
              <Sparkles className="h-4 w-4" />
              <span className="text-sm">No models available</span>
            </Button>
            <p className="text-xs text-muted-foreground px-1">
              {statusMessage}
            </p>
          </>
        )}

        <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Download a Model</DialogTitle>
              <DialogDescription>
                Choose a model to download. Models are stored locally on your system.
              </DialogDescription>
            </DialogHeader>
            
            {downloadingModel ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-medium">{downloadingModel}</span>
                </div>
                <Progress value={downloadProgress?.percent || 0} />
                <p className="text-sm text-muted-foreground">{downloadProgress?.status}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {catalog.map((model) => (
                  <Card 
                    key={model.id} 
                    className="p-3 hover-elevate cursor-pointer"
                    onClick={() => handleDownloadModel(model.id)}
                    data-testid={`card-model-${model.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{model.name}</div>
                        <p className="text-sm text-muted-foreground">{model.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">{model.size}</Badge>
                          {model.tags.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Normal state - show model selector
  return (
    <>
      <div className="flex gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex-1 justify-between gap-2 min-w-0"
              data-testid="button-model-selector"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium truncate">{currentModel?.name || selectedModel}</span>
                {currentModel?.size && (
                  <Badge variant="secondary" className="text-xs shrink-0">{currentModel.size}</Badge>
                )}
              </div>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
            {/* Provider status header */}
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span className="text-xs text-muted-foreground font-medium truncate">
                {activeConnection?.name ?? "Unknown"}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                {models.length} {models.length === 1 ? "model" : "models"}
              </span>
            </div>
            <DropdownMenuSeparator />
            {models.map((model) => {
              const ts = toolSupportLabel(model.toolSupport);
              return (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => onModelChange(model.id)}
                  className="py-2"
                  data-testid={`option-model-${model.id}`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="min-w-0">
                      <span className="font-medium truncate block">{model.name}</span>
                      {model.toolSupport && (
                        <span className={`text-[10px] ${ts.className}`}>
                          {ts.symbol} {ts.label}
                        </span>
                      )}
                    </div>
                    {model.size && (
                      <Badge variant="secondary" className="text-xs shrink-0">{model.size}</Badge>
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}
          {activeConnection?.provider === "ollama" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setDownloadDialogOpen(true)}
                className="py-2"
                data-testid="option-download-more"
              >
                <Download className="h-4 w-4 mr-2" />
                Download more models
              </DropdownMenuItem>
            </>
          )}
          </DropdownMenuContent>
        </DropdownMenu>

        {currentModel && activeConnection && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9"
                data-testid="button-model-profile"
              >
                <Info className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4">
              <ModelProfileCard model={currentModel} connection={activeConnection} />
            </PopoverContent>
          </Popover>
        )}
      </div>

      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Download a Model</DialogTitle>
            <DialogDescription>
              Choose a model to download. Models are stored locally on your system.
            </DialogDescription>
          </DialogHeader>
          
          {downloadingModel ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-medium">{downloadingModel}</span>
              </div>
              <Progress value={downloadProgress?.percent || 0} />
              <p className="text-sm text-muted-foreground">{downloadProgress?.status}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {catalog.filter(c => !models.some(m => m.id === c.id)).map((model) => (
                <Card 
                  key={model.id} 
                  className="p-3 hover-elevate cursor-pointer"
                  onClick={() => handleDownloadModel(model.id)}
                  data-testid={`card-model-${model.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{model.name}</div>
                      <p className="text-sm text-muted-foreground">{model.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{model.size}</Badge>
                        {model.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </Card>
              ))}
              {catalog.filter(c => !models.some(m => m.id === c.id)).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  All recommended models are already installed!
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
