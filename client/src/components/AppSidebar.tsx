import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, FileText, Activity } from "lucide-react";
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
  onOpenDocs: () => void;
  onOpenSystemLog?: () => void;
}

interface SimpleHealth {
  status: "ok" | "degraded" | "unwell";
  headline: string;
  canChat: boolean;
  issues: { component: string; severity: string; message: string; whyItMatters: string; action: string }[];
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
  onOpenDocs,
  onOpenSystemLog,
}: AppSidebarProps) {
  const [projectsDialogOpen, setProjectsDialogOpen] = useState(false);

  const { data: health } = useQuery<SimpleHealth>({
    queryKey: ["/api/system/health"],
    refetchInterval: 30_000,
  });

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
          {/* Health indicator — always visible, reflects whether chat actually works */}
          {health && health.status !== "ok" && (
            <button
              onClick={onOpenSystemLog}
              title={health.headline}
              data-testid="button-health-indicator"
              className={`w-full flex items-start gap-2 px-3 py-2 rounded-md text-left text-xs transition-colors hover:bg-accent ${
                health.status === "unwell"
                  ? "bg-destructive/10 border border-destructive/20"
                  : "bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
              }`}
            >
              <span className={`mt-0.5 shrink-0 h-2 w-2 rounded-full ${
                health.status === "unwell" ? "bg-destructive animate-pulse" : "bg-amber-500"
              }`} />
              <div className="min-w-0">
                <p className={`font-medium leading-tight truncate ${
                  health.status === "unwell" ? "text-destructive" : "text-amber-700 dark:text-amber-400"
                }`}>
                  {health.issues[0]?.message ?? health.headline}
                </p>
                <p className="text-muted-foreground truncate mt-0.5">
                  {health.issues[0]?.action ?? "Open System Log for details"}
                </p>
              </div>
            </button>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={onOpenDocs}
            data-testid="button-open-docs"
          >
            <FileText className="h-4 w-4" />
            Documents
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={onOpenSettings}
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={onOpenSystemLog}
            data-testid="button-system-log-sidebar"
          >
            <Activity className="h-4 w-4" />
            System Log
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
