import { Bot, Code, FileText, Lightbulb, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";

interface SuggestionCard {
  icon: React.ReactNode;
  title: string;
  prompt: string;
}

const suggestions: SuggestionCard[] = [
  {
    icon: <Code className="h-5 w-5" />,
    title: "Debug code",
    prompt: "Help me debug this code that's not working as expected",
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: "Write content",
    prompt: "Write a professional email to follow up on a meeting",
  },
  {
    icon: <Lightbulb className="h-5 w-5" />,
    title: "Brainstorm ideas",
    prompt: "Give me creative ideas for a weekend project",
  },
  {
    icon: <MessageSquare className="h-5 w-5" />,
    title: "Explain concepts",
    prompt: "Explain how machine learning works in simple terms",
  },
];

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
        <Bot className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold mb-2" data-testid="text-welcome-title">
        How can I help you today?
      </h1>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        Start a conversation or choose a suggestion below
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {suggestions.map((suggestion, index) => (
          <Card
            key={index}
            className="p-4 cursor-pointer hover-elevate active-elevate-2"
            onClick={() => onSelectPrompt(suggestion.prompt)}
            data-testid={`card-suggestion-${index}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelectPrompt(suggestion.prompt)}
          >
            <div className="flex items-start gap-3">
              <div className="text-muted-foreground">{suggestion.icon}</div>
              <div>
                <h3 className="font-medium text-sm mb-1">{suggestion.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {suggestion.prompt}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
