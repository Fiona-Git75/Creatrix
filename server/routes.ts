import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { hashPassword, comparePasswords } from "./auth";
import { storage } from "./storage";
import { chatRequestSchema, type Message, type CapabilityName, type Source, insertConsultantSchema } from "@shared/schema";
import { createProvider } from "./providers";
import { randomUUID } from "crypto";
import { chunkText } from "./rag/chunking";
import { embedChunks } from "./rag/embeddings";
import { listCapabilities, invokeCapability, getCapability } from "./capabilities";
import { probeNotionConnected } from "./capabilities/notion";
import { CREATRIX_ORIENTATION } from "./orientation";
import { requestConfirmation, resolveConfirmation } from "./confirm";
import { getServiceState, getAllServiceStates } from "./runtime/service-runtime";
import { syslog, getLogs, clearLogs, setLogPersist } from "./syslog";
import { getProvidersStatus, startBackgroundRefresh, resolveModelToProvider, fetchModelProfile, scanConnection, scanConnectionLite } from "./providers/discovery";
import type { ToolSupport } from "./providers/discovery";
import type { ToolDefinition, MultimodalMessage } from "./providers/index";
import fs from "fs/promises";
import path from "path";

const SERVER_START = Date.now();

function makeSource(
  toolName: CapabilityName,
  toolArgs: Record<string, unknown>,
  result: unknown,
  rootFolder?: string
): Source | null {
  const r = result as Record<string, unknown> | null;
  switch (toolName) {
    case "read_file":
    case "write_file":
    case "append_file":
    case "create_note":
    case "ocr_image":
    case "analyze_image":
    case "transcribe_audio": {
      const fullPath = String((r?.path ?? toolArgs.path) || "");
      if (!fullPath) return null;
      const resolved = rootFolder ? path.resolve(rootFolder) : null;
      const label = resolved && fullPath.startsWith(resolved)
        ? fullPath.slice(resolved.length).replace(/^[\\/]/, "")
        : path.basename(fullPath);
      return { type: "file", label, detail: fullPath };
    }
    case "retrieve_url": {
      const url = String(toolArgs.url || "");
      if (!url) return null;
      let label = url;
      try { label = new URL(url).hostname; } catch { label = url.slice(0, 40); }
      return { type: "url", label, detail: url };
    }
    case "get_youtube_transcript": {
      const url = String(toolArgs.url || "");
      if (!url) return null;
      return { type: "youtube", label: "YouTube", detail: url };
    }
    case "web_search": {
      const q = String(toolArgs.query || "");
      return q ? { type: "web", label: q.slice(0, 48) } : null;
    }
    case "notion_search":
    case "notion_get_page":
    case "notion_query_database": {
      const label = String(toolArgs.query || toolArgs.pageId || toolArgs.databaseId || "Notion");
      return { type: "notion", label: label.slice(0, 48) };
    }
    default:
      return null;
  }
}

