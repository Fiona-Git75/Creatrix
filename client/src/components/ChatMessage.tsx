import { Bot, User, Copy, Check, FileText, Globe, PlayCircle, Search, BookOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Source, MessageImage } from "@shared/schema";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  images?: MessageImage[];
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
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

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        <div className={cn("flex-1 space-y-2", isUser ? "text-right" : "")}>
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

          {!isUser && !isStreaming && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
