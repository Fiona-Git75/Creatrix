import { Loader2, ChevronDown, ChevronRight, BrainCircuit } from "lucide-react";
import { useState, useEffect } from "react";
import type { CapabilityName } from "@shared/schema";
import { Button } from "@/components/ui/button";

export interface ToolEvent {
  id: string;
  capability: CapabilityName;
  args: Record<string, unknown>;
  status: "running" | "success" | "error" | "pending_confirm" | "cancelled";
  result?: unknown;
  error?: string;
  confirmId?: string;
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
  ask_consultant: "Consulting specialist",
};

function argHint(capability: CapabilityName, args: Record<string, unknown>): string {
  if (capability === "run_command") {
    return String(args.command ?? "").slice(0, 60);
  }
  const val = args.path ?? args.query ?? args.url ?? args.source ?? args.title ?? args.pageId ?? "";
  return String(val).split("/").pop()?.slice(0, 48) || "";
}

function renderErrorWithLinks(text: string): (string | JSX.Element)[] {
  const parts = text.split(/(https?:\/\/[^\s,]+)/g);
  return parts.map((part, i) =>
    part.startsWith("http://") || part.startsWith("https://")
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">{part}</a>
      : part
  );
}

function confirmDescription(capability: CapabilityName, args: Record<string, unknown>): string {
  if (capability === "delete_file") return `Permanently delete: ${args.path}`;
  if (capability === "move_file")   return `Move ${args.path} → ${args.destination}`;
  if (capability === "notion_create_page") return `Create page "${args.title}" in Notion`;
  if (capability === "notion_append_block") return `Append text to Notion page ${args.pageId}`;
  return argHint(capability, args);
}

interface ToolCallCardProps {
  event: ToolEvent;
  onConfirm?: (confirmId: string, approved: boolean) => void;
}

export function ToolCallCard({ event, onConfirm }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(
    event.capability === "ask_consultant" && event.status === "success"
  );

  useEffect(() => {
    if (event.capability === "ask_consultant" && event.status === "success") {
      setExpanded(true);
    }
  }, [event.capability, event.status]);

  const label = LABELS[event.capability] ?? event.capability.replace(/_/g, " ");
  const hint = argHint(event.capability, event.args);
  const hasDetail = event.status !== "running" && event.status !== "pending_confirm" && (event.result !== undefined || event.error);

  // ── Pending confirmation ─────────────────────────────────────────────────
  if (event.status === "pending_confirm") {
    const isCommand = event.capability === "run_command";
    return (
      <div
        className="my-0.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs overflow-hidden"
        data-testid={`tool-confirm-${event.id}`}
      >
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="h-3 w-3 flex items-center justify-center shrink-0">
            <span className="block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          </span>
          <span className="font-medium text-foreground/80">{label}</span>
          <span className="text-amber-600/70 dark:text-amber-400/60 text-[10px] ml-auto">needs confirmation</span>
        </div>

        <div className="px-3 pb-2.5 space-y-2">
          {isCommand ? (
            <pre className="px-2.5 py-2 bg-muted/60 rounded text-[11px] font-mono text-foreground/70 whitespace-pre-wrap break-all leading-relaxed">
              {String(event.args.command ?? "")}
            </pre>
          ) : (
            <p className="text-muted-foreground/70">{confirmDescription(event.capability, event.args)}</p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-6 text-[11px] px-3"
              onClick={() => onConfirm?.(event.confirmId!, true)}
              data-testid={`button-confirm-run-${event.id}`}
            >
              Run
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] px-3 text-muted-foreground hover:text-foreground"
              onClick={() => onConfirm?.(event.confirmId!, false)}
              data-testid={`button-confirm-cancel-${event.id}`}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Cancelled ────────────────────────────────────────────────────────────
  if (event.status === "cancelled") {
    return (
      <div
        className="my-0.5 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/30 bg-muted/15 text-xs opacity-50"
        data-testid={`tool-cancelled-${event.id}`}
      >
        <span className="h-3 w-3 flex items-center justify-center shrink-0">
          <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        </span>
        <span className="text-muted-foreground line-through">{label}</span>
        {hint && <span className="text-muted-foreground/50 truncate">{hint}</span>}
        <span className="ml-auto text-muted-foreground/50">cancelled</span>
      </div>
    );
  }

  // ── Consultant call — distinct layout ────────────────────────────────────
  if (event.capability === "ask_consultant") {
    const consultantName = String(event.args.consultant_name ?? "");
    const question = String(event.args.question ?? "");
    const result = event.result as { consultant?: string; question?: string; answer?: string } | undefined;
    const answer = result?.answer;

    return (
      <div
        className={`my-0.5 rounded-lg text-xs overflow-hidden border ${
          event.status === "error"
            ? "border-destructive/20 bg-destructive/5"
            : "border-violet-500/20 bg-violet-500/5"
        }`}
        data-testid={`tool-call-${event.id}`}
      >
        <div
          className={`flex items-center gap-2 px-3 py-1.5 ${hasDetail ? "cursor-pointer" : ""}`}
          onClick={() => hasDetail && setExpanded(!expanded)}
        >
          {event.status === "running" ? (
            <Loader2 className="h-3 w-3 animate-spin text-violet-500/60 shrink-0" />
          ) : (
            <BrainCircuit className={`h-3 w-3 shrink-0 ${event.status === "error" ? "text-destructive/60" : "text-violet-500/70"}`} />
          )}
          <span className="font-medium text-foreground/80">
            {consultantName ? `${consultantName}` : "Consultant"}
          </span>
          {event.status === "running" && (
            <span className="text-violet-500/50 text-[10px] ml-auto">thinking…</span>
          )}
          {hasDetail && (
            expanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-auto" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-auto" />
          )}
        </div>

        {(question || expanded) && (
          <div className="px-3 pb-2 space-y-2">
            {question && (
              <p className="text-muted-foreground/60 italic text-[11px]">"{question}"</p>
            )}
            {expanded && hasDetail && (
              event.status === "error" ? (
                <p className="text-destructive/80">{renderErrorWithLinks(event.error ?? "")}</p>
              ) : answer ? (
                <div className="text-foreground/70 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border-t border-border/20 pt-2">
                  {answer}
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Running / success / error ─────────────────────────────────────────────
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
            ? <ChevronDown  className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-auto" />
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
