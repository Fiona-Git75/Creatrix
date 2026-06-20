import { useState } from "react";
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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { ConversationItem, type Conversation } from "./ConversationItem";
import { ProjectSelector } from "./ProjectSelector";
import { ProjectsDialog } from "./ProjectsDialog";
import { MorningOrientation } from "./MorningOrientation";
import { ToolStatusChip } from "./ToolStatusChip";

interface AppSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedProjectId: string | null;
  morningOrientationEnabled: boolean;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onProjectChange: (projectId: string | null) => void;
  onOpenSettings: () => void;
}

export function AppSidebar({
  conversations,
  activeConversationId,
  selectedProjectId,
  morningOrientationEnabled,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onProjectChange,
  onOpenSettings,
}: AppSidebarProps) {
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
              <ScrollArea className="h-[calc(100vh-260px)] px-2">
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

        {morningOrientationEnabled && <MorningOrientation />}

        <SidebarFooter className="border-t pt-2 pb-3 px-3 space-y-1">
          <ToolStatusChip onOpenSettings={onOpenSettings} />
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={onOpenSettings}
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </SidebarFooter>
      </Sidebar>

      <ProjectsDialog
        open={projectsDialogOpen}
        onOpenChange={setProjectsDialogOpen}
      />
    </>
  );
}
