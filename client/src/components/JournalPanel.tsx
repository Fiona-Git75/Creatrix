import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BookOpenCheck, FileText, FilePlus, Search, HelpCircle,
  Zap, AlignLeft, CheckCircle2, Circle, Loader2, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { JournalEntry, JournalEntryType } from "@shared/schema";

interface JournalPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_LABELS: Record<JournalEntryType, string> = {
  read: "Read",
  created: "Created",
  question: "Question",
  search: "Search",
  action: "Action",
  summary: "Summary",
};

const TYPE_ICONS: Record<JournalEntryType, typeof FileText> = {
  read: FileText,
  created: FilePlus,
  question: HelpCircle,
  search: Search,
  action: Zap,
  summary: AlignLeft,
};

const TYPE_COLORS: Record<JournalEntryType, string> = {
  read: "text-blue-500",
  created: "text-green-500",
  question: "text-amber-500",
  search: "text-purple-500",
  action: "text-orange-500",
  summary: "text-muted-foreground",
};

const BADGE_VARIANTS: Record<JournalEntryType, "default" | "secondary" | "destructive" | "outline"> = {
  read: "secondary",
  created: "secondary",
  question: "secondary",
  search: "secondary",
  action: "secondary",
  summary: "secondary",
};

function formatRelative(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function EntryCard({ entry, onToggleResolved }: { entry: JournalEntry; onToggleResolved: (id: string, resolved: boolean) => void }) {
  const Icon = TYPE_ICONS[entry.type] || Zap;
  const colorClass = TYPE_COLORS[entry.type] || "text-muted-foreground";

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-md border bg-card transition-colors ${entry.resolved ? "opacity-50" : "hover:bg-accent/30"}`}
      data-testid={`card-journal-${entry.id}`}
    >
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${colorClass}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium leading-tight ${entry.resolved ? "line-through text-muted-foreground" : ""}`}>
            {entry.title}
          </p>
          <span className="text-xs text-muted-foreground shrink-0">{formatRelative(entry.createdAt)}</span>
        </div>
        {entry.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.detail}</p>
        )}
        {entry.relatedPath && (
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{entry.relatedPath}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant={BADGE_VARIANTS[entry.type]} className="text-xs px-1.5 py-0">
            {TYPE_LABELS[entry.type]}
          </Badge>
          {entry.type === "question" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-xs gap-1"
              onClick={() => onToggleResolved(entry.id, !entry.resolved)}
              data-testid={`button-toggle-resolved-${entry.id}`}
            >
              {entry.resolved
                ? <><CheckCircle2 className="h-3 w-3 text-green-500" /> Answered</>
                : <><Circle className="h-3 w-3" /> Mark answered</>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function JournalPanel({ open, onOpenChange }: JournalPanelProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal", { type: typeFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/journal?${params}`);
      return res.json();
    },
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<JournalEntry> }) =>
      apiRequest("PATCH", `/api/journal/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update entry.", variant: "destructive" }),
  });

  const openQuestions = entries.filter(e => e.type === "question" && !e.resolved);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5" />
            Resident Journal
          </DialogTitle>
          <DialogDescription>
            A visible record of what the resident has read, created, searched, and noted.
          </DialogDescription>
        </DialogHeader>

        {openQuestions.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" />
              {openQuestions.length} open question{openQuestions.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-journal-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entries</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="question">Questions</SelectItem>
              <SelectItem value="search">Searches</SelectItem>
              <SelectItem value="action">Actions</SelectItem>
              <SelectItem value="summary">Summaries</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{entries.length} entries</span>
        </div>

        <ScrollArea className="flex-1 h-[420px]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpenCheck className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Journal is empty</p>
              <p className="text-xs mt-1">
                The journal fills automatically as the resident reads, creates, and searches.
              </p>
            </div>
          ) : (
            <div className="space-y-2 pr-2">
              {entries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onToggleResolved={(id, resolved) => updateMutation.mutate({ id, updates: { resolved } })}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
