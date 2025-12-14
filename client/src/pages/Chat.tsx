import { useState, useRef, useEffect } from "react";
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

interface ConversationData extends Conversation {
  messages: Message[];
}

function ChatContent({
  conversations,
  activeConversation,
  isLoading,
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
  }, [activeConversation?.messages]);

  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0;

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
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isStreaming={isLoading && index === messages.length - 1 && message.role === "assistant"}
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
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4o");

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  const createNewChat = () => {
    const newConversation: ConversationData = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
  };

  const handleSendMessage = async (content: string) => {
    let currentConversationId = activeConversationId;

    if (!currentConversationId) {
      const newConversation: ConversationData = {
        id: crypto.randomUUID(),
        title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
        messages: [],
      };
      setConversations((prev) => [newConversation, ...prev]);
      currentConversationId = newConversation.id;
      setActiveConversationId(currentConversationId);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === currentConversationId) {
          const updatedTitle = c.messages.length === 0
            ? content.slice(0, 50) + (content.length > 50 ? "..." : "")
            : c.title;
          return {
            ...c,
            title: updatedTitle,
            messages: [...c.messages, userMessage],
          };
        }
        return c;
      })
    );

    setIsLoading(true);

    // todo: remove mock functionality - replace with actual API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `This is a simulated response to: "${content}"\n\nIn the full implementation, this would connect to OpenAI's API using the ${selectedModel} model to generate intelligent responses.`,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === currentConversationId) {
          return {
            ...c,
            messages: [...c.messages, assistantMessage],
          };
        }
        return c;
      })
    );

    setIsLoading(false);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  };

  const handleClearChat = () => {
    if (activeConversationId) {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConversationId) {
            return { ...c, messages: [] };
          }
          return c;
        })
      );
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
