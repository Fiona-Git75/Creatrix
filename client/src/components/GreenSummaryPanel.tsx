import { useLocation } from "wouter";
import { CheckCircle2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CoherenceItem {
  domain: string;
  component: string;
  actual: string;
  message: string;
  action?: string;
  firstLook?: string;
}

export interface GreenSummaryPanelProps {
  authStatus: {
    bootstrapped: boolean;
    user?: { username?: string } | null;
  };
  coherence: {
    coherent: boolean;
    overallStatus: "GREEN" | "AMBER" | "RED";
    items: CoherenceItem[];
    measuredAt: string;
  };
}

export function GreenSummaryPanel({ authStatus, coherence }: GreenSummaryPanelProps) {
  const [, setLocation] = useLocation();

  const username = authStatus.user?.username ?? "";
  const domains = Array.from(new Set(coherence.items.map(i => i.domain)));

  return (
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
  );
}
