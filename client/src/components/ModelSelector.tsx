import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Sparkles, Loader2, Download, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { queryClient } from "@/lib/queryClient";
import type { Connection } from "@shared/schema";

export interface Model {
  id: string;
  name: string;
  size?: string;
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between gap-2"
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
        <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
          {models.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onModelChange(model.id)}
              className="py-2"
              data-testid={`option-model-${model.id}`}
            >
              <div className="flex items-center justify-between w-full gap-2">
                <span className="font-medium truncate">{model.name}</span>
                {model.size && (
                  <Badge variant="secondary" className="text-xs shrink-0">{model.size}</Badge>
                )}
              </div>
            </DropdownMenuItem>
          ))}
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
