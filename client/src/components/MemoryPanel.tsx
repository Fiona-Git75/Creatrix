import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Plus, Trash2, Globe, FolderOpen, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function MemoryPanel({ open, onOpenChange, projectId, conversationId }: MemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<"global" | "project" | "conversation">("global");
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addScope, setAddScope] = useState<"global" | "project" | "conversation">("global");
  const { toast } = useToast();

  const buildQueryParams = (scope: string) => {
    const params = new URLSearchParams({ scope });
    if (scope === "project" && projectId) params.set("scopeId", projectId);
    if (scope === "conversation" && conversationId) params.set("scopeId", conversationId);
    return params.toString();
  };

  const { data: globalMemories = [], isLoading: loadingGlobal } = useQuery<MemoryEntry[]>({
    queryKey: ["/api/memory", { scope: "global" }],
    queryFn: async () => {
      const res = await fetch(`/api/memory?${buildQueryParams("global")}`);
      return res.json();
    },
    enabled: open,
  });

  const { data: projectMemories = [], isLoading: loadingProject } = useQuery<MemoryEntry[]>({
    queryKey: ["/api/memory", { scope: "project", scopeId: projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/memory?${buildQueryParams("project")}`);
      return res.json();
    },
    enabled: open && !!projectId,
  });

  const { data: conversationMemories = [], isLoading: loadingConversation } = useQuery<MemoryEntry[]>({
    queryKey: ["/api/memory", { scope: "conversation", scopeId: conversationId }],
    queryFn: async () => {
      const res = await fetch(`/api/memory?${buildQueryParams("conversation")}`);
      return res.json();
    },
    enabled: open && !!conversationId,
  });

  const invalidateMemoryQueries = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === "/api/memory";
      }
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: { scope: string; content: string; projectId?: string; conversationId?: string }) => {
      return apiRequest("POST", "/api/memory", data);
    },
    onSuccess: () => {
      invalidateMemoryQueries();
      setNewMemoryContent("");
      setAddDialogOpen(false);
      toast({ title: "Memory saved", description: "Your memory has been stored successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save memory.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/memory/${id}`);
    },
    onSuccess: () => {
      invalidateMemoryQueries();
      toast({ title: "Memory deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete memory.", variant: "destructive" });
    },
  });

  const canAddScope = (scope: string) => {
    if (scope === "global") return true;
    if (scope === "project") return !!projectId;
    if (scope === "conversation") return !!conversationId;
    return false;
  };

  const getValidDefaultScope = (): "global" | "project" | "conversation" => {
    if (canAddScope(activeTab)) return activeTab;
    return "global";
  };

  const handleAddMemory = () => {
    if (!newMemoryContent.trim()) return;
    if (!canAddScope(addScope)) {
      toast({ title: "Error", description: "Cannot add memory to this scope.", variant: "destructive" });
      return;
    }
    
    const data: { scope: string; content: string; projectId?: string; conversationId?: string } = {
      scope: addScope,
      content: newMemoryContent.trim(),
    };
    
    if (addScope === "project" && projectId) data.projectId = projectId;
    if (addScope === "conversation" && conversationId) data.conversationId = conversationId;
    
    createMutation.mutate(data);
  };

  const getMemoriesForTab = (tab: string) => {
    switch (tab) {
      case "global": return globalMemories;
      case "project": return projectMemories;
      case "conversation": return conversationMemories;
      default: return [];
    }
  };

  const isLoadingTab = (tab: string) => {
    switch (tab) {
      case "global": return loadingGlobal;
      case "project": return loadingProject;
      case "conversation": return loadingConversation;
      default: return false;
    }
  };

  const getScopeIcon = (scope: string) => {
    switch (scope) {
      case "global": return <Globe className="h-4 w-4" />;
      case "project": return <FolderOpen className="h-4 w-4" />;
      case "conversation": return <MessageSquare className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Memory
          </DialogTitle>
          <DialogDescription>
            Memories persist across conversations and provide context to the AI.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="global" className="gap-1" data-testid="tab-memory-global">
              <Globe className="h-3 w-3" />
              Global
              {globalMemories.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{globalMemories.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="project" className="gap-1" disabled={!projectId} data-testid="tab-memory-project">
              <FolderOpen className="h-3 w-3" />
              Project
              {projectMemories.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{projectMemories.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="conversation" className="gap-1" disabled={!conversationId} data-testid="tab-memory-conversation">
              <MessageSquare className="h-3 w-3" />
              Chat
              {conversationMemories.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{conversationMemories.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {["global", "project", "conversation"].map((tab) => (
            <TabsContent key={tab} value={tab} className="flex-1 overflow-hidden mt-2">
              <ScrollArea className="h-[300px]">
                {isLoadingTab(tab) ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : getMemoriesForTab(tab).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <Brain className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No memories yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tab === "global" && "Global memories apply to all conversations."}
                      {tab === "project" && "Project memories apply to all chats in this project."}
                      {tab === "conversation" && "Chat memories only apply to this conversation."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-4">
                    {getMemoriesForTab(tab).map((memory) => (
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
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button
            onClick={() => {
              setAddScope(getValidDefaultScope());
              setAddDialogOpen(true);
            }}
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
              Tell the AI something it should remember for future conversations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Scope</label>
              <Select value={addScope} onValueChange={(v) => setAddScope(v as typeof addScope)}>
                <SelectTrigger data-testid="select-memory-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Global - All conversations
                    </div>
                  </SelectItem>
                  <SelectItem value="project" disabled={!projectId}>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Project - This project only
                    </div>
                  </SelectItem>
                  <SelectItem value="conversation" disabled={!conversationId}>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Chat - This conversation only
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">What should the AI remember?</label>
              <Textarea
                placeholder="e.g., I prefer TypeScript over JavaScript, My name is Alex, Use concise responses..."
                value={newMemoryContent}
                onChange={(e) => setNewMemoryContent(e.target.value)}
                rows={4}
                data-testid="textarea-memory-content"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddMemory}
              disabled={!newMemoryContent.trim() || createMutation.isPending}
              data-testid="button-save-memory"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save Memory"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
