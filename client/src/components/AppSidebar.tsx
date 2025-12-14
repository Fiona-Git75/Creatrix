import { useState } from "react";
import { Plus, Settings, FolderOpen, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { ConversationItem, type Conversation } from "./ConversationItem";
import { ModelSelector } from "./ModelSelector";
import { ConnectionSelector } from "./ConnectionSelector";
import { ProjectSelector } from "./ProjectSelector";
import { ConnectionsDialog } from "./ConnectionsDialog";
import { ProjectsDialog } from "./ProjectsDialog";

interface AppSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedModel: string;
  selectedConnectionId: string | null;
  selectedProjectId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onModelChange: (modelId: string) => void;
  onConnectionChange: (connectionId: string) => void;
  onProjectChange: (projectId: string | null) => void;
}

export function AppSidebar({
  conversations,
  activeConversationId,
  selectedModel,
  selectedConnectionId,
  selectedProjectId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onModelChange,
  onConnectionChange,
  onProjectChange,
}: AppSidebarProps) {
  const [connectionsDialogOpen, setConnectionsDialogOpen] = useState(false);
  const [projectsDialogOpen, setProjectsDialogOpen] = useState(false);

  const filteredConversations = selectedProjectId
    ? conversations.filter((c) => c.projectId === selectedProjectId)
    : conversations;

  return (
    <>
      <Sidebar>
        <SidebarHeader className="p-4 space-y-3">
          <Button
            onClick={onNewChat}
            className="w-full gap-2"
            data-testid="button-new-chat"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          
          <ProjectSelector
            selectedProjectId={selectedProjectId}
            onProjectChange={onProjectChange}
            onManageProjects={() => setProjectsDialogOpen(true)}
          />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-4">Conversations</SidebarGroupLabel>
            <SidebarGroupContent>
              <ScrollArea className="h-[calc(100vh-380px)] px-2">
                <SidebarMenu>
                  {filteredConversations.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {selectedProjectId ? "No conversations in this project" : "No conversations yet"}
                    </div>
                  ) : (
                    filteredConversations.map((conversation) => (
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
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 space-y-3 border-t">
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Server className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Connection</span>
            </div>
            <ConnectionSelector
              selectedConnectionId={selectedConnectionId}
              onConnectionChange={onConnectionChange}
              onManageConnections={() => setConnectionsDialogOpen(true)}
            />
          </div>
          
          <ModelSelector
            selectedModel={selectedModel}
            connectionId={selectedConnectionId}
            onModelChange={onModelChange}
          />
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => setConnectionsDialogOpen(true)}
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </SidebarFooter>
      </Sidebar>

      <ConnectionsDialog
        open={connectionsDialogOpen}
        onOpenChange={setConnectionsDialogOpen}
      />
      
      <ProjectsDialog
        open={projectsDialogOpen}
        onOpenChange={setProjectsDialogOpen}
      />
    </>
  );
}
