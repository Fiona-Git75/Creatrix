import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, CheckCircle, XCircle, Loader2, Settings as SettingsIcon, Server, FolderOpen, X } from "lucide-react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Connection, ProviderType, Settings } from "@shared/schema";

interface ConnectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultEndpoints: Record<ProviderType, string> = {
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234/v1",
  custom: "",
};

const defaultModels: Record<ProviderType, string> = {
  openai: "gpt-4o",
  ollama: "mistral:latest",
  lmstudio: "local-model",
  custom: "default",
};

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
      endpoint: defaultEndpoints.ollama,
      apiKey: "",
      defaultModel: defaultModels.ollama,
      isDefault: false,
    });
  };

  const handleProviderChange = (provider: ProviderType) => {
    setNewConnection({
      ...newConnection,
      provider,
      endpoint: defaultEndpoints[provider],
      defaultModel: defaultModels[provider],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnection.name || !newConnection.endpoint) return;
    createMutation.mutate({
      ...newConnection,
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
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-4">No connections configured</p>
            <Button onClick={() => setIsAdding(true)} data-testid="button-add-first-connection">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Connection
            </Button>
          </div>
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
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newConnection.name}
                  onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })}
                  placeholder="My Local Ollama"
                  data-testid="input-connection-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={newConnection.provider}
                  onValueChange={(v) => handleProviderChange(v as ProviderType)}
                >
                  <SelectTrigger data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ollama">Ollama (Local)</SelectItem>
                    <SelectItem value="lmstudio">LM Studio (Local)</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="custom">Custom API</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endpoint">Endpoint URL</Label>
                <Input
                  id="endpoint"
                  value={newConnection.endpoint}
                  onChange={(e) => setNewConnection({ ...newConnection, endpoint: e.target.value })}
                  placeholder="http://localhost:11434"
                  data-testid="input-connection-endpoint"
                />
              </div>

              {(newConnection.provider === "openai" || newConnection.provider === "custom") && (
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key (optional)</Label>
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

              <div className="space-y-2">
                <Label htmlFor="defaultModel">Default Model</Label>
                <Input
                  id="defaultModel"
                  value={newConnection.defaultModel}
                  onChange={(e) => setNewConnection({ ...newConnection, defaultModel: e.target.value })}
                  placeholder="llama3.2"
                  data-testid="input-connection-model"
                />
              </div>

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
                  disabled={createMutation.isPending}
                  data-testid="button-save-connection"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Connection
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
  const { data, isLoading } = useQuery<{ healthy: boolean }>({
    queryKey: ["/api/connections", connectionId, "health"],
    staleTime: 60000,
  });

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return data?.healthy ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-destructive" />
  );
}
