import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { GreenSummaryPanel } from "@/components/GreenSummaryPanel";
import { RepairPanel } from "@/components/RepairPanel";

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

export interface SetupPostBootstrapProps {
  authStatus: {
    bootstrapped: boolean;
    user?: { username?: string } | null;
  };
}

export function SetupPostBootstrap({ authStatus }: SetupPostBootstrapProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const commissionMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const res = await apiRequest("POST", "/api/bootstrap/complete", {
        steps: [
          {
            step: 1,
            component: "Database + Account",
            result: "OK",
            detail: `Account: ${authStatus.user?.username ?? "unknown"}`,
            timestamp: now,
          },
        ],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/coherence"] });
    },
  });

  const { data: coherence, isFetching: coherenceIsFetching } = useQuery<CoherenceReport>({
    queryKey: ["/api/system/coherence"],
    enabled: authStatus?.bootstrapped === true,
    refetchInterval: 30_000,
  });

  const inRepairView = authStatus?.bootstrapped && coherence && coherence.overallStatus !== "GREEN";

  const [repairCountdownTarget, setRepairCountdownTarget] = useState<number>(() => Date.now() + 30_000);
  const [repairCountdown, setRepairCountdown] = useState(30);

  useEffect(() => {
    if (inRepairView) setRepairCountdownTarget(Date.now() + 30_000);
  }, [coherence?.measuredAt]);

  useEffect(() => {
    if (!inRepairView) return;

    const tick = () => {
      setRepairCountdown(Math.max(0, Math.round((repairCountdownTarget - Date.now()) / 1000)));
    };

    const id = setInterval(tick, 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [inRepairView, repairCountdownTarget]);

  const wasInRepairView = useRef(false);
  if (authStatus?.bootstrapped && coherence && coherence.overallStatus !== "GREEN") {
    wasInRepairView.current = true;
  }

  useEffect(() => {
    if (wasInRepairView.current && coherence?.overallStatus === "GREEN") {
      setLocation("/");
    }
  }, [coherence?.overallStatus, setLocation]);

  if (!coherence) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground" data-testid="panel-coherence-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Checking system status…</span>
      </div>
    );
  }

  if (coherence.overallStatus === "GREEN") {
    return <GreenSummaryPanel authStatus={authStatus} coherence={coherence} />;
  }

  const neverCommissioned =
    coherence.items.length === 1 &&
    coherence.items[0].component === "Commissioned" &&
    coherence.items[0].actual === "absent";

  if (neverCommissioned) {
    return (
      <div className="space-y-6 max-w-md" data-testid="panel-commission-now">
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            One step remaining
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Complete commissioning</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your account and connections are set up, but the system has never been formally
            commissioned. Seal the bootstrap record now — this is a one-time action.
          </p>
        </div>

        {commissionMutation.isSuccess ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400" data-testid="text-commission-success">
            <CheckCircle2 className="h-4 w-4" />
            <span>Commissioned — verifying system state…</span>
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full"
            disabled={commissionMutation.isPending}
            onClick={() => commissionMutation.mutate()}
            data-testid="button-complete-commissioning"
          >
            {commissionMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sealing record…</>
            ) : (
              <><Shield className="h-4 w-4 mr-2" />Commission Creatrix</>
            )}
          </Button>
        )}

        {commissionMutation.isError && (
          <p className="text-sm text-destructive" data-testid="text-commission-error">
            {(commissionMutation.error as Error)?.message ?? "Failed to commission. Try again."}
          </p>
        )}
      </div>
    );
  }

  return (
    <RepairPanel
      coherence={{ ...coherence, overallStatus: coherence.overallStatus as "AMBER" | "RED" }}
      coherenceIsFetching={coherenceIsFetching}
      repairCountdown={repairCountdown}
      onRecheck={() => queryClient.invalidateQueries({ queryKey: ["/api/system/coherence"] })}
    />
  );
}
