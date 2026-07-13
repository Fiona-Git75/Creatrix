import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Menu, RotateCcw, Brain, Search, Library, BookOpenCheck, Activity, Cpu, ChevronDown, Check, Loader2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
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
  onSelectConnection,
}: {
  conn: Connection;
  selectedConnectionId: string | null;
  onSelectConnection: (connectionId: string, model: string) => void;
}) {
  const { data, isLoading } = useQuery<ModelsResponse>({
    queryKey: ["/api/connections", conn.id, "models"],
    retry: false,
    staleTime: 30_000,
  });

  const models = data?.models ?? [];
  const isOffline = data?.status === "offline" || data?.status === "error";
  const isSelected = selectedConnectionId === conn.id;

  const dotClass = isLoading
    ? "bg-yellow-400 animate-pulse"
    : isOffline
    ? "bg-red-400"
    : "bg-green-500";

  const handleSelect = () => {
    if (isOffline || isLoading) return;
    const model = conn.defaultModel || models[0]?.id || "";
    if (model) onSelectConnection(conn.id, model);
  };

  return (
    <DropdownMenuItem
      onClick={handleSelect}
      disabled={isLoading || isOffline}
      className="flex items-center justify-between gap-2 py-2"
      data-testid={`option-connection-${conn.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
        {conn.residentEmoji && <span className="text-sm leading-none">{conn.residentEmoji}</span>}
        <span className="text-sm truncate">{conn.residentName || conn.name}</span>
        {isOffline && <span className="text-xs text-muted-foreground">· offline</span>}
      </div>
      {isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
    </DropdownMenuItem>
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
  guestConnectionId,
  respondingMode,
  streamingConnectionId,
  onGuestChange,
  onRespondingModeChange,
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
  guestConnectionId: string | null;
  respondingMode: "primary" | "both";
  streamingConnectionId: string | null;
  onGuestChange: (id: string | null) => void;
  onRespondingModeChange: (mode: "primary" | "both") => void;
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
      role: "assistant" as const,
      content: streamingContent,
      connectionId: streamingConnectionId ?? undefined,
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
                    {(() => {
                      const sel = connections.find(c => c.id === selectedConnectionId);
                      return sel ? (sel.residentName || sel.name) : "Select resident";
                    })()}
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
                        onSelectConnection={onSelectConnection}
                      />
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Council mode: guest resident selector */}
            {connections.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={guestConnectionId ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 gap-1.5 text-xs px-2"
                    data-testid="button-council-selector"
                    aria-label="Council mode — add a guest resident"
                  >
                    {guestConnectionId ? (
                      <>
                        {connections.find(c => c.id === guestConnectionId)?.residentEmoji && (
                          <span className="text-sm leading-none">
                            {connections.find(c => c.id === guestConnectionId)?.residentEmoji}
                          </span>
                        )}
                        <span className="max-w-[100px] truncate text-foreground">
                          {connections.find(c => c.id === guestConnectionId)?.residentName
                            ?? connections.find(c => c.id === guestConnectionId)?.name
                            ?? "Guest"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </>
                    ) : (
                      <>
                        <Users className="h-3 w-3" />
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Council — guest resident</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {connections
                    .filter(c => c.id !== selectedConnectionId)
                    .map(c => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => onGuestChange(guestConnectionId === c.id ? null : c.id)}
                        className="flex items-center gap-2 text-xs"
                        data-testid={`council-guest-${c.id}`}
                      >
                        {guestConnectionId === c.id
                          ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          : <span className="w-3.5 h-3.5 shrink-0" />}
                        {c.residentEmoji && <span className="text-sm leading-none">{c.residentEmoji}</span>}
                        <span className="truncate">{c.residentName ?? c.name}</span>
                      </DropdownMenuItem>
                    ))}
                  {guestConnectionId && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Response mode</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => onRespondingModeChange("primary")}
                        className="text-xs gap-2"
                        data-testid="council-mode-primary"
                      >
                        {respondingMode === "primary"
                          ? <Check className="h-3.5 w-3.5 text-primary" />
                          : <span className="w-3.5 h-3.5" />}
                        Primary only
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onRespondingModeChange("both")}
                        className="text-xs gap-2"
                        data-testid="council-mode-both"
                      >
                        {respondingMode === "both"
                          ? <Check className="h-3.5 w-3.5 text-primary" />
                          : <span className="w-3.5 h-3.5" />}
                        Ask both
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => { onGuestChange(null); onRespondingModeChange("primary"); }}
                        className="text-xs gap-2 text-muted-foreground"
                        data-testid="council-dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                        Dismiss council
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {hasMessages && (
              <span className="text-sm font-medium truncate max-w-[200px]">
                {activeConversation?.title}
              </span>
            )}
          </div>
          <TooltipProvider delayDuration={400}>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSearchDialogOpen(true)}
                    data-testid="button-search"
                    aria-label="Search"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Search</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setJournalPanelOpen(true)}
                    data-testid="button-journal"
                    aria-label="Journal"
                  >
                    <BookOpenCheck className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Journal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setLibraryPanelOpen(true)}
                    data-testid="button-library"
                    aria-label="Library"
                  >
                    <Library className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Library</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setMemoryPanelOpen(true)}
                    data-testid="button-continuity"
                    aria-label="Continuity"
                  >
                    <Brain className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Continuity</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSystemLogOpen(true)}
                    data-testid="button-system-log"
                    aria-label="System Log"
                  >
                    <Activity className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">System Log</TooltipContent>
              </Tooltip>
              {hasMessages && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={onClearChat}
                      data-testid="button-clear-chat"
                      aria-label="Clear conversation"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Clear conversation</TooltipContent>
                </Tooltip>
              )}
              <ThemeToggle />
            </div>
          </TooltipProvider>
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
                      connections={connections}
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
  const [streamingConnectionId, setStreamingConnectionId] = useState<string | null>(null);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [openDocId, setOpenDocId] = useState<string | null | undefined>(undefined);
  const [pinnedDocId, setPinnedDocId] = useState<string | null>(null);
  const [guestConnectionId, setGuestConnectionId] = useState<string | null>(null);
  const [respondingMode, setRespondingMode] = useState<"primary" | "both">("primary");
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

  // Streams a single chat request and processes server-sent events.
  // Returns the conversationId discovered during streaming (if any).
  const streamChatRequest = async (opts: {
    conversationId: string | null;
    connectionId: string | null;
    respondingConnectionId?: string;
    skipUserMessage?: boolean;
    message: string;
    model?: string;
    images?: AttachedImage[];
    onConversationId?: (id: string) => void;
  }): Promise<{ streamDone: boolean; partialContent: boolean }> => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: opts.conversationId ?? undefined,
        projectId: selectedProjectId ?? undefined,
        connectionId: opts.connectionId ?? undefined,
        respondingConnectionId: opts.respondingConnectionId,
        skipUserMessage: opts.skipUserMessage,
        message: opts.message,
        model: opts.model || undefined,
        imageBase64s: opts.images && opts.images.length > 0 ? opts.images.map(img => img.base64) : undefined,
        imageMimeTypes: opts.images && opts.images.length > 0 ? opts.images.map(img => img.mimeType) : undefined,
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
    const activeToolEvents = new Map<string, string>();
    let eventCounter = 0;
    let streamDoneReceived = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        let data: any;
        try {
          data = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (data.type === "conversation_id") {
          opts.onConversationId?.(data.id);
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
          throw new Error(data.message || data.error || "Stream error from provider");
        }
      }
    }

    const partialContent = !streamDoneReceived && accumulated.length > 0;
    return { streamDone: streamDoneReceived, partialContent };
  };

  const handleSendMessage = async (content: string, images?: AttachedImage[]) => {
    setIsLoading(true);
    setStreamingContent("");
    setToolEvents([]);

    let keepPartialContent = false;

    // Capture the conversationId at call time; may be updated after new-conversation creation.
    let currentConversationId = activeConversationId;

    try {
      // --- Primary response ---
      setStreamingConnectionId(selectedConnectionId);
      const primary = await streamChatRequest({
        conversationId: currentConversationId,
        connectionId: selectedConnectionId,
        message: content,
        model: selectedModel,
        images,
        onConversationId: (id) => {
          if (!currentConversationId) {
            currentConversationId = id;
            setActiveConversationId(id);
          }
        },
      });

      if (primary.partialContent) {
        keepPartialContent = true;
        toast({
          title: "Connection dropped",
          description: "The response was cut short. Partial content is shown above.",
          variant: "destructive",
        });
      }

      // --- Council: guest response (ask both mode) ---
      if (primary.streamDone && respondingMode === "both" && guestConnectionId && currentConversationId) {
        setStreamingConnectionId(guestConnectionId);
        setStreamingContent("");
        const guest = await streamChatRequest({
          conversationId: currentConversationId,
          connectionId: selectedConnectionId,
          respondingConnectionId: guestConnectionId,
          skipUserMessage: true,
          message: content,
        });
        if (guest.partialContent) {
          keepPartialContent = true;
          toast({
            title: "Connection dropped",
            description: "Guest response was cut short. Partial content is shown above.",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setStreamingConnectionId(null);
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
          streamingConnectionId={streamingConnectionId}
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
          guestConnectionId={guestConnectionId}
          respondingMode={respondingMode}
          onGuestChange={setGuestConnectionId}
          onRespondingModeChange={setRespondingMode}
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
