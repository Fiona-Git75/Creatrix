import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Plus, Trash2, Loader2 } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MemoryEntry } from "@shared/schema";

interface MemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  conversationId: string | null;
}

export function MemoryPanel({ open, onOpenChange }: MemoryPanelProps) {
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: memories = [], isLoading } = useQuery<MemoryEntry[]>({
    queryKey: ["/api/memory", { scope: "global" }],
    queryFn: async () => {
      const res = await fetch("/api/memory?scope=global");
      return res.json();
    },
    enabled: open,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/memory",
    });

  const createMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", "/api/memory", { scope: "global", content }),
    onSuccess: () => {
      invalidate();
      setNewMemoryContent("");
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

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Memory
          </DialogTitle>
          <DialogDescription>
            Stable preferences and working style — how you like to collaborate. Available in every conversation.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="spinner-memory-global">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Brain className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No memories yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add things like preferred working style, communication patterns, or stable preferences.
              </p>
            </div>
          ) : (
            <div className="space-y-2 pr-1">
              {memories.map((memory) => (
                <Card key={memory.id} className="p-3" data-testid={`card-memory-${memory.id}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm whitespace-pre-wrap break-words">{memory.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(memory.createdAt)}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => deleteMutation.mutate(memory.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-memory-${memory.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="mt-2">
          <Button
            onClick={() => setAddDialogOpen(true)}
            className="w-full gap-2"
            data-testid="button-add-memory"
          >
            <Plus className="h-4 w-4" />
            Add Memory
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Memory</DialogTitle>
            <DialogDescription>
              What should the AI know about how you work? This applies to all conversations.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="e.g. I prefer concise responses. Use British English. When working on Anavere, assume ecological frame unless told otherwise."
            value={newMemoryContent}
            onChange={(e) => setNewMemoryContent(e.target.value)}
            rows={4}
            data-testid="textarea-memory-content"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newMemoryContent.trim())}
              disabled={!newMemoryContent.trim() || createMutation.isPending}
              data-testid="button-save-memory"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
