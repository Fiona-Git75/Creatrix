import { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, FileText, Eye, Edit3, Trash2, ChevronDown, Download, Pin, PinOff } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WorkspaceDoc } from "@shared/schema";

// ─── Inline markdown renderer ─────────────────────────────────────────────────

function escHtml(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inlineMd(t: string) {
  return escHtml(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="inline-code">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  let listType = "";

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { if (inList) { out.push(`</${listType}>`); inList = false; } out.push('<pre class="md-pre"><code>'); inCode = true; }
      continue;
    }
    if (inCode) { out.push(escHtml(line)); continue; }

    const isBullet = /^[-*] /.test(line);
    const isOrdered = /^\d+\. /.test(line);
    if (inList && !isBullet && !isOrdered) { out.push(`</${listType}>`); inList = false; }

    if (/^### /.test(line))      { out.push(`<h3 class="md-h3">${inlineMd(line.slice(4))}</h3>`); }
    else if (/^## /.test(line))  { out.push(`<h2 class="md-h2">${inlineMd(line.slice(3))}</h2>`); }
    else if (/^# /.test(line))   { out.push(`<h1 class="md-h1">${inlineMd(line.slice(2))}</h1>`); }
    else if (/^> /.test(line))   { out.push(`<blockquote class="md-blockquote">${inlineMd(line.slice(2))}</blockquote>`); }
    else if (/^---$/.test(line)) { out.push("<hr class=\"md-hr\" />"); }
    else if (isBullet) {
      if (!inList || listType !== "ul") { if (inList) out.push(`</${listType}>`); out.push("<ul class=\"md-ul\">"); inList = true; listType = "ul"; }
      out.push(`<li>${inlineMd(line.slice(2))}</li>`);
    } else if (isOrdered) {
      if (!inList || listType !== "ol") { if (inList) out.push(`</${listType}>`); out.push("<ol class=\"md-ol\">"); inList = true; listType = "ol"; }
      out.push(`<li>${inlineMd(line.replace(/^\d+\. /, ""))}</li>`);
    } else if (line.trim() === "") {
      out.push("<br />");
    } else {
      out.push(`<p class="md-p">${inlineMd(line)}</p>`);
    }
  }
  if (inList) out.push(`</${listType}>`);
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DocumentPanelProps {
  docId: string | null;
  projectId?: string | null;
  pinned?: boolean;
  onClose: () => void;
  onTogglePin?: () => void;
  onDocChange?: (docId: string) => void;
}

export function DocumentPanel({ docId, projectId, pinned, onClose, onTogglePin, onDocChange }: DocumentPanelProps) {
  const [preview, setPreview] = useState(false);
  const [localContent, setLocalContent] = useState("");
  const [localTitle, setLocalTitle] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showDocList, setShowDocList] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // List docs for the current project scope
  const { data: docs = [] } = useQuery<WorkspaceDoc[]>({
    queryKey: ["/api/docs", projectId ?? "global"],
    queryFn: () => {
      const qs = projectId ? `?projectId=${projectId}` : "?projectId=null";
      return fetch(`/api/docs${qs}`).then(r => r.json());
    },
    refetchInterval: 10_000,
  });

  // Current doc
  const { data: doc } = useQuery<WorkspaceDoc>({
    queryKey: ["/api/docs", docId],
    queryFn: () => fetch(`/api/docs/${docId}`).then(r => r.json()),
    enabled: !!docId,
  });

  useEffect(() => {
    if (doc) {
      setLocalContent(doc.content);
      setLocalTitle(doc.title);
      setDirty(false);
    }
  }, [doc]);

  const saveMutation = useMutation({
    mutationFn: ({ id, content, title }: { id: string; content: string; title: string }) =>
      apiRequest("PATCH", `/api/docs/${id}`, { content, title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      setDirty(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string; projectId?: string }) =>
      apiRequest("POST", "/api/docs", data).then(r => r.json() as Promise<WorkspaceDoc>),
    onSuccess: (newDoc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      onDocChange?.(newDoc.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/docs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      onClose();
    },
  });

  const handleExport = () => {
    const filename = (localTitle || "document").replace(/[^a-z0-9_\-\s]/gi, "").trim() || "document";
    const blob = new Blob([localContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scheduleAutoSave = useCallback((id: string, content: string, title: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate({ id, content, title }), 1200);
  }, [saveMutation]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalContent(e.target.value);
    setDirty(true);
    if (docId) scheduleAutoSave(docId, e.target.value, localTitle);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTitle(e.target.value);
    setDirty(true);
    if (docId) scheduleAutoSave(docId, localContent, e.target.value);
  };

  const handleNewDoc = () => {
    createMutation.mutate({
      title: "Untitled",
      content: "",
      projectId: projectId ?? undefined,
    });
  };

  return (
    <div className="flex flex-col h-full border-l border-border/50 bg-background" data-testid="document-panel">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2.5 border-b border-border/40 shrink-0">
        <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />

        {/* Doc title / picker */}
        <div className="flex-1 min-w-0">
          {docId ? (
            <input
              value={localTitle}
              onChange={handleTitleChange}
              className="w-full bg-transparent text-sm font-medium focus:outline-none truncate"
              placeholder="Untitled"
              data-testid="input-doc-title"
            />
          ) : (
            <button
              className="text-sm text-muted-foreground"
              onClick={() => setShowDocList(v => !v)}
            >
              Documents
            </button>
          )}
        </div>

        {docId && (
          <button
            className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 px-1"
            onClick={() => setShowDocList(v => !v)}
            data-testid="button-doc-switcher"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setPreview(v => !v)}
            title={preview ? "Edit" : "Preview"}
            data-testid="button-doc-preview-toggle"
          >
            {preview ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          {docId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleExport}
              title="Download as .md"
              data-testid="button-doc-export"
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
          {onTogglePin && docId && (
            <Button
              size="icon"
              variant="ghost"
              className={`h-6 w-6 ${pinned ? "text-primary" : ""}`}
              onClick={onTogglePin}
              title={pinned ? "Unpin document" : "Pin document (keep visible while chatting)"}
              data-testid="button-doc-pin"
            >
              {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={handleNewDoc}
            title="New document"
            data-testid="button-doc-new"
          >
            <Plus className="h-3 w-3" />
          </Button>
          {docId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive/60 hover:text-destructive"
              onClick={() => docId && deleteMutation.mutate(docId)}
              title="Delete document"
              data-testid="button-doc-delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onClose}
            data-testid="button-doc-close"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Doc switcher dropdown */}
      {showDocList && (
        <div className="border-b border-border/40 bg-muted/20 max-h-40 overflow-y-auto shrink-0">
          {docs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No documents yet</p>
          ) : (
            docs.map(d => (
              <button
                key={d.id}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${d.id === docId ? "bg-muted/40 font-medium" : ""}`}
                onClick={() => { onDocChange?.(d.id); setShowDocList(false); }}
                data-testid={`button-doc-select-${d.id}`}
              >
                <FileText className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <span className="truncate">{d.title}</span>
                <span className="ml-auto text-muted-foreground/40 shrink-0">
                  {new Date(d.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {!docId ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <FileText className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/60">No document open</p>
            <Button size="sm" variant="outline" onClick={handleNewDoc} data-testid="button-doc-create-first">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New document
            </Button>
          </div>
        ) : preview ? (
          <div
            className="h-full overflow-y-auto px-5 py-4 prose-doc text-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(localContent) }}
            data-testid="div-doc-preview"
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={handleContentChange}
            className="w-full h-full resize-none bg-transparent px-5 py-4 text-sm font-mono leading-relaxed focus:outline-none placeholder:text-muted-foreground/30"
            placeholder="Start writing… (markdown supported)"
            spellCheck
            data-testid="textarea-doc-content"
          />
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 px-4 py-1 border-t border-border/30 flex items-center gap-3 text-[10px] text-muted-foreground/40">
        <span>{localContent.length} chars · {localContent.split(/\s+/).filter(Boolean).length} words</span>
        {dirty && <span className="ml-auto">saving…</span>}
        {!dirty && docId && <span className="ml-auto">saved</span>}
      </div>
    </div>
  );
}

/* Add these to your global CSS (index.css) for the markdown preview: */
// .prose-doc h1.md-h1 { @apply text-xl font-bold mt-4 mb-2; }
// .prose-doc h2.md-h2 { @apply text-lg font-semibold mt-3 mb-1.5; }
// .prose-doc h3.md-h3 { @apply text-base font-semibold mt-2 mb-1; }
// etc — added inline via Tailwind below
