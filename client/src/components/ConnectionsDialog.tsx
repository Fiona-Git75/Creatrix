import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, CheckCircle, XCircle, Loader2, Settings as SettingsIcon, Server, FolderOpen, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Connection, ProviderType, Settings } from "@shared/schema";

interface ConnectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DiscoveredProvider { name: string; provider: string; endpoint: string; models: string[]; }

function DiscoveryPanel({ onUse, onManual }: {
  onUse: (name: string, provider: ProviderType, endpoint: string, model: string) => void;
  onManual: () => void;
}) {
  const { data, isLoading, refetch } = useQuery<{ providers: DiscoveredProvider[] }>({
    queryKey: ["/api/discover"],
    retry: false,
    staleTime: 0,
  });

  const found = data?.providers ?? [];

  return (
    <div className="space-y-5 py-2">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Scanning local AI…
        </div>
      ) : found.length > 0 ? (
        <p className="text-sm font-medium">Local AI detected</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No local AI found.</p>
          <p className="text-xs text-muted-foreground">
            Start Ollama or LM Studio, then scan again.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-rescan">
            Scan again
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {found.map(p => (
          <Card key={p.endpoint} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              <span className="font-medium">{p.name}</span>
            </div>

            {p.models.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {p.models.length} {p.models.length === 1 ? "model" : "models"} available
                </p>
                <div className="space-y-0.5">
                  {p.models.map(m => (
                    <p key={m} className="text-sm">{m}</p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No models installed yet</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                onClick={() => onUse(p.name, p.provider as ProviderType, p.endpoint, p.models[0] || "")}
                data-testid={`button-use-${p.provider}`}
              >
                Use this
              </Button>
              {!isLoading && (
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs text-muted-foreground h-7" data-testid="button-rescan">
                  Scan again
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="pt-1 border-t">
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onManual} data-testid="button-configure-manually">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Connect to a remote or custom AI
        </Button>
      </div>
    </div>
  );
}

const defaultModels: Record<ProviderType, string> = {
  openai: "gpt-4o",
  ollama: "mistral:latest",
  lmstudio: "local-model",
  custom: "default",
};

function detectProvider(url: string): { provider: ProviderType; name: string; model: string } {
  if (url.includes("api.openai.com")) return { provider: "openai", name: "OpenAI", model: "gpt-4o" };
  if (url.includes("localhost:11434") || url.includes("127.0.0.1:11434")) return { provider: "ollama", name: "Ollama", model: "mistral:latest" };
  if (url.includes("localhost:1234") || url.includes("127.0.0.1:1234")) return { provider: "lmstudio", name: "LM Studio", model: "local-model" };
  try {
    const hostname = new URL(url).hostname;
    return { provider: "custom", name: hostname || "Remote AI", model: "default" };
  } catch {
    return { provider: "custom", name: "Remote AI", model: "default" };
  }
}

function ConnectionsTab() {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [newConnection, setNewConnection] = useState({
    name: "",
    provider: "ollama" as ProviderType,
    endpoint: defaultEndpoints.ollama,
    apiKey: "",
    defaultModel: defaultModels.ollama,
    isDefault: false,
  });

  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newConnection) =>
      await apiRequest("POST", "/api/connections", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      setIsAdding(false);
      resetForm();
      toast({ title: "Connection added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add connection", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/connections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      toast({ title: "Connection deleted" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/connections/${id}`, { isDefault: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
    },
  });

  const resetForm = () => {
    setNewConnection({
      name: "",
      provider: "ollama",
      endpoint: "",
      apiKey: "",
      defaultModel: "",
      isDefault: false,
    });
  };

  const handleProviderChange = (provider: ProviderType) => {
    setNewConnection({ ...newConnection, provider, defaultModel: defaultModels[provider] });
  };

  const handleEndpointChange = (url: string) => {
    const detected = detectProvider(url);
    setNewConnection(prev => ({
      ...prev,
      endpoint: url,
      provider: detected.provider,
      name: prev.name || detected.name,
      defaultModel: prev.defaultModel || detected.model,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnection.endpoint) return;
    const detected = detectProvider(newConnection.endpoint);
    createMutation.mutate({
      ...newConnection,
      name: newConnection.name || detected.name,
      defaultModel: newConnection.defaultModel || detected.model,
      isDefault: connections.length === 0,
    });
  };

  const providerLabels: Record<ProviderType, string> = {
    openai: "OpenAI",
    ollama: "Ollama (Local)",
    lmstudio: "LM Studio (Local)",
    custom: "Custom API",
  };

  return (
    <ScrollArea className="h-[480px]">
      <div className="space-y-4 pr-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : connections.length === 0 && !isAdding ? (
          <DiscoveryPanel
            onUse={(name, provider, endpoint, model) => {
              createMutation.mutate({ name, provider, endpoint, apiKey: "", defaultModel: model, isDefault: true });
            }}
            onManual={() => setIsAdding(true)}
          />
        ) : (
          <>
            {connections.map((connection) => (
              <Card key={connection.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{connection.name}</span>
                      {connection.isDefault && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {providerLabels[connection.provider as ProviderType]}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {connection.endpoint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ConnectionHealth connectionId={connection.id} />
                    {!connection.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDefaultMutation.mutate(connection.id)}
                        data-testid={`button-set-default-${connection.id}`}
                      >
                        Set Default
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(connection.id)}
                      data-testid={`button-delete-connection-${connection.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {!isAdding && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setIsAdding(true)}
                data-testid="button-add-connection"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Connection
              </Button>
            )}
          </>
        )}

        {isAdding && (
          <Card className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="endpoint">URL</Label>
                <Input
                  id="endpoint"
                  value={newConnection.endpoint}
                  onChange={(e) => handleEndpointChange(e.target.value)}
                  placeholder="https://api.openai.com/v1  or  http://my-server:11434"
                  autoFocus
                  data-testid="input-connection-endpoint"
                />
                {newConnection.endpoint && (
                  <p className="text-xs text-muted-foreground">
                    Detected: {providerLabels[newConnection.provider]}
                  </p>
                )}
              </div>

              {(newConnection.provider === "openai" || newConnection.provider === "custom") && (
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={newConnection.apiKey}
                    onChange={(e) => setNewConnection({ ...newConnection, apiKey: e.target.value })}
                    placeholder="sk-..."
                    data-testid="input-connection-apikey"
                  />
                </div>
              )}

              <details className="group">
                <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none list-none">
                  <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                  Advanced
                </summary>
                <div className="pt-3 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={newConnection.name}
                      onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })}
                      placeholder={detectProvider(newConnection.endpoint).name || "My AI"}
                      data-testid="input-connection-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider type</Label>
                    <Select
                      value={newConnection.provider}
                      onValueChange={(v) => handleProviderChange(v as ProviderType)}
                    >
                      <SelectTrigger data-testid="select-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ollama">Ollama</SelectItem>
                        <SelectItem value="lmstudio">LM Studio</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultModel">Default model</Label>
                    <Input
                      id="defaultModel"
                      value={newConnection.defaultModel}
                      onChange={(e) => setNewConnection({ ...newConnection, defaultModel: e.target.value })}
                      placeholder={detectProvider(newConnection.endpoint).model || "model-name"}
                      data-testid="input-connection-model"
                    />
                  </div>
                </div>
              </details>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setIsAdding(false); resetForm(); }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !newConnection.endpoint}
                  data-testid="button-save-connection"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Connect
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

function SettingsTab() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const [rootFolder, setRootFolder] = useState<string>("");
  const [whisperEndpoint, setWhisperEndpoint] = useState<string>("");
  const [libraryPaths, setLibraryPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (settings && !initialized) {
    setRootFolder(settings.rootFolder || "");
    setWhisperEndpoint(settings.whisperEndpoint || "");
    setLibraryPaths(settings.libraryPaths || []);
    setInitialized(true);
  }

  const addLibraryPath = () => {
    const trimmed = newPath.trim();
    if (!trimmed || libraryPaths.includes(trimmed)) return;
    const updated = [...libraryPaths, trimmed];
    setLibraryPaths(updated);
    setNewPath("");
    updateMutation.mutate({ libraryPaths: updated });
  };

  const removeLibraryPath = (index: number) => {
    const updated = libraryPaths.filter((_, i) => i !== index);
    setLibraryPaths(updated);
    updateMutation.mutate({ libraryPaths: updated.length > 0 ? updated : undefined });
  };

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Settings>) => apiRequest("PATCH", "/api/settings", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Root Folder */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Root Folder</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          The base folder for filesystem tools (read_file, create_note, etc.). Leave empty to disable filesystem access.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="/home/user/notes"
            value={rootFolder}
            onChange={(e) => setRootFolder(e.target.value)}
            className="font-mono text-sm"
            data-testid="input-root-folder"
          />
          <Button
            onClick={() => updateMutation.mutate({ rootFolder: rootFolder || undefined })}
            disabled={updateMutation.isPending}
            size="sm"
            data-testid="button-save-root-folder"
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
        {rootFolder && (
          <p className="text-xs text-green-600 dark:text-green-400">
            Filesystem tools will operate within: <span className="font-mono">{rootFolder}</span>
          </p>
        )}
      </div>

      <Separator />

      {/* Library Paths */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Additional Library Paths</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Add multiple folders the resident can access. Each path is an independent access root — files anywhere inside will be readable.
        </p>
        <div className="space-y-2">
          {libraryPaths.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 font-mono text-xs text-muted-foreground bg-muted rounded px-2 py-1 truncate" title={p}>{p}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => removeLibraryPath(i)}
                data-testid={`button-remove-library-path-${i}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="/home/user/research"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLibraryPath()}
              className="font-mono text-sm"
              data-testid="input-new-library-path"
            />
            <Button
              onClick={addLibraryPath}
              disabled={updateMutation.isPending || !newPath.trim()}
              size="sm"
              variant="outline"
              data-testid="button-add-library-path"
            >
              Add
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* Whisper Endpoint */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Whisper Endpoint</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Local whisper.cpp server for audio transcription. Leave empty if you don't need audio transcription.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="http://localhost:8080/v1"
            value={whisperEndpoint}
            onChange={(e) => setWhisperEndpoint(e.target.value)}
            className="font-mono text-sm"
            data-testid="input-whisper-endpoint"
          />
          <Button
            onClick={() => updateMutation.mutate({ whisperEndpoint: whisperEndpoint || undefined })}
            disabled={updateMutation.isPending}
            size="sm"
            data-testid="button-save-whisper-endpoint"
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
        {whisperEndpoint && (
          <p className="text-xs text-green-600 dark:text-green-400">
            Audio transcription will use: <span className="font-mono">{whisperEndpoint}</span>
          </p>
        )}
      </div>

      <Separator />

      {/* Morning Orientation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Morning Orientation</h3>
          </div>
          <Switch
            checked={settings?.morningOrientationEnabled ?? false}
            onCheckedChange={(checked) => updateMutation.mutate({ morningOrientationEnabled: checked })}
            data-testid="switch-morning-orientation"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Show a collapsible summary in the sidebar with yesterday's activity and any open questions.
        </p>
      </div>

      <Separator />

      {/* Theme */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Theme</h3>
        <Select
          value={settings?.theme ?? "system"}
          onValueChange={(v) => updateMutation.mutate({ theme: v as Settings["theme"] })}
        >
          <SelectTrigger data-testid="select-theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function ConnectionsDialog({ open, onOpenChange }: ConnectionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="connections">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="connections" className="gap-1.5" data-testid="tab-connections">
              <Server className="h-3.5 w-3.5" />
              Connections
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5" data-testid="tab-settings">
              <SettingsIcon className="h-3.5 w-3.5" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="mt-4">
            <ConnectionsTab />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionHealth({ connectionId }: { connectionId: string }) {
  const { data, isLoading } = useQuery<{ healthy: boolean; reason: string | null }>({
    queryKey: ["/api/connections", connectionId, "health"],
    staleTime: 60000,
  });

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (data?.healthy) {
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <XCircle className="h-4 w-4 text-destructive cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">{data?.reason || "Not responding"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
