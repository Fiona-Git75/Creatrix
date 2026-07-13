import { Bot, User, Copy, Check, FileText, Globe, PlayCircle, Search, BookOpen, Bookmark, Loader2, Save, Folder, ChevronRight, Home } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Source, MessageImage, Connection } from "@shared/schema";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  images?: MessageImage[];
  connectionId?: string;  // Council mode: which resident produced this message
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  messageIndex?: number;
  conversationId?: string;
  conversationTitle?: string;
  projectId?: string;
  connections?: Connection[];
}

const SOURCE_ICONS: Record<Source["type"], React.ElementType> = {
  file: FileText,
  url: Globe,
  youtube: PlayCircle,
  web: Search,
  notion: BookOpen,
};

function SourceCitations({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {sources.map((source, i) => {
        const Icon = SOURCE_ICONS[source.type] ?? FileText;
        return (
          <span
            key={i}
            title={source.detail || source.label}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted border border-border/50 text-xs text-muted-foreground font-mono cursor-default select-text"
            data-testid={`source-citation-${i}`}
          >
            <Icon className="h-3 w-3 shrink-0 opacity-60" />
            {source.label}
          </span>
        );
      })}
    </div>
  );
}

export function ChatMessage({ message, isStreaming, messageIndex = 0, conversationId, conversationTitle, projectId, connections = [] }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [isFlagging, setIsFlagging] = useState(false);
  const [pivot, setPivot] = useState("");
  const [flagNote, setFlagNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [isDocOpen, setIsDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docPending, setDocPending] = useState(false);
  const [docSaved, setDocSaved] = useState(false);
  const [browsePath, setBrowsePath] = useState(".");
  const [browseItems, setBrowseItems] = useState<{name:string;type:string;path:string}[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const isUser = message.role === "user";
  const residentConnection = !isUser && message.connectionId
    ? connections.find(c => c.id === message.connectionId) ?? null
    : null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openFlag = () => {
    const trimmed = message.content.slice(0, 320);
    setPivot(trimmed);
    setFlagNote("");
    setIsFlagging(true);
  };

  const fetchBrowse = async (p: string) => {
    setBrowseLoading(true);
    try {
      const res = await fetch(`/api/filesystem/browse?path=${encodeURIComponent(p === "." ? "" : p)}`);
      const data = await res.json();
      if (data.items) {
        setBrowseItems(data.items);
        setBrowsePath(data.path || ".");
      }
    } finally {
      setBrowseLoading(false);
    }
  };

  const openDocPanel = () => {
    setDocTitle("");
    setBrowsePath(".");
    setBrowseItems([]);
    setIsDocOpen(true);
    setIsFlagging(false);
    fetchBrowse(".");
  };

  const saveDoc = async () => {
    if (!docTitle.trim()) return;
    setDocPending(true);
    try {
      const folder = browsePath === "." ? "" : browsePath;
      await apiRequest("POST", "/api/filesystem/write", {
        filename: `${docTitle.trim()}.md`,
        content: message.content,
        ...(folder ? { folderPath: folder } : {}),
      });
      setDocSaved(true);
      setIsDocOpen(false);
      setTimeout(() => setDocSaved(false), 3000);
    } finally {
      setDocPending(false);
    }
  };

  const saveFlag = async () => {
    if (!pivot.trim() || !conversationId) return;
    setIsSaving(true);
    try {
      await apiRequest("POST", "/api/flags", {
        conversationId,
        conversationTitle: conversationTitle ?? "Conversation",
        projectId,
        messageIndex,
        pivotSentence: pivot.trim(),
        note: flagNote.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/flags"] });
      setFlagged(true);
      setIsFlagging(false);
      setTimeout(() => setFlagged(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "group py-6 px-4",
        isUser ? "flex justify-end" : ""
      )}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div
        className={cn(
          "flex gap-4",
          isUser ? "flex-row-reverse max-w-[80%]" : "max-w-3xl mx-auto w-full"
        )}
      >
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className={cn(
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>
            {isUser
              ? <User className="h-4 w-4" />
              : residentConnection?.residentEmoji
                ? <span className="text-base leading-none">{residentConnection.residentEmoji}</span>
                : <Bot className="h-4 w-4" />
            }
          </AvatarFallback>
        </Avatar>

        <div className={cn("flex-1 space-y-2", isUser ? "text-right" : "")}>
          {residentConnection && (
            <p className="text-xs text-muted-foreground font-medium" data-testid={`message-attribution-${message.id}`}>
              {residentConnection.residentName ?? residentConnection.name}
            </p>
          )}
          <div
            className={cn(
              "inline-block rounded-lg px-4 py-3 text-base leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            )}
          >
            {isUser && message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2" data-testid="message-images">
                {message.images.map((img, i) => (
                  <img
                    key={i}
                    src={`data:${img.mimeType};base64,${img.base64}`}
                    alt={`Attached image ${i + 1}`}
                    className="max-h-48 max-w-xs rounded-md object-contain"
                    data-testid={`message-image-${message.id}-${i}`}
                  />
                ))}
              </div>
            )}
            <p className="whitespace-pre-wrap">{message.content}</p>
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
            )}
          </div>

          {!isUser && !isStreaming && message.sources && message.sources.length > 0 && (
            <SourceCitations sources={message.sources} />
          )}

          {!isStreaming && (
            <div className={cn(
              "opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mt-0.5",
              isUser ? "justify-end" : ""
            )}>
              {!isUser && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCopy}
                  className="h-8 w-8"
                  data-testid={`button-copy-${message.id}`}
                  aria-label="Copy message"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              )}
              {conversationId && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={openFlag}
                  className="h-8 w-8"
                  data-testid={`button-flag-${message.id}`}
                  aria-label="Flag this moment"
                >
                  <Bookmark className={cn("h-4 w-4", flagged && "fill-current text-amber-500")} />
                </Button>
              )}
              {!isUser && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={openDocPanel}
                  className="h-8 w-8"
                  data-testid={`button-save-doc-${message.id}`}
                  aria-label="Save as document"
                >
                  <Save className={cn("h-4 w-4", docSaved && "text-green-500")} />
                </Button>
              )}
            </div>
          )}

          {isDocOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-background p-3 text-sm shadow-sm">
              <Label className="text-xs font-medium">Filename</Label>
              <Input
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                placeholder="e.g. Research notes on Anavere"
                className="text-sm h-8"
                data-testid={`input-doc-title-${message.id}`}
                onKeyDown={e => e.key === "Enter" && saveDoc()}
                autoFocus
              />

              {/* Breadcrumb */}
              <div className="flex items-center gap-1 flex-wrap text-[11px] text-muted-foreground">
                <button
                  className="hover:text-foreground flex items-center gap-0.5"
                  onClick={() => fetchBrowse(".")}
                  data-testid={`button-browse-root-${message.id}`}
                >
                  <Home className="h-3 w-3" />
                </button>
                {browsePath !== "." && browsePath.split("/").map((seg, i, arr) => {
                  const partial = arr.slice(0, i + 1).join("/");
                  return (
                    <span key={partial} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 opacity-40" />
                      <button
                        className="hover:text-foreground max-w-[120px] truncate"
                        onClick={() => fetchBrowse(partial)}
                        data-testid={`button-browse-crumb-${i}-${message.id}`}
                      >{seg}</button>
                    </span>
                  );
                })}
              </div>

              {/* Folder list */}
              <div
                className="rounded border border-border/40 bg-muted/20 overflow-y-auto"
                style={{ maxHeight: "140px" }}
                data-testid={`browse-list-${message.id}`}
              >
                {browseLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : browseItems.filter(i => i.type === "folder").length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic px-2 py-3">No subfolders here — file will save in current location</p>
                ) : (
                  browseItems.filter(i => i.type === "folder").map(item => (
                    <button
                      key={item.path}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-muted/60 transition-colors text-left"
                      onClick={() => fetchBrowse(item.path)}
                      data-testid={`button-browse-folder-${item.name}-${message.id}`}
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{item.name}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                    </button>
                  ))
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Saves as <code className="font-mono">{docTitle.trim() || "filename"}.md</code>
                {browsePath !== "." ? ` → ${browsePath}/` : " in root folder"}
              </p>

              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setIsDocOpen(false)} data-testid={`button-doc-cancel-${message.id}`}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={saveDoc}
                  disabled={!docTitle.trim() || docPending}
                  data-testid={`button-doc-save-${message.id}`}
                >
                  {docPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Save here
                </Button>
              </div>
            </div>
          )}

          {isFlagging && (
            <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-background p-3 text-sm shadow-sm">
              <Label className="text-xs font-medium">Pivot sentence</Label>
              <Textarea
                value={pivot}
                onChange={e => setPivot(e.target.value)}
                className="min-h-[72px] text-sm resize-none"
                placeholder="The sentence that shifted the landscape…"
                data-testid={`input-pivot-${message.id}`}
              />
              <Label className="text-xs font-medium text-muted-foreground">Note (optional)</Label>
              <Input
                value={flagNote}
                onChange={e => setFlagNote(e.target.value)}
                placeholder="What shifted, what it connects to…"
                className="text-sm h-8"
                data-testid={`input-flagnote-${message.id}`}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFlagging(false)}
                  data-testid={`button-flag-cancel-${message.id}`}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveFlag}
                  disabled={!pivot.trim() || isSaving}
                  data-testid={`button-flag-save-${message.id}`}
                >
                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Save moment
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
