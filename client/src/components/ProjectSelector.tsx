import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FolderOpen, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@shared/schema";

interface ProjectSelectorProps {
  selectedProjectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  onManageProjects: () => void;
}

export function ProjectSelector({
  selectedProjectId,
  onProjectChange,
  onManageProjects,
}: ProjectSelectorProps) {
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  if (isLoading) {
    return (
      <Button variant="ghost" className="w-full justify-start gap-2" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between gap-2"
          data-testid="button-project-selector"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium truncate">
              {currentProject?.name || "All Conversations"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem
          onClick={() => onProjectChange(null)}
          className="flex flex-col items-start gap-0.5 py-2"
          data-testid="option-project-all"
        >
          <span className="font-medium">All Conversations</span>
          <span className="text-xs text-muted-foreground">View all chats</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {projects.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground text-center">
            No projects yet
          </div>
        ) : (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => onProjectChange(project.id)}
              className="flex flex-col items-start gap-0.5 py-2"
              data-testid={`option-project-${project.id}`}
            >
              <span className="font-medium truncate">{project.name}</span>
              {project.description && (
                <span className="text-xs text-muted-foreground truncate max-w-full">
                  {project.description}
                </span>
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={onManageProjects}
          data-testid="button-manage-projects"
        >
          <Plus className="h-4 w-4 mr-2" />
          Manage Projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
