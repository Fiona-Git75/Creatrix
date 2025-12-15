import { useState, useEffect, useCallback } from "react";
import { Search, MessageSquare, FileText, Brain, Loader2 } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface SearchResult {
  conversations: { id: string; title: string; excerpt: string; matchType: string }[];
  documents: { id: string; title: string; excerpt: string }[];
  memories: { id: string; content: string; scope: string }[];
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  onSelectConversation: (id: string) => void;
}

export function SearchDialog({ open, onOpenChange, projectId, onSelectConversation }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ q: searchQuery });
      if (projectId) params.append("projectId", projectId);
      
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      
      const data = await res.json();
      setResults(data);
    } catch (error) {
      console.error("Search error:", error);
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  const hasResults = results && (
    results.conversations.length > 0 ||
    results.documents.length > 0 ||
    results.memories.length > 0
  );

  const handleSelectConversation = (id: string) => {
    onSelectConversation(id);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search conversations, documents, memories..."
        value={query}
        onValueChange={setQuery}
        data-testid="input-search"
      />
      <CommandList>
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && query.length >= 2 && !hasResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {!isLoading && query.length < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search...
          </div>
        )}

        {!isLoading && hasResults && (
          <>
            {results.conversations.length > 0 && (
              <CommandGroup heading="Conversations">
                {results.conversations.map((conv) => (
                  <CommandItem
                    key={conv.id}
                    value={conv.id}
                    onSelect={() => handleSelectConversation(conv.id)}
                    className="flex items-start gap-2 py-3"
                    data-testid={`search-result-conversation-${conv.id}`}
                  >
                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{conv.title}</p>
                      {conv.excerpt && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{conv.excerpt}</p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.documents.length > 0 && (
              <CommandGroup heading="Documents">
                {results.documents.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    value={doc.id}
                    className="flex items-start gap-2 py-3"
                    data-testid={`search-result-document-${doc.id}`}
                  >
                    <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{doc.excerpt}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.memories.length > 0 && (
              <CommandGroup heading="Memories">
                {results.memories.map((mem) => (
                  <CommandItem
                    key={mem.id}
                    value={mem.id}
                    className="flex items-start gap-2 py-3"
                    data-testid={`search-result-memory-${mem.id}`}
                  >
                    <Brain className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{mem.content}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{mem.scope} memory</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
