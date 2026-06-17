import { Bot } from "lucide-react";

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function EmptyState({ onSelectPrompt: _ }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
        <Bot className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold mb-2" data-testid="text-welcome-title">
        How can I help you today?
      </h1>
      <p className="text-muted-foreground text-center max-w-md">
        Start a conversation below.
      </p>
    </div>
  );
}
