import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
    const id = setInterval(() => {
      setRepairCountdown(Math.max(0, Math.round((repairCountdownTarget - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
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

  return (
    <RepairPanel
      coherence={{ ...coherence, overallStatus: coherence.overallStatus as "AMBER" | "RED" }}
      coherenceIsFetching={coherenceIsFetching}
      repairCountdown={repairCountdown}
      onRecheck={() => queryClient.invalidateQueries({ queryKey: ["/api/system/coherence"] })}
    />
  );
}
