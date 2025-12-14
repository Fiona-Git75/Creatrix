import { pgTable, text, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Connection providers for AI models
export const providerTypes = ["openai", "ollama", "lmstudio", "custom"] as const;
export type ProviderType = typeof providerTypes[number];

export const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(providerTypes),
  endpoint: z.string(),
  apiKey: z.string().optional(),
  defaultModel: z.string(),
  isDefault: z.boolean().default(false),
});

export type Connection = z.infer<typeof connectionSchema>;

export const insertConnectionSchema = connectionSchema.omit({ id: true });
export type InsertConnection = z.infer<typeof insertConnectionSchema>;

// Projects to organize conversations
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  connectionId: z.string().optional(),
  systemPrompt: z.string().optional(),
  createdAt: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

export const insertProjectSchema = projectSchema.omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;

// Messages within conversations
export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().optional(),
});

export type Message = z.infer<typeof messageSchema>;

// Conversations
export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  projectId: z.string().optional(),
  connectionId: z.string().optional(),
  model: z.string(),
  messages: z.array(messageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const insertConversationSchema = conversationSchema.omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true,
  messages: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;

// Memory entries for persistent context
export const memoryScopeTypes = ["global", "project", "conversation"] as const;
export type MemoryScope = typeof memoryScopeTypes[number];

export const memoryEntrySchema = z.object({
  id: z.string(),
  scope: z.enum(memoryScopeTypes),
  projectId: z.string().optional(),
  conversationId: z.string().optional(),
  content: z.string(),
  summary: z.string().optional(),
  createdAt: z.string(),
});

export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

export const insertMemoryEntrySchema = memoryEntrySchema.omit({ id: true, createdAt: true });
export type InsertMemoryEntry = z.infer<typeof insertMemoryEntrySchema>;

// Knowledge documents for RAG
export const documentChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.string()).optional(),
});

export type DocumentChunk = z.infer<typeof documentChunkSchema>;

export const knowledgeDocumentSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  title: z.string(),
  source: z.string(),
  content: z.string(),
  chunks: z.array(documentChunkSchema),
  createdAt: z.string(),
});

export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export const insertKnowledgeDocumentSchema = knowledgeDocumentSchema.omit({ 
  id: true, 
  createdAt: true,
  chunks: true,
});
export type InsertKnowledgeDocument = z.infer<typeof insertKnowledgeDocumentSchema>;

// Chat request schema
export const chatRequestSchema = z.object({
  conversationId: z.string().optional(),
  projectId: z.string().optional(),
  connectionId: z.string().optional(),
  message: z.string().min(1),
  model: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Settings schema
export const settingsSchema = z.object({
  defaultConnectionId: z.string().optional(),
  defaultProjectId: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).default("system"),
});

export type Settings = z.infer<typeof settingsSchema>;
