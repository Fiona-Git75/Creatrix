import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Menu, RotateCcw, Brain, Search, Library, BookOpenCheck, Activity, Cpu, ChevronDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ConnectionsDialog } from "@/components/ConnectionsDialog";
import { ResidentsPanel } from "@/components/ResidentsPanel";
import { ChatMessage, type Message } from "@/components/ChatMessage";
import { ChatInput, type AttachedImage } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ContinuityPanel } from "@/components/ContinuityPanel";
import { LibraryPanel } from "@/components/LibraryPanel";
import { JournalPanel } from "@/components/JournalPanel";
import { SystemLogPanel } from "@/components/SystemLogPanel";
import { MomentsPanel } from "@/components/MomentsPanel";
import { SearchDialog } from "@/components/SearchDialog";
import { ToolCallCard, type ToolEvent } from "@/components/ToolCallCard";
import { DocumentPanel } from "@/components/DocumentPanel";
import { ProjectPanel } from "@/components/ProjectPanel";
import { type Conversation } from "@/components/ConversationItem";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Connection } from "@shared/schema";
import type { CapabilityName } from "@shared/schema";

interface ConversationData extends Conversation {
  messages: Message[];
  model: string;
}

interface ModelEntry { id: string; name: string; }
interface ModelsResponse { status: string; message?: string; models: ModelEntry[]; }

