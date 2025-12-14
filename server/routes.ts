import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";
import { chatRequestSchema, type Message } from "@shared/schema";
import { randomUUID } from "crypto";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured. Please add your API key.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get all conversations
  app.get("/api/conversations", async (_req: Request, res: Response) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation
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

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversation = await storage.createConversation({
        title: req.body.title || "New Chat",
        messages: [],
        model: req.body.model || "gpt-4o",
      });
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Update conversation
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

  // Delete conversation
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

  // Chat with streaming
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error });
      }

      const { conversationId, message, model } = parsed.data;
      
      let conversation;
      let currentConversationId = conversationId;

      // Create new conversation if none exists
      if (!currentConversationId) {
        const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
        conversation = await storage.createConversation({
          title,
          messages: [],
          model,
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

      // Build messages for OpenAI
      const updatedConversation = await storage.getConversation(currentConversationId);
      const openaiMessages = updatedConversation!.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Set up streaming response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send conversation ID first
      res.write(`data: ${JSON.stringify({ type: "conversation_id", id: currentConversationId })}\n\n`);

      const assistantMessageId = randomUUID();
      let fullContent = "";

      try {
        const openai = getOpenAIClient();
        const stream = await openai.chat.completions.create({
          model: model === "gpt-5" ? "gpt-5" : model,
          messages: openaiMessages,
          stream: true,
          max_completion_tokens: 4096,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullContent += content;
            res.write(`data: ${JSON.stringify({ type: "content", content })}\n\n`);
          }
        }

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
        console.error("OpenAI streaming error:", streamError);
        res.write(`data: ${JSON.stringify({ type: "error", message: streamError.message || "Failed to get AI response" })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Error in chat:", error);
      res.status(500).json({ error: error.message || "Failed to process chat" });
    }
  });

  return httpServer;
}
