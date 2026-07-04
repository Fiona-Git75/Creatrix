import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Connections table
export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  endpoint: text("endpoint").notNull(),
  apiKey: text("api_key"),
  defaultModel: text("default_model").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  maxImageSizeMb: integer("max_image_size_mb"),
  orderIndex: integer("order_index").default(0),
});

// Projects table
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  connectionId: text("connection_id"),
  systemPrompt: text("system_prompt"),
  currentTask: text("current_task"),
  folderPath: text("folder_path"),
  createdAt: text("created_at").notNull(),
  orderIndex: integer("order_index").default(0),
  // Project dashboard fields
  goals: text("goals"),
  architecturalNotes: text("architectural_notes"),
  workState: text("work_state"),
  recentChanges: text("recent_changes"),
  activeIssues: text("active_issues"),
});

// Conversations table
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  projectId: text("project_id"),
  connectionId: text("connection_id"),
  model: text("model").notNull(),
  messages: text("messages").notNull().default("[]"),  // JSON-encoded Message[]
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Memory entries table
export const memoryEntries = sqliteTable("memory_entries", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  projectId: text("project_id"),
  conversationId: text("conversation_id"),
  content: text("content").notNull(),
  summary: text("summary"),
  createdAt: text("created_at").notNull(),
});

// Knowledge documents table
export const knowledgeDocuments = sqliteTable("knowledge_documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  title: text("title").notNull(),
  source: text("source").notNull(),
  content: text("content").notNull(),
  chunks: text("chunks").notNull().default("[]"),  // JSON-encoded DocumentChunk[]
  createdAt: text("created_at").notNull(),
});

// Settings table
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("default"),
  defaultConnectionId: text("default_connection_id"),
  defaultProjectId: text("default_project_id"),
  theme: text("theme").default("system"),
  rootFolder: text("root_folder"),
  libraryPaths: text("library_paths"),  // JSON-encoded string[]
  morningOrientationEnabled: integer("morning_orientation_enabled", { mode: "boolean" }).default(false),
  whisperEndpoint: text("whisper_endpoint"),
  searchEndpoint: text("search_endpoint"),
  embeddingModel: text("embedding_model"),
  dayNote: text("day_note"),
});

// ─── Phase 2: Library ────────────────────────────────────────────────────────

// Library folders — named collections within the library
export const libraryFolders = sqliteTable("library_folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

// Library items — an inspectable record of every document the resident knows about
export const libraryItems = sqliteTable("library_items", {
  id: text("id").primaryKey(),
  folderId: text("folder_id"),
  title: text("title").notNull(),
  filePath: text("file_path"),
  source: text("source").notNull(),
  mimeType: text("mime_type"),
  content: text("content"),
  summary: text("summary"),
  tags: text("tags"),  // JSON-encoded string[]
  createdAt: text("created_at").notNull(),
  accessedAt: text("accessed_at"),
});

// ─── Phase 2: Resident Journal ───────────────────────────────────────────────

export const journalEntryTypes = [
  "read",
  "created",
  "question",
  "search",
  "action",
  "summary",
] as const;
export type JournalEntryType = typeof journalEntryTypes[number];

export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  relatedPath: text("related_path"),
  relatedLibraryItemId: text("related_library_item_id"),
  relatedConversationId: text("related_conversation_id"),
  resolved: integer("resolved", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

// ─── Zod schemas & types ─────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
  maxImageSizeMb: z.number().int().positive().nullable().optional(),
  orderIndex: z.number().int().default(0),
});
export type Connection = z.infer<typeof connectionSchema>;
export const insertConnectionSchema = connectionSchema.omit({ id: true });
export type InsertConnection = z.infer<typeof insertConnectionSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  connectionId: z.string().optional(),
  systemPrompt: z.string().optional(),
  currentTask: z.string().optional(),
  folderPath: z.string().optional(),
  createdAt: z.string(),
  orderIndex: z.number().int().default(0),
  goals: z.string().optional(),
  architecturalNotes: z.string().optional(),
  workState: z.string().optional(),
  recentChanges: z.string().optional(),
  activeIssues: z.string().optional(),
});
export type Project = z.infer<typeof projectSchema>;
export const insertProjectSchema = projectSchema.omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const sourceSchema = z.object({
  type: z.enum(["file", "url", "web", "notion", "youtube"]),
  label: z.string(),
  detail: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

export const messageImageSchema = z.object({
  base64: z.string(),
  mimeType: z.string(),
});
export type MessageImage = z.infer<typeof messageImageSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().optional(),
  sources: z.array(sourceSchema).optional(),
  images: z.array(messageImageSchema).optional(),
});
export type Message = z.infer<typeof messageSchema>;

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
export const systemLogs = sqliteTable("system_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).$defaultFn(() => new Date()).notNull(),
  level: text("level").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  detail: text("detail"),
});
export type SystemLog = typeof systemLogs.$inferSelect;

