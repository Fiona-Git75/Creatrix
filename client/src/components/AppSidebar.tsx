import { useState, useRef, useEffect } from "react";
import { Plus, Settings, FileText, ChevronDown, FolderOpen, NotebookPen, Bookmark, PanelRight, Users } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { ToolStatusChip } from "./ToolStatusChip";
import { RuntimeCoherencePanel } from "./RuntimeCoherencePanel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project, Settings as AppSettings } from "@shared/schema";

interface AppSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedProjectId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onProjectChange: (projectId: string | null) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onOpenDocs: () => void;
  onOpenMoments?: () => void;
  onOpenSystemLog?: () => void;
  onOpenResidents?: () => void;
}

export function AppSidebar({
  conversations,
  activeConversationId,
  selectedProjectId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onProjectChange,
  onOpenProject,
  onOpenSettings,
  onOpenDocs,
  onOpenMoments,
  onOpenSystemLog,
  onOpenResidents,
}: AppSidebarProps) {
  const [projectsDialogOpen, setProjectsDialogOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(true);
  const [localNote, setLocalNote] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: settingsData } = useQuery<AppSettings>({
    queryKey: ["/api/settings"],
  });

  const savedNote = settingsData?.dayNote ?? "";

  useEffect(() => {
    if (localNote === null && settingsData !== undefined) {
      setLocalNote(settingsData.dayNote ?? "");
    }
  }, [settingsData, localNote]);

  const saveMutation = useMutation({
    mutationFn: (note: string) => apiRequest("PATCH", "/api/settings", { dayNote: note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const handleNoteChange = (val: string) => {
    setLocalNote(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate(val), 800);
  };

  const handleNoteBlur = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const current = localNote ?? savedNote;
    if (current !== savedNote) saveMutation.mutate(current);
  };

  const displayNote = localNote ?? savedNote;

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;

  // Always show all conversations — project selection sets AI context, not a view filter
  const filteredConversations = conversations;

  const conversationLabel = "Conversations";

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

          {/* Conversations — top, takes all remaining space */}
          <SidebarGroup className="flex-1 min-h-0">
            <SidebarGroupLabel className="px-4">{conversationLabel}</SidebarGroupLabel>
            <SidebarGroupContent className="flex-1 min-h-0">
              <ScrollArea className="h-[calc(100vh-340px)] px-2">
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

          {/* Projects — bottom third, collapsible */}
          <SidebarGroup className="shrink-0 border-t border-border/40">
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
                      <div
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors flex items-start gap-2 group/proj ${
                          selectedProjectId === project.id
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <button
                          className="flex items-start gap-2 flex-1 min-w-0 text-left"
                          onClick={() => {
                            onProjectChange(project.id);
                            onNewChat();
                          }}
                          data-testid={`option-project-${project.id}`}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-60 mt-0.5" />
                          <span className="min-w-0">
                            <span className="truncate block">{project.name}</span>
                            {project.currentTask && (
                              <span className="text-xs font-normal opacity-60 truncate block">
                                ↳ {project.currentTask}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          className="shrink-0 opacity-0 group-hover/proj:opacity-60 hover:!opacity-100 transition-opacity mt-0.5"
                          onClick={e => { e.stopPropagation(); onOpenProject(project.id); }}
                          title="Open project panel"
                          data-testid={`button-open-project-panel-${project.id}`}
                        >
                          <PanelRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
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

          {/* Day Note — bottom, collapsible */}
          <SidebarGroup className="shrink-0 border-t border-border/40">
            <button
              onClick={() => setNoteOpen(o => !o)}
              className="flex items-center justify-between w-full px-4 py-1 group"
              data-testid="button-toggle-day-note"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                <NotebookPen className="h-3 w-3" />
                Day Note
              </span>
              <ChevronDown
                className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${noteOpen ? "" : "-rotate-90"}`}
              />
            </button>

            {noteOpen && (
              <SidebarGroupContent className="px-3 pb-2">
                <textarea
                  value={displayNote}
                  onChange={e => handleNoteChange(e.target.value)}
                  onBlur={handleNoteBlur}
                  placeholder="Start here tomorrow… what did we accomplish, where did we stop, what not to revisit?"
                  rows={4}
                  className="w-full text-xs text-foreground bg-muted/30 border border-border/50 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 leading-relaxed"
                  data-testid="textarea-day-note"
                />
                {saveMutation.isPending && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">saving…</p>
                )}
              </SidebarGroupContent>
            )}
          </SidebarGroup>

        </SidebarContent>

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
            onClick={onOpenResidents}
            data-testid="button-open-residents"
          >
            <Users className="h-4 w-4" />
            Residents
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={onOpenMoments}
            data-testid="button-open-moments"
          >
            <Bookmark className="h-4 w-4" />
            Moments
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
