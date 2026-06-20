import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
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

const LABELS: Partial<Record<CapabilityName, string>> = {
  list_directory: "Listing directory",
  read_file: "Reading file",
  write_file: "Writing file",
  create_note: "Creating note",
  create_folder: "Creating folder",
  copy_file: "Copying file",
  move_file: "Moving file",
  delete_file: "Deleting file",
  web_search: "Searching the web",
  retrieve_url: "Fetching page",
  search_library: "Searching library",
  save_conversation: "Saving to library",
  notion_search: "Searching Notion",
  notion_get_page: "Reading Notion page",
  notion_create_page: "Creating Notion page",
  notion_query_database: "Querying Notion database",
  notion_append_block: "Updating Notion page",
  get_youtube_transcript: "Watching video",
  transcribe_audio: "Listening to audio",
  ocr_image: "Reading image",
  analyze_image: "Looking at image",
  append_file: "Appending to file",
  run_command: "Running command",
};

function argHint(capability: CapabilityName, args: Record<string, unknown>): string {
  if (capability === "run_command") {
    return String(args.command ?? "").slice(0, 60);
  }
  const val = args.path ?? args.query ?? args.url ?? args.source ?? args.title ?? args.pageId ?? "";
  return String(val).split("/").pop()?.slice(0, 48) || "";
}

export function ToolCallCard({ event }: { event: ToolEvent }) {
  const [expanded, setExpanded] = useState(false);
  const label = LABELS[event.capability] ?? event.capability.replace(/_/g, " ");
  const hint = argHint(event.capability, event.args);
  const hasDetail = event.status !== "running" && (event.result !== undefined || event.error);

  return (
    <div
      className={`my-0.5 flex flex-col rounded-lg text-xs overflow-hidden transition-all ${
        event.status === "error"
          ? "bg-destructive/8 border border-destructive/20"
          : "bg-muted/30 border border-border/40"
      }`}
      data-testid={`tool-call-${event.id}`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${hasDetail ? "cursor-pointer" : ""}`}
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        {event.status === "running" && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60 shrink-0" />
        )}
        {event.status === "success" && (
          <span className="h-3 w-3 shrink-0 flex items-center justify-center">
            <span className="block h-1.5 w-1.5 rounded-full bg-green-500/70" />
          </span>
        )}
        {event.status === "error" && (
          <span className="h-3 w-3 shrink-0 flex items-center justify-center">
            <span className="block h-1.5 w-1.5 rounded-full bg-destructive/80" />
          </span>
        )}

        <span className={`font-medium ${event.status === "success" ? "text-muted-foreground/80" : "text-foreground/80"}`}>
          {label}
        </span>

        {hint && (
          <span className="text-muted-foreground/50 truncate flex-1 font-normal">{hint}</span>
        )}

        {hasDetail && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-auto" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-auto" />
        )}
      </div>

      {expanded && hasDetail && (
        <div className="px-3 pb-2 pt-1 border-t border-border/30">
          {event.status === "error" ? (
            <p className="text-destructive/80">{event.error}</p>
          ) : (
            <pre className="text-muted-foreground/70 whitespace-pre-wrap break-all max-h-36 overflow-y-auto leading-relaxed">
              {typeof event.result === "object" && event.result !== null && "text" in event.result
                ? String((event.result as any).text || (event.result as any).transcript || (event.result as any).analysis || JSON.stringify(event.result, null, 2))
                : typeof event.result === "string"
                  ? event.result
                  : JSON.stringify(event.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
