import { useState } from "react";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import { Layers, Plus, Trash2, Loader2, Globe, User, Users, ChevronDown, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const [addOrientationDraft, setAddOrientationDraft] = useState("");
  const [editingOrientationId, setEditingOrientationId] = useState<string | null>(null);
  const [orientationDraft, setOrientationDraft] = useState("");
  const { toast } = useToast();

  const activeConnection = connections.find(c => c.id === connectionId) ?? null;
  const residentLabel = activeConnection?.residentName ?? "This Resident";
  const residentConnections = connections.filter(c => !!c.residentName);

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
    mutationFn: ({ id, defaultModel, residentDescription }: { id: string; defaultModel?: string; residentDescription?: string }) =>
      apiRequest("PATCH", `/api/connections/${id}`, {
        ...(defaultModel !== undefined ? { defaultModel } : {}),
        ...(residentDescription !== undefined ? { residentDescription: residentDescription || undefined } : {}),
      }),
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
    const modelChanged = addResidentModel && addResidentModel !== targetConn?.defaultModel;
    const orientationChanged = addOrientationDraft !== (targetConn?.residentDescription ?? "");
    const hasNote = newContent.trim().length > 0;

    const patches: { defaultModel?: string; residentDescription?: string } = {};
    if (modelChanged) patches.defaultModel = addResidentModel;
    if (orientationChanged) patches.residentDescription = addOrientationDraft;

    const tasks: Promise<unknown>[] = [];
    if (Object.keys(patches).length > 0) {
      tasks.push(configureResidentMutation.mutateAsync({ id: targetConnId, ...patches }));
    }
    if (hasNote) {
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
    let resolvedConnId = connId ?? connectionId;

    // When opening for a resident, ensure we have an actual resident connection.
    // If the resolved ID doesn't point to one, fall back to the first resident connection.
    if (target === "resident") {
      const isResidentConn = residentConnections.some(c => c.id === resolvedConnId);
      if (!isResidentConn) resolvedConnId = residentConnections[0]?.id ?? resolvedConnId;
    }

    setAddTargetConnectionId(resolvedConnId);
    setNewContent("");

    if (target === "resident") {
      const conn = connections.find(c => c.id === resolvedConnId);
      setAddResidentModel(conn?.defaultModel ?? "");
      setAddOrientationDraft(conn?.residentDescription ?? "");
    }

    setAddDialogOpen(true);
  };

  const handleAddTargetResidentChange = (newConnId: string) => {
    setAddTargetConnectionId(newConnId);
    const conn = connections.find(c => c.id === newConnId);
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
            {residentConnections.length > 0 && (
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
                          {/* Header row: emoji + name + model */}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {conn.residentEmoji && (
                              <span className="text-sm leading-none">{conn.residentEmoji}</span>
                            )}
                            <span className="text-xs font-medium">{conn.residentName}</span>
                            <span className="text-xs text-muted-foreground font-mono ml-auto truncate max-w-[140px]" title={conn.defaultModel}>
                              {conn.defaultModel}
                            </span>
                          </div>

                          {/* Role / study */}
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
                                  placeholder="Describe this resident's role and focus. E.g. Your job is to learn everything about Creatrix — its file structure, logs, and documentation. You specialise in technical troubleshooting."
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

                          {/* Continuity count + configure */}
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
                              + configure
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Configure {dialogResidentLabel}</DialogTitle>
              {selectedDialogConn?.residentRole && (
                <p className="text-sm text-muted-foreground">
                  Role: {selectedDialogConn.residentRole}
                </p>
              )}
            </DialogHeader>

            <div className="space-y-5 py-1">

              {/* Resident selector */}
              {residentConnections.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Resident</Label>
                  <Select
                    value={addTargetConnectionId ?? ""}
                    onValueChange={handleAddTargetResidentChange}
                  >
                    <SelectTrigger data-testid="select-dialog-resident">
                      <SelectValue placeholder="Select a resident" />
                    </SelectTrigger>
                    <SelectContent>
                      {residentConnections.map(conn => (
                        <SelectItem key={conn.id} value={conn.id} data-testid={`option-resident-${conn.id}`}>
                          <span className="flex items-center gap-2">
                            {conn.residentEmoji && <span>{conn.residentEmoji}</span>}
                            <span>{conn.residentName}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Model selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Resident Model</Label>
                {dialogProviderModels.length > 0 ? (
                  <Select
                    value={addResidentModel}
                    onValueChange={setAddResidentModel}
                  >
                    <SelectTrigger data-testid="select-dialog-model" className="h-auto py-2">
                      {addResidentModel ? (
                        <span className="flex flex-col items-start text-left gap-0.5 min-w-0">
                          {/* Primary: the Creatrix-facing connection name (e.g. "OLMo Research") */}
                          <span className="text-sm leading-snug truncate">
                            {selectedDialogConn?.name ?? addResidentModel}
                          </span>
                          {/* Secondary: the actual backend engine ID */}
                          <span className="text-xs font-mono text-muted-foreground leading-snug truncate">
                            {addResidentModel}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Select a model</span>
                      )}
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
                    <input
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={addResidentModel}
                      onChange={e => setAddResidentModel(e.target.value)}
                      placeholder="e.g. llama3.2, gpt-4o"
                      data-testid="input-dialog-model"
                    />
                    <p className="text-xs text-muted-foreground">Provider is offline — enter a model ID manually.</p>
                  </div>
                )}
              </div>

              {/* Orientation */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Orientation</Label>
                <p className="text-xs text-muted-foreground">
                  Tell this resident how they approach work, what they specialise in, and how they collaborate with you.
                  This is sent at the start of every conversation.
                </p>
                <Textarea
                  placeholder={`e.g. ${dialogResidentLabel}, your job is to learn everything about this project — its file structure, logs, and documentation. You specialise in technical troubleshooting and project thinking.`}
                  value={addOrientationDraft}
                  onChange={(e) => setAddOrientationDraft(e.target.value)}
                  rows={5}
                  data-testid="textarea-dialog-orientation"
                />
              </div>

              {/* Continuity Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Continuity Notes</Label>
                <p className="text-xs text-muted-foreground">
                  Persistent observations about this resident. These accumulate over time and help maintain continuity across conversations.
                </p>
                <Textarea
                  placeholder={`e.g. ${dialogResidentLabel} prefers to review architecture before implementation.`}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={3}
                  data-testid="textarea-continuity-content"
                />
              </div>

            </div>

            <DialogFooter>
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
