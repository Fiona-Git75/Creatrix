import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import type { KnowledgeDocument } from "@shared/schema";

interface KnowledgePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

export function KnowledgePanel({ open, onOpenChange, projectId }: KnowledgePanelProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const { toast } = useToast();

  const { data: documents = [], isLoading } = useQuery<KnowledgeDocument[]>({
    queryKey: ["/api/documents", { projectId }],
    queryFn: async () => {
      const params = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/documents${params}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch documents: ${res.status}`);
      }
      return res.json();
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; projectId?: string }) => {
      return apiRequest("POST", "/api/documents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === "/api/documents";
        }
      });
      setNewTitle("");
      setNewContent("");
      setAddDialogOpen(false);
      toast({ title: "Document added", description: "Your document has been processed and indexed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add document.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === "/api/documents";
        }
      });
      toast({ title: "Document deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
    },
  });

  const handleAddDocument = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    
    createMutation.mutate({
      title: newTitle.trim(),
      content: newContent.trim(),
      projectId: projectId || undefined,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Knowledge Base
            </DialogTitle>
            <DialogDescription>
              Add documents to provide context for AI conversations. The AI will search these when answering questions.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No documents yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add documents to give the AI more context about your topics.
                </p>
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {documents.map((doc) => (
                  <Card key={doc.id} className="p-3" data-testid={`card-document-${doc.id}`}>
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {doc.chunks.length} chunks | {formatDate(doc.createdAt)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {doc.content.slice(0, 150)}...
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-document-${doc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button
              onClick={() => setAddDialogOpen(true)}
              className="w-full gap-2"
              data-testid="button-add-document"
            >
              <Plus className="h-4 w-4" />
              Add Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>
              Paste text content that will be processed and made searchable for AI conversations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g., Product Documentation, Company FAQ..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-document-title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                placeholder="Paste your document content here..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={8}
                data-testid="textarea-document-content"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddDocument}
              disabled={!newTitle.trim() || !newContent.trim() || createMutation.isPending}
              data-testid="button-save-document"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Add Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
