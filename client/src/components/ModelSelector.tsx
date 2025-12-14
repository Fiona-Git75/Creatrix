import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Connection } from "@shared/schema";

export interface Model {
  id: string;
  name: string;
}

interface ModelSelectorProps {
  selectedModel: string;
  connectionId: string | null;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, connectionId, onModelChange }: ModelSelectorProps) {
  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const activeConnection = connectionId 
    ? connections.find((c) => c.id === connectionId)
    : connections.find((c) => c.isDefault) || connections[0];

  const { data: models = [], isLoading } = useQuery<Model[]>({
    queryKey: ["/api/connections", activeConnection?.id, "models"],
    enabled: !!activeConnection?.id,
  });

  const currentModel = models.find((m) => m.id === selectedModel) 
    || models.find((m) => m.id === activeConnection?.defaultModel)
    || models[0];

  if (isLoading || !activeConnection) {
    return (
      <Button variant="outline" className="w-full gap-2" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading models...
      </Button>
    );
  }

  if (models.length === 0) {
    return (
      <Button variant="outline" className="w-full gap-2" disabled>
        <Sparkles className="h-4 w-4" />
        <span className="text-sm">No models available</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between gap-2"
          data-testid="button-model-selector"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium truncate">{currentModel?.name || selectedModel}</span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelChange(model.id)}
            className="py-2"
            data-testid={`option-model-${model.id}`}
          >
            <span className="font-medium truncate">{model.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
