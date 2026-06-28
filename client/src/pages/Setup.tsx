import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, ArrowRight, CheckCircle2, XCircle,
  Circle, Wifi, WifiOff, Shield, Database, Cpu, Wrench, SkipForward, Info, X, Home,
  Copy, Check
} from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      data-testid="button-copy-command"
      className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function CopyReportButton({ buildReport }: { buildReport: () => string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(buildReport()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      data-testid="button-copy-report"
      className="flex items-center gap-2 w-full justify-center py-2 px-3 rounded-md border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border hover:bg-white/5 transition-colors font-mono"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-400" />
          <span className="text-green-400">Report copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy report
        </>
      )}
    </button>
  );
}

interface CoherenceReport {
  coherent: boolean;
  overallStatus: "GREEN" | "AMBER" | "RED";
  items: {
    domain: string;
    component: string;
    actual: string;
    message: string;
    action?: string;
    firstLook?: string;
  }[];
  measuredAt: string;
}

type Provider = "ollama" | "lmstudio" | "openai" | "custom";

const PROVIDER_DEFAULTS: Record<Provider, { endpoint: string; label: string }> = {
  ollama:   { endpoint: "http://localhost:11434",     label: "Ollama" },
  lmstudio: { endpoint: "http://localhost:1234/v1",   label: "LM Studio" },
  openai:   { endpoint: "https://api.openai.com/v1", label: "OpenAI" },
  custom:   { endpoint: "",                           label: "Custom" },
};

const TOTAL_STEPS = 4;

type ProbePhase = "enter" | "probing" | "select" | "saving" | "done";
type ServiceState = "idle" | "probing" | "ok" | "fail" | "skip";

interface BootstrapStep {
  step: number;
  component: string;
  result: "OK" | "SKIP" | "FAIL";
  detail: string;
  timestamp: string;
}

const STEP_LABELS = ["Account", "AI Connection", "Services"];

