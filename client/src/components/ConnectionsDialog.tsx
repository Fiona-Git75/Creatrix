import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, CheckCircle, XCircle, Loader2, Settings as SettingsIcon, Server, FolderOpen, X, ChevronDown, Search, Sparkles, Pencil, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Connection, ProviderType, Settings } from "@shared/schema";

interface ConnectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SuggestedProvider { name: string; type: string; endpoint: string; models: string[]; }
interface ProvidersStatusResponse {
  providers: { connectionId: string; name: string; type: string; status: "online" | "offline"; models: { id: string }[] }[];
  suggested: SuggestedProvider[];
}

function DiscoveryPanel({ onUse, onManual }: {
  onUse: (name: string, provider: ProviderType, endpoint: string, defaultModel: string) => void;
  onManual: () => void;
}) {
  const { data, isLoading } = useQuery<ProvidersStatusResponse>({
    queryKey: ["/api/providers/status"],
    retry: false,
    staleTime: 0,
  });

  // POST to force-refresh bypasses the server-side 30s cache so scanConnection
  // actually runs instead of returning stale "offline" results
  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/providers/refresh"),
    onSuccess: async (res) => {
      const fresh = await res.json();
      queryClient.setQueryData(["/api/providers/status"], fresh);
    },
  });

  useEffect(() => {
    scanMutation.mutate();
  }, []);

  const scanning = isLoading || scanMutation.isPending;
  const found = data?.suggested ?? [];

  return (
    <div className="space-y-5 py-2">
      {scanning ? (
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
          <Button variant="outline" size="sm" onClick={() => scanMutation.mutate()} disabled={scanning} data-testid="button-rescan">
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
                onClick={() => onUse(p.name, p.type as ProviderType, p.endpoint, p.models[0] ?? "")}
                data-testid={`button-use-${p.type}`}
              >
                Use this
              </Button>
              {!scanning && (
                <Button variant="ghost" size="sm" onClick={() => scanMutation.mutate()} className="text-xs text-muted-foreground h-7" data-testid="button-rescan">
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
  ollama: "",
  lmstudio: "",
  custom: "",
};

function detectProvider(url: string): { provider: ProviderType; name: string; model: string } {
  if (url.includes("api.openai.com")) return { provider: "openai", name: "OpenAI", model: "gpt-4o" };
  if (url.includes("localhost:11434") || url.includes("127.0.0.1:11434")) return { provider: "ollama", name: "Ollama", model: "" };
  if (url.includes("localhost:1234") || url.includes("127.0.0.1:1234")) return { provider: "lmstudio", name: "LM Studio", model: "" };
  try {
    const hostname = new URL(url).hostname;
    return { provider: "custom", name: hostname || "Remote AI", model: "" };
  } catch {
    return { provider: "custom", name: "Remote AI", model: "" };
  }
}

type EditForm = {
  name: string;
  provider: ProviderType;
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  maxImageSizeMb: string;
};

interface SortableConnectionCardProps {
  connection: Connection;
  editingId: string | null;
  editForm: EditForm;
  setEditForm: (form: EditForm) => void;
  onStartEditing: (c: Connection) => void;
  onCancelEdit: () => void;
  onEditSubmit: (e: React.FormEvent) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
  updateIsPending: boolean;
  providerLabels: Record<ProviderType, string>;
}

function SortableConnectionCard({
  connection,
  editingId,
  editForm,
  setEditForm,
  onStartEditing,
  onCancelEdit,
  onEditSubmit,
  onSetDefault,
  onDelete,
  deletingId,
  updateIsPending,
  providerLabels,
}: SortableConnectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: connection.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="p-4">
        {editingId === connection.id ? (
          <form onSubmit={onEditSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Edit connection</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onCancelEdit}
                data-testid={`button-cancel-edit-${connection.id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-endpoint-${connection.id}`}>URL</Label>
              <Input
                id={`edit-endpoint-${connection.id}`}
                value={editForm.endpoint}
                onChange={(e) => setEditForm({ ...editForm, endpoint: e.target.value })}
                placeholder="https://api.openai.com/v1"
                data-testid={`input-edit-endpoint-${connection.id}`}
              />
            </div>

            {(editForm.provider === "openai" || editForm.provider === "custom") && (
              <div className="space-y-2">
                <Label htmlFor={`edit-apikey-${connection.id}`}>API Key</Label>
                <Input
                  id={`edit-apikey-${connection.id}`}
                  type="password"
                  value={editForm.apiKey}
                  onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                  placeholder="sk-…  (leave blank to keep existing)"
                  data-testid={`input-edit-apikey-${connection.id}`}
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
                  <Label htmlFor={`edit-name-${connection.id}`}>Name</Label>
                  <Input
                    id={`edit-name-${connection.id}`}
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="My AI"
                    data-testid={`input-edit-name-${connection.id}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edit-provider-${connection.id}`}>Provider type</Label>
                  <Select
                    value={editForm.provider}
                    onValueChange={(v) => setEditForm({ ...editForm, provider: v as ProviderType })}
                  >
                    <SelectTrigger data-testid={`select-edit-provider-${connection.id}`}>
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
                  <Label htmlFor={`edit-model-${connection.id}`}>Default model</Label>
                  <Input
                    id={`edit-model-${connection.id}`}
                    value={editForm.defaultModel}
                    onChange={(e) => setEditForm({ ...editForm, defaultModel: e.target.value })}
                    placeholder="model-name"
                    data-testid={`input-edit-model-${connection.id}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edit-maximg-${connection.id}`}>Max image size (MB)</Label>
                  <Input
                    id={`edit-maximg-${connection.id}`}
                    type="number"
                    min="1"
                    value={editForm.maxImageSizeMb}
                    onChange={(e) => setEditForm({ ...editForm, maxImageSizeMb: e.target.value })}
                    placeholder={`Default: ${editForm.provider === "ollama" ? "10" : "20"}`}
                    data-testid={`input-edit-max-image-size-${connection.id}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use the provider default.
                  </p>
                </div>
              </div>
            </details>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
              <Button
                type="submit"
                disabled={updateIsPending || !editForm.endpoint}
                data-testid={`button-save-edit-${connection.id}`}
              >
                {updateIsPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-start gap-2">
            <div
              {...attributes}
              {...listeners}
              className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
              data-testid={`drag-handle-${connection.id}`}
            >
              <GripVertical className="h-4 w-4" />
            </div>
            <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
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
                {(() => {
                  const custom = connection.maxImageSizeMb != null;
                  const mb = custom ? connection.maxImageSizeMb : (connection.provider === "ollama" ? 10 : 20);
                  return (
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-image-limit-${connection.id}`}>
                      Image limit:{" "}
                      <span className={custom ? undefined : "opacity-60"}>
                        {mb} MB{custom ? "" : " (default)"}
                      </span>
                    </p>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ConnectionHealth connectionId={connection.id} />
                {!connection.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSetDefault(connection.id)}
                    data-testid={`button-set-default-${connection.id}`}
                  >
                    Set Default
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onStartEditing(connection)}
                  data-testid={`button-edit-connection-${connection.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(connection.id)}
                  disabled={deletingId === connection.id}
                  data-testid={`button-delete-connection-${connection.id}`}
                >
                  {deletingId === connection.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ConnectionsTab() {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    provider: "ollama",
    endpoint: "",
    apiKey: "",
    defaultModel: "",
    maxImageSizeMb: "",
  });
  const [newConnection, setNewConnection] = useState({
    name: "",
    provider: "ollama" as ProviderType,
    endpoint: "",
    apiKey: "",
    defaultModel: "",
    isDefault: false,
    maxImageSizeMb: "" as string,
  });
  const [localOrder, setLocalOrder] = useState<Connection[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; count: number } | null>(null);
  const [checkingUsage, setCheckingUsage] = useState<string | null>(null);

  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  useEffect(() => {
    setLocalOrder(connections);
  }, [connections]);

  type ConnectionCreatePayload = Omit<typeof newConnection, "maxImageSizeMb"> & { maxImageSizeMb?: number };

  const createMutation = useMutation({
    mutationFn: async (data: ConnectionCreatePayload) =>
      await apiRequest("POST", "/api/connections", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/status"] });
      setIsAdding(false);
      resetForm();
      toast({ title: "Connection added" });
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
      setDeleteConfirm(null);
      toast({ title: "Connection deleted" });
    },
  });

  const handleDeleteClick = async (id: string) => {
    setCheckingUsage(id);
    try {
      const res = await apiRequest("GET", `/api/connections/${id}/usage`);
      const { count } = await res.json();
      if (count > 0) {
        setDeleteConfirm({ id, count });
      } else {
        deleteMutation.mutate(id);
      }
    } catch {
      deleteMutation.mutate(id);
    } finally {
      setCheckingUsage(null);
    }
  };

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/connections/${id}`, { isDefault: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
    },
  });

  type ConnectionPatchPayload = {
    name?: string; provider?: ProviderType; endpoint?: string;
    apiKey?: string; defaultModel?: string; maxImageSizeMb?: number;
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ConnectionPatchPayload }) =>
      await apiRequest("PATCH", `/api/connections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/status"] });
      setEditingId(null);
      toast({ title: "Connection updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update connection", description: error.message, variant: "destructive" });
    },
  });

  const startEditing = (connection: Connection) => {
    setEditForm({
      name: connection.name,
      provider: connection.provider as ProviderType,
      endpoint: connection.endpoint,
      apiKey: connection.apiKey ?? "",
      defaultModel: connection.defaultModel ?? "",
      maxImageSizeMb: connection.maxImageSizeMb != null ? String(connection.maxImageSizeMb) : "",
    });
    setEditingId(connection.id);
    setIsAdding(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editForm.endpoint) return;
    const maxMb = editForm.maxImageSizeMb !== "" ? parseInt(editForm.maxImageSizeMb, 10) : undefined;
    updateMutation.mutate({
      id: editingId,
      data: {
        name: editForm.name,
        provider: editForm.provider,
        endpoint: editForm.endpoint,
        apiKey: editForm.apiKey || undefined,
        defaultModel: editForm.defaultModel || undefined,
        maxImageSizeMb: maxMb && maxMb > 0 ? maxMb : undefined,
      },
    });
  };

  const resetForm = () => {
    setNewConnection({
      name: "",
      provider: "ollama",
      endpoint: "",
      apiKey: "",
      defaultModel: "",
      isDefault: false,
      maxImageSizeMb: "",
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
    const maxMb = newConnection.maxImageSizeMb !== "" ? parseInt(newConnection.maxImageSizeMb, 10) : undefined;
    createMutation.mutate({
      ...newConnection,
      name: newConnection.name || detected.name,
      defaultModel: newConnection.defaultModel || detected.model,
      isDefault: connections.length === 0,
      maxImageSizeMb: maxMb && maxMb > 0 ? maxMb : undefined,
    });
  };

  const providerLabels: Record<ProviderType, string> = {
    openai: "OpenAI",
    ollama: "Ollama (Local)",
    lmstudio: "LM Studio (Local)",
    custom: "Custom API",
  };

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await apiRequest("POST", "/api/connections/reorder", { orderedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalOrder(prev => {
      const oldIndex = prev.findIndex(c => c.id === active.id);
      const newIndex = prev.findIndex(c => c.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      reorderMutation.mutate(reordered.map(c => c.id));
      return reordered;
    });
  };

  return (
    <>
    <ScrollArea className="h-[480px]">
      <div className="space-y-4 pr-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : connections.length === 0 && !isAdding ? (
          <DiscoveryPanel
            onUse={(name, provider, endpoint, defaultModel) => {
              createMutation.mutate({ name, provider, endpoint, apiKey: "", defaultModel, isDefault: true, maxImageSizeMb: undefined });
            }}
            onManual={() => setIsAdding(true)}
          />
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localOrder.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  {localOrder.map((connection) => (
                    <SortableConnectionCard
                      key={connection.id}
                      connection={connection}
                      editingId={editingId}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      onStartEditing={startEditing}
                      onCancelEdit={() => setEditingId(null)}
                      onEditSubmit={handleEditSubmit}
                      onSetDefault={(id) => setDefaultMutation.mutate(id)}
                      onDelete={handleDeleteClick}
                      deletingId={checkingUsage || (deleteMutation.isPending ? (deleteConfirm?.id ?? null) : null)}
                      updateIsPending={updateMutation.isPending}
                      providerLabels={providerLabels}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
                  <div className="space-y-2">
                    <Label htmlFor="maxImageSizeMb">Max image size (MB)</Label>
                    <Input
                      id="maxImageSizeMb"
                      type="number"
                      min="1"
                      value={newConnection.maxImageSizeMb}
                      onChange={(e) => setNewConnection({ ...newConnection, maxImageSizeMb: e.target.value })}
                      placeholder={`Default: ${newConnection.provider === "ollama" ? "10" : "20"}`}
                      data-testid="input-connection-max-image-size"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the provider default. Raise this for high-VRAM setups or lower it to protect constrained hardware.
                    </p>
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

    <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete connection?</DialogTitle>
        </DialogHeader>
        {deleteConfirm && deleteConfirm.count > 0 && (
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{deleteConfirm.count} {deleteConfirm.count === 1 ? "conversation uses" : "conversations use"} this connection.</strong>{" "}
            Deleting it will leave {deleteConfirm.count === 1 ? "that conversation" : "them"} without a provider and they won't be able to continue.
          </p>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete-connection">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            disabled={deleteMutation.isPending}
            data-testid="button-confirm-delete-connection"
          >
            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Delete anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function SettingsTab() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: substrateHealth } = useQuery<{
    coherence: "green" | "amber" | "red";
    substrates: Record<string, { status: "up" | "down" | "unknown"; latencyMs: number | null; endpoint: string | null }>;
    issues: string[];
  }>({
    queryKey: ["/api/substrate/health"],
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: systemCoherence } = useQuery<{
    coherent: boolean;
    overallStatus: "GREEN" | "AMBER" | "RED";
    items: { domain: string; component: string; actual: "coherent" | "degraded" | "absent"; message: string; action?: string }[];
  }>({
    queryKey: ["/api/system/coherence"],
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const [rootFolder, setRootFolder] = useState<string>("");
  const [whisperEndpoint, setWhisperEndpoint] = useState<string>("");
  const [searchEndpoint, setSearchEndpoint] = useState<string>("");
  const [embeddingModel, setEmbeddingModel] = useState<string>("");
  const [libraryPaths, setLibraryPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (settings && !initialized) {
    setRootFolder(settings.rootFolder || "");
    setWhisperEndpoint(settings.whisperEndpoint || "");
    setSearchEndpoint((settings as any).searchEndpoint || "");
    setEmbeddingModel((settings as any).embeddingModel || "");
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
    <ScrollArea className="h-[480px]">
    <div className="space-y-6 pr-4">
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
        {whisperEndpoint && (() => {
          const s = substrateHealth?.substrates?.whisper;
          const dotColor = !s ? "bg-muted-foreground/30" : s.status === "up" ? "bg-green-500" : s.status === "down" ? "bg-red-500" : "bg-amber-400 animate-pulse";
          const label = !s ? "checking…" : s.status === "up" ? `up · ${s.latencyMs}ms` : s.status === "down" ? "unreachable" : "probing…";
          const textColor = !s ? "text-muted-foreground" : s.status === "up" ? "text-green-600 dark:text-green-400" : s.status === "down" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
          return (
            <span className={`flex items-center gap-1.5 text-xs ${textColor}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="font-mono">{whisperEndpoint}</span>
              <span className="text-muted-foreground">·</span>
              {label}
            </span>
          );
        })()}
      </div>

      <Separator />

      {/* Search Endpoint */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Search Endpoint</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          SearXNG instance for private, multi-source web search. Leave empty to use DuckDuckGo as a fallback.
          Run locally with: <span className="font-mono">docker run -d -p 8888:8080 searxng/searxng</span>
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="http://localhost:8888"
            value={searchEndpoint}
            onChange={(e) => setSearchEndpoint(e.target.value)}
            className="font-mono text-sm"
            data-testid="input-search-endpoint"
          />
          <Button
            onClick={() => updateMutation.mutate({ searchEndpoint: searchEndpoint || undefined } as any)}
            disabled={updateMutation.isPending}
            size="sm"
            data-testid="button-save-search-endpoint"
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
        {searchEndpoint ? (() => {
          const s = substrateHealth?.substrates?.search;
          const dotColor = !s ? "bg-muted-foreground/30" : s.status === "up" ? "bg-green-500" : s.status === "down" ? "bg-red-500" : "bg-amber-400 animate-pulse";
          const label = !s ? "checking…" : s.status === "up" ? `up · ${s.latencyMs}ms` : s.status === "down" ? "unreachable — falling back to DuckDuckGo" : "probing…";
          const textColor = !s ? "text-muted-foreground" : s.status === "up" ? "text-green-600 dark:text-green-400" : s.status === "down" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
          return (
            <span className={`flex items-center gap-1.5 text-xs ${textColor}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="font-mono">{searchEndpoint}</span>
              <span className="text-muted-foreground">·</span>
              {label}
            </span>
          );
        })() : (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-amber-400" />
            DuckDuckGo fallback — configure SearXNG for full coverage
          </span>
        )}
      </div>

      <Separator />

      {/* Embedding Model */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Embedding Model</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Ollama model used for semantic search in your knowledge base. Leave blank to use the default (<span className="font-mono">nomic-embed-text</span>).
          Install with: <span className="font-mono">ollama pull nomic-embed-text</span>
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="nomic-embed-text"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            className="font-mono text-sm"
            data-testid="input-embedding-model"
          />
          <Button
            onClick={() => updateMutation.mutate({ embeddingModel: embeddingModel || undefined } as any)}
            disabled={updateMutation.isPending}
            size="sm"
            data-testid="button-save-embedding-model"
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
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
      <Separator />

      {/* System */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">System</h3>
          {systemCoherence && (() => {
            const status = systemCoherence.overallStatus;
            const problemItems = systemCoherence.items.filter(i => i.actual !== "coherent");
            const dotColor = status === "GREEN"
              ? "bg-green-500"
              : status === "AMBER"
                ? "bg-amber-400"
                : "bg-red-500";

            if (status === "GREEN") {
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor} cursor-default`}
                        data-testid="status-system-coherence"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      All systems coherent — everything is running as commissioned.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }

            return (
              <Popover>
                <PopoverTrigger asChild>
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor} cursor-pointer`}
                    data-testid="status-system-coherence"
                  />
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {status === "AMBER" ? "Degraded" : "System Issues"}
                    </p>
                  </div>
                  <ul className="divide-y">
                    {problemItems.map((item, idx) => (
                      <li key={idx} className="px-3 py-2.5 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                              item.actual === "absent" ? "bg-red-500" : "bg-amber-400"
                            }`}
                          />
                          <span className="text-xs font-medium">{item.component}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{item.domain}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-3.5">{item.message}</p>
                        {item.action && (
                          <p className="text-xs text-foreground/70 pl-3.5 italic">{item.action}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            );
          })()}
        </div>
        {systemCoherence?.overallStatus !== "GREEN" && (
          <>
            <p className="text-xs text-muted-foreground">
              Re-run the setup wizard to repair a degraded or uncommissioned system state.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { window.location.href = "/setup"; }}
              data-testid="button-run-setup-wizard"
            >
              Run Setup Wizard
            </Button>
          </>
        )}
      </div>
    </div>
    </ScrollArea>
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
  const { data, isLoading } = useQuery<ProvidersStatusResponse>({
    queryKey: ["/api/providers/status"],
    staleTime: 30_000,
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  const provider = data?.providers.find(p => p.connectionId === connectionId);
  if (!provider) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  if (provider.status === "online") {
    const count = provider.models.length;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCircle className="h-4 w-4 text-green-500 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="left">
            <p className="text-xs">{count} {count === 1 ? "model" : "models"} available</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <XCircle className="h-4 w-4 text-destructive cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">Offline — not responding</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
