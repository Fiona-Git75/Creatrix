import { useQuery } from "@tanstack/react-query";
import { Sun, FileText, FilePlus, HelpCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { JournalEntry } from "@shared/schema";

function getYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getTodayStartISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function MorningOrientation() {
  const [expanded, setExpanded] = useState(false);

  const { data: recentEntries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal", { since: "yesterday" }],
    queryFn: async () => {
      const res = await fetch(`/api/journal?since=${encodeURIComponent(getYesterdayISO())}&limit=50`);
      return res.json();
    },
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  });

  const yesterdayStart = getYesterdayISO();
  const todayStart = getTodayStartISO();

  const yesterdayEntries = recentEntries.filter(e => e.createdAt >= yesterdayStart && e.createdAt < todayStart);
  const created = yesterdayEntries.filter(e => e.type === "created");
  const read = yesterdayEntries.filter(e => e.type === "read");
  const openQuestions = recentEntries.filter(e => e.type === "question" && !e.resolved);

  const hasActivity = created.length > 0 || read.length > 0 || openQuestions.length > 0;

  return (
    <div className="border-t" data-testid="section-morning-orientation">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-orientation"
      >
        <Sun className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-medium flex-1">Morning Orientation</span>
        {openQuestions.length > 0 && !expanded && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0 mr-1">
            {openQuestions.length} Q
          </Badge>
        )}
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground" />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          {isLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !hasActivity ? (
            <p className="text-xs text-muted-foreground py-2">
              Nothing recorded yesterday. Start a conversation to build a history.
            </p>
          ) : (
            <ScrollArea className="max-h-48">
              <div className="space-y-3 pt-1">
                {created.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <FilePlus className="h-3 w-3" /> Created yesterday
                    </p>
                    <ul className="space-y-0.5">
                      {created.slice(0, 5).map(e => (
                        <li key={e.id} className="text-xs truncate text-foreground/80 pl-4">
                          {e.title.replace(/^created:/i, "").replace(/^added to library:/i, "").trim()}
                        </li>
                      ))}
                      {created.length > 5 && (
                        <li className="text-xs text-muted-foreground pl-4">+{created.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {read.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Read yesterday
                    </p>
                    <ul className="space-y-0.5">
                      {read.slice(0, 5).map(e => (
                        <li key={e.id} className="text-xs truncate text-foreground/80 pl-4">
                          {e.title.replace(/^read file:/i, "").trim()}
                        </li>
                      ))}
                      {read.length > 5 && (
                        <li className="text-xs text-muted-foreground pl-4">+{read.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {openQuestions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                      <HelpCircle className="h-3 w-3" /> Open questions
                    </p>
                    <ul className="space-y-0.5">
                      {openQuestions.slice(0, 4).map(e => (
                        <li key={e.id} className="text-xs truncate text-foreground/80 pl-4">
                          {e.title}
                        </li>
                      ))}
                      {openQuestions.length > 4 && (
                        <li className="text-xs text-muted-foreground pl-4">+{openQuestions.length - 4} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
