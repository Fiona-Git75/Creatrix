import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Trash2, Loader2, Pencil, X, ChevronLeft,
  CheckCircle, Users, Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Connection, Project, ProviderType } from "@shared/schema";

interface ResidentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CommissionStep = 1 | 2;

type IdentityForm = {
  residentEmoji: string;
  residentName: string;
  residentRole: string;
  residentDescription: string;
};

type RuntimeForm = {
  endpoint: string;
  provider: ProviderType;
  apiKey: string;
  defaultModel: string;
};

type EditForm = IdentityForm & RuntimeForm & { name: string; maxImageSizeMb: string };

interface SuggestedProvider {
  name: string;
  type: string;
  endpoint: string;
  models: string[];
}

interface ProvidersStatusResponse {
  providers: { connectionId: string; name: string; type: string; status: "online" | "offline"; models: { id: string }[] }[];
  suggested: SuggestedProvider[];
}

function detectProvider(url: string): { provider: ProviderType; model: string } {
  if (url.includes("api.openai.com")) return { provider: "openai", model: "gpt-4o" };
  if (url.includes("localhost:11434") || url.includes("127.0.0.1:11434")) return { provider: "ollama", model: "" };
  if (url.includes("localhost:1234") || url.includes("127.0.0.1:1234")) return { provider: "lmstudio", model: "" };
  return { provider: "custom", model: "" };
}

const providerLabels: Record<ProviderType, string> = {
  openai: "OpenAI",
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
  custom: "Custom endpoint",
};

