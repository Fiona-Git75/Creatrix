import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { CapabilityName } from "@shared/schema";

export interface ToolEvent {
  id: string;
  capability: CapabilityName;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
  error?: string;
}

const CAPABILITY_LABELS: Partial<Record<CapabilityName, string>> = {
  read_file: "Reading file",
  write_file: "Writing file",
  create_note: "Creating note",
  create_folder: "Creating folder",
  copy_file: "Copying file",
  move_file: "Moving file",
  delete_file: "Deleting file",
  web_search: "Searching the web",
  retrieve_url: "Fetching URL",
  search_library: "Searching library",
  save_conversation: "Saving to library",
};

function argSummary(capability: CapabilityName, args: Record<string, unknown>): string {
  const val = args.path || args.query || args.title || args.url || args.source || "";
  return String(val).slice(0, 60) || capability;
}

export function ToolCallCard({ event }: { event: ToolEvent }) {
  const [expanded, setExpanded] = useState(false);
  const label = CAPABILITY_LABELS[event.capability] || event.capability.replace(/_/g, " ");
  const summary = argSummary(event.capability, event.args);

  const hasResult = event.status !== "running" && (event.result !== undefined || event.error);

  return (
    <div
      className={`my-1 flex flex-col rounded-md border text-xs overflow-hidden ${
        event.status === "error"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/40"
      }`}
      data-testid={`tool-call-${event.id}`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => hasResult && setExpanded(!expanded)}
      >
        {event.status === "running" && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
        )}
        {event.status === "success" && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
        {event.status === "error" && (
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        )}

        <span className="font-medium text-foreground">{label}</span>
        {summary && (
          <span className="text-muted-foreground truncate flex-1">{summary}</span>
        )}

        {hasResult && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </div>

      {expanded && hasResult && (
        <div className="px-3 pb-2 border-t">
          {event.status === "error" ? (
            <p className="text-destructive mt-1.5">{event.error}</p>
          ) : (
            <pre className="mt-1.5 text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
              {typeof event.result === "string"
                ? event.result
                : JSON.stringify(event.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
