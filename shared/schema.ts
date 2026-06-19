import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Connections table
export const connections = pgTable("connections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  endpoint: text("endpoint").notNull(),
  apiKey: text("api_key"),
  defaultModel: text("default_model").notNull(),
  isDefault: boolean("is_default").default(false),
});

// Projects table
export const projects = pgTable("projects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  connectionId: varchar("connection_id", { length: 36 }),
  systemPrompt: text("system_prompt"),
  folderPath: text("folder_path"),
  createdAt: text("created_at").notNull(),
});

// Conversations table
export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: text("title").notNull(),
  projectId: varchar("project_id", { length: 36 }),
  connectionId: varchar("connection_id", { length: 36 }),
  model: text("model").notNull(),
  messages: jsonb("messages").notNull().default([]),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Memory entries table
export const memoryEntries = pgTable("memory_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  scope: varchar("scope", { length: 20 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  conversationId: varchar("conversation_id", { length: 36 }),
  content: text("content").notNull(),
  summary: text("summary"),
  createdAt: text("created_at").notNull(),
});

// Knowledge documents table
export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }),
  title: text("title").notNull(),
  source: text("source").notNull(),
  content: text("content").notNull(),
  chunks: jsonb("chunks").notNull().default([]),
  createdAt: text("created_at").notNull(),
});

// Settings table
export const settings = pgTable("settings", {
  id: varchar("id", { length: 36 }).primaryKey().default("default"),
  defaultConnectionId: varchar("default_connection_id", { length: 36 }),
  defaultProjectId: varchar("default_project_id", { length: 36 }),
  theme: varchar("theme", { length: 10 }).default("system"),
  rootFolder: text("root_folder"),
  libraryPaths: text("library_paths").array(),
  morningOrientationEnabled: boolean("morning_orientation_enabled").default(false),
  whisperEndpoint: text("whisper_endpoint"),
});

// ─── Phase 2: Library ────────────────────────────────────────────────────────

// Library folders — named collections within the library
export const libraryFolders = pgTable("library_folders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  parentId: varchar("parent_id", { length: 36 }),       // null = root collection
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

// Library items — an inspectable record of every document the resident knows about
export const libraryItems = pgTable("library_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  folderId: varchar("folder_id", { length: 36 }),        // null = root
  title: text("title").notNull(),
  filePath: text("file_path"),                            // absolute path on disk (when local)
  source: varchar("source", { length: 20 }).notNull(),   // "file" | "upload" | "url" | "note"
  mimeType: text("mime_type"),
  content: text("content"),                               // cached text content
  summary: text("summary"),                               // short resident-generated summary
  tags: text("tags").array(),
  createdAt: text("created_at").notNull(),
  accessedAt: text("accessed_at"),
});

// ─── Phase 2: Resident Journal ───────────────────────────────────────────────

// Journal entry types
export const journalEntryTypes = [
  "read",          // resident read a document
  "created",       // resident created a file or note
  "question",      // open question the resident noted
  "search",        // a search the resident performed
  "action",        // any other capability invocation
  "summary",       // end-of-session or morning summary
] as const;
export type JournalEntryType = typeof journalEntryTypes[number];

export const journalEntries = pgTable("journal_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  relatedPath: text("related_path"),                      // file path if relevant
  relatedLibraryItemId: varchar("related_library_item_id", { length: 36 }),
  relatedConversationId: varchar("related_conversation_id", { length: 36 }),
  resolved: boolean("resolved").default(false),           // for questions: has it been answered?
  createdAt: text("created_at").notNull(),
});

// ─── Zod schemas & types ─────────────────────────────────────────────────────

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
  folderPath: z.string().optional(),
  createdAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;
export const insertProjectSchema = projectSchema.omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;

// Messages within conversations
export const sourceSchema = z.object({
  type: z.enum(["file", "url", "web", "notion", "youtube"]),
  label: z.string(),
  detail: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().optional(),
  sources: z.array(sourceSchema).optional(),
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

// System logs
export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  level: varchar("level", { length: 10 }).notNull(),
  category: varchar("category", { length: 20 }).notNull(),
  message: text("message").notNull(),
  detail: text("detail"),
});
export type SystemLog = typeof systemLogs.$inferSelect;

// Chat request schema
export const chatRequestSchema = z.object({
  conversationId: z.string().nullish(),
  projectId: z.string().nullish(),
  connectionId: z.string().nullish(),
  message: z.string().min(1),
  model: z.string().nullish(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Settings schema
export const settingsSchema = z.object({
  defaultConnectionId: z.string().optional(),
  defaultProjectId: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  rootFolder: z.string().optional(),
  libraryPaths: z.array(z.string()).optional(),
  morningOrientationEnabled: z.boolean().default(false),
  whisperEndpoint: z.string().optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

// ─── Phase 2 schemas ─────────────────────────────────────────────────────────

// Library folder
export const libraryFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string(),
});
export type LibraryFolder = z.infer<typeof libraryFolderSchema>;
export const insertLibraryFolderSchema = libraryFolderSchema.omit({ id: true, createdAt: true });
export type InsertLibraryFolder = z.infer<typeof insertLibraryFolderSchema>;

// Library item sources
export const libraryItemSources = ["file", "upload", "url", "note"] as const;
export type LibraryItemSource = typeof libraryItemSources[number];

// Library item
export const libraryItemSchema = z.object({
  id: z.string(),
  folderId: z.string().optional(),
  title: z.string(),
  filePath: z.string().optional(),
  source: z.enum(libraryItemSources),
  mimeType: z.string().optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  accessedAt: z.string().optional(),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export const insertLibraryItemSchema = libraryItemSchema.omit({ id: true, createdAt: true });
export type InsertLibraryItem = z.infer<typeof insertLibraryItemSchema>;

// Journal entry
export const journalEntrySchema = z.object({
  id: z.string(),
  type: z.enum(journalEntryTypes),
  title: z.string(),
  detail: z.string().optional(),
  relatedPath: z.string().optional(),
  relatedLibraryItemId: z.string().optional(),
  relatedConversationId: z.string().optional(),
  resolved: z.boolean().default(false),
  createdAt: z.string(),
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export const insertJournalEntrySchema = journalEntrySchema.omit({ id: true, createdAt: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;

// Filesystem capability — supported readable extensions
export const readableExtensions = [
  ".md", ".txt", ".docx", ".pdf", ".rtf", ".odt", ".epub",
  ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml",
  ".toml", ".ini", ".xml", ".css", ".html", ".htm", ".csv", ".xlsx",
  ".sh", ".env",
] as const;
export type ReadableExtension = typeof readableExtensions[number];

// Capability invocation (used in chat context to track what tools were called)
export const capabilityNames = [
  "read_file",
  "write_file",
  "create_note",
  "create_folder",
  "copy_file",
  "move_file",
  "delete_file",
  "web_search",
  "retrieve_url",
  "search_library",
  "save_conversation",
  "notion_search",
  "notion_get_page",
  "notion_create_page",
  "notion_query_database",
  "notion_append_block",
  "get_youtube_transcript",
  "transcribe_audio",
  "ocr_image",
  "analyze_image",
  "append_file",
] as const;
export type CapabilityName = typeof capabilityNames[number];

export const capabilityInvocationSchema = z.object({
  capability: z.enum(capabilityNames),
  args: z.record(z.unknown()),
  status: z.enum(["pending", "running", "success", "error", "requires_confirmation"]),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type CapabilityInvocation = z.infer<typeof capabilityInvocationSchema>;
