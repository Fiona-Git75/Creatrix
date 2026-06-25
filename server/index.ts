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
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
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
      // Warm the provider cache once at startup so the UI has real state on first load
      import("./providers/discovery").then(({ getProvidersStatus }) => {
        getProvidersStatus(true).then(s => {
          log(`Discovery: ${s.providers.length} connection(s) scanned, ${s.providers.filter(p => p.status === "online").length} online`);
        }).catch(e => console.error("[discovery] startup scan failed:", e));
      });

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
