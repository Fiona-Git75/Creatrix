import { useState } from "react";
import { Plus, Settings, FileText, ChevronDown, FolderOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { ProjectsDialog } from "./ProjectsDialog";
import { MorningOrientation } from "./MorningOrientation";
import { ToolStatusChip } from "./ToolStatusChip";
import { RuntimeCoherencePanel } from "./RuntimeCoherencePanel";
import type { Project } from "@shared/schema";

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
  const [projectsOpen, setProjectsOpen] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;

  const filteredConversations = selectedProjectId
    ? conversations.filter((c) => c.projectId === selectedProjectId)
    : conversations;

  const conversationLabel = selectedProject ? selectedProject.name : "Conversations";

  return (
    <>
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

        <SidebarContent className="flex flex-col min-h-0">
          {/* Projects — collapsible section */}
          <SidebarGroup className="shrink-0">
            <button
              onClick={() => setProjectsOpen(o => !o)}
              className="flex items-center justify-between w-full px-4 py-1 group"
              data-testid="button-toggle-projects"
            >
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                Projects
              </span>
              <ChevronDown
                className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${projectsOpen ? "" : "-rotate-90"}`}
              />
            </button>

            {projectsOpen && (
              <SidebarGroupContent className="px-2 pb-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <button
                      onClick={() => onProjectChange(null)}
                      className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                        !selectedProjectId
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                      data-testid="option-project-all"
                    >
                      All conversations
                    </button>
                  </SidebarMenuItem>

                  {projects.map(project => (
                    <SidebarMenuItem key={project.id}>
                      <button
                        onClick={() => {
                          onProjectChange(project.id);
                          onNewChat();
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                          selectedProjectId === project.id
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                        data-testid={`option-project-${project.id}`}
                      >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{project.name}</span>
                      </button>
                    </SidebarMenuItem>
                  ))}

                  {projects.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No projects yet
                    </div>
                  )}

                  <SidebarMenuItem>
                    <button
                      onClick={() => setProjectsDialogOpen(true)}
                      className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md hover:bg-accent/50 transition-colors"
                      data-testid="button-manage-projects"
                    >
                      <Plus className="h-3 w-3" />
                      Manage projects
                    </button>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>

          {/* Conversations */}
          <SidebarGroup className="flex-1 min-h-0">
            <SidebarGroupLabel className="px-4">{conversationLabel}</SidebarGroupLabel>
            <SidebarGroupContent className="flex-1 min-h-0">
              <ScrollArea className="h-[calc(100vh-230px)] px-2">
                <SidebarMenu>
                  {filteredConversations.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {selectedProjectId ? "No conversations in this project yet" : "No conversations yet"}
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
          <RuntimeCoherencePanel onOpenSystemLog={onOpenSystemLog} />
          <ToolStatusChip onOpenSettings={onOpenSettings} />
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
        </SidebarFooter>
      </Sidebar>

      <ProjectsDialog
        open={projectsDialogOpen}
        onOpenChange={setProjectsDialogOpen}
      />
    </>
  );
}
