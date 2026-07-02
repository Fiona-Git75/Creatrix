import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bookmark, Trash2, Loader2, Search, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ConversationFlag } from "@shared/schema";

interface MomentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConversation: (id: string) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MomentsPanel({ open, onOpenChange, onSelectConversation }: MomentsPanelProps) {
  const [query, setQuery] = useState("");

  const { data: flags = [], isLoading } = useQuery<ConversationFlag[]>({
    queryKey: ["/api/flags"],
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/flags/${id}`, undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/flags"] }),
  });

  const filtered = query.trim()
    ? flags.filter(f =>
        f.pivotSentence.toLowerCase().includes(query.toLowerCase()) ||
        (f.note ?? "").toLowerCase().includes(query.toLowerCase()) ||
        f.conversationTitle.toLowerCase().includes(query.toLowerCase())
      )
    : flags;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Bookmark className="h-4 w-4" />
            Moments
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Flagged moments from your conversations — pivot sentences, doorways back into ideas.
          </p>
        </DialogHeader>

        <div className="px-6 py-3 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search moments…"
              className="pl-9 h-8 text-sm"
              data-testid="input-moments-search"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-3">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading moments…
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground space-y-1">
                <Bookmark className="h-8 w-8 mx-auto opacity-30 mb-3" />
                {query ? (
                  <p>No moments match "<span className="italic">{query}</span>"</p>
                ) : (
                  <>
                    <p className="font-medium">No moments flagged yet</p>
                    <p className="text-xs">When a conversation reaches a pivot point, flag it with the bookmark icon on a message.</p>
                  </>
                )}
              </div>
            )}

            {filtered.map(flag => (
              <div
                key={flag.id}
                className="group rounded-lg border border-border/60 bg-card p-4 space-y-2 hover:border-border transition-colors"
                data-testid={`moment-item-${flag.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-snug flex-1">
                    "{flag.pivotSentence}"
                  </p>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        onSelectConversation(flag.conversationId);
                        onOpenChange(false);
                      }}
                      title="Go to conversation"
                      data-testid={`button-goto-moment-${flag.id}`}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => deleteMutation.mutate(flag.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-moment-${flag.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {flag.note && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{flag.note}</p>
                )}

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                  <span>{formatDate(flag.createdAt)}</span>
                  <span>·</span>
                  <button
                    className="truncate max-w-[240px] hover:text-foreground transition-colors text-left"
                    onClick={() => {
                      onSelectConversation(flag.conversationId);
                      onOpenChange(false);
                    }}
                  >
                    {flag.conversationTitle}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
