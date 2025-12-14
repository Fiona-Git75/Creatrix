import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Server, Plus, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Connection } from "@shared/schema";

interface ConnectionSelectorProps {
  selectedConnectionId: string | null;
  onConnectionChange: (connectionId: string) => void;
  onManageConnections: () => void;
}

export function ConnectionSelector({
  selectedConnectionId,
  onConnectionChange,
  onManageConnections,
}: ConnectionSelectorProps) {
  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const currentConnection = connections.find((c) => c.id === selectedConnectionId) 
    || connections.find((c) => c.isDefault)
    || connections[0];

  const providerLabels: Record<string, string> = {
    openai: "OpenAI",
    ollama: "Ollama",
    lmstudio: "LM Studio",
    custom: "Custom",
  };

  if (isLoading) {
    return (
      <Button variant="outline" className="w-full gap-2" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (connections.length === 0) {
    return (
      <Button 
        variant="outline" 
        className="w-full gap-2"
        onClick={onManageConnections}
        data-testid="button-add-connection"
      >
        <Plus className="h-4 w-4" />
        Add Connection
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between gap-2"
          data-testid="button-connection-selector"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Server className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium truncate">{currentConnection?.name}</span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {connections.map((connection) => (
          <DropdownMenuItem
            key={connection.id}
            onClick={() => onConnectionChange(connection.id)}
            className="flex items-center justify-between gap-2 py-2"
            data-testid={`option-connection-${connection.id}`}
          >
            <div className="flex flex-col items-start gap-0.5 min-w-0">
              <span className="font-medium truncate">{connection.name}</span>
              <span className="text-xs text-muted-foreground">
                {providerLabels[connection.provider] || connection.provider}
              </span>
            </div>
            <ConnectionHealthIndicator connectionId={connection.id} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={onManageConnections}
          data-testid="button-manage-connections"
        >
          <Plus className="h-4 w-4 mr-2" />
          Manage Connections
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConnectionHealthIndicator({ connectionId }: { connectionId: string }) {
  const { data, isLoading } = useQuery<{ healthy: boolean }>({
    queryKey: ["/api/connections", connectionId, "health"],
    staleTime: 60000,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }

  return data?.healthy ? (
    <CheckCircle className="h-3 w-3 text-green-500" />
  ) : (
    <XCircle className="h-3 w-3 text-destructive" />
  );
}
