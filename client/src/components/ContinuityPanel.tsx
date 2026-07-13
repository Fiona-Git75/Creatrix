import { useState } from "react";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import { Layers, Plus, Trash2, Loader2, Globe, User, Users, ChevronDown, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MemoryEntry, Connection } from "@shared/schema";

interface ContinuityPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  conversationId: string | null;
  connectionId: string | null;
  connections?: Connection[];
}

type AddTarget = "global" | "resident";

export function ContinuityPanel({
  open,
  onOpenChange,
  connectionId,
  connections = [],
}: ContinuityPanelProps) {
  const [newContent, setNewContent] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<AddTarget>("global");
  const [addTargetConnectionId, setAddTargetConnectionId] = useState<string | null>(null);
  const [addResidentModel, setAddResidentModel] = useState<string>("");
  const [addResidentName, setAddResidentName] = useState<string>("");
  const [addResidentRole, setAddResidentRole] = useState<string>("");
  const [addOrientationDraft, setAddOrientationDraft] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingOrientationId, setEditingOrientationId] = useState<string | null>(null);
  const [orientationDraft, setOrientationDraft] = useState("");
  const { toast } = useToast();

  const activeConnection = connections.find(c => c.id === connectionId) ?? null;
  const residentLabel = activeConnection?.residentName ?? "This Resident";
  const residentConnections = connections.filter(c => !!c.residentName);
  const commissionedModelIds = new Set(residentConnections.map(c => c.defaultModel).filter(Boolean));

  const { data: providerStatus } = useQuery<{
    providers: { connectionId: string; name: string; status: "online" | "offline"; models: { id: string; name?: string }[] }[];
  }>({
    queryKey: ["/api/providers/status"],
    staleTime: 30_000,
    enabled: open,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/memory",
    });

  const { data: globalEntries = [], isLoading: globalLoading } = useQuery<MemoryEntry[]>({
    queryKey: ["/api/memory", { scope: "global" }],
    queryFn: async () => {
      const res = await fetch("/api/memory?scope=global");
      return res.json();
    },
    enabled: open,
  });

  const { data: residentEntries = [], isLoading: residentLoading } = useQuery<MemoryEntry[]>({
    queryKey: ["/api/memory", { scope: "resident", connectionId }],
    queryFn: async () => {
      const res = await fetch(`/api/memory?scope=resident&connectionId=${connectionId}`);
      return res.json();
    },
    enabled: open && !!connectionId,
  });

  const residentCountResults = useQueries({
    queries: residentConnections.map(conn => ({
      queryKey: ["/api/memory", { scope: "resident", connectionId: conn.id }],
      queryFn: async (): Promise<MemoryEntry[]> => {
        const res = await fetch(`/api/memory?scope=resident&connectionId=${conn.id}`);
        return res.json();
      },
      enabled: open,
    })),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { scope: string; content: string; connectionId?: string }) =>
      apiRequest("POST", "/api/memory", payload),
    onSuccess: () => {
      invalidate();
      setNewContent("");
      toast({ title: "Note saved" });
    },
    onError: () => toast({ title: "Failed to save note", variant: "destructive" }),
  });

  const configureResidentMutation = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; defaultModel?: string; residentDescription?: string; residentName?: string; residentRole?: string }) =>
      apiRequest("PATCH", `/api/connections/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/connections" });
    },
    onError: () => toast({ title: "Failed to update resident", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/memory/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const cloneResidentMutation = useMutation({
    mutationFn: async ({ sourceConnectionId, model }: { sourceConnectionId: string; model: string }) => {
      const source = connections.find(c => c.id === sourceConnectionId) ?? connections[0];
      if (!source) throw new Error("No connection to clone");
      const res = await apiRequest("POST", "/api/connections", {
        name: source.name,
        provider: source.provider,
        endpoint: source.endpoint,
        apiKey: source.apiKey ?? "",
        defaultModel: model,
        isDefault: false,
      });
      return res.json() as Promise<Connection>;
    },
    onSuccess: async (newConn: Connection) => {
      // Wait for the connections list to include the new record BEFORE opening
      // the dialog — if the Select renders before the refetch completes its value
      // won't match any option and Radix snaps to the first entry (Olmo), causing
      // the save to overwrite the wrong connection.
      await queryClient.refetchQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/connections" });
      setAddTarget("resident");
      setAddTargetConnectionId(newConn.id);
      setNewContent("");
      setAdvancedOpen(false);
      setAddResidentName("");
      setAddResidentRole("");
      setAddResidentModel(newConn.defaultModel ?? "");
      setAddOrientationDraft("");
      setAddDialogOpen(true);
    },
    onError: () => toast({ title: "Failed to create resident slot", variant: "destructive" }),
  });

  const orientationMutation = useMutation({
    mutationFn: ({ id, residentDescription }: { id: string; residentDescription: string }) =>
      apiRequest("PATCH", `/api/connections/${id}`, { residentDescription: residentDescription || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/connections" });
      setEditingOrientationId(null);
      toast({ title: "Orientation saved" });
    },
    onError: () => toast({ title: "Failed to save orientation", variant: "destructive" }),
  });

  const handleResidentDialogSave = async () => {
    const targetConnId = addTargetConnectionId ?? connectionId;
    if (!targetConnId) return;

    const targetConn = connections.find(c => c.id === targetConnId);
    const patches: Record<string, string | undefined> = {};
    if (addResidentName.trim() !== (targetConn?.residentName ?? "")) patches.residentName = addResidentName.trim() || undefined;
    if (addResidentRole.trim() !== (targetConn?.residentRole ?? "")) patches.residentRole = addResidentRole.trim() || undefined;
    if (addResidentModel && addResidentModel !== targetConn?.defaultModel) patches.defaultModel = addResidentModel;
    if (addOrientationDraft !== (targetConn?.residentDescription ?? "")) patches.residentDescription = addOrientationDraft || undefined;

    const tasks: Promise<unknown>[] = [];
    if (Object.keys(patches).length > 0) {
      tasks.push(configureResidentMutation.mutateAsync({ id: targetConnId, ...patches }));
    }
    if (newContent.trim()) {
      tasks.push(createMutation.mutateAsync({ scope: "resident", content: newContent.trim(), connectionId: targetConnId }));
    }

    if (tasks.length === 0) {
      setAddDialogOpen(false);
      return;
    }

    await Promise.all(tasks);
    setAddDialogOpen(false);
    toast({ title: "Resident updated" });
  };

  const handleGlobalSave = () => {
    createMutation.mutate({ scope: "global", content: newContent.trim() });
    setAddDialogOpen(false);
  };

  const openAddDialog = (target: AddTarget, connId?: string | null) => {
    setAddTarget(target);
    let resolvedConnId: string | null | undefined;

    if (connId != null) {
      // Explicit target — use it directly, even if it has no residentName yet.
      // (That's exactly the case when first configuring a new connection.)
      resolvedConnId = connId;
    } else {
      // No explicit target — resolve from the active connection, then fall back
      // to the first named resident if the active one isn't a resident connection.
      resolvedConnId = connectionId;
      if (target === "resident") {
        const isResidentConn = residentConnections.some(c => c.id === resolvedConnId);
        if (!isResidentConn) resolvedConnId = residentConnections[0]?.id ?? resolvedConnId;
      }
    }

    setAddTargetConnectionId(resolvedConnId);
    setNewContent("");
    setAdvancedOpen(false);

    if (target === "resident") {
      const conn = connections.find(c => c.id === resolvedConnId);
      setAddResidentName(conn?.residentName ?? "");
      setAddResidentRole(conn?.residentRole ?? "");
      setAddResidentModel(conn?.defaultModel ?? "");
      setAddOrientationDraft(conn?.residentDescription ?? "");
    }

    setAddDialogOpen(true);
  };

  const handleAddTargetResidentChange = (newConnId: string) => {
    setAddTargetConnectionId(newConnId);
    const conn = connections.find(c => c.id === newConnId);
    setAddResidentName(conn?.residentName ?? "");
    setAddResidentRole(conn?.residentRole ?? "");
    setAddResidentModel(conn?.defaultModel ?? "");
    setAddOrientationDraft(conn?.residentDescription ?? "");
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const EntryList = ({ entries, loading, testPrefix }: { entries: MemoryEntry[]; loading: boolean; testPrefix: string }) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8" data-testid={`spinner-continuity-${testPrefix}`}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (entries.length === 0) {
      return (
        <p className="text-xs text-muted-foreground italic py-2 px-1">None yet.</p>
      );
    }
    return (
      <div className="space-y-2">
        {entries.map((entry) => (
          <Card key={entry.id} className="p-3" data-testid={`card-continuity-${entry.id}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap break-words">{entry.content}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(entry.createdAt)}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0"
                onClick={() => deleteMutation.mutate(entry.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-continuity-${entry.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const [globalCollapsed, setGlobalCollapsed] = useState(false);
  const [residentCollapsed, setResidentCollapsed] = useState(false);
  const [rosterCollapsed, setRosterCollapsed] = useState(false);

  const selectedDialogConn = connections.find(c => c.id === addTargetConnectionId);
  const dialogResidentLabel = selectedDialogConn?.residentName ?? "This Resident";
  const dialogProviderModels =
    providerStatus?.providers.find(p => p.connectionId === addTargetConnectionId)?.models ?? [];

  const addDialogLabel =
    addTarget === "resident"
      ? (connections.find(c => c.id === addTargetConnectionId)?.residentName ?? residentLabel)
      : "Environment";

  const isSaving = configureResidentMutation.isPending || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Continuity
          </DialogTitle>
          <DialogDescription>
            What persists across conversations — environment culture and resident working style.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-5 pr-3">

            {/* Residents roster */}
            {connections.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors mb-2"
                  onClick={() => setRosterCollapsed(v => !v)}
                  data-testid="button-toggle-roster-section"
                >
                  {rosterCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <Users className="h-3.5 w-3.5" />
                  Residents
                </button>
                {!rosterCollapsed && (
                  <div className="space-y-2" data-testid="roster-list">
                    {residentConnections.map((conn, i) => {
                      const entries: MemoryEntry[] = residentCountResults[i]?.data ?? [];
                      const count = residentCountResults[i]?.isLoading ? null : entries.length;
                      const isActive = conn.id === connectionId;
                      const isEditingOrientation = editingOrientationId === conn.id;
                      return (
                        <div
                          key={conn.id}
                          className={`px-3 py-2.5 rounded-md border ${isActive ? "bg-muted/50 border-border/60" : "bg-muted/20 border-border/30"}`}
                          data-testid={`roster-resident-${conn.id}`}
                        >
                          {/* Header row: emoji + name + edit icon */}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {conn.residentEmoji && (
                              <span className="text-sm leading-none">{conn.residentEmoji}</span>
                            )}
                            <span className="text-xs font-medium">{conn.residentName}</span>
                            <span className="text-xs text-muted-foreground font-mono ml-auto truncate max-w-[140px]" title={conn.defaultModel}>
                              {conn.defaultModel}
                            </span>
                            <button
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => openAddDialog("resident", conn.id)}
                              data-testid={`button-edit-resident-${conn.id}`}
                              title="Edit resident"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Role */}
                          {conn.residentRole && (
                            <p className="text-xs text-muted-foreground pl-5">Study: {conn.residentRole}</p>
                          )}

                          {/* Orientation */}
                          <div className="pl-5 mt-1.5">
                            {isEditingOrientation ? (
                              <div className="space-y-1.5">
                                <textarea
                                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                  rows={5}
                                  placeholder="Describe this resident's role and focus."
                                  value={orientationDraft}
                                  onChange={(e) => setOrientationDraft(e.target.value)}
                                  autoFocus
                                  data-testid={`textarea-orientation-${conn.id}`}
                                />
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs gap-1"
                                    onClick={() => orientationMutation.mutate({ id: conn.id, residentDescription: orientationDraft })}
                                    disabled={orientationMutation.isPending}
                                    data-testid={`button-save-orientation-${conn.id}`}
                                  >
                                    {orientationMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs gap-1"
                                    onClick={() => setEditingOrientationId(null)}
                                    data-testid={`button-cancel-orientation-${conn.id}`}
                                  >
                                    <X className="h-3 w-3" />
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1 group">
                                <div className="flex-1 min-w-0">
                                  {conn.residentDescription ? (
                                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{conn.residentDescription}</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">No orientation yet.</p>
                                  )}
                                </div>
                                <button
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground mt-0.5"
                                  onClick={() => {
                                    setOrientationDraft(conn.residentDescription ?? "");
                                    setEditingOrientationId(conn.id);
                                  }}
                                  data-testid={`button-edit-orientation-${conn.id}`}
                                  title="Edit orientation"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Continuity count + note */}
                          <div className="flex items-center justify-between pl-5 mt-1.5">
                            <p className="text-xs text-muted-foreground">
                              {count === null
                                ? "…"
                                : count === 0
                                  ? "No continuity notes"
                                  : `Continuity: ${count} note${count === 1 ? "" : "s"}`}
                            </p>
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => openAddDialog("resident", conn.id)}
                              data-testid={`button-add-roster-note-${conn.id}`}
                            >
                              + Note
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Commission Resident — models waiting outside */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={cloneResidentMutation.isPending}
                          data-testid="button-commission-resident"
                        >
                          {cloneResidentMutation.isPending
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> Commissioning…</>
                            : <>[ Commission Resident ▾ ]</>}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
                        {(() => {
                          const availableProviders = providerStatus?.providers
                            .filter(p => p.status === "online")
                            .map(p => ({ ...p, models: p.models.filter(m => !commissionedModelIds.has(m.id)) }))
                            .filter(p => p.models.length > 0) ?? [];
                          return availableProviders.length === 0 ? (
                            <DropdownMenuItem disabled>
                              {providerStatus ? "All models already commissioned" : "No providers online"}
                            </DropdownMenuItem>
                          ) : (
                            availableProviders.map((provider, pi) => (
                              <div key={provider.connectionId}>
                                {pi > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                                  {provider.name}
                                </DropdownMenuLabel>
                                {provider.models.map(m => (
                                  <DropdownMenuItem
                                    key={m.id}
                                    className="font-mono text-xs"
                                    onSelect={() => cloneResidentMutation.mutate({ sourceConnectionId: provider.connectionId, model: m.id })}
                                    data-testid={`commission-model-${m.id}`}
                                  >
                                    {m.id}
                                  </DropdownMenuItem>
                                ))}
                              </div>
                            ))
                          );
                        })()}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            )}

            {/* Global continuity */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                  onClick={() => setGlobalCollapsed(v => !v)}
                  data-testid="button-toggle-global-section"
                >
                  {globalCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <Globe className="h-3.5 w-3.5" />
                  Environment
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => openAddDialog("global")}
                  data-testid="button-add-global-continuity"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </div>
              {!globalCollapsed && (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Known by every resident. Collaboration preferences, project principles, environment culture.
                  </p>
                  <EntryList entries={globalEntries} loading={globalLoading} testPrefix="global" />
                </>
              )}
            </div>

            {/* Resident continuity */}
            {connectionId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <button
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                    onClick={() => setResidentCollapsed(v => !v)}
                    data-testid="button-toggle-resident-section"
                  >
                    {residentCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <User className="h-3.5 w-3.5" />
                    {residentLabel}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={() => openAddDialog("resident")}
                    data-testid="button-add-resident-continuity"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
                {!residentCollapsed && (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      How this resident operates — working style, specialties, conventions with you.
                    </p>
                    <EntryList entries={residentEntries} loading={residentLoading} testPrefix="resident" />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Add entry dialog — global */}
      {addTarget === "global" && (
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Environment</DialogTitle>
              <DialogDescription>
                What should every resident know? Collaboration preferences, project culture, stable context.
              </DialogDescription>
            </DialogHeader>

            <Textarea
              placeholder="e.g. Prefer exploratory dialogue before decisions. Canonical files are authoritative."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              data-testid="textarea-continuity-content"
            />

            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGlobalSave}
                disabled={!newContent.trim() || createMutation.isPending}
                data-testid="button-save-continuity"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Configure resident dialog */}
      {addTarget === "resident" && (
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Configure Resident</DialogTitle>
              {residentConnections.length > 1 && (
                <Select
                  value={addTargetConnectionId ?? ""}
                  onValueChange={handleAddTargetResidentChange}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs" data-testid="select-dialog-resident">
                    <SelectValue placeholder="Select a resident" />
                  </SelectTrigger>
                  <SelectContent>
                    {residentConnections.map(conn => (
                      <SelectItem key={conn.id} value={conn.id} data-testid={`option-resident-${conn.id}`}>
                        <span className="flex items-center gap-2">
                          {conn.residentEmoji && <span>{conn.residentEmoji}</span>}
                          <span>{conn.residentName ?? conn.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-4 py-1 pr-1">

                {/* Name */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Name</Label>
                  <Input
                    placeholder="e.g. Olmo"
                    value={addResidentName}
                    onChange={e => setAddResidentName(e.target.value)}
                    data-testid="input-dialog-resident-name"
                  />
                </div>

                {/* Role */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Role</Label>
                  <Input
                    placeholder="e.g. Creatrix Coordinator and Primary Support"
                    value={addResidentRole}
                    onChange={e => setAddResidentRole(e.target.value)}
                    data-testid="input-dialog-resident-role"
                  />
                </div>

                {/* Runtime model */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Runtime Model</Label>
                  {dialogProviderModels.length > 0 ? (
                    <Select value={addResidentModel} onValueChange={setAddResidentModel}>
                      <SelectTrigger data-testid="select-dialog-model">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {dialogProviderModels.map(m => (
                          <SelectItem key={m.id} value={m.id} data-testid={`option-model-${m.id}`}>
                            <span className="font-mono text-sm">{m.id}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        value={addResidentModel}
                        onChange={e => setAddResidentModel(e.target.value)}
                        placeholder="e.g. llama3.2, gpt-4o"
                        className="font-mono text-sm"
                        data-testid="input-dialog-model"
                      />
                      <p className="text-xs text-muted-foreground">Provider offline — enter model ID manually.</p>
                    </div>
                  )}
                </div>

                {/* Orientation */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Orientation</Label>
                  <p className="text-xs text-muted-foreground">
                    The initial relationship contract. Sent at the start of every conversation.
                  </p>
                  <Textarea
                    placeholder={`e.g. You are ${addResidentName || "this resident"}, the primary collaborator within Creatrix. Your role is to…`}
                    value={addOrientationDraft}
                    onChange={(e) => setAddOrientationDraft(e.target.value)}
                    rows={4}
                    data-testid="textarea-dialog-orientation"
                  />
                </div>

                {/* Continuity */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Continuity</Label>
                  <p className="text-xs text-muted-foreground">
                    Accumulated wisdom. Add a new note below; existing notes are shown beneath.
                  </p>
                  <Textarea
                    placeholder={`e.g. Prefers relational/systemic thinking. Prioritises continuity over novelty.`}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={2}
                    data-testid="textarea-continuity-content"
                  />
                  {/* Existing notes for this resident */}
                  {(() => {
                    const idx = residentConnections.findIndex(c => c.id === addTargetConnectionId);
                    const existing: MemoryEntry[] = idx >= 0 ? (residentCountResults[idx]?.data ?? []) : [];
                    if (existing.length === 0) return null;
                    return (
                      <div className="space-y-1.5 pt-1">
                        {existing.map(entry => (
                          <div key={entry.id} className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                            <p className="text-xs flex-1 whitespace-pre-wrap text-muted-foreground">{entry.content}</p>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5 shrink-0 -mt-0.5"
                              onClick={() => deleteMutation.mutate(entry.id)}
                              data-testid={`button-delete-note-${entry.id}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Advanced (collapsible) */}
                <div>
                  <button
                    onClick={() => setAdvancedOpen(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-toggle-advanced"
                  >
                    {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Advanced
                  </button>
                  {advancedOpen && selectedDialogConn && (
                    <div className="mt-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 space-y-1 font-mono text-xs text-muted-foreground">
                      <p><span className="text-foreground/60">Provider:</span> {selectedDialogConn.provider}</p>
                      <p><span className="text-foreground/60">Endpoint:</span> {selectedDialogConn.endpoint}</p>
                      <p><span className="text-foreground/60">Model ID:</span> {addResidentModel || selectedDialogConn.defaultModel}</p>
                    </div>
                  )}
                </div>

              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleResidentDialogSave}
                disabled={isSaving}
                data-testid="button-save-continuity"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
