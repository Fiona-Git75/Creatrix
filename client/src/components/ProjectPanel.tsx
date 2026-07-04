import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

interface ProjectPanelProps {
  projectId: string;
  onClose: () => void;
}

interface FieldAreaProps {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function FieldArea({ label, value, placeholder, testId, onChange, onBlur }: FieldAreaProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={3}
        className="w-full text-xs bg-muted/30 border border-border/50 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40 leading-relaxed"
        data-testid={testId}
      />
    </div>
  );
}

export function ProjectPanel({ projectId, onClose }: ProjectPanelProps) {
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then(r => r.json()),
    enabled: !!projectId,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [fields, setFields] = useState({
    goals: "",
    architecturalNotes: "",
    workState: "",
    recentChanges: "",
    activeIssues: "",
    systemPrompt: "",
    folderPath: "",
    currentTask: "",
    name: "",
    description: "",
  });

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (project) {
      setFields({
        goals: project.goals ?? "",
        architecturalNotes: project.architecturalNotes ?? "",
        workState: project.workState ?? "",
        recentChanges: project.recentChanges ?? "",
        activeIssues: project.activeIssues ?? "",
        systemPrompt: project.systemPrompt ?? "",
        folderPath: project.folderPath ?? "",
        currentTask: project.currentTask ?? "",
        name: project.name ?? "",
        description: project.description ?? "",
      });
    }
  }, [project]);

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<typeof fields>) =>
      apiRequest("PATCH", `/api/projects/${projectId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    },
  });

  const handleChange = (key: keyof typeof fields, value: string) => {
    setFields(f => ({ ...f, [key]: value }));
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => saveMutation.mutate({ [key]: value }), 900);
  };

  const handleBlur = (key: keyof typeof fields) => {
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveMutation.mutate({ [key]: fields[key] });
  };

  if (!project) return null;

  return (
    <div className="flex flex-col h-full bg-background border-l border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-semibold text-sm truncate">{project.name}</span>
          {project.folderPath && (
            <span className="text-[10px] text-muted-foreground truncate hidden sm:block">{project.folderPath}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          data-testid="button-close-project-panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col md:flex-row gap-0 h-full">

          {/* CONTEXT column */}
          <div className="flex-1 flex flex-col gap-4 p-4 border-b md:border-b-0 md:border-r border-border/60">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pb-1 border-b border-border/40">
              Context
            </div>

            <FieldArea
              label="Goals"
              value={fields.goals}
              placeholder="What is this project trying to achieve?"
              testId="textarea-project-goals"
              onChange={v => handleChange("goals", v)}
              onBlur={() => handleBlur("goals")}
            />

            <FieldArea
              label="System Intent"
              value={fields.systemPrompt}
              placeholder="How should the AI behave in this project?"
              testId="textarea-project-system-prompt"
              onChange={v => handleChange("systemPrompt", v)}
              onBlur={() => handleBlur("systemPrompt")}
            />

            <FieldArea
              label="Architectural Notes"
              value={fields.architecturalNotes}
              placeholder="Key structural decisions, patterns, constraints…"
              testId="textarea-project-architectural-notes"
              onChange={v => handleChange("architecturalNotes", v)}
              onBlur={() => handleBlur("architecturalNotes")}
            />

            <FieldArea
              label="Description"
              value={fields.description}
              placeholder="Short summary of this project"
              testId="textarea-project-description"
              onChange={v => handleChange("description", v)}
              onBlur={() => handleBlur("description")}
            />
          </div>

          {/* WORKING SPACE column */}
          <div className="flex-1 flex flex-col gap-4 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pb-1 border-b border-border/40">
              Working Space
            </div>

            <FieldArea
              label="Current Task"
              value={fields.currentTask}
              placeholder="What are we working on right now?"
              testId="textarea-project-current-task"
              onChange={v => handleChange("currentTask", v)}
              onBlur={() => handleBlur("currentTask")}
            />

            <FieldArea
              label="Work State"
              value={fields.workState}
              placeholder="Where things stand — what's in flight, what's blocked…"
              testId="textarea-project-work-state"
              onChange={v => handleChange("workState", v)}
              onBlur={() => handleBlur("workState")}
            />

            <FieldArea
              label="Recent Changes"
              value={fields.recentChanges}
              placeholder="What changed recently, what decisions were made…"
              testId="textarea-project-recent-changes"
              onChange={v => handleChange("recentChanges", v)}
              onBlur={() => handleBlur("recentChanges")}
            />

            <FieldArea
              label="Active Issues"
              value={fields.activeIssues}
              placeholder="Known problems, open questions, blockers…"
              testId="textarea-project-active-issues"
              onChange={v => handleChange("activeIssues", v)}
              onBlur={() => handleBlur("activeIssues")}
            />
          </div>
        </div>
      </div>

      {/* Settings — collapsible strip at bottom */}
      <div className="shrink-0 border-t border-border">
        <button
          className="flex items-center justify-between w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          onClick={() => setSettingsOpen(o => !o)}
          data-testid="button-toggle-project-settings"
        >
          <span className="font-semibold uppercase tracking-widest text-[10px]">Project Settings</span>
          {settingsOpen
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />}
        </button>

        {settingsOpen && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Folder Path</label>
              <input
                type="text"
                value={fields.folderPath}
                onChange={e => handleChange("folderPath", e.target.value)}
                onBlur={() => handleBlur("folderPath")}
                placeholder="/path/to/project"
                className="w-full text-xs bg-muted/30 border border-border/50 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
                data-testid="input-project-folder-path"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Name</label>
              <input
                type="text"
                value={fields.name}
                onChange={e => handleChange("name", e.target.value)}
                onBlur={() => handleBlur("name")}
                placeholder="Project name"
                className="w-full text-xs bg-muted/30 border border-border/50 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
                data-testid="input-project-name"
              />
            </div>
            {saveMutation.isPending && (
              <p className="text-[10px] text-muted-foreground">saving…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
