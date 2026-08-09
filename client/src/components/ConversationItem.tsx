import { useState, useRef, useEffect } from "react";
import { MessageSquare, Trash2, Archive, ArchiveRestore, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  connectionId?: string;
  archivedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  projectName?: string;
  onClick: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onRename?: (id: string, newTitle: string) => void;
}

/** Compact relative date label for the sidebar. */
function formatConversationDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

  if (date >= startOfToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (date >= startOfYesterday) {
    return "Yesterday";
  }
  if (date >= startOfWeek) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  // Older: "Jan 12" or "Jan 12, 2024" if a different year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function ConversationItem({
  conversation,
  isActive,
  projectName,
  onClick,
  onDelete,
  onArchive,
  onRestore,
  onRename,
}: ConversationItemProps) {
  const isArchived = Boolean(conversation.archivedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync if title changes externally
  useEffect(() => {
    if (!editing) setDraft(conversation.title);
  }, [conversation.title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename?.(conversation.id, trimmed);
    } else {
      setDraft(conversation.title);
    }
    setEditing(false);
  };

  const dateLabel = conversation.updatedAt
    ? formatConversationDate(conversation.updatedAt)
    : null;

  return (
    <div
      className={cn(
        "group flex flex-col gap-0.5 px-3 py-2 rounded-md cursor-pointer hover-elevate active-elevate-2",
        isActive && "bg-sidebar-accent"
      )}
      onClick={editing ? undefined : onClick}
      data-testid={`conversation-${conversation.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (!editing && e.key === "Enter") onClick(); }}
    >
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { setDraft(conversation.title); setEditing(false); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm bg-transparent border-b border-ring outline-none py-0.5"
            data-testid={`input-rename-${conversation.id}`}
          />
        ) : (
          <span className="flex-1 truncate text-sm">{conversation.title}</span>
        )}

        {/* Rename button — only when not archived and onRename provided */}
        {!editing && !isArchived && onRename && (
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); setDraft(conversation.title); setEditing(true); }}
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-rename-${conversation.id}`}
            aria-label={`Rename ${conversation.title}`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}

        {isArchived && onRestore ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onRestore(); }}
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-restore-${conversation.id}`}
            aria-label={`Restore ${conversation.title}`}
          >
            <ArchiveRestore className="h-3 w-3" />
          </Button>
        ) : onArchive ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-archive-${conversation.id}`}
            aria-label={`Archive ${conversation.title}`}
          >
            <Archive className="h-3 w-3" />
          </Button>
        ) : null}

        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`button-delete-${conversation.id}`}
          aria-label={`Delete ${conversation.title}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Date + project name row */}
      <div className="ml-6 flex items-center gap-2">
        {dateLabel && (
          <span className="text-[10px] text-muted-foreground/50 leading-tight shrink-0">
            {dateLabel}
          </span>
        )}
        {projectName && (
          <span className="text-[10px] text-muted-foreground/60 truncate leading-tight">
            {projectName}
          </span>
        )}
      </div>
    </div>
  );
}
