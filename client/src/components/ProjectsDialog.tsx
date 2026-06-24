import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Pencil, FolderOpen, BrainCircuit, ChevronDown, ChevronRight } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Connection, Consultant } from "@shared/schema";

interface ProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectsDialog({ open, onOpenChange }: ProjectsDialogProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedConsultantsId, setExpandedConsultantsId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    folderPath: "",
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
      folderPath: "",
    });
  };

  const startEditing = (project: Project) => {
    setEditingId(project.id);
    setFormData({
      name: project.name,
      description: project.description || "",
      systemPrompt: project.systemPrompt || "",
      folderPath: project.folderPath || "",
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
                      <div className="space-y-3">
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
                            {project.folderPath && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 line-clamp-1">
                                <FolderOpen className="h-3 w-3 shrink-0" />
                                {project.folderPath}
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

                        <ConsultantsSection
                          projectId={project.id}
                          expanded={expandedConsultantsId === project.id}
                          onToggle={() =>
                            setExpandedConsultantsId(
                              expandedConsultantsId === project.id ? null : project.id
                            )
                          }
                        />
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
  formData: { name: string; description: string; systemPrompt: string; folderPath: string };
  setFormData: (data: { name: string; description: string; systemPrompt: string; folderPath: string }) => void;
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
        <Label htmlFor="project-folder-path" className="flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5" />
          Project Folder (optional)
        </Label>
        <Input
          id="project-folder-path"
          value={formData.folderPath}
          onChange={(e) => setFormData({ ...formData, folderPath: e.target.value })}
          placeholder="/home/user/my-project"
          data-testid="input-project-folder-path"
        />
        <p className="text-xs text-muted-foreground">
          Filesystem tools and library browsing will be scoped to this folder when this project is active.
        </p>
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

interface ConsultantsSectionProps {
  projectId: string;
  expanded: boolean;
  onToggle: () => void;
}

function ConsultantsSection({ projectId, expanded, onToggle }: ConsultantsSectionProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [consultantForm, setConsultantForm] = useState({
    name: "",
    description: "",
    connectionId: "",
    model: "",
    systemPrompt: "",
  });

  const { data: consultants = [], isLoading } = useQuery<Consultant[]>({
    queryKey: ["/api/projects", projectId, "consultants"],
    queryFn: () => fetch(`/api/projects/${projectId}/consultants`).then(r => r.json()),
    enabled: expanded,
  });

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
    enabled: expanded && isAdding,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof consultantForm) => {
      return await apiRequest("POST", `/api/projects/${projectId}/consultants`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "consultants"] });
      setIsAdding(false);
      setConsultantForm({ name: "", description: "", connectionId: "", model: "", systemPrompt: "" });
      toast({ title: "Consultant added" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add consultant", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/consultants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "consultants"] });
      toast({ title: "Consultant removed" });
    },
  });

  const handleConsultantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultantForm.name || !consultantForm.connectionId || !consultantForm.model || !consultantForm.description) return;
    createMutation.mutate(consultantForm);
  };

  return (
    <div className="border-t border-border/40 pt-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        onClick={onToggle}
        data-testid={`button-toggle-consultants-${projectId}`}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <BrainCircuit className="h-3 w-3 shrink-0" />
        <span>Consultants</span>
        {!expanded && consultants.length > 0 && (
          <span className="ml-auto text-[10px] text-violet-500/70">{consultants.length} configured</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          ) : consultants.length === 0 && !isAdding ? (
            <p className="text-xs text-muted-foreground py-1">
              No consultants yet. Add one to let the primary model call specialist models as tools.
            </p>
          ) : (
            <div className="space-y-1">
              {consultants.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5 text-xs"
                  data-testid={`consultant-card-${c.id}`}
                >
                  <BrainCircuit className="h-3 w-3 mt-0.5 shrink-0 text-violet-500/60" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground ml-2">{c.model}</span>
                    <p className="text-muted-foreground/70 mt-0.5 line-clamp-1">{c.description}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 shrink-0"
                    onClick={() => deleteMutation.mutate(c.id)}
                    data-testid={`button-delete-consultant-${c.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {isAdding ? (
            <form onSubmit={handleConsultantSubmit} className="space-y-2 border border-border/40 rounded-md p-3 bg-muted/10">
              <p className="text-xs font-medium text-foreground/80">Add Consultant</p>

              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={consultantForm.name}
                  onChange={(e) => setConsultantForm({ ...consultantForm, name: e.target.value })}
                  placeholder="Vision Consultant"
                  className="h-7 text-xs"
                  data-testid="input-consultant-name"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Description <span className="text-muted-foreground">(shown to primary model)</span></Label>
                <Input
                  value={consultantForm.description}
                  onChange={(e) => setConsultantForm({ ...consultantForm, description: e.target.value })}
                  placeholder="Specialist for analyzing images and visual content"
                  className="h-7 text-xs"
                  data-testid="input-consultant-description"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Connection</Label>
                <Select
                  value={consultantForm.connectionId}
                  onValueChange={(v) => setConsultantForm({ ...consultantForm, connectionId: v })}
                >
                  <SelectTrigger className="h-7 text-xs" data-testid="select-consultant-connection">
                    <SelectValue placeholder="Pick a connection" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id} className="text-xs">
                        {conn.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Model</Label>
                <Input
                  value={consultantForm.model}
                  onChange={(e) => setConsultantForm({ ...consultantForm, model: e.target.value })}
                  placeholder="moondream, llama3.2, gpt-4o…"
                  className="h-7 text-xs"
                  data-testid="input-consultant-model"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Role / System Prompt</Label>
                <Textarea
                  value={consultantForm.systemPrompt}
                  onChange={(e) => setConsultantForm({ ...consultantForm, systemPrompt: e.target.value })}
                  placeholder="You are a vision specialist. Analyze images and describe what you see in detail..."
                  className="min-h-[60px] text-xs"
                  data-testid="input-consultant-system-prompt"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setIsAdding(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-6 text-xs"
                  disabled={createMutation.isPending}
                  data-testid="button-save-consultant"
                >
                  {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Add
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={() => setIsAdding(true)}
              data-testid={`button-add-consultant-${projectId}`}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add consultant
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
