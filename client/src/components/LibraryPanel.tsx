import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Library, FolderOpen, FileText, Search, Plus, Trash2,
  ChevronRight, ChevronDown, Clock, Globe, Loader2,
  HardDrive, FilePlus, ArrowLeft, Download, BookOpen, ExternalLink,
  ScanLine, Image,
} from "lucide-react";
import { SiNotion } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LibraryItem, LibraryFolder } from "@shared/schema";

interface LibraryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FsEntry {
  name: string;
  type: "file" | "folder";
  path: string;
  size?: number;
  modifiedAt?: string;
}

interface FsBrowseResult {
  path: string;
  items: FsEntry[];
  rootFolder: string;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".avif", ".tiff"]);

function isImagePath(p?: string): boolean {
  if (!p) return false;
  return IMAGE_EXTS.has("." + p.split(".").pop()?.toLowerCase());
}

function imagePreviewUrl(p: string): string {
  return `/api/library/preview?path=${encodeURIComponent(p)}`;
}

function sourceIcon(source: string, filePath?: string) {
  if (source === "file" && filePath && isImagePath(filePath)) return <Image className="h-3.5 w-3.5 text-purple-500" />;
  switch (source) {
    case "file": return <FileText className="h-3.5 w-3.5 text-blue-500" />;
    case "url": return <Globe className="h-3.5 w-3.5 text-green-500" />;
    case "note": return <FileText className="h-3.5 w-3.5 text-amber-500" />;
    default: return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function ItemCard({ item, onDelete }: { item: LibraryItem; onDelete: (id: string) => void }) {
  const isImage = item.source === "file" && isImagePath(item.filePath);
  return (
    <div
      className="flex items-start gap-2 p-2.5 rounded-md border bg-card hover:bg-accent/40 transition-colors group"
      data-testid={`card-library-item-${item.id}`}
    >
      {isImage && item.filePath ? (
        <img
          src={imagePreviewUrl(item.filePath)}
          alt={item.title}
          className="w-14 h-14 object-cover rounded-md shrink-0 border"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="mt-0.5 shrink-0">{sourceIcon(item.source, item.filePath)}</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.source === "file" && item.filePath && !isImage && (
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate" title={item.filePath}>
            {item.filePath}
          </p>
        )}
        {item.source === "file" && item.filePath && isImage && (
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate" title={item.filePath}>
            {item.filePath.split("/").pop()}
          </p>
        )}
        {item.source !== "file" && item.summary && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.summary}</p>
        )}
        {item.notes && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic line-clamp-2">
            {item.notes}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
          {item.tags?.map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs px-1 py-0">{tag}</Badge>
          ))}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 opacity-0 group-hover:opacity-100 h-6 w-6"
        onClick={() => onDelete(item.id)}
        data-testid={`button-delete-library-item-${item.id}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function FolderSection({ folder, onDelete }: { folder: LibraryFolder; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  const { data: items = [] } = useQuery<LibraryItem[]>({
    queryKey: ["/api/library/items", { folderId: folder.id }],
    queryFn: async () => {
      const res = await fetch(`/api/library/items?folderId=${folder.id}`);
      return res.json();
    },
    enabled: expanded,
  });

  return (
    <div data-testid={`folder-library-${folder.id}`}>
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer transition-colors group"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-sm flex-1">{folder.name}</span>
        <Button
          size="icon"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 h-5 w-5 shrink-0"
          onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
          data-testid={`button-delete-folder-${folder.id}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {expanded && (
        <div className="ml-6 mt-1 space-y-1">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">Empty collection</p>
          ) : (
            items.map(item => (
              <ItemCard key={item.id} item={item} onDelete={() => queryClient.invalidateQueries({ queryKey: ["/api/library/items"] })} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface NotionResult {
  id: string;
  type: string;
  title: string;
  url: string;
  lastEdited: string;
}

function NotionBrowser({ onImport }: { onImport: (item: NotionResult) => void }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ results: NotionResult[] }>({
    queryKey: ["/api/capabilities/invoke", "notion_search", submitted],
    queryFn: async () => {
      if (!submitted.trim()) return { results: [] };
      const res = await apiRequest("POST", "/api/capabilities/invoke", {
        name: "notion_search",
        args: { query: submitted, maxResults: 20 },
      });
      return res.json();
    },
    enabled: submitted.trim().length > 0,
  });

  const results = (data as any)?.result?.results ?? (data as any)?.results ?? [];

  const handleSearch = () => {
    if (query.trim()) setSubmitted(query.trim());
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search your Notion workspace…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          data-testid="input-notion-search"
        />
        <Button
          size="sm"
          onClick={handleSearch}
          disabled={!query.trim() || isLoading}
          data-testid="button-notion-search"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {error && (
        <div className="text-center py-6 text-muted-foreground">
          <SiNotion className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Could not connect to Notion.</p>
          <p className="text-xs mt-1">{(error as Error).message}</p>
        </div>
      )}

      {!submitted && !error && (
        <div className="text-center py-6 text-muted-foreground">
          <SiNotion className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Search for pages, databases, or notes in your Notion workspace.</p>
        </div>
      )}

      <ScrollArea className="h-[300px]">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 && submitted ? (
          <div className="text-center py-6 text-muted-foreground">
            <Search className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">No results for "{submitted}"</p>
          </div>
        ) : (
          <div className="space-y-1">
            {results.map((item: NotionResult) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/40 transition-colors group"
                data-testid={`notion-result-${item.id}`}
              >
                <SiNotion className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.type === "database" ? "Database" : "Page"} · {new Date(item.lastEdited).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    title="Import to library"
                    onClick={() => onImport(item)}
                    data-testid={`button-notion-import-${item.id}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-6 w-6 rounded-sm hover:bg-accent transition-colors"
                    title="Open in Notion"
                    data-testid={`link-notion-open-${item.id}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function FilesystemBrowser({ onImport, onScanFolder }: { onImport: (entry: FsEntry) => void; onScanFolder: (relativePath: string, absoluteRoot: string) => void }) {
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<FsBrowseResult>({
    queryKey: ["/api/filesystem/browse", currentPath],
    queryFn: async () => {
      const params = currentPath ? `?path=${encodeURIComponent(currentPath)}` : "";
      const res = await fetch(`/api/filesystem/browse${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to browse");
      }
      return res.json();
    },
  });

  const pathParts = (data?.path && data.path !== ".") ? data.path.split("/").filter(Boolean) : [];

  const navigate = (entry: FsEntry) => {
    if (entry.type === "folder") {
      setCurrentPath(entry.path);
    }
  };

  const goUp = () => {
    if (pathParts.length === 0) return;
    const parent = pathParts.slice(0, -1).join("/");
    setCurrentPath(parent || undefined);
  };

  const goToSegment = (index: number) => {
    const seg = pathParts.slice(0, index + 1).join("/");
    setCurrentPath(seg || undefined);
  };

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <HardDrive className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm">{(error as Error).message}</p>
        <p className="text-xs mt-1">Set a root folder in Settings to enable browsing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Breadcrumb + Scan button */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1 flex-1 flex-wrap">
          <button
            className="hover:text-foreground transition-colors font-medium"
            onClick={() => setCurrentPath(undefined)}
            data-testid="breadcrumb-root"
          >
            root
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => goToSegment(i)}
              >
                {part}
              </button>
            </span>
          ))}
        </div>
        {data?.rootFolder && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs gap-1 shrink-0"
            onClick={() => onScanFolder(data.path, data.rootFolder)}
            title="Scan this folder and add all files to library"
            data-testid="button-scan-folder"
          >
            <ScanLine className="h-3 w-3" />
            Scan folder
          </Button>
        )}
      </div>

      <ScrollArea className="h-[340px]">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-0.5">
            {pathParts.length > 0 && (
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-accent/40 text-sm text-muted-foreground transition-colors"
                onClick={goUp}
                data-testid="button-go-up"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                ..
              </button>
            )}
            {data?.items.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">Empty folder</p>
            )}
            {data?.items.map(entry => (
              <div
                key={entry.path}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors group cursor-pointer"
                onClick={() => navigate(entry)}
                data-testid={`fs-entry-${entry.type}-${entry.name}`}
              >
                {entry.type === "folder"
                  ? <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  : <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                }
                <span className="text-sm flex-1 truncate">{entry.name}</span>
                {entry.size !== undefined && (
                  <span className="text-xs text-muted-foreground shrink-0">{formatSize(entry.size)}</span>
                )}
                {entry.type === "file" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 shrink-0"
                    onClick={(e) => { e.stopPropagation(); onImport(entry); }}
                    title="Import to library"
                    data-testid={`button-import-${entry.name}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function LibraryPanel({ open, onOpenChange }: LibraryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState<"note" | "url" | "file" | "upload">("note");
  const [newFilePath, setNewFilePath] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const { toast } = useToast();

  const { data: folders = [], isLoading: loadingFolders } = useQuery<LibraryFolder[]>({
    queryKey: ["/api/library/folders"],
    enabled: open,
  });

  const { data: recentItems = [], isLoading: loadingRecent } = useQuery<LibraryItem[]>({
    queryKey: ["/api/library/items", { recent: true }],
    queryFn: async () => {
      const res = await fetch("/api/library/items?recent=true&limit=20");
      return res.json();
    },
    enabled: open,
  });

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery<LibraryItem[]>({
    queryKey: ["/api/library/items/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await fetch(`/api/library/items/search?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: open && searchQuery.trim().length > 1,
  });

  const createItemMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/library/items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/items"] });
      setAddItemOpen(false);
      setNewTitle("");
      setNewContent("");
      toast({ title: "Added to library" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add item.", variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/library/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/items"] });
      toast({ title: "Removed from library" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove item.", variant: "destructive" }),
  });

  const createFolderMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/library/folders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/folders"] });
      setAddFolderOpen(false);
      setNewFolderName("");
      toast({ title: "Collection created" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create collection.", variant: "destructive" }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/library/folders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/library/items"] });
      toast({ title: "Collection removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove collection.", variant: "destructive" }),
  });

  const scanFolderMutation = useMutation({
    mutationFn: (data: { folderPath: string; folderId?: string }) =>
      apiRequest("POST", "/api/library/scan-folder", data).then((r) => r.json()),
    onSuccess: (data: { created: number; skipped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/items"] });
      toast({
        title: `Scan complete`,
        description: `${data.created} file${data.created !== 1 ? "s" : ""} added${data.skipped ? `, ${data.skipped} already in library` : ""}.`,
      });
    },
    onError: () => toast({ title: "Scan failed", description: "Could not scan folder.", variant: "destructive" }),
  });

  const handleImportFromFs = (entry: FsEntry) => {
    createItemMutation.mutate({
      title: entry.name,
      source: "file",
      filePath: entry.path,
      summary: `File imported from ${entry.path}`,
    });
    toast({ title: "Importing…", description: entry.name });
  };

  const handleScanFolder = (relativePath: string, rootFolder: string) => {
    const folderPath = relativePath === "."
      ? rootFolder
      : `${rootFolder.replace(/\/$/, "")}/${relativePath}`;
    scanFolderMutation.mutate({ folderPath });
    toast({ title: "Scanning…", description: "Walking folder, adding file references." });
  };

  const handleImportFromNotion = (item: NotionResult) => {
    createItemMutation.mutate({
      title: item.title,
      source: "url",
      content: item.url,
      summary: `Notion ${item.type}: ${item.title}`,
      tags: ["notion"],
    });
    toast({ title: "Added to library", description: item.title });
  };

  const isSearching = searchQuery.trim().length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Library
          </DialogTitle>
          <DialogDescription>
            An inspectable record of documents, notes, and files the resident knows about.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search library…"
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-library-search"
          />
        </div>

        {isSearching ? (
          <div className="flex-1 overflow-hidden">
            <p className="text-xs text-muted-foreground mb-2">
              {loadingSearch ? "Searching…" : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
            </p>
            <ScrollArea className="h-[400px]">
              {loadingSearch ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">No results found</p>
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {searchResults.map(item => (
                    <ItemCard key={item.id} item={item} onDelete={(id) => deleteItemMutation.mutate(id)} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <Tabs defaultValue="recent" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="recent" className="gap-1.5" data-testid="tab-library-recent">
                <Clock className="h-3.5 w-3.5" />
                Recent
              </TabsTrigger>
              <TabsTrigger value="collections" className="gap-1.5" data-testid="tab-library-collections">
                <FolderOpen className="h-3.5 w-3.5" />
                Collections
                {folders.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{folders.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="notion" className="gap-1.5" data-testid="tab-library-notion">
                <SiNotion className="h-3.5 w-3.5" />
                Notion
              </TabsTrigger>
              <TabsTrigger value="browse" className="gap-1.5" data-testid="tab-library-browse">
                <HardDrive className="h-3.5 w-3.5" />
                Files
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="flex-1 overflow-hidden mt-2">
              <ScrollArea className="h-[360px]">
                {loadingRecent ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : recentItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Library className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">Library is empty</p>
                    <p className="text-xs mt-1">Add notes, files, or URLs — or ask the AI to save something.</p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-2">
                    {recentItems.map(item => (
                      <ItemCard key={item.id} item={item} onDelete={(id) => deleteItemMutation.mutate(id)} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="collections" className="flex-1 overflow-hidden mt-2">
              <ScrollArea className="h-[360px]">
                {loadingFolders ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : folders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">No collections yet</p>
                    <p className="text-xs mt-1">Create a collection to organise your library.</p>
                  </div>
                ) : (
                  <div className="space-y-1 pr-2">
                    {folders.map(folder => (
                      <FolderSection
                        key={folder.id}
                        folder={folder}
                        onDelete={(id) => deleteFolderMutation.mutate(id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="notion" className="flex-1 overflow-hidden mt-2">
              <NotionBrowser onImport={handleImportFromNotion} />
            </TabsContent>

            <TabsContent value="browse" className="flex-1 overflow-hidden mt-2">
              <FilesystemBrowser onImport={handleImportFromFs} onScanFolder={handleScanFolder} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2 flex-row justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddFolderOpen(true)}
            className="gap-1.5"
            data-testid="button-add-collection"
          >
            <Plus className="h-3.5 w-3.5" />
            Collection
          </Button>
          <Button
            size="sm"
            onClick={() => setAddItemOpen(true)}
            className="gap-1.5"
            data-testid="button-add-library-item"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={(v) => {
        setAddItemOpen(v);
        if (!v) { setNewTitle(""); setNewContent(""); setNewFilePath(""); setNewNotes(""); setNewSource("note"); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Library</DialogTitle>
            <DialogDescription>Save a note, URL, or local file path to the library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={newSource} onValueChange={(v) => setNewSource(v as any)}>
                <SelectTrigger data-testid="select-library-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="url">URL / Web Page</SelectItem>
                  <SelectItem value="file">Local File Path</SelectItem>
                  <SelectItem value="upload">Uploaded File</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Title…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-library-title"
              />
            </div>
            {newSource === "file" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">File Path</label>
                <Input
                  placeholder="/mnt/workhub/Projects/My Document.md"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-library-filepath"
                />
                <p className="text-xs text-muted-foreground">
                  Absolute path on your machine. The file stays where it is — only the path is saved here.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{newSource === "url" ? "URL" : "Content"}</label>
                <Textarea
                  placeholder={newSource === "url" ? "https://…" : "Write or paste content…"}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  data-testid="textarea-library-content"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Note <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g. Read this before looking at flora/fauna — it provides the context"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                data-testid="input-library-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (newSource === "file") {
                  createItemMutation.mutate({
                    title: newTitle,
                    source: "file",
                    filePath: newFilePath,
                    notes: newNotes || undefined,
                  });
                } else {
                  createItemMutation.mutate({
                    title: newTitle,
                    source: newSource,
                    content: newContent,
                    summary: newContent.slice(0, 200),
                    notes: newNotes || undefined,
                  });
                }
              }}
              disabled={
                !newTitle.trim() ||
                (newSource === "file" ? !newFilePath.trim() : !newContent.trim() && newSource !== "note") ||
                createItemMutation.isPending
              }
              data-testid="button-save-library-item"
            >
              {createItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Collection Dialog */}
      <Dialog open={addFolderOpen} onOpenChange={setAddFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>Create a named collection to organise library items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="Collection name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              data-testid="input-folder-name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) {
                  createFolderMutation.mutate({ name: newFolderName });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFolderOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createFolderMutation.mutate({ name: newFolderName })}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              data-testid="button-save-folder"
            >
              {createFolderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
