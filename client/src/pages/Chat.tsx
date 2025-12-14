import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Menu, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatMessage, type Message } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { type Conversation } from "@/components/ConversationItem";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ConversationData extends Conversation {
  messages: Message[];
  model: string;
}

function ChatContent({
  conversations,
  activeConversation,
  isLoading,
  streamingContent,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onSendMessage,
  onClearChat,
  selectedModel,
  onModelChange,
}: {
  conversations: ConversationData[];
  activeConversation: ConversationData | null;
  isLoading: boolean;
  streamingContent: string;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSendMessage: (message: string) => void;
  onClearChat: () => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useSidebar();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages, streamingContent]);

  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0 || streamingContent;

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
        onNewChat={onNewChat}
        onSelectConversation={onSelectConversation}
        onDeleteConversation={onDeleteConversation}
        onModelChange={onModelChange}
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

        <main className="flex-1 overflow-hidden flex flex-col">
          {hasMessages ? (
            <>
              <ScrollArea className="flex-1">
                <div className="py-4">
                  {displayMessages.map((message, index) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isStreaming={message.id === "streaming"}
                    />
                  ))}
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
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const { toast } = useToast();

  const { data: conversations = [], isLoading: isLoadingConversations } = useQuery<ConversationData[]>({
    queryKey: ["/api/conversations"],
  });

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
  };

  const handleSendMessage = async (content: string) => {
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "conversation_id" && !activeConversationId) {
                setActiveConversationId(data.id);
              } else if (data.type === "content") {
                accumulated += data.content;
                setStreamingContent(accumulated);
              } else if (data.type === "done") {
                setStreamingContent("");
                queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
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
          onNewChat={createNewChat}
          onSelectConversation={setActiveConversationId}
          onDeleteConversation={handleDeleteConversation}
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
    </SidebarProvider>
  );
}