function StepIndicator({ current, skipped = [] }: { current: number; skipped?: number[] }) {
  return (
    <div className="flex items-start gap-0">
      {STEP_LABELS.map((label, i) => {
        const isSkipped = skipped.includes(i);
        const isComplete = !isSkipped && i < current;
        const isCurrent = i === current;
        const isFuture = !isSkipped && !isComplete && !isCurrent;

        return (
          <div key={i} className="flex items-start">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-all duration-300 ${
                  isSkipped
                    ? "bg-muted text-muted-foreground"
                    : isComplete
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                    ? "bg-primary/15 text-primary border-2 border-primary/50"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
                data-testid={`step-indicator-${i}`}
              >
                {isSkipped ? (
                  <SkipForward className="h-3 w-3" />
                ) : isComplete ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  i + 1
                )}
              </div>
              <div className="flex flex-col items-center">
                <span
                  className={`text-xs whitespace-nowrap font-medium ${
                    isSkipped
                      ? "text-muted-foreground/60 line-through"
                      : isCurrent
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
                {isSkipped && (
                  <span className="text-xs text-muted-foreground/70 whitespace-nowrap" data-testid={`step-skipped-label-${i}`}>
                    Already set up
                  </span>
                )}
              </div>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={`h-px w-8 mt-3 mx-1 transition-all duration-300 ${
                  i < current || isSkipped ? "bg-primary/40" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <span className="text-xs text-muted-foreground">{label}</span>;
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-destructive">
      <XCircle className="h-3 w-3" /> {label}
    </span>
  );
}

function RecordRow({
  icon: Icon,
  component,
  result,
  detail,
  timestamp,
}: {
  icon: React.ElementType;
  component: string;
  result: "OK" | "SKIP" | "FAIL";
  detail: string;
  timestamp: string;
}) {
  const colour =
    result === "OK"
      ? "text-emerald-600 dark:text-emerald-400"
      : result === "SKIP"
      ? "text-muted-foreground"
      : "text-destructive";
  return (
    <div className="grid grid-cols-[20px_1fr_36px_auto] gap-3 items-start py-2.5 border-b border-border/50 last:border-0">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{component}</p>
        <p className="text-xs text-muted-foreground truncate">{detail}</p>
      </div>
      <span className={`text-xs font-mono font-semibold ${colour}`}>{result}</span>
      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
        {new Date(timestamp).toLocaleTimeString()}
      </span>
    </div>
  );
}

export default function Setup() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [autoSkippedAccount, setAutoSkippedAccount] = useState(false);
  const [skippedBannerVisible, setSkippedBannerVisible] = useState(true);

  const { data: authStatus } = useQuery<{ bootstrapped: boolean; user: { username: string } | null }>({
    queryKey: ["/api/auth/status"],
  });

  const { data: coherence } = useQuery<CoherenceReport>({
    queryKey: ["/api/system/coherence"],
    enabled: authStatus?.bootstrapped === true,
    // Poll every 30s regardless of status:
    //   GREEN  → detect mid-session degradation so the summary page stays accurate
    //   AMBER/RED → detect recovery so the repair view can redirect home
    refetchInterval: 30_000,
  });

  // Countdown banner for the repair view: counts down 30→0 and resets on each poll.
  const [repairCountdown, setRepairCountdown] = useState(30);
  const inRepairView = authStatus?.bootstrapped && coherence && coherence.overallStatus !== "GREEN";

  // Reset to 30 each time the coherence query resolves (measuredAt changes = new poll).
  useEffect(() => {
    if (inRepairView) setRepairCountdown(30);
  }, [coherence?.measuredAt]);

  // Tick down every second while the repair view is active.
  useEffect(() => {
    if (!inRepairView) return;
    const id = setInterval(() => {
      setRepairCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [inRepairView]);

  // Track whether the repair view was ever shown so we can detect recovery.
  const wasInRepairView = useRef(false);
  if (authStatus?.bootstrapped && coherence && coherence.overallStatus !== "GREEN") {
    wasInRepairView.current = true;
  }

  // When coherence recovers to GREEN while the repair view was active, navigate home.
  useEffect(() => {
    if (wasInRepairView.current && coherence?.overallStatus === "GREEN") {
      setLocation("/");
    }
  }, [coherence?.overallStatus, setLocation]);

  useEffect(() => {
    if (authStatus?.user && step === 0) {
      setCreatedUsername(authStatus.user.username);
      setAccountTimestamp(new Date().toISOString());
      setAutoSkippedAccount(true);
      setSkippedBannerVisible(true);
      setStep(2);
    }
  }, [authStatus, step]);

  useEffect(() => {
    if (autoSkippedAccount && skippedBannerVisible) {
      const timer = setTimeout(() => setSkippedBannerVisible(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [autoSkippedAccount, skippedBannerVisible]);

  // ── Step 1: Account ──────────────────────────────────────────────────────
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountError, setAccountError] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");
  const [accountTimestamp, setAccountTimestamp] = useState("");

  // ── Step 2: AI connection ────────────────────────────────────────────────
  const [provider, setProvider] = useState<Provider>("ollama");
  const [endpoint, setEndpoint] = useState(PROVIDER_DEFAULTS.ollama.endpoint);
  const [apiKey, setApiKey] = useState("");
  const [probePhase, setProbePhase] = useState<ProbePhase>("enter");
  const [probeModels, setProbeModels] = useState<{ id: string; name: string; size?: string }[]>([]);
  const [probeError, setProbeError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [confirmedAI, setConfirmedAI] = useState<{ provider: string; endpoint: string; model: string; timestamp: string } | null>(null);

  // ── Step 3: Services ─────────────────────────────────────────────────────
  const [whisperUrl, setWhisperUrl] = useState("http://localhost:9000");
  const [whisperState, setWhisperState] = useState<ServiceState>("idle");
  const [whisperError, setWhisperError] = useState("");
  const [searxngUrl, setSearxngUrl] = useState("http://localhost:8080");
  const [searxngState, setSearxngState] = useState<ServiceState>("idle");
  const [searxngError, setSearxngError] = useState("");
  const [servicesTimestamp, setServicesTimestamp] = useState("");

  // ── Step 4: Bootstrap record ─────────────────────────────────────────────
  const [bootstrapId, setBootstrapId] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/register", { username, password });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to create account.");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const ts = new Date().toISOString();
      setCreatedUsername(data.user.username);
      setAccountTimestamp(ts);
      queryClient.setQueryData(["/api/auth/status"], { bootstrapped: true, user: data.user });
      setStep(2);
    },
    onError: (err: any) => {
      setAccountError(err.message ?? "Failed to create account.");
    },
  });

  const probeMutation = useMutation({
    mutationFn: async () => {
      setProbePhase("probing");
      setProbeError("");
      const res = await apiRequest("POST", "/api/providers/probe", { provider, endpoint, apiKey: apiKey || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.ok) {
        setProbePhase("enter");
        setProbeError(data.error ?? `Could not reach ${endpoint} — is the service running?`);
        return;
      }
      setProbeModels(data.models ?? []);
      setSelectedModel(data.models?.[0]?.id ?? "");
      setProbePhase("select");
    },
    onError: (err: any) => {
      setProbePhase("enter");
      setProbeError(err.message ?? "Probe failed.");
    },
  });

  const saveConnectionMutation = useMutation({
    mutationFn: async () => {
      setProbePhase("saving");
      const res = await apiRequest("POST", "/api/connections", {
        name: PROVIDER_DEFAULTS[provider].label,
        provider,
        endpoint,
        apiKey: apiKey || "",
        defaultModel: selectedModel,
        isDefault: true,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to save connection.");
      }
      return res.json();
    },
    onSuccess: () => {
      const ts = new Date().toISOString();
      setConfirmedAI({ provider, endpoint, model: selectedModel, timestamp: ts });
      setProbePhase("done");
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setTimeout(() => setStep(3), 600);
    },
    onError: (err: any) => {
      setProbePhase("select");
      setProbeError(err.message ?? "Could not save connection.");
    },
  });

  const probeServiceMutation = useMutation({
    mutationFn: async ({ url, type }: { url: string; type: "whisper" | "searxng" }) => {
      const res = await apiRequest("POST", "/api/services/probe", { url, type });
      return { ...(await res.json()), type };
    },
    onSuccess: (data) => {
      if (data.type === "whisper") {
        setWhisperState(data.ok ? "ok" : "fail");
        if (!data.ok) setWhisperError(data.error ?? `Received HTTP ${data.httpStatus}`);
      } else {
        setSearxngState(data.ok ? "ok" : "fail");
        if (!data.ok) setSearxngError(data.error ?? `Received HTTP ${data.httpStatus}`);
      }
    },
    onError: (err: any) => {
      setWhisperState("fail");
      setWhisperError(err.message);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (steps: BootstrapStep[]) => {
      const res = await apiRequest("POST", "/api/bootstrap/complete", { steps });
      return res.json();
    },
    onSuccess: (data) => {
      setBootstrapId(data.bootstrap_id);
      setCompletedAt(data.completed_at);
      queryClient.invalidateQueries({ queryKey: ["/api/system/coherence"] });
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setEndpoint(PROVIDER_DEFAULTS[p].endpoint);
    setApiKey("");
    setProbePhase("enter");
    setProbeModels([]);
    setSelectedModel("");
    setProbeError("");
  }

  function handleContinueServices() {
    const ts = new Date().toISOString();
    setServicesTimestamp(ts);

    const steps: BootstrapStep[] = [
      {
        step: 1,
        component: "Database + Account",
        result: "OK",
        detail: `Account created: ${createdUsername}`,
        timestamp: accountTimestamp,
      },
      {
        step: 2,
        component: "AI Endpoint",
        result: confirmedAI ? "OK" : "SKIP",
        detail: confirmedAI
          ? `${confirmedAI.provider} @ ${confirmedAI.endpoint} — model: ${confirmedAI.model}`
          : "No connection registered",
        timestamp: confirmedAI?.timestamp ?? ts,
      },
      {
        step: 3,
        component: "Services",
        result: "OK",
        detail: [
          whisperState === "ok" ? `Whisper: ${whisperUrl}` : "Whisper: not configured",
          searxngState === "ok" ? `SearXNG: ${searxngUrl}` : "SearXNG: not configured",
        ].join(" · "),
        timestamp: ts,
      },
    ];

    completeMutation.mutate(steps);
    setStep(4);
  }

  function handleEnter() {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/status"] });
  }

  // ─── Guard: system is already healthy — show read-only summary ───────────
  if (authStatus?.bootstrapped && coherence?.overallStatus === "GREEN") {
    const username = authStatus.user?.username ?? "";
    const domains = [...new Set(coherence.items.map(i => i.domain))];
    return (
      <Screen>
        <div className="space-y-8 w-full max-w-lg" data-testid="panel-already-configured">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800/50"
                data-testid="badge-system-status"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                System healthy
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Creatrix is already configured</h1>
            <p className="text-muted-foreground leading-relaxed max-w-sm text-sm">
              Your system passed all coherence checks. The setup wizard is read-only — no changes
              can be made from here.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="panel-coherence-summary">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                Runtime coherence · GREEN
              </span>
            </div>
            <div className="px-4 py-3 space-y-3">
              {domains.map(domain => {
                const items = coherence.items.filter(i => i.domain === domain);
                return (
                  <div key={domain}>
                    <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">{domain}</p>
                    {items.map(item => (
                      <div key={item.component} className="flex items-center gap-2 text-sm py-0.5" data-testid={`coherence-item-${item.component}`}>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="text-foreground/80">{item.component}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {username && (
              <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Signed in as</span>
                <span className="text-xs font-medium" data-testid="text-signed-in-user">{username}</span>
              </div>
            )}
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={() => setLocation("/")}
            data-testid="button-return-to-app"
          >
            <Home className="h-4 w-4 mr-2" />
            Return to app
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            To change your AI connections or services, use the{" "}
            <button
              className="underline underline-offset-2 hover:text-foreground transition-colors"
              onClick={() => setLocation("/settings")}
              data-testid="link-settings"
            >
              Settings
            </button>{" "}
            page.
          </p>
        </div>
      </Screen>
    );
  }

  // ─── Waiting for coherence check (bootstrapped but coherence not yet loaded) ─
  if (authStatus?.bootstrapped && !coherence) {
    return (
      <Screen>
        <div className="flex items-center gap-3 text-muted-foreground" data-testid="panel-coherence-loading">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Checking system status…</span>
        </div>
      </Screen>
    );
  }

  // ─── Bootstrapped but system is not GREEN — show targeted repair view ──────
  if (authStatus?.bootstrapped && coherence && coherence.overallStatus !== "GREEN") {
    const degradedItems = coherence.items.filter(i => i.actual !== "coherent");
    const isRed = coherence.overallStatus === "RED";
    const statusColor = isRed ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400";
    const borderColor = isRed ? "border-red-900/40 bg-red-950/20" : "border-amber-900/30 bg-amber-950/20";

    const buildReport = () => {
      const lines: string[] = [`=== System Repair Report (${coherence.overallStatus}) ===`, ""];
      degradedItems.forEach(item => {
        lines.push(`[${item.domain}] ${item.component}`);
        lines.push(`✗ ${item.message}`);
        if (item.action) lines.push(`Fix: ${item.action}`);
        if (item.firstLook) lines.push(`First look: ${item.firstLook}`);
        lines.push("");
      });
      return lines.join("\n").trimEnd();
    };

    return (
      <Screen>
        <div className="space-y-6 max-w-md">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Wrench className={`h-5 w-5 ${statusColor}`} />
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                System repair
              </p>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Something needs attention
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your system was commissioned, but {degradedItems.length === 1 ? "one component has" : "some components have"} degraded since then.
              Review the items below and follow the recommended steps to restore full coherence.
            </p>
          </div>

          <div className={`border rounded-md divide-y divide-border/30 overflow-hidden font-mono text-xs ${borderColor}`} data-testid="panel-repair-list">
            {degradedItems.map((item, idx) => (
              <div key={idx} className="px-4 py-3 space-y-1.5" data-testid={`repair-item-${item.component}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {item.domain}
                </div>
                <div className="flex items-center gap-2">
                  <span className={statusColor}>✗</span>
                  <span className="font-semibold text-foreground">{item.component}</span>
                </div>
                <p className="text-foreground/70 pl-4">{item.message}</p>
                {item.action && (
                  <div className="pl-4 space-y-0.5">
                    <p className="text-muted-foreground">Fix:</p>
                    <div className="flex items-start gap-1.5">
                      <p className="text-foreground/90 whitespace-pre-wrap flex-1">
                        <span className="font-medium text-foreground/60">{item.component}: </span>{item.action}
                      </p>
                      <CopyButton text={item.action} />
                    </div>
                  </div>
                )}
                {item.firstLook && (
                  <div className="pl-4 space-y-0.5">
                    <p className="text-muted-foreground">First place to look:</p>
                    <div className="flex items-start gap-1.5">
                      <p className="text-foreground/80 whitespace-pre-wrap flex-1">
                        <span className="font-medium text-foreground/60">{item.component}: </span>{item.firstLook}
                      </p>
                      <CopyButton text={item.firstLook} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <CopyReportButton buildReport={buildReport} />

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { window.location.href = "/"; }}
              className="gap-2 text-muted-foreground hover:text-foreground"
              data-testid="button-repair-return-to-app"
            >
              <Home className="h-4 w-4" />
              Return to app
            </Button>
            <p className="text-xs text-muted-foreground font-mono">
              Status: <span className={statusColor}>{coherence.overallStatus}</span>
            </p>
          </div>

          <p className="text-xs text-muted-foreground font-mono text-center" data-testid="text-repair-countdown">
            Checking again in {repairCountdown}s…
          </p>
        </div>
      </Screen>
    );
  }

  // ─── Step 0: Welcome ──────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <Screen>
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              One-time setup
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Welcome to Creatrix</h1>
            <p className="text-muted-foreground leading-relaxed max-w-sm">
              This sequence constructs and validates your system — account, AI connection, and
              services — and seals a permanent record when complete. You will never see it again.
            </p>
          </div>
          <Button size="lg" onClick={() => setStep(1)} data-testid="button-start-setup">
            Begin <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </Screen>
    );
  }

  // ─── Step 1: Account ──────────────────────────────────────────────────────

  if (step === 1) {
    const passwordMismatch = confirmPassword && password !== confirmPassword;
    const canSubmit =
      username.trim().length >= 2 &&
      password.length >= 6 &&
      password === confirmPassword &&
      !registerMutation.isPending;

    return (
      <Screen progress={<StepIndicator current={0} />}>
        <div className="space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-mono text-muted-foreground">Step 1 of 3 — Database + Account</p>
            <h2 className="text-xl font-semibold">Create your account</h2>
            <p className="text-sm text-muted-foreground">
              Creating this account proves the database is writable and starts your session record.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAccountError("");
              registerMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your name"
                data-testid="input-setup-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="minimum 6 characters"
                data-testid="input-setup-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={passwordMismatch ? "border-destructive" : ""}
                data-testid="input-setup-confirm"
              />
              {passwordMismatch && (
                <p className="text-xs text-destructive">Passwords don't match.</p>
              )}
            </div>

            {accountError && (
              <p className="text-sm text-destructive" data-testid="text-account-error">
                {accountError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit}
              data-testid="button-create-account"
            >
              {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create account
            </Button>
          </form>
        </div>
      </Screen>
    );
  }

  // ─── Step 2: AI connection (probe-first) ──────────────────────────────────

  if (step === 2) {
    const needsKey = provider === "openai" || provider === "custom";
    const canProbe = endpoint.trim().length > 0 && (!needsKey || apiKey.trim().length > 0);

    return (
      <Screen progress={<StepIndicator current={1} skipped={autoSkippedAccount ? [0] : []} />}>
        <div className="space-y-6">
          {autoSkippedAccount && skippedBannerVisible && (
            <div
              className="flex items-start gap-2.5 rounded-md border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300"
              data-testid="banner-skipped-account"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">
                You're already signed in as <span className="font-semibold">{createdUsername}</span> — account setup was skipped.
              </span>
              <button
                type="button"
                onClick={() => setSkippedBannerVisible(false)}
                className="shrink-0 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 p-0.5 transition-colors"
                aria-label="Dismiss"
                data-testid="button-dismiss-skipped-banner"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-mono text-muted-foreground">Step 2 of 3 — AI Endpoint</p>
            <h2 className="text-xl font-semibold">Connect your AI</h2>
            <p className="text-sm text-muted-foreground">
              The endpoint will be probed live. You will pick from the models that respond —
              no guessing required.
            </p>
          </div>

          {/* Provider tabs */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PROVIDER_DEFAULTS) as Provider[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                disabled={probePhase === "probing" || probePhase === "saving"}
                data-testid={`button-provider-${p}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 ${
                  provider === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-accent"
                }`}
              >
                {PROVIDER_DEFAULTS[p].label}
              </button>
            ))}
          </div>

          {/* Endpoint + key inputs */}
          {probePhase === "enter" || probePhase === "probing" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="endpoint">Endpoint URL</Label>
                <Input
                  id="endpoint"
                  value={endpoint}
                  onChange={(e) => { setEndpoint(e.target.value); setProbeError(""); }}
                  placeholder="http://localhost:11434"
                  disabled={probePhase === "probing"}
                  data-testid="input-setup-endpoint"
                />
              </div>
              {needsKey && (
                <div className="space-y-2">
                  <Label htmlFor="apikey">API key</Label>
                  <Input
                    id="apikey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    disabled={probePhase === "probing"}
                    data-testid="input-setup-apikey"
                  />
                </div>
              )}
              {probeError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-sm text-destructive" data-testid="text-probe-error">
                    {probeError}
                  </p>
                </div>
              )}
              <Button
                onClick={() => probeMutation.mutate()}
                disabled={!canProbe || probePhase === "probing"}
                className="w-full"
                data-testid="button-test-connection"
              >
                {probePhase === "probing" ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Probing endpoint…</>
                ) : (
                  <><Wifi className="h-4 w-4 mr-2" />Test Connection</>
                )}
              </Button>
            </div>
          ) : null}

          {/* Model selection after successful probe */}
          {(probePhase === "select" || probePhase === "saving" || probePhase === "done") && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {endpoint} is online — {probeModels.length} model{probeModels.length !== 1 ? "s" : ""} found
                </span>
              </div>

              {probeModels.length > 0 ? (
                <div className="space-y-2">
                  <Label>Select default model</Label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-border p-1">
                    {probeModels.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedModel(m.id)}
                        disabled={probePhase === "saving" || probePhase === "done"}
                        data-testid={`button-model-${m.id}`}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          selectedModel === m.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        }`}
                      >
                        <span className="font-medium">{m.name || m.id}</span>
                        {m.size && (
                          <span className="ml-2 text-xs opacity-70">{m.size}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="manual-model">Model name</Label>
                  <Input
                    id="manual-model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    placeholder="e.g. gpt-4o"
                    data-testid="input-manual-model"
                  />
                  <p className="text-xs text-muted-foreground">
                    Endpoint is reachable but returned no models. Enter the model name manually.
                  </p>
                </div>
              )}

              {probeError && (
                <p className="text-sm text-destructive">{probeError}</p>
              )}

              {probePhase === "done" ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Registered — moving to services…</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={() => saveConnectionMutation.mutate()}
                    disabled={!selectedModel.trim() || probePhase === "saving"}
                    className="flex-1"
                    data-testid="button-register-connection"
                  >
                    {probePhase === "saving" ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Registering…</>
                    ) : (
                      "Register & Continue"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setProbePhase("enter"); setProbeError(""); }}
                    disabled={probePhase === "saving"}
                    data-testid="button-back-to-enter"
                  >
                    Change
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Screen>
    );
  }

  // ─── Step 3: Services ──────────────────────────────────────────────────────

  if (step === 3) {
    return (
      <Screen progress={<StepIndicator current={2} skipped={autoSkippedAccount ? [0] : []} />}>
        <div className="space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-mono text-muted-foreground">Step 3 of 3 — Services</p>
            <h2 className="text-xl font-semibold">Register services</h2>
            <p className="text-sm text-muted-foreground">
              These are optional. Test what is running — anything confirmed here will be
              available in your workspace. Skip what isn't set up yet.
            </p>
          </div>

          <div className="space-y-3">
            <ServiceRow
              name="Whisper (speech-to-text)"
              type="whisper"
              url={whisperUrl}
              setUrl={setWhisperUrl}
              state={whisperState}
              error={whisperError}
              isProbing={probeServiceMutation.isPending}
              onProbe={() => {
                setWhisperState("probing");
                setWhisperError("");
                probeServiceMutation.mutate({ url: whisperUrl, type: "whisper" });
              }}
              onSkip={() => setWhisperState("skip")}
            />
            <ServiceRow
              name="SearXNG (web search)"
              type="searxng"
              url={searxngUrl}
              setUrl={setSearxngUrl}
              state={searxngState}
              error={searxngError}
              isProbing={probeServiceMutation.isPending}
              onProbe={() => {
                setSearxngState("probing");
                setSearxngError("");
                probeServiceMutation.mutate({ url: searxngUrl, type: "searxng" });
              }}
              onSkip={() => setSearxngState("skip")}
            />
          </div>

          <Button
            onClick={handleContinueServices}
            className="w-full"
            disabled={completeMutation.isPending}
            data-testid="button-services-continue"
          >
            {completeMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sealing record…</>
            ) : (
              <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>
            )}
          </Button>
        </div>
      </Screen>
    );
  }

  // ─── Step 4: Bootstrap Record ─────────────────────────────────────────────

  return (
    <Screen>
      <div className="space-y-6 w-full max-w-lg">
        {createdUsername && (
          <div className="space-y-1 pt-2">
            <p className="text-2xl font-light tracking-tight">
              Welcome to Creatrix, {createdUsername}.
            </p>
            <p className="text-sm text-muted-foreground">
              Initialization complete. Your workspace is ready.
            </p>
          </div>
        )}

        {/* Birth certificate */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                Bootstrap Record
              </span>
              {bootstrapId && (
                <span className="text-xs font-mono text-muted-foreground">
                  {bootstrapId.slice(0, 8)}
                </span>
              )}
            </div>
          </div>

          <div className="px-4 divide-y divide-border/0">
            <RecordRow
              icon={Database}
              component="Database + Account"
              result="OK"
              detail={`Account created: ${createdUsername}`}
              timestamp={accountTimestamp || new Date().toISOString()}
            />
            <RecordRow
              icon={Cpu}
              component="AI Endpoint"
              result={confirmedAI ? "OK" : "SKIP"}
              detail={
                confirmedAI
                  ? `${confirmedAI.provider} @ ${confirmedAI.endpoint} · ${confirmedAI.model}`
                  : "No connection registered"
              }
              timestamp={confirmedAI?.timestamp || servicesTimestamp || new Date().toISOString()}
            />
            <RecordRow
              icon={Wrench}
              component="Whisper"
              result={whisperState === "ok" ? "OK" : "SKIP"}
              detail={whisperState === "ok" ? whisperUrl : "Not configured"}
              timestamp={servicesTimestamp || new Date().toISOString()}
            />
            <RecordRow
              icon={Wrench}
              component="SearXNG"
              result={searxngState === "ok" ? "OK" : "SKIP"}
              detail={searxngState === "ok" ? searxngUrl : "Not configured"}
              timestamp={servicesTimestamp || new Date().toISOString()}
            />
          </div>

          {completedAt && (
            <div className="px-4 py-3 border-t border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  SYSTEM STATE: COMPLETE &amp; VALID
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {new Date(completedAt).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Bootstrap Metadata
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">Signed in as</span>
            <span className="font-medium">{createdUsername}</span>
            <span className="text-muted-foreground">Environment</span>
            <span className="font-medium">Local-First</span>
            <span className="text-muted-foreground">Scaffold inference</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">NONE</span>
            <span className="text-muted-foreground">Manual intervention</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">NONE</span>
            {bootstrapId && (
              <>
                <span className="text-muted-foreground">Bootstrap ID</span>
                <span className="font-mono">{bootstrapId.slice(0, 16)}…</span>
              </>
            )}
          </div>
        </div>

        <Button
          size="lg"
          onClick={handleEnter}
          className="w-full"
          data-testid="button-enter-creatrix"
        >
          <Shield className="h-4 w-4 mr-2" />
          Enter Creatrix
        </Button>
      </div>
    </Screen>
  );
}

function ServiceRow({
  name,
  type,
  url,
  setUrl,
  state,
  error,
  isProbing,
  onProbe,
  onSkip,
}: {
  name: string;
  type: "whisper" | "searxng";
  url: string;
  setUrl: (v: string) => void;
  state: ServiceState;
  error: string;
  isProbing: boolean;
  onProbe: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{name}</p>
        {state === "ok" && <StatusBadge ok={true} label="confirmed" />}
        {state === "fail" && <StatusBadge ok={false} label="unreachable" />}
        {state === "skip" && <span className="text-xs text-muted-foreground">skipped</span>}
      </div>
      {state !== "skip" && (
        <>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={state === "ok" || isProbing}
            placeholder={type === "whisper" ? "http://localhost:9000" : "http://localhost:8080"}
            data-testid={`input-${type}-url`}
            className="text-sm"
          />
          {error && state === "fail" && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {state !== "ok" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onProbe}
                disabled={!url.trim() || isProbing}
                data-testid={`button-probe-${type}`}
              >
                {isProbing ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Wifi className="h-3 w-3 mr-1" />
                )}
                Test
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onSkip}
                className="text-muted-foreground"
                data-testid={`button-skip-${type}`}
              >
                Skip
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Screen({
  children,
  progress,
}: {
  children: React.ReactNode;
  progress?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-8">
        {progress && <div>{progress}</div>}
        {children}
      </div>
    </div>
  );
}