function ResidentCard({
  connection,
  projects,
  onEdit,
  onDelete,
  deletingId,
}: {
  connection: Connection;
  projects: Project[];
  onEdit: (c: Connection) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  const residentProjects = projects.filter(p => p.connectionId === connection.id);
  const name = connection.residentName || connection.name;
  const emoji = connection.residentEmoji;

  return (
    <div className="py-5 first:pt-2" data-testid={`resident-card-${connection.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              {emoji && <span className="text-xl leading-none">{emoji}</span>}
              <span className="font-semibold text-base">{name}</span>
              {connection.isDefault && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                  Default
                </span>
              )}
            </div>
            {connection.residentRole && (
              <p className="text-sm text-muted-foreground mt-0.5">{connection.residentRole}</p>
            )}
          </div>

          <div className="space-y-2 text-sm">
            {connection.defaultModel && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Model</p>
                <p className="font-mono text-xs">{connection.defaultModel}</p>
              </div>
            )}
            {connection.residentDescription && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">About</p>
                <p className="text-sm text-foreground/80 leading-snug">{connection.residentDescription}</p>
              </div>
            )}
            {residentProjects.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Projects</p>
                <div className="space-y-0.5">
                  {residentProjects.map(p => (
                    <p key={p.id} className="text-sm">{p.name}</p>
                  ))}
                </div>
              </div>
            )}
            {!connection.residentName && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-1.5">
                <Cpu className="h-3 w-3 shrink-0" />
                Runtime only — no resident commissioned yet
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onEdit(connection)}
            data-testid={`button-edit-resident-${connection.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onDelete(connection.id)}
            disabled={deletingId === connection.id}
            data-testid={`button-delete-resident-${connection.id}`}
          >
            {deletingId === connection.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditResidentForm({
  connection,
  onSave,
  onCancel,
  isPending,
}: {
  connection: Connection;
  onSave: (form: EditForm) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<EditForm>({
    residentEmoji: connection.residentEmoji ?? "",
    residentName: connection.residentName ?? "",
    residentRole: connection.residentRole ?? "",
    residentDescription: connection.residentDescription ?? "",
    endpoint: connection.endpoint,
    provider: connection.provider as ProviderType,
    apiKey: connection.apiKey ?? "",
    defaultModel: connection.defaultModel ?? "",
    name: connection.name,
    maxImageSizeMb: connection.maxImageSizeMb != null ? String(connection.maxImageSizeMb) : "",
  });

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Edit resident</p>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel} data-testid={`button-cancel-edit-resident-${connection.id}`}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Identity</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[56px_1fr] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-emoji-${connection.id}`} className="text-xs">Emoji</Label>
              <Input
                id={`edit-emoji-${connection.id}`}
                value={form.residentEmoji}
                onChange={e => setForm(f => ({ ...f, residentEmoji: e.target.value }))}
                placeholder="🤖"
                className="text-center text-lg"
                data-testid={`input-edit-resident-emoji-${connection.id}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-rname-${connection.id}`} className="text-xs">Name</Label>
              <Input
                id={`edit-rname-${connection.id}`}
                value={form.residentName}
                onChange={e => setForm(f => ({ ...f, residentName: e.target.value }))}
                placeholder="e.g. Olmo, Sage, Aria"
                data-testid={`input-edit-resident-name-${connection.id}`}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-rrole-${connection.id}`} className="text-xs">Role</Label>
            <Input
              id={`edit-rrole-${connection.id}`}
              value={form.residentRole}
              onChange={e => setForm(f => ({ ...f, residentRole: e.target.value }))}
              placeholder="e.g. Primary collaborator, Technical steward"
              data-testid={`input-edit-resident-role-${connection.id}`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-rdesc-${connection.id}`} className="text-xs">Description</Label>
            <textarea
              id={`edit-rdesc-${connection.id}`}
              value={form.residentDescription}
              onChange={e => setForm(f => ({ ...f, residentDescription: e.target.value }))}
              placeholder="How this resident operates, their character, what they care about…"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              data-testid={`input-edit-resident-desc-${connection.id}`}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Runtime</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-endpoint-${connection.id}`} className="text-xs">URL</Label>
            <Input
              id={`edit-endpoint-${connection.id}`}
              value={form.endpoint}
              onChange={e => {
                const detected = detectProvider(e.target.value);
                setForm(f => ({ ...f, endpoint: e.target.value, provider: detected.provider }));
              }}
              placeholder="http://localhost:11434  or  https://api.openai.com/v1"
              data-testid={`input-edit-endpoint-${connection.id}`}
            />
            {form.endpoint && (
              <p className="text-xs text-muted-foreground">{providerLabels[form.provider]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-model-${connection.id}`} className="text-xs">Default model</Label>
            <Input
              id={`edit-model-${connection.id}`}
              value={form.defaultModel}
              onChange={e => setForm(f => ({ ...f, defaultModel: e.target.value }))}
              placeholder="model-name"
              data-testid={`input-edit-model-${connection.id}`}
            />
          </div>
          {(form.provider === "openai" || form.provider === "custom") && (
            <div className="space-y-1.5">
              <Label htmlFor={`edit-apikey-${connection.id}`} className="text-xs">API Key</Label>
              <Input
                id={`edit-apikey-${connection.id}`}
                type="password"
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-…  (leave blank to keep existing)"
                data-testid={`input-edit-apikey-${connection.id}`}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={isPending || !form.endpoint}
          data-testid={`button-save-resident-${connection.id}`}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

function CommissionForm({
  onDone,
  onCancel,
  connectionCount,
}: {
  onDone: () => void;
  onCancel: () => void;
  connectionCount: number;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<CommissionStep>(1);
  const [identity, setIdentity] = useState<IdentityForm>({
    residentEmoji: "",
    residentName: "",
    residentRole: "",
    residentDescription: "",
  });
  const [runtime, setRuntime] = useState<RuntimeForm>({
    endpoint: "",
    provider: "ollama",
    apiKey: "",
    defaultModel: "",
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/providers/refresh"),
    onSuccess: async (res) => {
      const data: ProvidersStatusResponse = await res.json();
      const first = data.suggested?.[0];
      if (first) {
        const detected = detectProvider(first.endpoint);
        setRuntime(r => ({
          ...r,
          endpoint: first.endpoint,
          provider: detected.provider,
          defaultModel: first.models[0] ?? r.defaultModel,
        }));
        toast({ title: `Found: ${first.name}`, description: first.models.length > 0 ? `${first.models.length} model(s) available` : "No models installed yet" });
      } else {
        toast({ title: "No local AI found", description: "Start Ollama or LM Studio and try again." });
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: object) => apiRequest("POST", "/api/connections", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/status"] });
      toast({ title: `${identity.residentName || "Resident"} commissioned` });
      onDone();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const handleEndpointChange = (url: string) => {
    const detected = detectProvider(url);
    setRuntime(r => ({ ...r, endpoint: url, provider: detected.provider, defaultModel: r.defaultModel || detected.model }));
  };

  const handleCommission = () => {
    createMutation.mutate({
      name: identity.residentName || runtime.endpoint,
      provider: runtime.provider,
      endpoint: runtime.endpoint,
      apiKey: runtime.apiKey || undefined,
      defaultModel: runtime.defaultModel || undefined,
      isDefault: connectionCount === 0,
      residentName: identity.residentName || undefined,
      residentEmoji: identity.residentEmoji || undefined,
      residentRole: identity.residentRole || undefined,
      residentDescription: identity.residentDescription || undefined,
    });
  };

  if (step === 1) {
    return (
      <div className="space-y-5 py-2">
        <div className="space-y-1">
          <p className="font-medium">Who are they?</p>
          <p className="text-sm text-muted-foreground">
            Give this resident an identity before choosing a runtime.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-[56px_1fr] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="commission-emoji" className="text-xs">Emoji</Label>
              <Input
                id="commission-emoji"
                value={identity.residentEmoji}
                onChange={e => setIdentity(f => ({ ...f, residentEmoji: e.target.value }))}
                placeholder="🤖"
                className="text-center text-lg"
                data-testid="input-commission-emoji"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission-name" className="text-xs">Name</Label>
              <Input
                id="commission-name"
                value={identity.residentName}
                onChange={e => setIdentity(f => ({ ...f, residentName: e.target.value }))}
                placeholder="e.g. Olmo, Sage, Aria"
                autoFocus
                data-testid="input-commission-name"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commission-role" className="text-xs">Role</Label>
            <Input
              id="commission-role"
              value={identity.residentRole}
              onChange={e => setIdentity(f => ({ ...f, residentRole: e.target.value }))}
              placeholder="e.g. Primary collaborator, Technical steward"
              data-testid="input-commission-role"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commission-desc" className="text-xs">Description</Label>
            <textarea
              id="commission-desc"
              value={identity.residentDescription}
              onChange={e => setIdentity(f => ({ ...f, residentDescription: e.target.value }))}
              placeholder="How this resident operates, their character, what they care about…"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              data-testid="input-commission-desc"
            />
          </div>
        </div>

        <div className="flex justify-between pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => setStep(2)}
            disabled={!identity.residentName.trim()}
            data-testid="button-commission-next"
          >
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-2">
      <div className="space-y-1">
        <button
          onClick={() => setStep(1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-commission-back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <p className="font-medium">
          {identity.residentEmoji && <span className="mr-1">{identity.residentEmoji}</span>}
          {identity.residentName} — Runtime
        </p>
        <p className="text-sm text-muted-foreground">
          Which model and endpoint does {identity.residentName} run on?
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            data-testid="button-scan-runtime"
          >
            {scanMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
            Scan for local AI
          </Button>
          <span className="text-xs text-muted-foreground">or enter manually below</span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="commission-endpoint" className="text-xs">Runtime URL</Label>
          <Input
            id="commission-endpoint"
            value={runtime.endpoint}
            onChange={e => handleEndpointChange(e.target.value)}
            placeholder="http://localhost:11434  or  https://api.openai.com/v1"
            data-testid="input-commission-endpoint"
          />
          {runtime.endpoint && (
            <p className="text-xs text-muted-foreground">{providerLabels[runtime.provider]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="commission-model" className="text-xs">Model</Label>
          <Input
            id="commission-model"
            value={runtime.defaultModel}
            onChange={e => setRuntime(r => ({ ...r, defaultModel: e.target.value }))}
            placeholder="e.g. olmo-3:7b-instruct-q4_K_M"
            data-testid="input-commission-model"
          />
          <p className="text-xs text-muted-foreground">
            The model {identity.residentName} uses by default. You can change it per-chat.
          </p>
        </div>

        {(runtime.provider === "openai" || runtime.provider === "custom") && (
          <div className="space-y-1.5">
            <Label htmlFor="commission-apikey" className="text-xs">API Key</Label>
            <Input
              id="commission-apikey"
              type="password"
              value={runtime.apiKey}
              onChange={e => setRuntime(r => ({ ...r, apiKey: e.target.value }))}
              placeholder="sk-…"
              data-testid="input-commission-apikey"
            />
          </div>
        )}
      </div>

      <div className="flex justify-between pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
        <Button
          size="sm"
          onClick={handleCommission}
          disabled={createMutation.isPending || !runtime.endpoint}
          data-testid="button-commission-submit"
        >
          {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          Commission {identity.residentName}
        </Button>
      </div>
    </div>
  );
}

export function ResidentsPanel({ open, onOpenChange }: ResidentsPanelProps) {
  const { toast } = useToast();
  const [commissioning, setCommissioning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; count: number } | null>(null);

  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      apiRequest("PATCH", `/api/connections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      setEditingId(null);
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      setDeleteConfirm(null);
      toast({ title: "Resident removed" });
    },
  });

  const handleDeleteClick = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await apiRequest("GET", `/api/connections/${id}/usage`);
      const { count } = await res.json();
      if (count > 0) {
        setDeleteConfirm({ id, count });
      } else {
        deleteMutation.mutate(id);
      }
    } catch {
      deleteMutation.mutate(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveEdit = (id: string, form: EditForm) => {
    const maxMb = form.maxImageSizeMb !== "" ? parseInt(form.maxImageSizeMb, 10) : undefined;
    updateMutation.mutate({
      id,
      data: {
        name: form.residentName || form.name,
        provider: form.provider,
        endpoint: form.endpoint,
        apiKey: form.apiKey || undefined,
        defaultModel: form.defaultModel || undefined,
        maxImageSizeMb: maxMb && maxMb > 0 ? maxMb : undefined,
        residentName: form.residentName || undefined,
        residentEmoji: form.residentEmoji || undefined,
        residentRole: form.residentRole || undefined,
        residentDescription: form.residentDescription || undefined,
      },
    });
  };

  const isEmpty = !isLoading && connections.length === 0 && !commissioning;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Residents
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="pr-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : isEmpty ? (
                <div className="py-10 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">No residents yet.</p>
                  <p className="text-xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                    Commission a resident to give an AI an identity, role, and continuity of their own.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setCommissioning(true)}
                    data-testid="button-commission-first"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Commission Resident
                  </Button>
                </div>
              ) : commissioning ? (
                <CommissionForm
                  onDone={() => setCommissioning(false)}
                  onCancel={() => setCommissioning(false)}
                  connectionCount={connections.length}
                />
              ) : (
                <div>
                  <button
                    onClick={() => { setEditingId(null); setCommissioning(true); }}
                    className="w-full flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors py-1 mb-2"
                    data-testid="button-commission-resident"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Commission Resident
                  </button>

                  <Separator />

                  {connections.map((connection, idx) => (
                    <div key={connection.id}>
                      {editingId === connection.id ? (
                        <EditResidentForm
                          connection={connection}
                          onSave={(form) => handleSaveEdit(connection.id, form)}
                          onCancel={() => setEditingId(null)}
                          isPending={updateMutation.isPending}
                        />
                      ) : (
                        <ResidentCard
                          connection={connection}
                          projects={projects}
                          onEdit={(c) => { setCommissioning(false); setEditingId(c.id); }}
                          onDelete={handleDeleteClick}
                          deletingId={deletingId || (deleteMutation.isPending ? (deleteConfirm?.id ?? null) : null)}
                        />
                      )}
                      {idx < connections.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm !== null} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove resident?</DialogTitle>
          </DialogHeader>
          {deleteConfirm && deleteConfirm.count > 0 && (
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">
                {deleteConfirm.count} {deleteConfirm.count === 1 ? "conversation uses" : "conversations use"} this resident.
              </strong>{" "}
              Removing them will leave {deleteConfirm.count === 1 ? "that conversation" : "them"} without a provider.
            </p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete-resident">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-resident"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
