import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, FolderOpen, ChevronDown, ChevronUp, Plus, FileText, Trash2 } from "lucide-react";
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
  rows?: number;
}

function FieldArea({ label, value, placeholder, testId, onChange, onBlur, rows = 4 }: FieldAreaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
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
  const [newFilePath, setNewFilePath] = useState("");
  const [addingFile, setAddingFile] = useState(false);

  const [fields, setFields] = useState({
    description: "",
    goals: "",
    recentChanges: "",
    activeIssues: "",
    currentTask: "",
    systemPrompt: "",
    folderPath: "",
    name: "",
    contextFiles: "[]",
  });

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (project) {
      setFields({
        description: project.description ?? "",
        goals: project.goals ?? "",
        recentChanges: project.recentChanges ?? "",
        activeIssues: project.activeIssues ?? "",
        currentTask: project.currentTask ?? "",
        systemPrompt: project.systemPrompt ?? "",
        folderPath: project.folderPath ?? "",
        name: project.name ?? "",
        contextFiles: project.contextFiles ?? "[]",
      });
    }
  }, [project]);

  const parsedFiles: string[] = (() => {
    try { return JSON.parse(fields.contextFiles); } catch { return []; }
  })();

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

  const addFile = () => {
    const path = newFilePath.trim();
    if (!path) return;
    const next = JSON.stringify([...parsedFiles, path]);
    setNewFilePath("");
    setAddingFile(false);
    handleChange("contextFiles", next);
    saveMutation.mutate({ contextFiles: next });
  };

  const removeFile = (index: number) => {
    const next = JSON.stringify(parsedFiles.filter((_, i) => i !== index));
    handleChange("contextFiles", next);
    saveMutation.mutate({ contextFiles: next });
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

          {/* LEFT — Context */}
          <div className="flex-1 flex flex-col gap-4 p-4 border-b md:border-b-0 md:border-r border-border/60">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pb-1 border-b border-border/40">
              Context
            </div>

            <FieldArea
              label="Description"
              value={fields.description}
              placeholder="A short summary of what this project is…"
              testId="textarea-project-description"
              onChange={v => handleChange("description", v)}
              onBlur={() => handleBlur("description")}
              rows={3}
            />

            <FieldArea
              label="Overarching Project"
              value={fields.goals}
              placeholder="The bigger picture — what is this project trying to achieve and why?"
              testId="textarea-project-goals"
              onChange={v => handleChange("goals", v)}
              onBlur={() => handleBlur("goals")}
              rows={5}
            />

            {/* Context Documents */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Context Documents
                </label>
                <button
                  onClick={() => setAddingFile(v => !v)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  data-testid="button-add-context-file"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>

              {parsedFiles.length === 0 && !addingFile && (
                <p className="text-[10px] text-muted-foreground/50 italic px-1">
                  No context files yet — add file paths the model should know about.
                </p>
              )}

              {parsedFiles.map((filePath, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border/50 group"
                  data-testid={`item-context-file-${i}`}
                >
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate flex-1 font-mono">{filePath}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    data-testid={`button-remove-context-file-${i}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {addingFile && (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={newFilePath}
                    onChange={e => setNewFilePath(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") addFile();
                      if (e.key === "Escape") { setAddingFile(false); setNewFilePath(""); }
                    }}
                    placeholder="/path/to/file.md"
                    className="flex-1 text-xs font-mono bg-muted/30 border border-border/50 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
                    data-testid="input-new-context-file"
                  />
                  <button
                    onClick={addFile}
                    className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    data-testid="button-confirm-add-context-file"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Working Space */}
          <div className="flex-1 flex flex-col gap-4 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pb-1 border-b border-border/40">
              Working Space
            </div>

            <FieldArea
              label="Recent Changes"
              value={fields.recentChanges}
              placeholder="What changed recently, what decisions were made…"
              testId="textarea-project-recent-changes"
              onChange={v => handleChange("recentChanges", v)}
              onBlur={() => handleBlur("recentChanges")}
              rows={6}
            />

            <FieldArea
              label="Active Issues"
              value={fields.activeIssues}
              placeholder="Known problems, open questions, blockers…"
              testId="textarea-project-active-issues"
              onChange={v => handleChange("activeIssues", v)}
              onBlur={() => handleBlur("activeIssues")}
              rows={6}
            />

            <FieldArea
              label="Tasks In Progress"
              value={fields.currentTask}
              placeholder="What's currently being worked on…"
              testId="textarea-project-tasks-in-progress"
              onChange={v => handleChange("currentTask", v)}
              onBlur={() => handleBlur("currentTask")}
              rows={6}
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
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">System Intent</label>
              <textarea
                value={fields.systemPrompt}
                onChange={e => handleChange("systemPrompt", e.target.value)}
                onBlur={() => handleBlur("systemPrompt")}
                placeholder="How should the AI behave in this project?"
                rows={3}
                className="w-full text-xs bg-muted/30 border border-border/50 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40 leading-relaxed"
                data-testid="textarea-project-system-prompt"
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
