import { MessageSquare, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  connectionId?: string;
  archivedAt?: string | null;
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  projectName?: string;
  onClick: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}

export function ConversationItem({
  conversation,
  isActive,
  projectName,
  onClick,
  onDelete,
  onArchive,
  onRestore,
}: ConversationItemProps) {
  const isArchived = Boolean(conversation.archivedAt);
  return (
    <div
      className={cn(
        "group flex flex-col gap-0.5 px-3 py-2 rounded-md cursor-pointer hover-elevate active-elevate-2",
        isActive && "bg-sidebar-accent"
      )}
      onClick={onClick}
      data-testid={`conversation-${conversation.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm">{conversation.title}</span>
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
      {projectName && (
        <span className="ml-6 text-[10px] text-muted-foreground/60 truncate leading-tight">
          {projectName}
        </span>
      )}
    </div>
  );
}
