import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const PgStore = connectPgSimple(session);
app.use(session({
  store: process.env.DATABASE_URL
    ? new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      })
    : undefined,
  secret: process.env.SESSION_SECRET ?? "creatrix-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (!path.startsWith("/api")) return;

    const status = res.statusCode;
    const isGet  = req.method === "GET";
    const isErr  = status >= 400;
    const isSlow = duration > 1000;

    // GETs that succeed quickly are background polling — not worth surfacing.
    // Log: all mutations, all errors, slow GETs (anomalies).
    if (isGet && !isErr && !isSlow) return;

    let logLine = `${req.method} ${path} ${status} in ${duration}ms`;
    if (capturedJsonResponse && isErr) {
      // Errors: include the message/error field only — not the full response body.
      const msg = capturedJsonResponse.message ?? capturedJsonResponse.error ?? null;
      if (msg) logLine += ` — ${String(msg).slice(0, 120)}`;
    }
    log(logLine);
  });

  next();
});

(async () => {
  try {
    const port = parseInt(process.env.PORT || "5000", 10);

    if (process.env.NODE_ENV !== "production") {
      // Add the health-check placeholder BEFORE the port opens.
      // Replit checks GET / for HTTP 200 as soon as it detects port 5000 open.
      // This responds 200 instantly; once Vite is ready it takes over naturally.
      let appReady = false;
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (!appReady && req.path === "/") {
          res.status(200).set("Content-Type", "text/html").send(
            "<!DOCTYPE html><html><head><title>Loading…</title></head><body></body></html>"
          );
        } else {
          next();
        }
      });

      // Open port immediately — Replit sees it open AND gets 200 on GET /
      await new Promise<void>((resolve) => {
        httpServer.listen(port, "0.0.0.0", () => {
          log(`Server listening on port ${port}`);
          resolve();
        });
      });

      // Now do the slower work (DB init, route registration, Vite setup)
      log("Initializing storage…");
      await storage.initialize?.();
      log("Storage ready");
      log("Initializing routes…");
      await registerRoutes(httpServer, app);
      log("Routes registered");
      // ── Morning Roll Call ─────────────────────────────────────────────────────
      // Probes services and Ollama in parallel, then prints a coordinated
      // ecological status block — before the browser is open.
      Promise.all([
        import("./runtime/service-runtime"),
        import("./providers/discovery"),
      ]).then(async ([
        { probeAll, startBackgroundProbes, getAllServiceStates },
        { getProvidersStatus },
      ]) => {
        try {
          const s = await storage.getSettings();

          // Both probes run concurrently — neither waits for the other.
          const [, providerScan] = await Promise.all([
            probeAll({
              postgres: process.env.DATABASE_URL ?? null,
              searxng:  (s as any).searchEndpoint ?? null,
              whisper:  (s as any).whisperEndpoint ?? null,
            }),
            getProvidersStatus(true),
          ]);

          // ── Compose roll call ───────────────────────────────────────────────
          const onlineProviders  = providerScan.providers.filter(p => p.status === "online");
          const offlineProviders = providerScan.providers.filter(p => p.status === "offline");
          const serviceStates    = Object.values(getAllServiceStates());

          // Functional readiness descriptions — ecological language, not HTTP codes.
          const readyDesc: Record<string, string> = {
            postgres: "Database accessible. Read/write confirmed.",
            searxng:  "Search endpoint responding. Web search verified.",
            whisper:  "Server responding. Audio transcription ready.",
          };
          const absentDesc: Record<string, string> = {
            postgres: "Database not configured.",
            searxng:  "Web search endpoint not configured.",
            whisper:  "Audio transcription not configured.",
          };

          const SEP = "─".repeat(44);
          const PAD = 14;
          const IND = " ".repeat(PAD + 5);
          const out: string[] = [];

          out.push("");
          out.push(SEP);
          out.push("  Creatrix  ·  Morning Roll Call");
          out.push(SEP);
          out.push("");

          for (const svc of serviceStates) {
            const nm = svc.name.padEnd(PAD);
            if (svc.ready) {
              const whisperModel = svc.key === "whisper"
                ? svc.detail.match(/model (.+?) loaded/)?.[1] : null;
              const desc = whisperModel
                ? `Model ${whisperModel} loaded. Audio transcription ready.`
                : (readyDesc[svc.key] ?? svc.detail);
              out.push(`  ${nm} ✓  Present. ${desc}`);
            } else if (svc.status === "not_configured") {
              out.push(`  ${nm} –  Absent. ${absentDesc[svc.key] ?? svc.detail}`);
              if (svc.action) {
                const hint = svc.action.split("\n")[0].replace(/:$/, "");
                out.push(`  ${IND}→ ${hint}`);
              }
            } else if (svc.status === "degraded") {
              const stripped = svc.detail.replace(/^GET \/\S+: /, "").replace(/HTTP \d+ — /, "");
              out.push(`  ${nm} ⚠  Present, not ready. ${stripped}`);
              if (svc.action) {
                const hint = svc.action.split("\n")[0].replace(/:$/, "");
                out.push(`  ${IND}→ ${hint}`);
              }
            } else {
              out.push(`  ${nm} ✗  Absent. ${svc.detail}`);
              if (svc.action) {
                const hint = svc.action.split("\n")[0].replace(/:$/, "");
                out.push(`  ${IND}→ ${hint}`);
              }
            }
          }

          // Ollama — sourced from provider discovery, not the service probe system.
          const ollamaNm = "Ollama".padEnd(PAD);
          if (onlineProviders.length > 0) {
            const totalModels = onlineProviders.reduce((n, p) => n + p.models.length, 0);
            out.push(`  ${ollamaNm} ✓  Present. ${totalModels} model${totalModels !== 1 ? "s" : ""} available. Ready for inference.`);
          } else if (providerScan.providers.length === 0) {
            out.push(`  ${ollamaNm} –  Absent. No inference connection configured.`);
            out.push(`  ${IND}→ Settings → Connections`);
          } else {
            out.push(`  ${ollamaNm} ✗  Absent. ${offlineProviders.map(p => p.name).join(", ")} unreachable.`);
            out.push(`  ${IND}→ Run: ollama serve`);
          }

          // Ecological summary
          const readyCount  = serviceStates.filter(sv => sv.ready).length + (onlineProviders.length > 0 ? 1 : 0);
          const totalCount  = serviceStates.length + 1;
          const absentCount = totalCount - readyCount;

          out.push("");
          out.push(SEP);
          out.push(absentCount === 0
            ? `  Participants: ${readyCount}/${totalCount}  ·  All present.  ·  Welcome home.`
            : `  Participants: ${readyCount}/${totalCount}  ·  ${absentCount} participant${absentCount !== 1 ? "s" : ""} absent or not ready.`);
          out.push(SEP);
          out.push("");

          for (const line of out) console.log(line);

          // ── Background probes ───────────────────────────────────────────────
          startBackgroundProbes(async () => {
            const settings = await storage.getSettings();
            return {
              postgres: process.env.DATABASE_URL ?? null,
              searxng:  (settings as any).searchEndpoint  ?? null,
              whisper:  (settings as any).whisperEndpoint ?? null,
            };
          });

          // ── Coherence check + syslog ────────────────────────────────────────
          try {
            const [{ loadManifest }, { measureCoherence }, { syslog }] = await Promise.all([
              import("./runtime/manifest"),
              import("./runtime/coherence"),
              import("./syslog"),
            ]);

            if (providerScan.providers.length === 0) {
              syslog("warn", "connection", "No connections configured — inference unavailable. Add one in Settings → Connections.");
            } else if (onlineProviders.length === 0) {
              syslog("warn", "connection",
                `No connection established — ${offlineProviders.map(p => p.name).join(", ")} ${offlineProviders.length === 1 ? "is" : "are"} unreachable. Inference unavailable.`);
            } else {
              for (const p of offlineProviders) {
                syslog("warn", "connection", `${p.name} not reachable at startup — inference on this connection unavailable.`);
              }
            }

            const manifest = await loadManifest();
            if (!manifest.bootstrapped) return;
            syslog("info", "system",
              `Manifest loaded — commissioned by ${manifest.bootstrappedBy} on ${manifest.bootstrappedAt?.slice(0, 10) ?? "unknown"}`);
            const report = await measureCoherence(manifest);
            for (const item of report.items) {
              const level = item.actual === "coherent" ? "info" : item.actual === "degraded" ? "warn" : "error";
              const icon  = item.actual === "coherent" ? "✓" : "⚠";
              syslog(level, "system", `${icon} ${item.component} — ${item.message}`,
                item.action ? `action: ${item.action}` : undefined);
            }
            const n = report.items.filter(i => i.actual === "coherent").length;
            syslog(report.coherent ? "info" : "warn", "system",
              `Coherence: ${n}/${report.items.length} item${report.items.length !== 1 ? "s" : ""} coherent`);
          } catch (e) {
            console.error("[runtime] coherence check failed:", e);
          }

        } catch (e) {
          log(`Morning roll call failed — ${e}`);
        }
      }).catch(e => console.error("[roll-call] startup failed:", e));

      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        console.error("Express error:", err);
        res.status(status).json({ message });
      });

      log("Setting up Vite…");
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
      appReady = true;
      log("Ready");
    } else {
      log("Production mode — initializing storage…");
      await storage.initialize?.();
      log("Storage ready");
      log("Production mode — registering routes…");
      await registerRoutes(httpServer, app);
      log("Routes registered");

      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        console.error("Express error:", err);
        res.status(status).json({ message });
      });

      serveStatic(app);

      await new Promise<void>((resolve) => {
        httpServer.listen(port, "0.0.0.0", () => {
          log(`Server listening on port ${port}`);
          resolve();
        });
      });

      log("Ready");
    }
  } catch (error) {
    console.error("Fatal error during server startup:", error);
    process.exit(1);
  }
})();
