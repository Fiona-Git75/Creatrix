import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Menu, RotateCcw, Brain, BookOpen, Search, Library, BookOpenCheck, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatMessage, type Message } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MemoryPanel } from "@/components/MemoryPanel";
import { KnowledgePanel } from "@/components/KnowledgePanel";
import { LibraryPanel } from "@/components/LibraryPanel";
import { JournalPanel } from "@/components/JournalPanel";
import { SystemLogPanel } from "@/components/SystemLogPanel";
import { SearchDialog } from "@/components/SearchDialog";
import { ToolCallCard, type ToolEvent } from "@/components/ToolCallCard";
import { type Conversation } from "@/components/ConversationItem";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Connection } from "@shared/schema";
import type { CapabilityName } from "@shared/schema";

interface ConversationData extends Conversation {
  messages: Message[];
  model: string;
}

function ChatContent({
  conversations,
  activeConversation,
  isLoading,
  streamingContent,
  toolEvents,
  selectedModel,
  selectedConnectionId,
  selectedProjectId,
  morningOrientationEnabled,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onSendMessage,
  onClearChat,
  onModelChange,
  onConnectionChange,
  onProjectChange,
}: {
  conversations: ConversationData[];
  activeConversation: ConversationData | null;
  isLoading: boolean;
  streamingContent: string;
  toolEvents: ToolEvent[];
  selectedModel: string;
  selectedConnectionId: string | null;
  selectedProjectId: string | null;
  morningOrientationEnabled: boolean;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSendMessage: (message: string) => void;
  onClearChat: () => void;
  onModelChange: (modelId: string) => void;
  onConnectionChange: (connectionId: string) => void;
  onProjectChange: (projectId: string | null) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useSidebar();
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(false);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [journalPanelOpen, setJournalPanelOpen] = useState(false);
  const [systemLogOpen, setSystemLogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

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
        selectedModel={selectedModel}
        selectedConnectionId={selectedConnectionId}
        selectedProjectId={selectedProjectId}
        morningOrientationEnabled={morningOrientationEnabled}
        onNewChat={onNewChat}
        onSelectConversation={onSelectConversation}
        onDeleteConversation={onDeleteConversation}
        onModelChange={onModelChange}
        onConnectionChange={onConnectionChange}
        onProjectChange={onProjectChange}
      />

      <div className="flex flex-col flex-1 h-screen">
        <header className="flex items-center justify-between gap-2 p-3 border-b sticky top-0 z-50 bg-background">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle">
              <Menu className="h-4 w-4" />
            </SidebarTrigger>
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
              onClick={() => setKnowledgePanelOpen(true)}
              data-testid="button-knowledge"
              aria-label="Knowledge Base"
            >
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMemoryPanelOpen(true)}
              data-testid="button-memory"
              aria-label="Memory"
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

        <MemoryPanel
          open={memoryPanelOpen}
          onOpenChange={setMemoryPanelOpen}
          projectId={selectedProjectId}
          conversationId={activeConversation?.id || null}
        />
        <KnowledgePanel
          open={knowledgePanelOpen}
          onOpenChange={setKnowledgePanelOpen}
          projectId={selectedProjectId}
        />
        <LibraryPanel open={libraryPanelOpen} onOpenChange={setLibraryPanelOpen} />
        <JournalPanel open={journalPanelOpen} onOpenChange={setJournalPanelOpen} />
        <SystemLogPanel open={systemLogOpen} onOpenChange={setSystemLogOpen} />
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
                  {displayMessages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isStreaming={message.id === "streaming"}
                    />
                  ))}

                  {/* Tool call cards shown during active generation */}
                  {toolEvents.length > 0 && (
                    <div className="px-4 py-1 max-w-3xl mx-auto">
                      {toolEvents.map(event => (
                        <ToolCallCard key={event.id} event={event} />
                      ))}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              <ChatInput onSend={onSendMessage} isLoading={isLoading} />
            </>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex-1">
                <EmptyState onSelectPrompt={onSendMessage} />
              </div>
              <ChatInput onSend={onSendMessage} isLoading={isLoading} />
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default function Chat() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [selectedModel, setSelectedModel] = useState("llama3.2");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
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

  useEffect(() => {
    if (connections.length > 0 && !selectedConnectionId) {
      const defaultConnection = connections.find((c) => c.isDefault) || connections[0];
      setSelectedConnectionId(defaultConnection.id);
      setSelectedModel(defaultConnection.defaultModel);
    }
  }, [connections, selectedConnectionId]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

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

  const handleConnectionChange = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    const connection = connections.find((c) => c.id === connectionId);
    if (connection) {
      setSelectedModel(connection.defaultModel);
    }
  };

  const handleSendMessage = async (content: string) => {
    setIsLoading(true);
    setStreamingContent("");
    setToolEvents([]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          projectId: selectedProjectId,
          connectionId: selectedConnectionId,
          message: content,
          model: selectedModel,
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
          try {
            const data = JSON.parse(line.slice(6));

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
            } else if (data.type === "tool_result") {
              const eventId = activeToolEvents.get(data.capability);
              if (eventId) {
                setToolEvents(prev => prev.map(e =>
                  e.id === eventId
                    ? { ...e, status: data.status === "success" ? "success" : "error", result: data.result, error: data.error }
                    : e
                ));
              }
            } else if (data.type === "done") {
              setStreamingContent("");
              setToolEvents([]);
              queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
              queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
            } else if (data.type === "error") {
              throw new Error(data.message);
            }
          } catch (parseError) {
            // Skip invalid JSON lines
          }
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
      setStreamingContent("");
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
          selectedModel={selectedModel}
          selectedConnectionId={selectedConnectionId}
          selectedProjectId={selectedProjectId}
          morningOrientationEnabled={settings?.morningOrientationEnabled ?? false}
          onNewChat={createNewChat}
          onSelectConversation={setActiveConversationId}
          onDeleteConversation={handleDeleteConversation}
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
          onModelChange={setSelectedModel}
          onConnectionChange={handleConnectionChange}
          onProjectChange={setSelectedProjectId}
        />
      </div>
    </SidebarProvider>
  );
}
