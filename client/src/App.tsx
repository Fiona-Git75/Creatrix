import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Chat from "@/pages/Chat";
import Setup from "@/pages/Setup";
import Login from "@/pages/Login";

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function Router() {
  const { bootstrapped, user, isLoading } = useAuth();

  // Coherence engine is the single authority on readiness.
  // Only run once the user is authenticated — there's nothing to measure before that.
  // staleTime: Infinity keeps this as a startup gate rather than a continuous poll;
  // SetupPostBootstrap owns the ongoing 30-second poll while repair is in progress,
  // and its cache writes propagate here automatically via the shared queryKey.
  const { data: coherence, isLoading: coherenceLoading } = useQuery<{
    overallStatus: "GREEN" | "AMBER" | "RED";
  }>({
    queryKey: ["/api/system/coherence"],
    enabled: bootstrapped && !!user,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (isLoading) return <Spinner />;
  if (!bootstrapped) return <Setup />;
  if (!user) return <Login />;
  if (coherenceLoading) return <Spinner />;

  // GREEN → Chat. RED / AMBER → Setup, which delegates to SetupPostBootstrap.
  // SetupPostBootstrap decides whether to show the commissioning prompt or the
  // repair panel based on what the coherence report actually contains.
  // If the coherence fetch failed entirely (coherence === undefined), fall through
  // to Chat — users should not be locked out by a transient endpoint failure.
  if (coherence?.overallStatus !== "GREEN") return <Setup />;

  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route path="/setup" component={Setup} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
