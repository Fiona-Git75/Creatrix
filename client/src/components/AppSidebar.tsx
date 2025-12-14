import { Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ConversationItem, type Conversation } from "./ConversationItem";
import { ModelSelector } from "./ModelSelector";

interface AppSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedModel: string;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onModelChange: (modelId: string) => void;
}

export function AppSidebar({
  conversations,
  activeConversationId,
  selectedModel,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onModelChange,
}: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Button
          onClick={onNewChat}
          className="w-full gap-2"
          data-testid="button-new-chat"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="flex-1 px-2">
          <SidebarMenu>
            {conversations.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              conversations.map((conversation) => (
                <SidebarMenuItem key={conversation.id}>
                  <ConversationItem
                    conversation={conversation}
                    isActive={conversation.id === activeConversationId}
                    onClick={() => onSelectConversation(conversation.id)}
                    onDelete={() => onDeleteConversation(conversation.id)}
                  />
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3 border-t">
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          data-testid="button-settings"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
