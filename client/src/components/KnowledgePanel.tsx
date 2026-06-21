import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Loader2, BookOpen, FolderOpen, CheckCircle2 } from "lucide-react";
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
  const [addDialogOpen, setAddDialogOpen]       = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [newTitle, setNewTitle]     = useState("");
  const [newContent, setNewContent] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const { toast } = useToast();

  const { data: documents = [], isLoading } = useQuery<KnowledgeDocument[]>({
    queryKey: ["/api/documents", { projectId }],
    queryFn: async () => {
      const params = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/documents${params}`);
      if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
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
        predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/documents",
      });
      setNewTitle("");
      setNewContent("");
      setAddDialogOpen(false);
      toast({ title: "Document added", description: "Indexed and being embedded in the background." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add document.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/documents",
      });
      toast({ title: "Document deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { folderPath: string; projectId?: string }) => {
      const res = await apiRequest("POST", "/api/documents/import-folder", data);
      return res.json() as Promise<{ imported: number; skipped: number; total: number; files: string[] }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/documents",
      });
      setImportResult(result);
    },
    onError: () => {
      toast({ title: "Import failed", description: "Check the folder path and try again.", variant: "destructive" });
    },
  });

  const handleImport = () => {
    if (!folderPath.trim()) return;
    setImportResult(null);
    importMutation.mutate({ folderPath: folderPath.trim(), projectId: projectId || undefined });
  };

  const handleCloseImport = () => {
    setImportDialogOpen(false);
    setFolderPath("");
    setImportResult(null);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      {/* Main panel */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Knowledge Base
            </DialogTitle>
            <DialogDescription>
              Documents added here are automatically searched and injected as context during conversations.
              Semantic search is used when an OpenAI connection is configured.
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
                  Add individual documents or import an entire folder of notes.
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
                          {doc.chunks.length} chunks · {formatDate(doc.createdAt)}
                          {doc.source && doc.source !== "manual" && (
                            <span className="ml-1 opacity-60">· {doc.source}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {doc.content.slice(0, 150)}…
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

          <DialogFooter className="flex gap-2 sm:justify-start">
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              className="gap-2"
              data-testid="button-import-folder"
            >
              <FolderOpen className="h-4 w-4" />
              Import folder
            </Button>
            <Button
              onClick={() => setAddDialogOpen(true)}
              className="gap-2 flex-1"
              data-testid="button-add-document"
            >
              <Plus className="h-4 w-4" />
              Add document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add single document */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>
              Paste text content that will be chunked, indexed, and made semantically searchable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g., Northern Kingdoms Lore, Chapter 3 Notes…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-document-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                placeholder="Paste your document content here…"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={8}
                data-testid="textarea-document-content"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({ title: newTitle.trim(), content: newContent.trim(), projectId: projectId || undefined })}
              disabled={!newTitle.trim() || !newContent.trim() || createMutation.isPending}
              data-testid="button-save-document"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import folder */}
      <Dialog open={importDialogOpen} onOpenChange={handleCloseImport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Import from folder
            </DialogTitle>
            <DialogDescription>
              Point to a folder on this machine. All <code className="text-xs bg-muted px-1 rounded">.md</code> and{" "}
              <code className="text-xs bg-muted px-1 rounded">.txt</code> files will be imported recursively.
              Files already in the knowledge base (matched by title) are skipped.
              Embeddings are generated in the background after import.
            </DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Import complete</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{importResult.imported} document{importResult.imported !== 1 ? "s" : ""} imported</p>
                <p>{importResult.skipped} skipped (already indexed or empty)</p>
                <p>{importResult.total} files found in total</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Semantic embeddings are being generated in the background — search will improve over the next minute or two.
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Folder path</label>
                <Input
                  placeholder="/Users/yourname/Documents/WorldBuilding"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  data-testid="input-folder-path"
                />
                <p className="text-xs text-muted-foreground">
                  Use the full absolute path to the folder on this machine.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseImport}>
              {importResult ? "Close" : "Cancel"}
            </Button>
            {!importResult && (
              <Button
                onClick={handleImport}
                disabled={!folderPath.trim() || importMutation.isPending}
                data-testid="button-start-import"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Importing…
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
