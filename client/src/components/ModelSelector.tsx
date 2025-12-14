import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Model {
  id: string;
  name: string;
  description: string;
}

const models: Model[] = [
  { id: "gpt-4o", name: "GPT-4o", description: "Most capable model" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and efficient" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "Quick responses" },
];

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const currentModel = models.find((m) => m.id === selectedModel) || models[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          data-testid="button-model-selector"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">{currentModel.name}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelChange(model.id)}
            className="flex flex-col items-start gap-1 py-2"
            data-testid={`option-model-${model.id}`}
          >
            <span className="font-medium">{model.name}</span>
            <span className="text-xs text-muted-foreground">{model.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
