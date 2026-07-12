import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layers, Plus, Trash2, Loader2, Globe, User, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  const { toast } = useToast();

  const activeConnection = connections.find(c => c.id === connectionId) ?? null;
  const residentLabel = activeConnection?.residentName ?? "This Resident";

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

  const createMutation = useMutation({
    mutationFn: (payload: { scope: string; content: string; connectionId?: string }) =>
      apiRequest("POST", "/api/memory", payload),
    onSuccess: () => {
      invalidate();
      setNewContent("");
      setAddDialogOpen(false);
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/memory/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const handleSave = () => {
    const payload =
      addTarget === "resident" && connectionId
        ? { scope: "resident", content: newContent.trim(), connectionId }
        : { scope: "global", content: newContent.trim() };
    createMutation.mutate(payload);
  };

  const openAddDialog = (target: AddTarget) => {
    setAddTarget(target);
    setNewContent("");
    setAddDialogOpen(true);
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
                    {activeConnection && (
                      <div className="flex items-center gap-2 mb-3 px-2.5 py-2 rounded-md bg-muted/40 border border-border/40" data-testid="resident-identity-strip">
                        {activeConnection.residentEmoji && (
                          <span className="text-base leading-none shrink-0">{activeConnection.residentEmoji}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{activeConnection.residentName ?? activeConnection.name}</p>
                          {activeConnection.residentRole && (
                            <p className="text-xs text-muted-foreground truncate">{activeConnection.residentRole}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground font-mono shrink-0 max-w-[140px] truncate" title={activeConnection.defaultModel}>
                          {activeConnection.defaultModel}
                        </span>
                      </div>
                    )}
                    <EntryList entries={residentEntries} loading={residentLoading} testPrefix="resident" />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Add entry dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addTarget === "resident"
                ? `Add to ${residentLabel}`
                : "Add to Environment"}
            </DialogTitle>
            <DialogDescription>
              {addTarget === "resident"
                ? `How does ${residentLabel} work with you? Specialties, conventions, preferred approach.`
                : "What should every resident know? Collaboration preferences, project culture, stable context."}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder={
              addTarget === "resident"
                ? `e.g. ${residentLabel} prefers to review architecture before implementation.`
                : "e.g. Prefer exploratory dialogue before decisions. Canonical files are authoritative."
            }
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
              onClick={handleSave}
              disabled={!newContent.trim() || createMutation.isPending}
              data-testid="button-save-continuity"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
