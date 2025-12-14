import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";

interface ProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectsDialog({ open, onOpenChange }: ProjectsDialogProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    systemPrompt: "",
  });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsAdding(false);
      resetForm();
      toast({ title: "Project created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create project", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return await apiRequest("PATCH", `/api/projects/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditingId(null);
      resetForm();
      toast({ title: "Project updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update project", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      systemPrompt: "",
    });
  };

  const startEditing = (project: Project) => {
    setEditingId(project.id);
    setFormData({
      name: project.name,
      description: project.description || "",
      systemPrompt: project.systemPrompt || "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const isFormVisible = isAdding || editingId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Projects</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : projects.length === 0 && !isFormVisible ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-2">Projects organize your conversations</p>
                <p className="text-sm mb-4">Each project can have its own system prompt and context.</p>
                <Button onClick={() => setIsAdding(true)} data-testid="button-add-first-project">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Project
                </Button>
              </div>
            ) : (
              <>
                {projects.map((project) => (
                  <Card key={project.id} className="p-4">
                    {editingId === project.id ? (
                      <ProjectForm
                        formData={formData}
                        setFormData={setFormData}
                        onSubmit={handleSubmit}
                        onCancel={handleCancel}
                        isLoading={updateMutation.isPending}
                        submitLabel="Save Changes"
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{project.name}</span>
                          {project.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {project.description}
                            </p>
                          )}
                          {project.systemPrompt && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              System prompt configured
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEditing(project)}
                            data-testid={`button-edit-project-${project.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(project.id)}
                            data-testid={`button-delete-project-${project.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}

                {!isFormVisible && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsAdding(true)}
                    data-testid="button-add-project"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                )}
              </>
            )}

            {isAdding && (
              <Card className="p-4">
                <ProjectForm
                  formData={formData}
                  setFormData={setFormData}
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                  isLoading={createMutation.isPending}
                  submitLabel="Create Project"
                />
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectFormProps {
  formData: { name: string; description: string; systemPrompt: string };
  setFormData: (data: { name: string; description: string; systemPrompt: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isLoading: boolean;
  submitLabel: string;
}

function ProjectForm({ formData, setFormData, onSubmit, onCancel, isLoading, submitLabel }: ProjectFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="My Project"
          data-testid="input-project-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="project-description">Description (optional)</Label>
        <Input
          id="project-description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of this project"
          data-testid="input-project-description"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="project-system-prompt">System Prompt (optional)</Label>
        <Textarea
          id="project-system-prompt"
          value={formData.systemPrompt}
          onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant specialized in..."
          className="min-h-[100px]"
          data-testid="input-project-system-prompt"
        />
        <p className="text-xs text-muted-foreground">
          This prompt will be added to all conversations in this project.
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} data-testid="button-save-project">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
