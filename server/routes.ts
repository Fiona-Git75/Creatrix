import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { chatRequestSchema, type Message } from "@shared/schema";
import { createProvider } from "./providers";
import { randomUUID } from "crypto";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
      const connection = await storage.createConnection(req.body);
      res.status(201).json(connection);
    } catch (error) {
      console.error("Error creating connection:", error);
      res.status(500).json({ error: "Failed to create connection" });
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
      const healthy = await provider.healthCheck();
      res.json({ healthy });
    } catch (error) {
      console.error("Error checking health:", error);
      res.json({ healthy: false });
    }
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
        model: req.body.model || "llama3.2",
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
        return res.status(400).json({ error: "Invalid request", details: parsed.error });
      }

      const { conversationId, projectId, connectionId, message, model } = parsed.data;
      
      // Get connection
      let connection;
      if (connectionId) {
        connection = await storage.getConnection(connectionId);
      } else {
        connection = await storage.getDefaultConnection();
      }

      if (!connection) {
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
      };
      await storage.addMessageToConversation(currentConversationId, userMessage);

      // Update title if this is the first message
      if (conversation.messages.length === 0) {
        const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
        await storage.updateConversation(currentConversationId, { title });
      }

      // Build messages for model
      const updatedConversation = await storage.getConversation(currentConversationId);
      const modelMessages = updatedConversation!.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Get project system prompt if available
      if (projectId) {
        const project = await storage.getProject(projectId);
        if (project?.systemPrompt) {
          modelMessages.unshift({ role: "system", content: project.systemPrompt });
        }
      }

      // Set up streaming response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send conversation ID first
      res.write(`data: ${JSON.stringify({ type: "conversation_id", id: currentConversationId })}\n\n`);

      const assistantMessageId = randomUUID();
      let fullContent = "";

      try {
        const provider = createProvider(connection);
        
        await provider.generateStream(modelMessages, selectedModel, (chunk) => {
          if (chunk.type === "content" && chunk.content) {
            fullContent += chunk.content;
            res.write(`data: ${JSON.stringify({ type: "content", content: chunk.content })}\n\n`);
          } else if (chunk.type === "error") {
            res.write(`data: ${JSON.stringify({ type: "error", message: chunk.error })}\n\n`);
          } else if (chunk.type === "done") {
            // Will be handled after loop
          }
        });

        // Save assistant message
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: fullContent,
        };
        await storage.addMessageToConversation(currentConversationId, assistantMessage);

        res.write(`data: ${JSON.stringify({ type: "done", messageId: assistantMessageId })}\n\n`);
        res.end();
      } catch (streamError: any) {
        console.error("Streaming error:", streamError);
        res.write(`data: ${JSON.stringify({ type: "error", message: streamError.message || "Failed to get AI response" })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Error in chat:", error);
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

  app.post("/api/documents", async (req: Request, res: Response) => {
    try {
      const doc = await storage.createKnowledgeDocument(req.body);
      res.status(201).json(doc);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteKnowledgeDocument(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
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

  return httpServer;
}