function humanizeError(msg: string): string {
  if (msg.includes("ECONNREFUSED")) return "Lost contact with the AI. Is it still running?";
  if (msg.includes("ENOTFOUND")) return "Couldn't reach the AI at this address.";
  if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) return "The AI took too long to respond. Try again.";
  if (msg.includes("aborted") || msg.includes("abort")) return "The request was cancelled.";
  if (msg.includes("fetch failed")) return "Lost contact with the AI. Is it still running?";
  return msg;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── Auth ─────────────────────────────────────────────────────────────────

  app.get("/api/auth/status", async (req: Request, res: Response) => {
    const allUsers = await storage.listUsers();
    const bootstrapped = allUsers.length > 0;
    const user = req.session.userId
      ? await storage.getUser(req.session.userId)
      : undefined;
    res.json({
      bootstrapped,
      user: user ? { id: user.id, username: user.username } : null,
    });
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.listUsers();
      if (allUsers.length > 0) {
        return res.status(403).json({ error: "System already bootstrapped. Use /api/auth/login." });
      }
      const { username, password } = req.body;
      if (!username?.trim() || !password) {
        return res.status(400).json({ error: "Username and password are required." });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      const existing = await storage.getUserByUsername(username.trim());
      if (existing) {
        return res.status(409).json({ error: "Username already taken." });
      }
      const hashed = await hashPassword(password);
      const user = await storage.createUser({ username: username.trim(), password: hashed });
      req.session.userId = user.id;
      syslog("info", "bootstrap", `Step 1 — Account registered: ${user.username}`, JSON.stringify({ userId: user.id, at: new Date().toISOString() }));
      return res.status(201).json({ user: { id: user.id, username: user.username } });
    } catch (err: any) {
      console.error("[auth] register error:", err);
      return res.status(500).json({ error: "Registration failed." });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password, remember } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return res.status(401).json({ error: "Incorrect username or password." });
      }
      req.session.userId = user.id;
      if (!remember) {
        req.session.cookie.expires = undefined;
        req.session.cookie.maxAge = undefined as any;
      }
      syslog("info", "system", `Session started: ${user.username}`, JSON.stringify({ userId: user.id }));
      return res.json({ user: { id: user.id, username: user.username } });
    } catch (err: any) {
      console.error("[auth] login error:", err);
      return res.status(500).json({ error: "Login failed." });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    syslog("info", "system", "Session ended", JSON.stringify({ userId: req.session.userId }));
    req.session.destroy(() => {});
    res.json({ ok: true });
  });

  // ─── System ───────────────────────────────────────────────────────────────

  // Wire log persistence to DB and prune entries older than 7 days
  setLogPersist((entry) => { storage.addSystemLog(entry).catch(() => {}); });
  storage.pruneSystemLogs(7).catch(() => {});
  syslog("info", "system", "Server started");
  startBackgroundRefresh();

  // Enable pgvector and create chunk_embeddings table (no-op if already exists or pgvector not installed)
  storage.initVectorStore?.().catch(() => {});

  // === Connections ===
  app.get("/api/connections", async (_req: Request, res: Response) => {
    try {
      const connections = await storage.getConnections();
      res.json(connections);
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ error: "Failed to fetch connections" });
    }
  });

  app.post("/api/connections", async (req: Request, res: Response) => {
    try {
      console.log("Creating connection with data:", JSON.stringify(req.body));
      const existingConns = await storage.getConnections();
      const connection = await storage.createConnection(req.body);
      if (existingConns.length === 0) {
        syslog("info", "bootstrap", `Step 2 — AI endpoint registered: ${connection.provider} @ ${connection.endpoint}`, JSON.stringify({ connectionId: connection.id, model: connection.defaultModel, at: new Date().toISOString() }));
      }
      res.status(201).json(connection);
    } catch (error: any) {
      console.error("Error creating connection:", error?.message || error, error?.stack);
      res.status(500).json({ error: "Failed to create connection", details: error?.message });
    }
  });

  app.patch("/api/connections/:id", async (req: Request, res: Response) => {
    try {
      const connection = await storage.updateConnection(req.params.id, req.body);
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }
      res.json(connection);
    } catch (error) {
      console.error("Error updating connection:", error);
      res.status(500).json({ error: "Failed to update connection" });
    }
  });

  app.get("/api/connections/:id/usage", async (req: Request, res: Response) => {
    try {
      const count = await storage.countConversationsByConnection(req.params.id);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching connection usage:", error);
      res.status(500).json({ error: "Failed to fetch connection usage" });
    }
  });

  app.delete("/api/connections/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteConnection(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Connection not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting connection:", error);
      res.status(500).json({ error: "Failed to delete connection" });
    }
  });

  app.post("/api/connections/reorder", async (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds must be an array" });
      }
      await storage.reorderConnections(orderedIds);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error reordering connections:", error);
      res.status(500).json({ error: "Failed to reorder connections" });
    }
  });

  app.get("/api/connections/:id/models", async (req: Request, res: Response) => {
    try {
      const connection = await storage.getConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }
      const provider = createProvider(connection);
      const result = await provider.listModelsWithStatus();
      res.json(result);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ status: "error", message: "Failed to fetch models", models: [] });
    }
  });

  app.get("/api/connections/:id/health", async (req: Request, res: Response) => {
    try {
      const connection = await storage.getConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }
      const provider = createProvider(connection);
      let healthy = false;
      let reason: string | null = null;
      try {
        healthy = await provider.healthCheck();
        if (!healthy) reason = "Not responding at this address";
      } catch (err: any) {
        const m = err?.message || "";
        reason = m.includes("ECONNREFUSED") ? "Nothing is running at this address" :
                 m.includes("ENOTFOUND") ? "Address not found" :
                 m.includes("ETIMEDOUT") || m.includes("timed out") ? "Connection timed out" :
                 "Not responding";
      }
      syslog(healthy ? "info" : "warn", "connection", `Health check: ${connection.name}`, healthy ? "healthy" : reason || "offline");
      res.json({ healthy, reason });
    } catch (error: any) {
      syslog("error", "connection", "Health check failed", error?.message);
      res.json({ healthy: false, reason: "Health check failed" });
    }
  });

  // Discover local providers by probing well-known ports
  app.get("/api/discover", async (_req: Request, res: Response) => {
    const discovered: Array<{ name: string; provider: string; endpoint: string; models: string[] }> = [];

    const probe = async (url: string, parseModels: (data: any) => string[]): Promise<string[]> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return [];
        return parseModels(await resp.json());
      } catch {
        clearTimeout(timeout);
        return [];
      }
    };

    const ollamaModels = await probe(
      "http://localhost:11434/api/tags",
      (d) => (d.models || []).map((m: any) => m.name || m.id).filter(Boolean)
    );
    if (ollamaModels !== null) {
      discovered.push({ name: "Ollama", provider: "ollama", endpoint: "http://localhost:11434", models: ollamaModels });
    }

    const lmModels = await probe(
      "http://localhost:1234/v1/models",
      (d) => (d.data || []).map((m: any) => m.id).filter(Boolean)
    );
    if (lmModels.length > 0) {
      discovered.push({ name: "LM Studio", provider: "lmstudio", endpoint: "http://localhost:1234/v1", models: lmModels });
    }

    res.json({ providers: discovered });
  });

  // Unified provider status — all configured connections scanned live, plus auto-discovered local providers
  app.get("/api/providers/status", async (_req: Request, res: Response) => {
    try {
      const status = await getProvidersStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Provenance ────────────────────────────────────────────────────────────
  // canonical:   server/routes.ts → POST /api/providers/probe
  // derives:     server/providers/discovery.ts → scanConnection()
  // contract:    read-only validation — never persists; result is ephemeral
  // bootstrap:   Step 2 precondition — must return ok:true before POST /api/connections
  // overrides:   none
  // consumed-by: client/src/pages/Setup.tsx → probeMutation
  app.post("/api/providers/probe", async (req: Request, res: Response) => {
    try {
      const { provider, endpoint, apiKey } = req.body;
      if (!provider || !endpoint) {
        return res.status(400).json({ ok: false, error: "provider and endpoint are required" });
      }
      const tempConn = {
        id: "probe",
        name: "probe",
        provider,
        endpoint,
        apiKey: apiKey || null,
        defaultModel: "",
        isDefault: false,
        settings: null,
      } as any;
      const result = await scanConnectionLite(tempConn);
      return res.json({
        ok: result.status === "online",
        status: result.status,
        models: result.models,
      });
    } catch (err: any) {
      return res.json({ ok: false, error: err.message || "Probe failed" });
    }
  });

  // ── Provenance ────────────────────────────────────────────────────────────
  // canonical:   server/routes.ts → POST /api/services/probe
  // contract:    read-only reachability check — no side effects
  // bootstrap:   Step 3 — Whisper and SearXNG validation; result informs record only
  // overrides:   none
  // consumed-by: client/src/pages/Setup.tsx → probeServiceMutation
  app.post("/api/services/probe", async (req: Request, res: Response) => {
    const { url, type } = req.body;
    if (!url) return res.status(400).json({ ok: false, error: "url required" });
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    try {
      const checkUrl = type === "whisper"
        ? `${url.replace(/\/$/, "")}/health`
        : url;
      const r = await fetch(checkUrl, { signal: controller.signal });
      clearTimeout(t);
      res.json({ ok: r.ok || r.status < 500, httpStatus: r.status });
    } catch (err: any) {
      clearTimeout(t);
      res.json({ ok: false, error: err.message || "Unreachable" });
    }
  });

  // ── Provenance ────────────────────────────────────────────────────────────
  // canonical:   server/routes.ts → POST /api/bootstrap/complete
  // derives:     server/syslog.ts → syslog("bootstrap", ...)
  // contract:    seals the birth certificate — one permanent log entry per call.
  //              Duplicate calls are intentionally visible (not idempotent by design):
  //              if this appears twice in system_logs, something ran bootstrap twice.
  // overrides:   none
  // consumed-by: client/src/pages/Setup.tsx → completeMutation (Step 4, "Enter Creatrix")
  app.post("/api/bootstrap/complete", async (req: Request, res: Response) => {
    const { steps } = req.body;
    const bootstrap_id = randomUUID();
    const completed_at = new Date().toISOString();
    const detail = JSON.stringify({ bootstrap_id, completed_at, steps: steps || [] });
    syslog("info", "bootstrap", `BOOTSTRAP COMPLETE — Creatrix is operational [${bootstrap_id.slice(0, 8)}]`, detail);
    return res.json({ bootstrap_id, completed_at, ok: true });
  });

  // Force-refresh the providers cache
  app.post("/api/providers/refresh", async (_req: Request, res: Response) => {
    try {
      const status = await getProvidersStatus(true);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Model profile — tool support classification + metadata for a specific model
  app.get("/api/providers/:connectionId/models/:modelId/profile", async (req: Request, res: Response) => {
    try {
      const { connectionId, modelId } = req.params;
      const connections = await storage.getConnections();
      const connection = connections.find(c => c.id === connectionId);
      if (!connection) return res.status(404).json({ error: "Connection not found" });
      const profile = await fetchModelProfile(connection, decodeURIComponent(modelId));
      res.json({ modelId, connectionId, ...profile });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // System status — uses discovery pipeline, preserves backward-compat shape for EmptyState
  app.get("/api/status", async (_req: Request, res: Response) => {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const settings = await storage.getSettings();

    const providerStatus = await getProvidersStatus();
    const onlineProviders = providerStatus.providers.filter(p => p.status === "online");
    const allModels = onlineProviders.flatMap(p => p.models.map(m => m.id));
    const firstOnline = onlineProviders[0];

    const localAI = firstOnline
      ? { found: true, name: firstOnline.name, models: allModels }
      : providerStatus.suggested.length > 0
      ? { found: true, name: providerStatus.suggested[0].name, models: providerStatus.suggested[0].models }
      : { found: false, name: null, models: [] };

    let libraryAvailable = false;
    if (settings.rootFolder) {
      try { await fs.access(settings.rootFolder); libraryAvailable = true; } catch {}
    }

    res.json({ greeting, localAI, library: { available: libraryAvailable }, connectionsCount: providerStatus.providers.length });
  });

  // Pull/download a model (Ollama only)
  app.post("/api/connections/:id/models/pull", async (req: Request, res: Response) => {
    try {
      const connection = await storage.getConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }
      
      if (connection.provider !== "ollama") {
        return res.status(400).json({ error: "Model pulling is only supported for Ollama connections" });
      }

      const { modelName } = req.body;
      if (!modelName || typeof modelName !== "string") {
        return res.status(400).json({ error: "Model name is required" });
      }

      // Allowlist of recommended models for security
      const allowedModels = [
        "llama3.2", "llama3.2:1b", "llama3.2:3b",
        "llama3.1", "llama3.1:8b", "llama3.1:70b",
        "mistral", "mistral:7b", "mistral:latest",
        "mixtral", "mixtral:8x7b",
        "codellama", "codellama:7b", "codellama:13b", "codellama:34b",
        "deepseek-coder", "deepseek-coder:6.7b", "deepseek-coder:33b",
        "phi3", "phi3:mini", "phi3:medium",
        "gemma", "gemma:2b", "gemma:7b",
        "gemma2", "gemma2:2b", "gemma2:9b", "gemma2:27b",
        "qwen2", "qwen2:0.5b", "qwen2:1.5b", "qwen2:7b",
        "vicuna", "vicuna:7b", "vicuna:13b",
        "neural-chat", "starling-lm",
      ];

      // Allow any model that starts with an allowed prefix
      const isAllowed = allowedModels.some(allowed => 
        modelName === allowed || modelName.startsWith(allowed.split(":")[0])
      );

      if (!isAllowed) {
        return res.status(400).json({ 
          error: `Model "${modelName}" is not in the allowed list. Contact support to add new models.` 
        });
      }

      const provider = createProvider(connection);
      if (!provider.pullModel) {
        return res.status(400).json({ error: "This provider does not support model pulling" });
      }

      // Set up SSE for progress
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        await provider.pullModel(modelName, (progress) => {
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        });
        res.write(`data: ${JSON.stringify({ status: "success", message: "Model downloaded successfully" })}\n\n`);
        res.end();
      } catch (pullError: any) {
        res.write(`data: ${JSON.stringify({ status: "error", message: pullError.message })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Error pulling model:", error);
      res.status(500).json({ error: error.message || "Failed to pull model" });
    }
  });

  // Get recommended models catalog
  app.get("/api/models/catalog", async (_req: Request, res: Response) => {
    const catalog = [
      { id: "llama3.2", name: "Llama 3.2", description: "Meta's latest, fast and capable", size: "2GB", tags: ["general", "fast"] },
      { id: "llama3.2:1b", name: "Llama 3.2 1B", description: "Tiny but surprisingly capable", size: "1GB", tags: ["general", "tiny"] },
      { id: "mistral", name: "Mistral 7B", description: "Excellent reasoning, efficient", size: "4GB", tags: ["general", "reasoning"] },
      { id: "codellama", name: "Code Llama", description: "Specialized for coding tasks", size: "4GB", tags: ["coding"] },
      { id: "deepseek-coder", name: "DeepSeek Coder", description: "Top-tier code generation", size: "4GB", tags: ["coding"] },
      { id: "phi3:mini", name: "Phi-3 Mini", description: "Microsoft's compact powerhouse", size: "2GB", tags: ["general", "fast"] },
      { id: "gemma2:2b", name: "Gemma 2 2B", description: "Google's efficient model", size: "1.5GB", tags: ["general", "tiny"] },
      { id: "qwen2:7b", name: "Qwen 2 7B", description: "Strong multilingual support", size: "4GB", tags: ["general", "multilingual"] },
    ];
    res.json(catalog);
  });

  // === Projects ===
  app.get("/api/projects", async (_req: Request, res: Response) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects/reorder", async (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds must be an array" });
      }
      await storage.reorderProjects(orderedIds);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error reordering projects:", error);
      res.status(500).json({ error: "Failed to reorder projects" });
    }
  });

  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const project = await storage.createProject(req.body);
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteProject(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // === Consultants ===
  app.get("/api/projects/:projectId/consultants", async (req: Request, res: Response) => {
    try {
      const list = await storage.getConsultants(req.params.projectId);
      res.json(list);
    } catch (error) {
      console.error("Error fetching consultants:", error);
      res.status(500).json({ error: "Failed to fetch consultants" });
    }
  });

  app.post("/api/projects/:projectId/consultants", async (req: Request, res: Response) => {
    try {
      const parsed = insertConsultantSchema.safeParse({ ...req.body, projectId: req.params.projectId });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid consultant data", details: parsed.error });
      }
      const consultant = await storage.createConsultant(parsed.data);
      res.status(201).json(consultant);
    } catch (error) {
      console.error("Error creating consultant:", error);
      res.status(500).json({ error: "Failed to create consultant" });
    }
  });

  app.patch("/api/projects/:projectId/consultants/:id", async (req: Request, res: Response) => {
    try {
      const updated = await storage.updateConsultant(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Consultant not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating consultant:", error);
      res.status(500).json({ error: "Failed to update consultant" });
    }
  });

  app.delete("/api/projects/:projectId/consultants/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteConsultant(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Consultant not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting consultant:", error);
      res.status(500).json({ error: "Failed to delete consultant" });
    }
  });

  // === Conversations ===
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const conversations = await storage.getConversations(projectId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversation = await storage.createConversation({
        title: req.body.title || "New Chat",
        model: req.body.model || "",
        projectId: req.body.projectId,
        connectionId: req.body.connectionId,
      });
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.patch("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const conversation = await storage.updateConversation(req.params.id, req.body);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteConversation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // === Chat with streaming ===
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        syslog("warn", "chat", "Chat request rejected — invalid body", parsed.error.issues.map(i => i.message).join("; "));
        return res.status(400).json({ error: "Invalid request", details: parsed.error });
      }

      const {
        conversationId: _cid, projectId: _pid, connectionId: _connid, message, model: _model,
        imageBase64s: _imageBase64s, imageMimeTypes: _imageMimeTypes,
      } = parsed.data;
      const imageBase64s = _imageBase64s ?? [];
      const imageMimeTypes = _imageMimeTypes ?? [];
      // Normalize null → undefined so storage functions receive string | undefined
      const conversationId = _cid ?? undefined;
      const projectId      = _pid ?? undefined;
      const connectionId   = _connid ?? undefined;
      const model          = _model ?? undefined;

      // Get connection
      let connection;
      if (connectionId) {
        connection = await storage.getConnection(connectionId);
      } else {
        connection = await storage.getDefaultConnection();
      }

      if (!connection) {
        syslog("warn", "chat", "Chat attempted with no connection configured");
        return res.status(400).json({ error: "No connection configured" });
      }

      const selectedModel = model || connection.defaultModel;
      
      let conversation;
      let currentConversationId = conversationId;

      // Create new conversation if none exists
      if (!currentConversationId) {
        const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
        conversation = await storage.createConversation({
          title,
          model: selectedModel,
          projectId,
          connectionId: connection.id,
        });
        currentConversationId = conversation.id;
      } else {
        conversation = await storage.getConversation(currentConversationId);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }
      }

      // Add user message
      const userMessage: Message = {
        id: randomUUID(),
        role: "user",
        content: message,
        ...(imageBase64s.length > 0 && {
          images: imageBase64s.map((base64, i) => ({
            base64,
            mimeType: imageMimeTypes[i] ?? "image/jpeg",
          })),
        }),
      };
      await storage.addMessageToConversation(currentConversationId, userMessage);

      // Update title if this is the first message
      if (conversation.messages.length === 0) {
        const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
        await storage.updateConversation(currentConversationId, { title });
      }

      // Build messages for model
      const updatedConversation = await storage.getConversation(currentConversationId);
      const rawMessages = updatedConversation!.messages;
      const modelMessages: MultimodalMessage[] = rawMessages.map((m, idx) => {
        const isLastUserMessage = m.role === "user" && idx === rawMessages.length - 1;
        if (isLastUserMessage && imageBase64s.length > 0) {
          return { role: m.role, content: m.content, images: imageBase64s, imageMimeTypes };
        }
        return { role: m.role, content: m.content };
      });

      // Build system context — orientation first, then project, memories, RAG, tools
      const systemParts: string[] = [];

      // The orientation map is always the first thing the model reads.
      // It establishes where the model is, what surrounds it, and how to move
      // when it reaches the edge of what it knows. Everything else builds on top.
      systemParts.push(CREATRIX_ORIENTATION);

      // Get project system prompt and folder path if available
      let project: Awaited<ReturnType<typeof storage.getProject>> | undefined;
      if (projectId) {
        project = await storage.getProject(projectId) ?? undefined;
        if (project?.systemPrompt) {
          systemParts.push(project.systemPrompt);
        }
        if (project?.currentTask) {
          systemParts.push(`\n## Current Focus\n${project.currentTask}`);
        }
      }

      // Gather memories from all scopes
      const globalMemories = await storage.getMemoryEntries("global");
      const projectMemories = projectId ? await storage.getMemoryEntries("project", projectId) : [];
      const conversationMemories = await storage.getMemoryEntries("conversation", currentConversationId);
      
      const allMemories = [...globalMemories, ...projectMemories, ...conversationMemories];
      
      if (allMemories.length > 0) {
        const memoryText = allMemories.map(m => `- ${m.content}`).join("\n");
        systemParts.push(`\n## Important Context (User Memories)\nRemember these facts about the user:\n${memoryText}`);
      }

      // Search knowledge documents for relevant context
      const docResults = await storage.searchDocuments(message, projectId, 3);
      if (docResults.length > 0) {
        const docContext = docResults.map(({ doc, chunks }) => {
          const chunkTexts = chunks.map(c => c.content).join("\n\n");
          return `### ${doc.title}\n${chunkTexts}`;
        }).join("\n\n---\n\n");
        systemParts.push(`\n## Relevant Knowledge Base Context\nUse the following information to help answer questions:\n\n${docContext}`);
      }

      // === Tool capability injection — gated by model profile ===
      const settings = await storage.getSettings();

      const modelProfile = await fetchModelProfile(connection, model || "");
      const toolSupport: ToolSupport = modelProfile.toolSupport ?? "text";

      const rootFolder = (settings as any).rootFolder as string | undefined;
      const whisperEndpoint = (settings as any).whisperEndpoint as string | undefined;
      const notionAvailable = toolSupport !== "none" ? await probeNotionConnected() : false;

      // Full capability ontology — the model reasons over all of these.
      // Only "none"-tier models (too small to use tools) skip this entirely.
      const allCaps = toolSupport !== "none" ? listCapabilities() : [];

      // Fetch consultants for this project (empty if no project)
      const projectConsultants = projectId ? await storage.getConsultants(projectId) : [];

      // Active = wired up and executable right now.
      const availableCaps = allCaps.filter(c => {
        if (c.requires?.rootFolder && !rootFolder) return false;
        if (c.requires?.whisperEndpoint && !whisperEndpoint) return false;
        if (c.requires?.notion && !notionAvailable) return false;
        // ask_consultant is only active when there are consultants configured for this project
        if (c.name === "ask_consultant" && projectConsultants.length === 0) return false;
        return true;
      });

      // Inactive = known to the model but not yet configured.
      // The model can surface these to the user; it cannot execute them.
      const inactiveCaps = allCaps
        .filter(c => !availableCaps.includes(c))
        .map(c => {
          const reasons: string[] = [];
          if (c.requires?.rootFolder && !rootFolder)
            reasons.push("root folder not configured — Settings → File Library");
          if (c.requires?.whisperEndpoint && !whisperEndpoint)
            reasons.push("Whisper endpoint not configured — Settings → Whisper Endpoint");
          if (c.requires?.notion && !notionAvailable)
            reasons.push("Notion not connected — Settings → Integrations → Notion");
          return { cap: c, reason: reasons.join("; ") };
        });

      // Native Jinja path: Ollama handles template rendering internally.
      // Pass tools as structured API objects — no text injection, no protocol negotiation.
      const useNativeToolCalling =
        toolSupport === "limited" &&
        connection.provider === "ollama" &&
        availableCaps.length > 0;

      const apiTools: ToolDefinition[] = useNativeToolCalling
        ? availableCaps.map(c => {
            const baseDescription = c.name === "ask_consultant" && projectConsultants.length > 0
              ? `${c.description} Available consultants: ${projectConsultants.map(con => `"${con.name}" (${con.description})`).join(", ")}.`
              : c.description;
            return {
              type: "function" as const,
              function: {
                name: c.name as string,
                description: baseDescription,
                parameters: {
                  type: "object" as const,
                  properties: Object.fromEntries(
                    Object.entries(c.argsSchema).map(([k, v]) => [k, { type: v.type, description: v.description }])
                  ),
                  required: Object.entries(c.argsSchema)
                    .filter(([, v]) => v.required)
                    .map(([k]) => k),
                },
              },
            };
          })
        : [];

      // Text path: inject orientation handshake for models that speak XML tool protocol.
      if (!useNativeToolCalling && allCaps.length > 0) {
        const activeDesc = availableCaps.length > 0
          ? availableCaps.map(c => {
              const desc = c.name === "ask_consultant" && projectConsultants.length > 0
                ? `${c.description} Available: ${projectConsultants.map(con => `"${con.name}" — ${con.description}`).join("; ")}.`
                : c.description;
              return `- **${c.name}**: ${desc}${c.requiresConfirmation ? " *(requires confirmation)*" : ""}\n  Args: ${Object.entries(c.argsSchema).map(([k, v]) => `${k} (${v.type}${v.required ? ", required" : ""})`).join(", ")}`;
            }).join("\n")
          : "(none — configure tools in Settings to enable them)";

        // Concrete example first — the model needs to see the exact protocol it will use
        const lines = [
          "## Tool Environment",
          "",
          "You are operating inside Creatrix. This environment provides real, executable tools.",
          "To use a tool, output exactly this format — nothing else on the line:",
          "",
          '<tool_call>{"name":"tool_name","args":{"key":"value"}}</tool_call>',
          "",
          "The system executes the tool and returns the result. You then continue your response.",
          "",
          "Example — searching the web:",
          '<tool_call>{"name":"web_search","args":{"query":"your search here"}}</tool_call>',
          "",
          "### Active tools (callable now):",
          activeDesc,
        ];

        if (inactiveCaps.length > 0) {
          lines.push(
            "",
            "### Available but not yet configured (do not attempt to call — surface to user if relevant):",
            inactiveCaps.map(({ cap, reason }) =>
              `- **${cap.name}**: ${cap.description} [inactive — ${reason}]`
            ).join("\n"),
            "",
            "If the user's request could be served by an inactive tool, tell them what it does and what they need to configure to enable it."
          );
        }

        lines.push(
          "",
          "Reach for a tool when your thinking calls for it — when you sense a gap, want to verify something, " +
          "or recognise that a question needs more than you currently hold. " +
          "You do not need to be asked. Conversational exchanges that need no external knowledge need no tool."
        );

        systemParts.push(lines.join("\n"));
      }

      // Jinja path: API handles the active tool declarations. Inject inactive tools
      // separately so the model can still reason about and surface them to the user.
      if (useNativeToolCalling && inactiveCaps.length > 0) {
        systemParts.push([
          "### Tools available but not yet configured (do not call — inform user if relevant):",
          inactiveCaps.map(({ cap, reason }) =>
            `- **${cap.name}**: ${cap.description} [inactive — ${reason}]`
          ).join("\n"),
          "",
          "If the user's request could be served by an inactive tool, tell them what it does and what they need to configure to enable it.",
        ].join("\n"));
      }

      // Add system message
      if (systemParts.length > 0) {
        modelMessages.unshift({ role: "system", content: systemParts.join("\n\n") });
      }

      // Set up streaming response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send conversation ID first
      res.write(`data: ${JSON.stringify({ type: "conversation_id", id: currentConversationId })}\n\n`);

      const assistantMessageId = randomUUID();
      let fullContent = "";
      const sources: Source[] = [];

      try {
        const provider = createProvider(connection);
        const TOOL_CALL_RE = /<tool_call>([\s\S]*?)<\/tool_call>/;
        const MAX_TOOL_ITERATIONS = 5;

        // Shared tool invocation helper — same execution path for both native and text tool calls
        const runTool = async (toolName: CapabilityName, toolArgs: Record<string, unknown>) => {
          const cap = getCapability(toolName);

          if (cap?.requiresConfirmation) {
            // Gate: send confirm_required and wait for explicit user approval
            const confirmId = randomUUID();
            res.write(`data: ${JSON.stringify({ type: "confirm_required", confirmId, capability: toolName, args: toolArgs })}\n\n`);
            const approved = await requestConfirmation(confirmId);
            if (!approved) {
              const cancelled = { cancelled: true, message: "User cancelled this action." };
              res.write(`data: ${JSON.stringify({ type: "tool_result", capability: toolName, status: "cancelled", result: cancelled })}\n\n`);
              return { capability: toolName, args: toolArgs, status: "error" as const, error: "User cancelled.", result: cancelled };
            }
          } else {
            res.write(`data: ${JSON.stringify({ type: "tool_call", capability: toolName, args: toolArgs })}\n\n`);
          }

          const invocation = await invokeCapability(
            toolName, toolArgs,
            { rootFolder: project?.folderPath || settings.rootFolder, libraryPaths: settings.libraryPaths, storageRef: storage, connection, model: selectedModel, searchEndpoint: (settings as any).searchEndpoint, projectId: project?.id }
          );

          if (invocation.status === "success") {
            const jTypeMap: Record<string, string> = {
              read_file: "read", write_file: "created", create_note: "created",
              create_folder: "created", copy_file: "action", move_file: "action",
              delete_file: "action", web_search: "search", retrieve_url: "search",
              search_library: "search", save_conversation: "created",
            };
            await storage.createJournalEntry({
              type: (jTypeMap[toolName] || "action") as any,
              title: `${toolName.replace(/_/g, " ")}: ${String(toolArgs.path || toolArgs.query || toolArgs.title || toolArgs.url || "").slice(0, 60)}`,
              detail: JSON.stringify(invocation.result)?.slice(0, 200),
              relatedPath: (toolArgs.path || toolArgs.destination) as string | undefined,
              resolved: false,
            });
            const src = makeSource(toolName, toolArgs, invocation.result, project?.folderPath || settings.rootFolder);
            if (src) {
              const key = src.detail || src.label;
              if (!sources.some(s => (s.detail || s.label) === key)) sources.push(src);
            }
          }

          // Enrich failed invocations with the service probe's specific diagnosis.
          // The model receives a plain-language reason + fix so it can tell the
          // user what is wrong and what to do — rather than relaying a raw error.
          if (invocation.status !== "success") {
            const TOOL_SERVICE: Partial<Record<string, string>> = {
              web_search:       "searxng",
              transcribe_audio: "whisper",
            };
            const svcKey = TOOL_SERVICE[toolName];
            if (svcKey) {
              const svcState = getServiceState(svcKey);
              if (svcState && !svcState.ready && svcState.action) {
                const diagnosis = svcState.action.split("\n")[0].replace(/:$/, "");
                (invocation as any).error = invocation.error
                  ? `${invocation.error} — ${diagnosis}`
                  : diagnosis;
              }
            }
          }

          res.write(`data: ${JSON.stringify({ type: "tool_result", capability: toolName, status: invocation.status, result: invocation.result, error: invocation.error })}\n\n`);
          return invocation;
        };

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          let buffered = "";
          let streamError: string | null = null;
          const nativeToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

          await provider.generateStream(modelMessages, selectedModel, (chunk) => {
            if (chunk.type === "content" && chunk.content) {
              buffered += chunk.content;
            } else if (chunk.type === "tool_call" && chunk.toolCall) {
              // Native path: Ollama parsed the model's Jinja output into structured tool calls
              nativeToolCalls.push(chunk.toolCall);
            } else if (chunk.type === "error") {
              streamError = chunk.error || "Unknown stream error";
            }
          }, apiTools.length > 0 ? apiTools : undefined);

          if (streamError) {
            res.write(`data: ${JSON.stringify({ type: "error", message: humanizeError(streamError) })}\n\n`);
            res.end();
            return;
          }

          // ── Native Jinja tool call path ──────────────────────────────────────
          // Ollama parsed the model's native format; we receive clean structured calls.
          if (nativeToolCalls.length > 0) {
            // Stream any accompanying text first
            if (buffered.trim()) {
              res.write(`data: ${JSON.stringify({ type: "content", content: buffered })}\n\n`);
              fullContent += buffered;
            }

            // Execute all tool calls and collect results for the next turn
            const toolResultParts: string[] = [];
            for (const tc of nativeToolCalls) {
              const invocation = await runTool(tc.name as CapabilityName, tc.args);
              const resultText = invocation.status === "success"
                ? JSON.stringify(invocation.result, null, 2)
                : `Error: ${invocation.error}`;
              toolResultParts.push(`[${tc.name}] ${resultText}`);
            }

            // Push assistant turn (tool calls) + tool results back into message history
            modelMessages.push({
              role: "assistant",
              content: buffered.trim() || "",
            });
            modelMessages.push({
              role: "user",
              content: toolResultParts.map(r => `<tool_result>${r}</tool_result>`).join("\n\n"),
            });
            continue;
          }

          // ── Text tool call path ──────────────────────────────────────────────
          // Model emitted <tool_call>{...}</tool_call> in its text output.
          const match = TOOL_CALL_RE.exec(buffered);

          if (match) {
            const toolCallStart = buffered.indexOf("<tool_call>");
            const preText = buffered.slice(0, toolCallStart).trim();
            if (preText) {
              res.write(`data: ${JSON.stringify({ type: "content", content: preText + "\n\n" })}\n\n`);
              fullContent += preText + "\n\n";
            }

            let toolName: CapabilityName;
            let toolArgs: Record<string, unknown> = {};
            try {
              const parsed = JSON.parse(match[1]);
              toolName = parsed.name as CapabilityName;
              toolArgs = parsed.args || {};
            } catch {
              res.write(`data: ${JSON.stringify({ type: "content", content: buffered })}\n\n`);
              fullContent += buffered;
              break;
            }

            const invocation = await runTool(toolName, toolArgs);

            const assistantTurn = preText ? `${preText}\n\n<tool_call>${match[1]}</tool_call>` : `<tool_call>${match[1]}</tool_call>`;
            modelMessages.push({ role: "assistant", content: assistantTurn });

            const resultContent = invocation.status === "success"
              ? `<tool_result>${JSON.stringify(invocation.result, null, 2)}</tool_result>`
              : `<tool_error>Tool "${toolName}" failed: ${invocation.error}</tool_error>`;
            modelMessages.push({ role: "user", content: resultContent });

          } else {
            // No tool call — final response, stream and exit loop
            res.write(`data: ${JSON.stringify({ type: "content", content: buffered })}\n\n`);
            fullContent = (fullContent + buffered).trim();
            break;
          }
        }

        // Save complete assistant message (with provenance sources)
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: fullContent,
          ...(sources.length > 0 ? { sources } : {}),
        };
        await storage.addMessageToConversation(currentConversationId, assistantMessage);

        res.write(`data: ${JSON.stringify({ type: "done", messageId: assistantMessageId })}\n\n`);
        res.end();
      } catch (streamError: any) {
        syslog("error", "chat", "Streaming error", streamError?.message);
        res.write(`data: ${JSON.stringify({ type: "error", message: humanizeError(streamError.message || "Failed to get AI response") })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      syslog("error", "chat", "Chat request failed", error?.message);
      res.status(500).json({ error: error.message || "Failed to process chat" });
    }
  });

  // === Memory ===
  app.get("/api/memory", async (req: Request, res: Response) => {
    try {
      const scope = (req.query.scope as string) || "global";
      const scopeId = req.query.scopeId as string | undefined;
      const entries = await storage.getMemoryEntries(scope, scopeId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching memory:", error);
      res.status(500).json({ error: "Failed to fetch memory" });
    }
  });

  app.post("/api/memory", async (req: Request, res: Response) => {
    try {
      const entry = await storage.createMemoryEntry(req.body);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating memory:", error);
      res.status(500).json({ error: "Failed to create memory" });
    }
  });

  app.delete("/api/memory/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteMemoryEntry(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Memory entry not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting memory:", error);
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  app.delete("/api/memory", async (req: Request, res: Response) => {
    try {
      const scope = (req.query.scope as string) || "global";
      const scopeId = req.query.scopeId as string | undefined;
      await storage.clearMemory(scope, scopeId);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing memory:", error);
      res.status(500).json({ error: "Failed to clear memory" });
    }
  });

  // === Knowledge Documents ===
  app.get("/api/documents", async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const docs = await storage.getKnowledgeDocuments(projectId);
      res.json(docs);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const doc = await storage.getKnowledgeDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", async (req: Request, res: Response) => {
    try {
      const { title, source, content, projectId } = req.body;
      
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "Title is required" });
      }
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      const chunks = chunkText(content.trim(), { chunkSize: 500, chunkOverlap: 50 });
      
      const doc = await storage.createKnowledgeDocument({
        title: title.trim(),
        source: source || "manual",
        content: content.trim(),
        projectId,
      });

      const updatedDoc = await storage.updateKnowledgeDocument(doc.id, { chunks });

      // Fire-and-forget: embed chunks in the background so the response isn't delayed
      if (storage.storeChunkEmbeddings) {
        embedChunks(chunks, storage).then(embedded => {
          if (embedded.length > 0) {
            return storage.storeChunkEmbeddings!(doc.id, embedded);
          }
        }).catch(() => {});
      }

      res.status(201).json({
        id: updatedDoc?.id || doc.id,
        title: updatedDoc?.title || doc.title,
        source: updatedDoc?.source || doc.source,
        projectId: updatedDoc?.projectId,
        chunkCount: chunks.length,
        createdAt: updatedDoc?.createdAt || doc.createdAt,
      });
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  // Bulk-import a folder of .md / .txt files as knowledge documents
  app.post("/api/documents/import-folder", async (req: Request, res: Response) => {
    try {
      const { folderPath, projectId, extensions } = req.body;
      if (!folderPath || typeof folderPath !== "string") {
        return res.status(400).json({ error: "folderPath is required" });
      }

      const allowed = new Set<string>((extensions as string[] | undefined) ?? [".md", ".txt"]);
      const root = path.resolve(folderPath);

      try {
        const stat = await fs.stat(root);
        if (!stat.isDirectory()) return res.status(400).json({ error: "Path is not a directory" });
      } catch {
        return res.status(400).json({ error: "Folder not found or not accessible" });
      }

      const walk = async (dir: string, depth = 0): Promise<string[]> => {
        if (depth > 6) return [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const e of entries) {
          if (e.name.startsWith(".")) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) files.push(...await walk(full, depth + 1));
          else if (allowed.has(path.extname(e.name).toLowerCase())) files.push(full);
        }
        return files;
      };

      const allFiles = await walk(root);
      const existing = await storage.getKnowledgeDocuments(projectId);
      const existingTitles = new Set(existing.map(d => d.title));

      let imported = 0;
      let skipped = 0;
      const importedFiles: string[] = [];

      for (const file of allFiles.slice(0, 500)) {
        const title = path.basename(file, path.extname(file));
        if (existingTitles.has(title)) { skipped++; continue; }

        const content = await fs.readFile(file, "utf-8").catch(() => null);
        if (!content || content.trim().length < 20) { skipped++; continue; }

        const relPath = path.relative(root, file);
        const chunks = chunkText(content.trim(), { chunkSize: 500, chunkOverlap: 50 });
        const doc = await storage.createKnowledgeDocument({
          title,
          source: relPath,
          content: content.trim(),
          projectId,
        });
        await storage.updateKnowledgeDocument(doc.id, { chunks });

        if (storage.storeChunkEmbeddings) {
          embedChunks(chunks, storage).then(embedded => {
            if (embedded.length > 0) return storage.storeChunkEmbeddings!(doc.id, embedded);
          }).catch(() => {});
        }

        imported++;
        importedFiles.push(relPath);
        existingTitles.add(title);
      }

      res.json({ imported, skipped, total: allFiles.length, files: importedFiles });
    } catch (error) {
      console.error("Error importing folder:", error);
      res.status(500).json({ error: "Failed to import folder" });
    }
  });

  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteKnowledgeDocument(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }
      // Clean up chunk embeddings (fire-and-forget, ON DELETE CASCADE not set)
      storage.deleteChunkEmbeddings?.(req.params.id).catch(() => {});
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.get("/api/documents/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const projectId = req.query.projectId as string | undefined;
      const topK = parseInt(req.query.topK as string) || 3;

      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const results = await storage.searchDocuments(query, projectId, topK);
      res.json(results);
    } catch (error) {
      console.error("Error searching documents:", error);
      res.status(500).json({ error: "Failed to search documents" });
    }
  });

  // === Tool activation status ===
  app.get("/api/tools/status", async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      const rootFolder = (settings as any).rootFolder as string | undefined;
      const whisperEndpoint = (settings as any).whisperEndpoint as string | undefined;
      const notionAvailable = await probeNotionConnected();

      const all = listCapabilities();
      const activeNames = new Set(
        all
          .filter(c => {
            if (c.requires?.rootFolder && !rootFolder) return false;
            if (c.requires?.whisperEndpoint && !whisperEndpoint) return false;
            if (c.requires?.notion && !notionAvailable) return false;
            return true;
          })
          .map(c => c.name)
      );

      const active = all
        .filter(c => activeNames.has(c.name))
        .map(c => ({ name: c.name, description: c.description, requiresConfirmation: !!c.requiresConfirmation }));

      const inactive = all
        .filter(c => !activeNames.has(c.name))
        .map(c => {
          const reasons: string[] = [];
          if (c.requires?.rootFolder && !rootFolder)
            reasons.push("root folder not configured — Settings → File Library");
          if (c.requires?.whisperEndpoint && !whisperEndpoint)
            reasons.push("Whisper endpoint not configured — Settings → Whisper Endpoint");
          if (c.requires?.notion && !notionAvailable)
            reasons.push("Notion not connected — Settings → Integrations → Notion");
          return { name: c.name, description: c.description, reason: reasons.join("; ") };
        });

      res.json({ active, inactive });
    } catch (error) {
      console.error("Error fetching tools status:", error);
      res.status(500).json({ error: "Failed to get tools status" });
    }
  });

  // === Workspace Documents ===
  app.get("/api/docs", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.query as { projectId?: string };
      const docs = await storage.getWorkspaceDocs(projectId === "null" ? null : projectId);
      res.json(docs);
    } catch { res.status(500).json({ error: "Failed to list docs" }); }
  });

  app.get("/api/docs/:id", async (req: Request, res: Response) => {
    try {
      const doc = await storage.getWorkspaceDoc(req.params.id);
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.json(doc);
    } catch { res.status(500).json({ error: "Failed to get doc" }); }
  });

  app.post("/api/docs", async (req: Request, res: Response) => {
    try {
      const { title, content = "", projectId } = req.body;
      if (!title) return res.status(400).json({ error: "title required" });
      const doc = await storage.createWorkspaceDoc({ title, content, projectId: projectId ?? undefined });
      res.json(doc);
    } catch { res.status(500).json({ error: "Failed to create doc" }); }
  });

  app.patch("/api/docs/:id", async (req: Request, res: Response) => {
    try {
      const { title, content } = req.body;
      const doc = await storage.updateWorkspaceDoc(req.params.id, { ...(title !== undefined && { title }), ...(content !== undefined && { content }) });
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.json(doc);
    } catch { res.status(500).json({ error: "Failed to update doc" }); }
  });

  app.delete("/api/docs/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteWorkspaceDoc(req.params.id);
      res.json({ deleted: ok });
    } catch { res.status(500).json({ error: "Failed to delete doc" }); }
  });

  // === Tool confirmation gate ===
  // Frontend POSTs here after the user clicks Run or Cancel on a confirm_required card.
  app.post("/api/confirm/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const approved = req.body?.approved !== false; // default true, explicit false = cancel
    const resolved = resolveConfirmation(id, approved);
    res.json({ resolved, approved });
  });

  // === Substrate health / coherence ===
  // Returns cached service-runtime state — no live probe fires here.
  // Background probes run every 30 s (kicked off in server/index.ts at startup).
  // Response shape is backward-compatible so existing frontend consumers are unaffected.
  app.get("/api/substrate/health", async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      const whisperEndpoint = (settings as any).whisperEndpoint as string | undefined;
      const searchEndpoint  = (settings as any).searchEndpoint  as string | undefined;

      const svcToSubstrate = (key: string, endpoint: string | undefined) => {
        const svc = getServiceState(key);
        if (!svc || svc.status === "probing") {
          return { status: "unknown" as const, latencyMs: null, endpoint: endpoint ?? null };
        }
        return {
          status: svc.ready ? ("up" as const) : ("down" as const),
          latencyMs: svc.latencyMs,
          endpoint: endpoint ?? null,
          detail: svc.detail,
          action: svc.action,
          firstLook: svc.firstLook,
        };
      }

      const substrates = {
        whisper: svcToSubstrate("whisper", whisperEndpoint),
        search:  svcToSubstrate("searxng", searchEndpoint),
      };

      const issues: string[] = [];
      if (substrates.whisper.status === "down") issues.push(`Whisper: ${(substrates.whisper as any).detail ?? "unreachable"}`);
      if (substrates.search.status  === "down") issues.push(`SearXNG: ${(substrates.search  as any).detail ?? "unreachable"}`);

      const anyDown    = substrates.whisper.status === "down"    || substrates.search.status === "down";
      const anyUnknown = substrates.whisper.status === "unknown" || substrates.search.status === "unknown";
      const coherence  = anyDown ? "red" : anyUnknown ? "amber" : "green";

      res.json({ coherence, substrates, issues, checkedAt: Date.now() });
    } catch (error) {
      console.error("Error fetching substrate health:", error);
      res.status(500).json({ error: "Failed to get substrate health" });
    }
  });

  // === Service runtime state ===
  // Rich view of all service definitions, their live readiness state, and runtime logs.
  app.get("/api/services/state", (_req: Request, res: Response) => {
    res.json({ services: getAllServiceStates(), lastUpdatedAt: Date.now() });
  });

  // === Settings ===
  app.get("/api/settings", async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.updateSettings(req.body);
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // === Unified Search ===
  app.get("/api/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const projectId = req.query.projectId as string | undefined;

      if (!query || !query.trim()) {
        return res.json({ conversations: [], documents: [], memories: [] });
      }

      const results = await storage.unifiedSearch(query, projectId);
      res.json(results);
    } catch (error) {
      console.error("Error performing unified search:", error);
      res.status(500).json({ error: "Failed to perform search" });
    }
  });

  // === Capability Registry ===
  app.get("/api/capabilities", (_req: Request, res: Response) => {
    const caps = listCapabilities().map(c => ({
      name: c.name,
      description: c.description,
      requiresConfirmation: c.requiresConfirmation ?? false,
      argsSchema: c.argsSchema,
    }));
    res.json(caps);
  });

  app.post("/api/capabilities/invoke", async (req: Request, res: Response) => {
    try {
      const { capability, args } = req.body;
      if (!capability) return res.status(400).json({ error: "capability is required" });

      const settings = await storage.getSettings();
      const capConnection = settings.defaultConnectionId
        ? await storage.getConnection(settings.defaultConnectionId)
        : undefined;
      const result = await invokeCapability(
        capability as CapabilityName,
        args || {},
        { rootFolder: settings.rootFolder, libraryPaths: settings.libraryPaths, storageRef: storage, connection: capConnection ?? undefined, searchEndpoint: (settings as any).searchEndpoint }
      );

      // Auto-log successful invocations to the journal
      if (result.status === "success") {
        const journalTypeMap: Record<string, string> = {
          read_file: "read", write_file: "created", create_note: "created",
          create_folder: "created", copy_file: "action", move_file: "action",
          delete_file: "action", web_search: "search", retrieve_url: "search",
          search_library: "search", save_conversation: "created",
        };
        const journalType = (journalTypeMap[capability] || "action") as any;
        await storage.createJournalEntry({
          type: journalType,
          title: `${capability.replace(/_/g, " ")}: ${String(args?.path || args?.query || args?.title || args?.url || "").slice(0, 60)}`,
          detail: JSON.stringify(result.result)?.slice(0, 200),
          relatedPath: (args?.path || args?.destination) as string | undefined,
          resolved: false,
        });
      }

      const argSummary = String(args?.path || args?.query || args?.title || args?.pageId || args?.url || "").slice(0, 80);
      if (result.status === "success") {
        syslog("info", "tool", `${capability} → ok`, argSummary || undefined);
      } else {
        syslog("warn", "tool", `${capability} → ${result.error}`, argSummary || undefined);
      }
      res.json(result);
    } catch (error: any) {
      syslog("error", "tool", `Capability invoke failed: ${req.body?.capability}`, error?.message);
      res.status(500).json({ error: error.message || "Failed to invoke capability" });
    }
  });

  // === Filesystem Browser ===
  app.get("/api/filesystem/browse", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      const rootFolder = settings.rootFolder;
      if (!rootFolder) return res.status(400).json({ error: "No root folder configured in settings" });

      const requestedPath = req.query.path as string | undefined;
      const targetPath = requestedPath ? path.join(rootFolder, requestedPath) : rootFolder;

      // Security: prevent path traversal
      const resolved = path.resolve(targetPath);
      const root = path.resolve(rootFolder);
      if (!resolved.startsWith(root)) {
        return res.status(403).json({ error: "Access denied: path is outside root folder" });
      }

      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const items = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(resolved, entry.name);
        const stat = await fs.stat(entryPath).catch(() => null);
        return {
          name: entry.name,
          type: entry.isDirectory() ? "folder" : "file",
          path: path.relative(root, entryPath),
          size: stat?.size,
          modifiedAt: stat?.mtime.toISOString(),
        };
      }));

      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ path: path.relative(root, resolved) || ".", items, rootFolder });
    } catch (error: any) {
      console.error("Error browsing filesystem:", error);
      res.status(500).json({ error: error.message || "Failed to browse filesystem" });
    }
  });

  // === Library Folders ===
  app.get("/api/library/folders", async (req: Request, res: Response) => {
    try {
      const parentId = req.query.parentId as string | undefined;
      const folders = await storage.getLibraryFolders(parentId === "root" ? null : parentId);
      res.json(folders);
    } catch (error) {
      console.error("Error fetching library folders:", error);
      res.status(500).json({ error: "Failed to fetch library folders" });
    }
  });

  app.post("/api/library/folders", async (req: Request, res: Response) => {
    try {
      const folder = await storage.createLibraryFolder(req.body);
      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating library folder:", error);
      res.status(500).json({ error: "Failed to create library folder" });
    }
  });

  app.patch("/api/library/folders/:id", async (req: Request, res: Response) => {
    try {
      const folder = await storage.updateLibraryFolder(req.params.id, req.body);
      if (!folder) return res.status(404).json({ error: "Folder not found" });
      res.json(folder);
    } catch (error) {
      console.error("Error updating library folder:", error);
      res.status(500).json({ error: "Failed to update library folder" });
    }
  });

  app.delete("/api/library/folders/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteLibraryFolder(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Folder not found" });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting library folder:", error);
      res.status(500).json({ error: "Failed to delete library folder" });
    }
  });

  // === Library Items ===
  app.get("/api/library/items", async (req: Request, res: Response) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const recent = req.query.recent === "true";
      const limit = parseInt(req.query.limit as string) || 20;

      let items;
      if (recent) {
        items = await storage.getRecentLibraryItems(limit);
      } else {
        items = await storage.getLibraryItems(folderId === "root" ? null : folderId);
      }
      res.json(items);
    } catch (error) {
      console.error("Error fetching library items:", error);
      res.status(500).json({ error: "Failed to fetch library items" });
    }
  });

  app.get("/api/library/items/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query?.trim()) return res.json([]);
      const items = await storage.searchLibraryItems(query);
      res.json(items);
    } catch (error) {
      console.error("Error searching library:", error);
      res.status(500).json({ error: "Failed to search library" });
    }
  });

  app.get("/api/library/items/:id", async (req: Request, res: Response) => {
    try {
      const item = await storage.getLibraryItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Library item not found" });

      // Update accessedAt
      await storage.updateLibraryItem(req.params.id, { accessedAt: new Date().toISOString() });
      res.json(item);
    } catch (error) {
      console.error("Error fetching library item:", error);
      res.status(500).json({ error: "Failed to fetch library item" });
    }
  });

  app.post("/api/library/items", async (req: Request, res: Response) => {
    try {
      const item = await storage.createLibraryItem(req.body);
      await storage.createJournalEntry({
        type: "created",
        title: `Added to library: ${item.title}`,
        relatedLibraryItemId: item.id,
        resolved: false,
      });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating library item:", error);
      res.status(500).json({ error: "Failed to create library item" });
    }
  });

  app.patch("/api/library/items/:id", async (req: Request, res: Response) => {
    try {
      const item = await storage.updateLibraryItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Library item not found" });
      res.json(item);
    } catch (error) {
      console.error("Error updating library item:", error);
      res.status(500).json({ error: "Failed to update library item" });
    }
  });

  app.delete("/api/library/items/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteLibraryItem(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Library item not found" });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting library item:", error);
      res.status(500).json({ error: "Failed to delete library item" });
    }
  });

  // === Journal ===
  app.get("/api/journal", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const type = req.query.type as string | undefined;
      const since = req.query.since as string | undefined;

      let entries;
      if (since) {
        entries = await storage.getJournalEntriesSince(since);
      } else {
        entries = await storage.getJournalEntries(limit, type);
      }
      res.json(entries);
    } catch (error) {
      console.error("Error fetching journal:", error);
      res.status(500).json({ error: "Failed to fetch journal entries" });
    }
  });

  app.post("/api/journal", async (req: Request, res: Response) => {
    try {
      const entry = await storage.createJournalEntry(req.body);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating journal entry:", error);
      res.status(500).json({ error: "Failed to create journal entry" });
    }
  });

  app.patch("/api/journal/:id", async (req: Request, res: Response) => {
    try {
      const entry = await storage.updateJournalEntry(req.params.id, req.body);
      if (!entry) return res.status(404).json({ error: "Journal entry not found" });
      res.json(entry);
    } catch (error) {
      console.error("Error updating journal entry:", error);
      res.status(500).json({ error: "Failed to update journal entry" });
    }
  });

  // === System Logs & Health ===
  app.get("/api/system/logs", async (req: Request, res: Response) => {
    const level = req.query.level as string | undefined;
    const category = req.query.category as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const entries = await storage.getSystemLogs({ level, category: category as any, limit });
    res.json(entries);
  });

  app.delete("/api/system/logs", async (_req: Request, res: Response) => {
    await storage.clearSystemLogs();
    syslog("info", "system", "Logs cleared by user");
    res.json({ ok: true });
  });

  // ── Provenance ────────────────────────────────────────────────────────────
  // canonical:   server/routes.ts → GET /api/system/health
  // contract:    reflects whether the user can actually do their task right now,
  //              not just whether infrastructure pings succeed. Each issue carries
  //              message (what) + whyItMatters + action (what to do).
  // consumed-by: client/src/components/SystemLogPanel.tsx → HealthBar
  //              client/src/components/AppSidebar.tsx → health dot
  app.get("/api/system/health", async (_req: Request, res: Response) => {
    let dbOk = false;
    try {
      await storage.getSettings();
      dbOk = true;
    } catch {}

    const uptimeSeconds = Math.floor((Date.now() - SERVER_START) / 1000);

    // Use cached provider state — do not force a fresh scan on every health poll
    const providerStatus = await getProvidersStatus(false).catch(() => null);
    const connections = providerStatus?.providers ?? [];
    const onlineConnections = connections.filter(c => c.status === "online");
    const canChat = onlineConnections.length > 0;

    // Errors in the last 5 minutes
    const recentLogs = await storage.getSystemLogs({ limit: 200 });
    const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
    const recentErrorLogs = recentLogs.filter(
      e => e.level === "error" && new Date(e.timestamp).getTime() > fiveMinsAgo
    );

    // Build task-oriented issue list — each item answers what/why/how
    const issues: {
      component: string;
      severity: "error" | "warn";
      message: string;
      whyItMatters: string;
      action: string;
    }[] = [];

    if (!dbOk) {
      issues.push({
        component: "Database",
        severity: "error",
        message: "Database is not responding",
        whyItMatters: "Nothing can be saved — settings, conversations, and logs will be lost",
        action: "Check that PostgreSQL is running and DATABASE_URL is set correctly",
      });
    }

    if (connections.length === 0) {
      issues.push({
        component: "AI Connection",
        severity: "error",
        message: "No AI connections configured",
        whyItMatters: "Chat will not work — there is nothing to send your messages to",
        action: "Open Settings → Connections and add your AI endpoint",
      });
    } else if (!canChat) {
      const names = connections.map(c => c.name).join(", ");
      const firstType = connections[0]?.type;
      const action = firstType === "ollama"
        ? "Run `ollama serve` in a terminal to start the local model server"
        : firstType === "lmstudio"
        ? "Open LM Studio and start the local server (Server tab)"
        : "Check that your AI service is running and the endpoint URL is correct";
      issues.push({
        component: "AI Connection",
        severity: "error",
        message: `${names} ${connections.length === 1 ? "is" : "are"} not responding`,
        whyItMatters: "Chat will fail — no models are available to respond",
        action,
      });
    }

    if (recentErrorLogs.length > 0 && canChat) {
      const sample = recentErrorLogs[0];
      issues.push({
        component: sample.category,
        severity: "warn",
        message: `${recentErrorLogs.length} error${recentErrorLogs.length !== 1 ? "s" : ""} in the last 5 minutes`,
        whyItMatters: "Something may not be working as expected",
        action: "Open the System Log and filter by Errors for details",
      });
    }

    const hasErrors = issues.some(i => i.severity === "error");
    const hasWarnings = issues.some(i => i.severity === "warn");
    const status = !dbOk || hasErrors ? "unwell" : hasWarnings ? "degraded" : "ok";

    const modelCount = onlineConnections.reduce((n, c) => n + c.models.length, 0);
    const headline = status === "ok"
      ? `Ready — ${onlineConnections[0]?.name ?? "AI"} online${modelCount > 0 ? ` · ${modelCount} model${modelCount !== 1 ? "s" : ""}` : ""}`
      : issues[0]?.message ?? "System issue detected";

    res.json({
      status,
      canChat,
      headline,
      issues,
      connections: connections.map(c => ({ name: c.name, status: c.status, models: c.models.length })),
      db: dbOk,
      uptime: uptimeSeconds,
      checkedAt: new Date().toISOString(),
      logCount: recentLogs.length,
      recentErrors: recentErrorLogs.length,
    });
  });

  // ── Provenance ────────────────────────────────────────────────────────────
  // canonical:   server/routes.ts → GET /api/system/coherence
  // derives:     server/runtime/manifest.ts + server/runtime/coherence.ts
  // contract:    measures current state against the commissioning record.
  //              Not "is X up?" but "was X commissioned, and is it still present?"
  //              Returns a coherence report with expected/actual/action per item.
  // consumed-by: client (future coherence panel); also called directly for debugging
  app.get("/api/system/coherence", async (_req: Request, res: Response) => {
    try {
      const { loadManifest } = await import("./runtime/manifest");
      const { measureCoherence } = await import("./runtime/coherence");
      const manifest = await loadManifest();
      const report = await measureCoherence(manifest);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Coherence check failed" });
    }
  });

  return httpServer;
}