export const chatRequestSchema = z.object({
  conversationId: z.string().nullish(),
  projectId: z.string().nullish(),
  connectionId: z.string().nullish(),
  message: z.string().min(1),
  model: z.string().nullish(),
  imageBase64s: z.array(z.string()).optional(),
  imageMimeTypes: z.array(z.string()).optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const settingsSchema = z.object({
  defaultConnectionId: z.string().optional(),
  defaultProjectId: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  rootFolder: z.string().optional(),
  libraryPaths: z.array(z.string()).optional(),
  morningOrientationEnabled: z.boolean().default(false),
  whisperEndpoint: z.string().optional(),
  searchEndpoint: z.string().optional(),
  embeddingModel: z.string().optional(),
  dayNote: z.string().optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

// ─── Phase 2 schemas ─────────────────────────────────────────────────────────

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

export const libraryItemSources = ["file", "upload", "url", "note"] as const;
export type LibraryItemSource = typeof libraryItemSources[number];

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

// ─── Conversation Flags (Moments) ────────────────────────────────────────────

export const conversationFlags = sqliteTable("conversation_flags", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  conversationTitle: text("conversation_title").notNull(),
  projectId: text("project_id"),
  messageIndex: integer("message_index").notNull().default(0),
  pivotSentence: text("pivot_sentence").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const flagSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  conversationTitle: z.string(),
  projectId: z.string().optional(),
  messageIndex: z.number(),
  pivotSentence: z.string(),
  note: z.string().optional(),
  createdAt: z.string(),
});
export type ConversationFlag = z.infer<typeof flagSchema>;
export const insertFlagSchema = flagSchema.omit({ id: true, createdAt: true });
export type InsertConversationFlag = z.infer<typeof insertFlagSchema>;

// Filesystem capability — supported readable extensions
export const readableExtensions = [
  ".md", ".txt", ".docx", ".pdf", ".rtf", ".odt", ".epub",
  ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml",
  ".toml", ".ini", ".xml", ".css", ".html", ".htm", ".csv", ".xlsx",
  ".sh", ".env",
] as const;
export type ReadableExtension = typeof readableExtensions[number];

// ─── Workspace Documents ──────────────────────────────────────────────────────

export const workspaceDocs = sqliteTable("workspace_docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  projectId: text("project_id"),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const workspaceDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  projectId: z.string().optional(),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export type WorkspaceDoc = z.infer<typeof workspaceDocSchema>;
export const insertWorkspaceDocSchema = workspaceDocSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkspaceDoc = z.infer<typeof insertWorkspaceDocSchema>;

// ─── Consultants ─────────────────────────────────────────────────────────────

export const consultants = sqliteTable("consultants", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  connectionId: text("connection_id").notNull(),
  model: text("model").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  createdAt: text("created_at").notNull(),
});

export const consultantSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  connectionId: z.string(),
  model: z.string(),
  systemPrompt: z.string(),
  createdAt: z.string(),
});
export type Consultant = z.infer<typeof consultantSchema>;
export const insertConsultantSchema = consultantSchema.omit({ id: true, createdAt: true });
export type InsertConsultant = z.infer<typeof insertConsultantSchema>;

// Capability invocation (used in chat context to track what tools were called)
export const capabilityNames = [
  "list_directory",
  "read_file",
  "write_file",
  "append_file",
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
  "run_command",
  "list_docs",
  "read_doc",
  "write_doc",
  "edit_doc",
  "ask_consultant",
  "check_services",
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