function ConnectionGroup({
  conn,
  selectedConnectionId,
  selectedModel,
  onSelectConnection,
}: {
  conn: Connection;
  selectedConnectionId: string | null;
  selectedModel: string;
  onSelectConnection: (connectionId: string, model: string) => void;
}) {
  const { data, isLoading } = useQuery<ModelsResponse>({
    queryKey: ["/api/connections", conn.id, "models"],
    retry: false,
    staleTime: 30_000,
  });

  const models = data?.models ?? [];
  const isOffline = data?.status === "offline" || data?.status === "error";
  const isReady = data?.status === "ok" || data?.status === "empty";

  const dotClass = isLoading
    ? "bg-yellow-400 animate-pulse"
    : isReady
    ? "bg-green-500"
    : isOffline
    ? "bg-red-400"
    : "bg-muted-foreground/30";

  const displayModels: ModelEntry[] = models;

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-2 py-1.5">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
        {conn.residentEmoji && <span className="text-sm leading-none">{conn.residentEmoji}</span>}
        {conn.residentName || conn.name}
      </DropdownMenuLabel>
      {isLoading ? (
        <DropdownMenuItem disabled className="pl-5">
          <Loader2 className="h-3 w-3 animate-spin mr-2 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Checking…</span>
        </DropdownMenuItem>
      ) : isOffline ? (
        <DropdownMenuItem disabled className="pl-5">
          <span className="text-xs text-muted-foreground">Offline — check connection in Settings</span>
        </DropdownMenuItem>
      ) : displayModels.length === 0 ? (
        <DropdownMenuItem disabled className="pl-5">
          <span className="text-xs text-muted-foreground">No models found</span>
        </DropdownMenuItem>
      ) : (
        displayModels.map(m => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => onSelectConnection(conn.id, m.id)}
            className="pl-5 flex items-center justify-between gap-2"
            data-testid={`model-option-${conn.id}-${m.id}`}
          >
            <span className="text-sm truncate">{m.name}</span>
            {selectedConnectionId === conn.id && selectedModel === m.id && (
              <Check className="h-3 w-3 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))
      )}
    </>
  );
}

function ChatContent({
  conversations,
  activeConversation,
  isLoading,
  streamingContent,
  toolEvents,
  selectedProjectId,
  connections,
  selectedConnectionId,
  selectedModel,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onSendMessage,
  onClearChat,
  onProjectChange,
  onSelectConnection,
  onOpenSettings,
  openDocId,
  onDocChange,
  pinnedDocId,
  onTogglePin,
  onUpdateToolEvents,
  maxImageSizeMb,
  openProjectId,
  onOpenProject,
  onCloseProject,
}: {
  conversations: ConversationData[];
  activeConversation: ConversationData | null;
  isLoading: boolean;
  streamingContent: string;
  toolEvents: ToolEvent[];
  selectedProjectId: string | null;
  connections: Connection[];
  selectedConnectionId: string | null;
  selectedModel: string;
  maxImageSizeMb: number;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSendMessage: (message: string, images?: AttachedImage[]) => void;
  onClearChat: () => void;
  onProjectChange: (projectId: string | null) => void;
  onSelectConnection: (connectionId: string, model: string) => void;
  onOpenSettings: () => void;
  openDocId: string | null | undefined;
  onDocChange: (id: string | null | undefined) => void;
  pinnedDocId: string | null;
  onTogglePin: (docId: string | null) => void;
  onUpdateToolEvents: (updater: (prev: ToolEvent[]) => ToolEvent[]) => void;
  openProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onCloseProject: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const { isMobile } = useSidebar();
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [journalPanelOpen, setJournalPanelOpen] = useState(false);
  const [systemLogOpen, setSystemLogOpen] = useState(false);
  const [momentsOpen, setMomentsOpen] = useState(false);
  const [residentsOpen, setResidentsOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [docPanelWidth, setDocPanelWidth] = useState(480);
  const [focusMode, setFocusMode] = useState(false);
  const [projectPanelWidth, setProjectPanelWidth] = useState(560);

  const handleDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = docPanelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setDocPanelWidth(Math.min(Math.max(startWidth + delta, 320), 1000));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  const handleProjectPanelDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = projectPanelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setProjectPanelWidth(Math.min(Math.max(startWidth + delta, 360), 1100));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchDialogOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages, streamingContent, toolEvents]);

  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0 || streamingContent || toolEvents.length > 0;

  const displayMessages = [...messages];
  if (streamingContent) {
    displayMessages.push({
      id: "streaming",
      role: "assistant",
      content: streamingContent,
    });
  }

  return (
    <>
      <AppSidebar
        conversations={conversations}
        activeConversationId={activeConversation?.id || null}
        selectedProjectId={selectedProjectId}
        onNewChat={onNewChat}
        onSelectConversation={onSelectConversation}
        onDeleteConversation={onDeleteConversation}
        onProjectChange={onProjectChange}
        onOpenProject={onOpenProject}
        onOpenSettings={onOpenSettings}
        onOpenDocs={() => onDocChange(null)}
        onOpenMoments={() => setMomentsOpen(true)}
        onOpenSystemLog={() => setSystemLogOpen(true)}
        onOpenResidents={() => setResidentsOpen(true)}
      />

      <div className="flex flex-row flex-1 min-w-0">
      <div className="flex flex-col flex-1 h-screen min-w-0 overflow-hidden">
        <header className="flex items-center justify-between gap-2 p-3 border-b sticky top-0 z-50 bg-background">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle">
              <Menu className="h-4 w-4" />
            </SidebarTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground px-2"
                  data-testid="button-connection-selector"
                >
                  <Cpu className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">
                    {selectedModel || "Select a model"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {connections.length === 0 ? (
                  <DropdownMenuItem disabled>
                    <span className="text-xs text-muted-foreground">No connections configured — add one in Settings</span>
                  </DropdownMenuItem>
                ) : (
                  connections.map((conn, i) => (
                    <div key={conn.id}>
                      {i > 0 && <DropdownMenuSeparator />}
                      <ConnectionGroup
                        conn={conn}
                        selectedConnectionId={selectedConnectionId}
                        selectedModel={selectedModel}
                        onSelectConnection={onSelectConnection}
                      />
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {hasMessages && (
              <span className="text-sm font-medium truncate max-w-[200px]">
                {activeConversation?.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSearchDialogOpen(true)}
              data-testid="button-search"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setJournalPanelOpen(true)}
              data-testid="button-journal"
              aria-label="Journal"
            >
              <BookOpenCheck className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setLibraryPanelOpen(true)}
              data-testid="button-library"
              aria-label="Library"
            >
              <Library className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMemoryPanelOpen(true)}
              data-testid="button-continuity"
              aria-label="Continuity"
            >
              <Brain className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSystemLogOpen(true)}
              data-testid="button-system-log"
              aria-label="System Log"
            >
              <Activity className="h-4 w-4" />
            </Button>
            {hasMessages && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onClearChat}
                data-testid="button-clear-chat"
                aria-label="Clear conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <ThemeToggle />
          </div>
        </header>

        <ContinuityPanel
          open={memoryPanelOpen}
          onOpenChange={setMemoryPanelOpen}
          projectId={selectedProjectId}
          conversationId={activeConversation?.id || null}
          connectionId={selectedConnectionId}
          connections={connections}
        />
        <LibraryPanel open={libraryPanelOpen} onOpenChange={setLibraryPanelOpen} />
        <JournalPanel open={journalPanelOpen} onOpenChange={setJournalPanelOpen} connections={connections} />
        <SystemLogPanel open={systemLogOpen} onOpenChange={setSystemLogOpen} />
        <MomentsPanel
          open={momentsOpen}
          onOpenChange={setMomentsOpen}
          onSelectConversation={onSelectConversation}
        />
        <ResidentsPanel open={residentsOpen} onOpenChange={setResidentsOpen} />
        <SearchDialog
          open={searchDialogOpen}
          onOpenChange={setSearchDialogOpen}
          projectId={selectedProjectId}
          onSelectConversation={onSelectConversation}
        />

        <main className="flex-1 overflow-hidden flex flex-col">
          {hasMessages ? (
            <>
              <ScrollArea className="flex-1">
                <div className="py-4">
                  {displayMessages.map((message, idx) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isStreaming={message.id === "streaming"}
                      messageIndex={idx}
                      conversationId={activeConversation?.id}
                      conversationTitle={activeConversation?.title}
                      projectId={selectedProjectId ?? undefined}
                    />
                  ))}

                  {/* Tool call cards shown during active generation */}
                  {toolEvents.length > 0 && (
                    <div className="px-4 py-1 max-w-3xl mx-auto">
                      {toolEvents.map(event => (
                        <ToolCallCard
                          key={event.id}
                          event={event}
                          onConfirm={event.confirmId ? async (confirmId, approved) => {
                            onUpdateToolEvents(prev => prev.map(e =>
                              e.id === event.id
                                ? { ...e, status: approved ? "running" : "cancelled" }
                                : e
                            ));
                            await apiRequest("POST", `/api/confirm/${confirmId}`, { approved });
                          } : undefined}
                        />
                      ))}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              <ChatInput onSend={onSendMessage} isLoading={isLoading} inputRef={chatInputRef} maxImageSizeMb={maxImageSizeMb} />
            </>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex-1">
                <EmptyState onStartChatting={() => chatInputRef.current?.focus()} onOpenSettings={onOpenSettings} />
              </div>
              <ChatInput onSend={onSendMessage} isLoading={isLoading} inputRef={chatInputRef} maxImageSizeMb={maxImageSizeMb} />
            </div>
          )}
        </main>
      </div>
      {(openDocId !== undefined || pinnedDocId !== null) && (
        <>
          <div
            className="w-1 shrink-0 h-screen cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
            onMouseDown={handleDragStart}
            data-testid="doc-panel-resize-handle"
          />
          <div
            className="shrink-0 h-screen"
            style={focusMode ? { flex: "1" } : { width: `${docPanelWidth}px` }}
          >
            <DocumentPanel
              docId={openDocId !== undefined ? openDocId : pinnedDocId}
              projectId={selectedProjectId}
              pinned={pinnedDocId !== null}
              focusMode={focusMode}
              onClose={() => onDocChange(undefined)}
              onTogglePin={() => {
                const current = openDocId !== undefined ? openDocId : pinnedDocId;
                onTogglePin(pinnedDocId !== null ? null : current);
              }}
              onToggleFocus={() => setFocusMode(v => !v)}
              onDocChange={onDocChange}
            />
          </div>
        </>
      )}
      {openProjectId && (
        <>
          <div
            className="w-1 shrink-0 h-screen cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
            onMouseDown={handleProjectPanelDragStart}
            data-testid="project-panel-resize-handle"
          />
          <div
            className="shrink-0 h-screen"
            style={{ width: `${projectPanelWidth}px` }}
          >
            <ProjectPanel
              projectId={openProjectId}
              onClose={onCloseProject}
            />
          </div>
        </>
      )}
      </div>
    </>
  );
}

export default function Chat() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [openDocId, setOpenDocId] = useState<string | null | undefined>(undefined);
  const [pinnedDocId, setPinnedDocId] = useState<string | null>(null);
  const CONN_KEY = "creatrix:selectedConnectionId";
  const MODEL_KEY = "creatrix:selectedModel";

  const [selectedModel, setSelectedModel] = useState<string>(() => localStorage.getItem(MODEL_KEY) ?? "");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(() => localStorage.getItem(CONN_KEY));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: conversations = [] } = useQuery<ConversationData[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: settings } = useQuery<{ morningOrientationEnabled?: boolean }>({
    queryKey: ["/api/settings"],
  });

  const { data: providerStatus } = useQuery<{
    providers: { connectionId: string; name: string; status: "online" | "offline"; models: { id: string; name: string }[] }[];
  }>({
    queryKey: ["/api/providers/status"],
    staleTime: 30_000,
  });

  // Persist selection so it survives page refreshes
  useEffect(() => {
    if (selectedConnectionId) localStorage.setItem(CONN_KEY, selectedConnectionId);
    else localStorage.removeItem(CONN_KEY);
  }, [selectedConnectionId]);

  useEffect(() => {
    if (selectedModel) localStorage.setItem(MODEL_KEY, selectedModel);
    else localStorage.removeItem(MODEL_KEY);
  }, [selectedModel]);

  // Validate stored selection against live DB connections.
  // If the stored connection still exists → keep it (fast path, no scan needed).
  // If it's gone or was never set → fall back to first online provider from the scan.
  useEffect(() => {
    if (!connections.length) return;
    if (selectedConnectionId && connections.some(c => c.id === selectedConnectionId)) return;
    if (!providerStatus?.providers?.length) return;
    const firstOnline = providerStatus.providers.find(p => p.status === "online");
    if (!firstOnline) return;
    setSelectedConnectionId(firstOnline.connectionId);
    if (firstOnline.models.length > 0) setSelectedModel(firstOnline.models[0].id);
  }, [connections, providerStatus?.providers, selectedConnectionId]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;
  const activeConnection = connections.find(c => c.id === selectedConnectionId) ?? null;
  const activeMaxImageSizeMb = activeConnection?.maxImageSizeMb ?? (activeConnection?.provider === "ollama" ? 10 : 20);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/conversations/${id}`, { messages: [] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const createNewChat = () => {
    setActiveConversationId(null);
    setStreamingContent("");
    setToolEvents([]);
  };

  const handleSendMessage = async (content: string, images?: AttachedImage[]) => {
    setIsLoading(true);
    setStreamingContent("");
    setToolEvents([]);

    // Declared outside try/finally so both blocks share the same binding.
    let streamDoneReceived = false;
    let keepPartialContent = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId ?? undefined,
          projectId: selectedProjectId ?? undefined,
          connectionId: selectedConnectionId ?? undefined,
          message: content,
          model: selectedModel || undefined,
          imageBase64s: images && images.length > 0 ? images.map(img => img.base64) : undefined,
          imageMimeTypes: images && images.length > 0 ? images.map(img => img.mimeType) : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      // Maps tool event id → index in toolEvents array (via closure)
      const activeToolEvents = new Map<string, string>();
      let eventCounter = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          // Parse JSON first in an isolated try/catch so that only genuine
          // JSON decode failures are silently skipped.  Event-processing code
          // below runs outside this catch, so intentional throws (e.g. on
          // "error" events) propagate to the outer handler instead of being
          // silently swallowed alongside malformed lines.
          let data: any;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            continue; // Malformed JSON — skip this line
          }

          if (data.type === "conversation_id" && !activeConversationId) {
            setActiveConversationId(data.id);
          } else if (data.type === "content") {
            accumulated += data.content;
            setStreamingContent(accumulated);
          } else if (data.type === "tool_call") {
            const eventId = `tool-${++eventCounter}`;
            activeToolEvents.set(data.capability, eventId);
            setToolEvents(prev => [...prev, {
              id: eventId,
              capability: data.capability as CapabilityName,
              args: data.args || {},
              status: "running",
            }]);
          } else if (data.type === "confirm_required") {
            const eventId = `tool-${++eventCounter}`;
            activeToolEvents.set(data.capability, eventId);
            setToolEvents(prev => [...prev, {
              id: eventId,
              capability: data.capability as CapabilityName,
              args: data.args || {},
              status: "pending_confirm",
              confirmId: data.confirmId,
            }]);
          } else if (data.type === "tool_result") {
            const eventId = activeToolEvents.get(data.capability);
            if (eventId) {
              setToolEvents(prev => prev.map(e =>
                e.id === eventId
                  ? { ...e, status: data.status === "success" ? "success" : "error", result: data.result, error: data.error }
                  : e
              ));
            }
            if ((data.capability === "write_doc" || data.capability === "edit_doc") && data.status === "success" && (data.result as any)?.id) {
              setOpenDocId((data.result as any).id);
            }
          } else if (data.type === "done") {
            streamDoneReceived = true;
            setStreamingContent("");
            setToolEvents([]);
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
          } else if (data.type === "error") {
            // Throw outside the JSON-parse catch so the error reaches the
            // outer handler and is shown to the user via toast.
            throw new Error(data.message || data.error || "Stream error from provider");
          }
        }
      }

      // Stream closed without a "done" event (network drop / provider crash).
      // Keep whatever arrived so the user can read the partial response, and
      // surface a toast explaining that the response was cut short.
      if (!streamDoneReceived && accumulated) {
        keepPartialContent = true;
        toast({
          title: "Connection dropped",
          description: "The response was cut short. Partial content is shown above.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      // Preserve partial content on abrupt drops; clear on clean done or errors.
      if (!keepPartialContent) {
        setStreamingContent("");
      }
      setToolEvents([]);
    }
  };

  const handleDeleteConversation = (id: string) => {
    deleteMutation.mutate(id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  };

  const handleClearChat = () => {
    if (activeConversationId) {
      clearMutation.mutate(activeConversationId);
    }
  };

  const sidebarStyle = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <ChatContent
          conversations={conversations}
          activeConversation={activeConversation}
          isLoading={isLoading}
          streamingContent={streamingContent}
          toolEvents={toolEvents}
          selectedProjectId={selectedProjectId}
          connections={connections}
          selectedConnectionId={selectedConnectionId}
          selectedModel={selectedModel}
          onNewChat={createNewChat}
          onSelectConversation={setActiveConversationId}
          onDeleteConversation={handleDeleteConversation}
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
          onProjectChange={setSelectedProjectId}
          onSelectConnection={(id, model) => { setSelectedConnectionId(id); setSelectedModel(model); }}
          onOpenSettings={() => setSettingsOpen(true)}
          openDocId={openDocId}
          onDocChange={setOpenDocId}
          pinnedDocId={pinnedDocId}
          onTogglePin={setPinnedDocId}
          onUpdateToolEvents={setToolEvents}
          maxImageSizeMb={activeMaxImageSizeMb}
          openProjectId={openProjectId}
          onOpenProject={setOpenProjectId}
          onCloseProject={() => setOpenProjectId(null)}
        />
      </div>
      <ConnectionsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SidebarProvider>
  );
}
