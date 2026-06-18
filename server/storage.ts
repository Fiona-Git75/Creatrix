import { 
  type User, type InsertUser, 
  type Conversation, type InsertConversation, type Message,
  type Project, type InsertProject,
  type Connection, type InsertConnection,
  type MemoryEntry, type InsertMemoryEntry,
  type KnowledgeDocument, type InsertKnowledgeDocument,
  type Settings,
  type LibraryFolder, type InsertLibraryFolder,
  type LibraryItem, type InsertLibraryItem,
  type JournalEntry, type InsertJournalEntry,
  users, connections, projects, conversations, memoryEntries, knowledgeDocuments, settings,
  libraryFolders, libraryItems, journalEntries,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, like, or, desc, sql } from "drizzle-orm";
import pg from "pg";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Connections
  getConnections(): Promise<Connection[]>;
  getConnection(id: string): Promise<Connection | undefined>;
  getDefaultConnection(): Promise<Connection | undefined>;
  createConnection(connection: InsertConnection): Promise<Connection>;
  updateConnection(id: string, updates: Partial<InsertConnection>): Promise<Connection | undefined>;
  deleteConnection(id: string): Promise<boolean>;

  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  // Conversations
  getConversations(projectId?: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Pick<Conversation, 'title' | 'messages' | 'model' | 'projectId'>>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<boolean>;
  addMessageToConversation(id: string, message: Message): Promise<Conversation | undefined>;

  // Memory
  getMemoryEntries(scope: string, scopeId?: string): Promise<MemoryEntry[]>;
  createMemoryEntry(entry: InsertMemoryEntry): Promise<MemoryEntry>;
  deleteMemoryEntry(id: string): Promise<boolean>;
  clearMemory(scope: string, scopeId?: string): Promise<boolean>;

  // Knowledge Documents
  getKnowledgeDocuments(projectId?: string): Promise<KnowledgeDocument[]>;
  getKnowledgeDocument(id: string): Promise<KnowledgeDocument | undefined>;
  createKnowledgeDocument(doc: InsertKnowledgeDocument): Promise<KnowledgeDocument>;
  updateKnowledgeDocument(id: string, updates: Partial<KnowledgeDocument>): Promise<KnowledgeDocument | undefined>;
  deleteKnowledgeDocument(id: string): Promise<boolean>;
  searchDocuments(query: string, projectId?: string, topK?: number): Promise<{ doc: KnowledgeDocument; chunks: import("@shared/schema").DocumentChunk[] }[]>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;

  // Unified Search
  unifiedSearch(query: string, projectId?: string): Promise<{
    conversations: { id: string; title: string; excerpt: string; matchType: string }[];
    documents: { id: string; title: string; excerpt: string }[];
    memories: { id: string; content: string; scope: string }[];
  }>;

  // ─── Phase 2: Library ──────────────────────────────────────────────────────
  getLibraryFolders(parentId?: string | null): Promise<LibraryFolder[]>;
  getLibraryFolder(id: string): Promise<LibraryFolder | undefined>;
  createLibraryFolder(folder: InsertLibraryFolder): Promise<LibraryFolder>;
  updateLibraryFolder(id: string, updates: Partial<InsertLibraryFolder>): Promise<LibraryFolder | undefined>;
  deleteLibraryFolder(id: string): Promise<boolean>;

  getLibraryItems(folderId?: string | null): Promise<LibraryItem[]>;
  getLibraryItem(id: string): Promise<LibraryItem | undefined>;
  getRecentLibraryItems(limit?: number): Promise<LibraryItem[]>;
  createLibraryItem(item: InsertLibraryItem): Promise<LibraryItem>;
  updateLibraryItem(id: string, updates: Partial<InsertLibraryItem>): Promise<LibraryItem | undefined>;
  deleteLibraryItem(id: string): Promise<boolean>;
  searchLibraryItems(query: string): Promise<LibraryItem[]>;

  // ─── Phase 2: Journal ──────────────────────────────────────────────────────
  getJournalEntries(limit?: number, type?: string): Promise<JournalEntry[]>;
  getJournalEntry(id: string): Promise<JournalEntry | undefined>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  updateJournalEntry(id: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined>;
  getJournalEntriesSince(since: string): Promise<JournalEntry[]>;
}

// ─── In-Memory Implementation ────────────────────────────────────────────────

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private connections: Map<string, Connection>;
  private projects: Map<string, Project>;
  private conversations: Map<string, Conversation>;
  private memoryEntries: Map<string, MemoryEntry>;
  private knowledgeDocuments: Map<string, KnowledgeDocument>;
  private _libraryFolders: Map<string, LibraryFolder>;
  private _libraryItems: Map<string, LibraryItem>;
  private _journalEntries: Map<string, JournalEntry>;
  private settings: Settings;

  constructor() {
    this.users = new Map();
    this.connections = new Map();
    this.projects = new Map();
    this.conversations = new Map();
    this.memoryEntries = new Map();
    this.knowledgeDocuments = new Map();
    this._libraryFolders = new Map();
    this._libraryItems = new Map();
    this._journalEntries = new Map();
    this.settings = { theme: "system", morningOrientationEnabled: false };

    const defaultConnection: Connection = {
      id: "default-ollama",
      name: "Local Ollama",
      provider: "ollama",
      endpoint: "http://localhost:11434",
      defaultModel: "llama3.2",
      isDefault: true,
    };
    this.connections.set(defaultConnection.id, defaultConnection);
  }

  // Users
  async getUser(id: string): Promise<User | undefined> { return this.users.get(id); }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Connections
  async getConnections(): Promise<Connection[]> { return Array.from(this.connections.values()); }
  async getConnection(id: string): Promise<Connection | undefined> { return this.connections.get(id); }
  async getDefaultConnection(): Promise<Connection | undefined> {
    return Array.from(this.connections.values()).find(c => c.isDefault);
  }
  async createConnection(insertConnection: InsertConnection): Promise<Connection> {
    const id = randomUUID();
    const connection: Connection = { ...insertConnection, id };
    if (connection.isDefault) {
      Array.from(this.connections.entries()).forEach(([key, conn]) => {
        if (conn.isDefault) this.connections.set(key, { ...conn, isDefault: false });
      });
    }
    this.connections.set(id, connection);
    return connection;
  }
  async updateConnection(id: string, updates: Partial<InsertConnection>): Promise<Connection | undefined> {
    const connection = this.connections.get(id);
    if (!connection) return undefined;
    if (updates.isDefault) {
      Array.from(this.connections.entries()).forEach(([key, conn]) => {
        if (conn.isDefault && key !== id) this.connections.set(key, { ...conn, isDefault: false });
      });
    }
    const updated: Connection = { ...connection, ...updates };
    this.connections.set(id, updated);
    return updated;
  }
  async deleteConnection(id: string): Promise<boolean> { return this.connections.delete(id); }

  // Projects
  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async getProject(id: string): Promise<Project | undefined> { return this.projects.get(id); }
  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = { ...insertProject, id, createdAt: new Date().toISOString() };
    this.projects.set(id, project);
    return project;
  }
  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    const updated: Project = { ...project, ...updates };
    this.projects.set(id, updated);
    return updated;
  }
  async deleteProject(id: string): Promise<boolean> {
    Array.from(this.conversations.entries()).forEach(([convId, conv]) => {
      if (conv.projectId === id) this.conversations.delete(convId);
    });
    return this.projects.delete(id);
  }

  // Conversations
  async getConversations(projectId?: string): Promise<Conversation[]> {
    let convs = Array.from(this.conversations.values());
    if (projectId !== undefined) convs = convs.filter(c => c.projectId === projectId);
    return convs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  async getConversation(id: string): Promise<Conversation | undefined> { return this.conversations.get(id); }
  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const conversation: Conversation = { ...insertConversation, id, messages: [], createdAt: now, updatedAt: now };
    this.conversations.set(id, conversation);
    return conversation;
  }
  async updateConversation(id: string, updates: Partial<Pick<Conversation, 'title' | 'messages' | 'model' | 'projectId'>>): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    const updated: Conversation = { ...conversation, ...updates, updatedAt: new Date().toISOString() };
    this.conversations.set(id, updated);
    return updated;
  }
  async deleteConversation(id: string): Promise<boolean> { return this.conversations.delete(id); }
  async addMessageToConversation(id: string, message: Message): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    const updated: Conversation = {
      ...conversation,
      messages: [...conversation.messages, { ...message, createdAt: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    };
    this.conversations.set(id, updated);
    return updated;
  }

  // Memory
  async getMemoryEntries(scope: string, scopeId?: string): Promise<MemoryEntry[]> {
    return Array.from(this.memoryEntries.values()).filter(entry => {
      if (entry.scope !== scope) return false;
      if (scope === "project" && entry.projectId !== scopeId) return false;
      if (scope === "conversation" && entry.conversationId !== scopeId) return false;
      return true;
    });
  }
  async createMemoryEntry(insertEntry: InsertMemoryEntry): Promise<MemoryEntry> {
    const id = randomUUID();
    const entry: MemoryEntry = { ...insertEntry, id, createdAt: new Date().toISOString() };
    this.memoryEntries.set(id, entry);
    return entry;
  }
  async deleteMemoryEntry(id: string): Promise<boolean> { return this.memoryEntries.delete(id); }
  async clearMemory(scope: string, scopeId?: string): Promise<boolean> {
    const toDelete: string[] = [];
    Array.from(this.memoryEntries.entries()).forEach(([id, entry]) => {
      if (entry.scope === scope) {
        if (scope === "global" ||
          (scope === "project" && entry.projectId === scopeId) ||
          (scope === "conversation" && entry.conversationId === scopeId)) {
          toDelete.push(id);
        }
      }
    });
    toDelete.forEach(id => this.memoryEntries.delete(id));
    return true;
  }

  // Knowledge Documents
  async getKnowledgeDocuments(projectId?: string): Promise<KnowledgeDocument[]> {
    let docs = Array.from(this.knowledgeDocuments.values());
    if (projectId !== undefined) docs = docs.filter(d => d.projectId === projectId);
    return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async getKnowledgeDocument(id: string): Promise<KnowledgeDocument | undefined> { return this.knowledgeDocuments.get(id); }
  async createKnowledgeDocument(insertDoc: InsertKnowledgeDocument): Promise<KnowledgeDocument> {
    const id = randomUUID();
    const doc: KnowledgeDocument = { ...insertDoc, id, chunks: [], createdAt: new Date().toISOString() };
    this.knowledgeDocuments.set(id, doc);
    return doc;
  }
  async deleteKnowledgeDocument(id: string): Promise<boolean> { return this.knowledgeDocuments.delete(id); }
  async updateKnowledgeDocument(id: string, updates: Partial<KnowledgeDocument>): Promise<KnowledgeDocument | undefined> {
    const doc = this.knowledgeDocuments.get(id);
    if (!doc) return undefined;
    const updated: KnowledgeDocument = { ...doc, ...updates };
    this.knowledgeDocuments.set(id, updated);
    return updated;
  }
  async searchDocuments(query: string, projectId?: string, topK: number = 3): Promise<{ doc: KnowledgeDocument; chunks: import("@shared/schema").DocumentChunk[] }[]> {
    if (!query?.trim()) return [];
    const docs = await this.getKnowledgeDocuments(projectId);
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (queryTerms.length === 0) return [];
    const results: { doc: KnowledgeDocument; chunks: import("@shared/schema").DocumentChunk[]; score: number }[] = [];
    for (const doc of docs) {
      if (!doc.chunks?.length) continue;
      const matchingChunks: { chunk: import("@shared/schema").DocumentChunk; score: number; position: number }[] = [];
      for (let i = 0; i < doc.chunks.length; i++) {
        const chunk = doc.chunks[i];
        const content = chunk.content.toLowerCase();
        let score = 0;
        for (const term of queryTerms) {
          try {
            const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi");
            const matches = content.match(regex);
            if (matches) score += matches.length;
          } catch { if (content.includes(term)) score += 1; }
        }
        if (score > 0) matchingChunks.push({ chunk, score, position: i });
      }
      if (matchingChunks.length > 0) {
        matchingChunks.sort((a, b) => b.score - a.score || a.position - b.position);
        results.push({ doc, chunks: matchingChunks.slice(0, topK).map(m => m.chunk), score: matchingChunks.reduce((s, m) => s + m.score, 0) });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).map(r => ({ doc: r.doc, chunks: r.chunks }));
  }

  // Settings
  async getSettings(): Promise<Settings> { return this.settings; }
  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    this.settings = { ...this.settings, ...updates };
    return this.settings;
  }

  async unifiedSearch(query: string, projectId?: string): Promise<{
    conversations: { id: string; title: string; excerpt: string; matchType: string }[];
    documents: { id: string; title: string; excerpt: string }[];
    memories: { id: string; content: string; scope: string }[];
  }> {
    if (!query?.trim()) return { conversations: [], documents: [], memories: [] };
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (queryTerms.length === 0) return { conversations: [], documents: [], memories: [] };

    const convs: { id: string; title: string; excerpt: string; matchType: string; score: number }[] = [];
    for (const conv of await this.getConversations(projectId)) {
      let score = 0; let matchType = ""; let excerpt = "";
      for (const term of queryTerms) {
        if (conv.title.toLowerCase().includes(term)) { score += 3; matchType = "title"; excerpt = conv.title; }
      }
      for (const msg of conv.messages) {
        if (msg.role === "system") continue;
        const cl = msg.content.toLowerCase();
        for (const term of queryTerms) {
          if (cl.includes(term)) {
            score += 1;
            if (!matchType) matchType = "message";
            const idx = cl.indexOf(term);
            excerpt = msg.content.slice(Math.max(0, idx - 30), idx + 80);
          }
        }
      }
      if (score > 0) convs.push({ id: conv.id, title: conv.title, excerpt, matchType, score });
    }
    convs.sort((a, b) => b.score - a.score);

    const docResults = await this.searchDocuments(query, projectId, 5);
    const documents = docResults.map(({ doc, chunks }) => ({ id: doc.id, title: doc.title, excerpt: chunks[0]?.content.slice(0, 100) + "..." || "" }));

    const memories: { id: string; content: string; scope: string }[] = [];
    for (const mem of Array.from(this.memoryEntries.values())) {
      if (projectId && mem.projectId !== projectId && mem.scope !== "global") continue;
      const cl = mem.content.toLowerCase();
      if (queryTerms.some(t => cl.includes(t))) memories.push({ id: mem.id, content: mem.content.slice(0, 100), scope: mem.scope });
    }

    return { conversations: convs.slice(0, 5).map(({ score, ...r }) => r), documents, memories: memories.slice(0, 5) };
  }

  // ─── Phase 2: Library ──────────────────────────────────────────────────────

  async getLibraryFolders(parentId?: string | null): Promise<LibraryFolder[]> {
    const folders = Array.from(this._libraryFolders.values());
    if (parentId === undefined) return folders;
    return folders.filter(f => (parentId === null ? f.parentId == null : f.parentId === parentId));
  }
  async getLibraryFolder(id: string): Promise<LibraryFolder | undefined> { return this._libraryFolders.get(id); }
  async createLibraryFolder(insertFolder: InsertLibraryFolder): Promise<LibraryFolder> {
    const id = randomUUID();
    const folder: LibraryFolder = { ...insertFolder, id, createdAt: new Date().toISOString() };
    this._libraryFolders.set(id, folder);
    return folder;
  }
  async updateLibraryFolder(id: string, updates: Partial<InsertLibraryFolder>): Promise<LibraryFolder | undefined> {
    const folder = this._libraryFolders.get(id);
    if (!folder) return undefined;
    const updated: LibraryFolder = { ...folder, ...updates };
    this._libraryFolders.set(id, updated);
    return updated;
  }
  async deleteLibraryFolder(id: string): Promise<boolean> {
    Array.from(this._libraryItems.entries()).forEach(([itemId, item]) => {
      if (item.folderId === id) this._libraryItems.delete(itemId);
    });
    return this._libraryFolders.delete(id);
  }

  async getLibraryItems(folderId?: string | null): Promise<LibraryItem[]> {
    const items = Array.from(this._libraryItems.values());
    if (folderId === undefined) return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items.filter(i => (folderId === null ? i.folderId == null : i.folderId === folderId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async getLibraryItem(id: string): Promise<LibraryItem | undefined> { return this._libraryItems.get(id); }
  async getRecentLibraryItems(limit: number = 10): Promise<LibraryItem[]> {
    return Array.from(this._libraryItems.values())
      .sort((a, b) => new Date(b.accessedAt || b.createdAt).getTime() - new Date(a.accessedAt || a.createdAt).getTime())
      .slice(0, limit);
  }
  async createLibraryItem(insertItem: InsertLibraryItem): Promise<LibraryItem> {
    const id = randomUUID();
    const item: LibraryItem = { ...insertItem, id, createdAt: new Date().toISOString() };
    this._libraryItems.set(id, item);
    return item;
  }
  async updateLibraryItem(id: string, updates: Partial<InsertLibraryItem>): Promise<LibraryItem | undefined> {
    const item = this._libraryItems.get(id);
    if (!item) return undefined;
    const updated: LibraryItem = { ...item, ...updates };
    this._libraryItems.set(id, updated);
    return updated;
  }
  async deleteLibraryItem(id: string): Promise<boolean> { return this._libraryItems.delete(id); }
  async searchLibraryItems(query: string): Promise<LibraryItem[]> {
    if (!query?.trim()) return [];
    const q = query.toLowerCase();
    return Array.from(this._libraryItems.values()).filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.content?.toLowerCase().includes(q) ||
      item.summary?.toLowerCase().includes(q) ||
      item.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  // ─── Phase 2: Journal ──────────────────────────────────────────────────────

  async getJournalEntries(limit: number = 50, type?: string): Promise<JournalEntry[]> {
    let entries = Array.from(this._journalEntries.values());
    if (type) entries = entries.filter(e => e.type === type);
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  }
  async getJournalEntry(id: string): Promise<JournalEntry | undefined> { return this._journalEntries.get(id); }
  async createJournalEntry(insertEntry: InsertJournalEntry): Promise<JournalEntry> {
    const id = randomUUID();
    const entry: JournalEntry = { ...insertEntry, id, createdAt: new Date().toISOString() };
    this._journalEntries.set(id, entry);
    return entry;
  }
  async updateJournalEntry(id: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    const entry = this._journalEntries.get(id);
    if (!entry) return undefined;
    const updated: JournalEntry = { ...entry, ...updates };
    this._journalEntries.set(id, updated);
    return updated;
  }
  async getJournalEntriesSince(since: string): Promise<JournalEntry[]> {
    const sinceTime = new Date(since).getTime();
    return Array.from(this._journalEntries.values())
      .filter(e => new Date(e.createdAt).getTime() >= sinceTime)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

// ─── Database Storage Implementation ─────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    this.db = drizzle(pool);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username));
    return result[0];
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user = { ...insertUser, id };
    await this.db.insert(users).values(user);
    return user;
  }

  async getConnections(): Promise<Connection[]> {
    const result = await this.db.select().from(connections);
    return result.map(c => ({ ...c, provider: c.provider as Connection["provider"], apiKey: c.apiKey ?? undefined, isDefault: c.isDefault ?? false }));
  }
  async getConnection(id: string): Promise<Connection | undefined> {
    const result = await this.db.select().from(connections).where(eq(connections.id, id));
    if (!result[0]) return undefined;
    const c = result[0];
    return { ...c, provider: c.provider as Connection["provider"], apiKey: c.apiKey ?? undefined, isDefault: c.isDefault ?? false };
  }
  async getDefaultConnection(): Promise<Connection | undefined> {
    const result = await this.db.select().from(connections).where(eq(connections.isDefault, true));
    if (!result[0]) return undefined;
    const c = result[0];
    return { ...c, provider: c.provider as Connection["provider"], apiKey: c.apiKey ?? undefined, isDefault: c.isDefault ?? false };
  }
  async createConnection(insertConnection: InsertConnection): Promise<Connection> {
    const id = randomUUID();
    if (insertConnection.isDefault) {
      await this.db.update(connections).set({ isDefault: false }).where(eq(connections.isDefault, true));
    }
    const apiKey = insertConnection.apiKey?.trim() || null;
    const connection = { id, name: insertConnection.name, provider: insertConnection.provider, endpoint: insertConnection.endpoint, apiKey, defaultModel: insertConnection.defaultModel, isDefault: insertConnection.isDefault ?? false };
    console.log("Inserting connection:", JSON.stringify(connection));
    await this.db.insert(connections).values(connection);
    return { ...insertConnection, id, isDefault: connection.isDefault };
  }
  async updateConnection(id: string, updates: Partial<InsertConnection>): Promise<Connection | undefined> {
    const existing = await this.getConnection(id);
    if (!existing) return undefined;
    if (updates.isDefault) {
      await this.db.update(connections).set({ isDefault: false }).where(eq(connections.isDefault, true));
    }
    await this.db.update(connections).set({ ...updates, apiKey: updates.apiKey ?? null }).where(eq(connections.id, id));
    return { ...existing, ...updates };
  }
  async deleteConnection(id: string): Promise<boolean> {
    const result = await this.db.delete(connections).where(eq(connections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getProjects(): Promise<Project[]> {
    const result = await this.db.select().from(projects).orderBy(desc(projects.createdAt));
    return result.map(p => ({ ...p, description: p.description ?? undefined, connectionId: p.connectionId ?? undefined, systemPrompt: p.systemPrompt ?? undefined, folderPath: p.folderPath ?? undefined }));
  }
  async getProject(id: string): Promise<Project | undefined> {
    const result = await this.db.select().from(projects).where(eq(projects.id, id));
    if (!result[0]) return undefined;
    const p = result[0];
    return { ...p, description: p.description ?? undefined, connectionId: p.connectionId ?? undefined, systemPrompt: p.systemPrompt ?? undefined, folderPath: p.folderPath ?? undefined };
  }
  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await this.db.insert(projects).values({ ...insertProject, id, createdAt, description: insertProject.description ?? null, connectionId: insertProject.connectionId ?? null, systemPrompt: insertProject.systemPrompt ?? null });
    return { ...insertProject, id, createdAt };
  }
  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const existing = await this.getProject(id);
    if (!existing) return undefined;
    await this.db.update(projects).set(updates).where(eq(projects.id, id));
    return { ...existing, ...updates };
  }
  async deleteProject(id: string): Promise<boolean> {
    await this.db.delete(conversations).where(eq(conversations.projectId, id));
    const result = await this.db.delete(projects).where(eq(projects.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getConversations(projectId?: string): Promise<Conversation[]> {
    const result = projectId !== undefined
      ? await this.db.select().from(conversations).where(eq(conversations.projectId, projectId)).orderBy(desc(conversations.updatedAt))
      : await this.db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    return result.map(c => ({ ...c, projectId: c.projectId ?? undefined, connectionId: c.connectionId ?? undefined, messages: (c.messages as Message[]) || [] }));
  }
  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await this.db.select().from(conversations).where(eq(conversations.id, id));
    if (!result[0]) return undefined;
    const c = result[0];
    return { ...c, projectId: c.projectId ?? undefined, connectionId: c.connectionId ?? undefined, messages: (c.messages as Message[]) || [] };
  }
  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.insert(conversations).values({ ...insertConversation, id, messages: [], createdAt: now, updatedAt: now, projectId: insertConversation.projectId ?? null, connectionId: insertConversation.connectionId ?? null });
    return { ...insertConversation, id, messages: [], createdAt: now, updatedAt: now };
  }
  async updateConversation(id: string, updates: Partial<Pick<Conversation, 'title' | 'messages' | 'model' | 'projectId'>>): Promise<Conversation | undefined> {
    const existing = await this.getConversation(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    await this.db.update(conversations).set({ ...updates, updatedAt: now }).where(eq(conversations.id, id));
    return { ...existing, ...updates, updatedAt: now };
  }
  async deleteConversation(id: string): Promise<boolean> {
    const result = await this.db.delete(conversations).where(eq(conversations.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async addMessageToConversation(id: string, message: Message): Promise<Conversation | undefined> {
    const existing = await this.getConversation(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const newMessages = [...existing.messages, { ...message, createdAt: now }];
    await this.db.update(conversations).set({ messages: newMessages, updatedAt: now }).where(eq(conversations.id, id));
    return { ...existing, messages: newMessages, updatedAt: now };
  }

  async getMemoryEntries(scope: string, scopeId?: string): Promise<MemoryEntry[]> {
    let result;
    if (scope === "project" && scopeId) {
      result = await this.db.select().from(memoryEntries).where(and(eq(memoryEntries.scope, scope), eq(memoryEntries.projectId, scopeId)));
    } else if (scope === "conversation" && scopeId) {
      result = await this.db.select().from(memoryEntries).where(and(eq(memoryEntries.scope, scope), eq(memoryEntries.conversationId, scopeId)));
    } else {
      result = await this.db.select().from(memoryEntries).where(eq(memoryEntries.scope, scope));
    }
    return result.map(m => ({ ...m, scope: m.scope as MemoryEntry["scope"], projectId: m.projectId ?? undefined, conversationId: m.conversationId ?? undefined, summary: m.summary ?? undefined }));
  }
  async createMemoryEntry(insertEntry: InsertMemoryEntry): Promise<MemoryEntry> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await this.db.insert(memoryEntries).values({ ...insertEntry, id, createdAt, projectId: insertEntry.projectId ?? null, conversationId: insertEntry.conversationId ?? null, summary: insertEntry.summary ?? null });
    return { ...insertEntry, id, createdAt };
  }
  async deleteMemoryEntry(id: string): Promise<boolean> {
    const result = await this.db.delete(memoryEntries).where(eq(memoryEntries.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async clearMemory(scope: string, scopeId?: string): Promise<boolean> {
    if (scope === "global") await this.db.delete(memoryEntries).where(eq(memoryEntries.scope, "global"));
    else if (scope === "project" && scopeId) await this.db.delete(memoryEntries).where(and(eq(memoryEntries.scope, "project"), eq(memoryEntries.projectId, scopeId)));
    else if (scope === "conversation" && scopeId) await this.db.delete(memoryEntries).where(and(eq(memoryEntries.scope, "conversation"), eq(memoryEntries.conversationId, scopeId)));
    return true;
  }

  async getKnowledgeDocuments(projectId?: string): Promise<KnowledgeDocument[]> {
    const result = projectId !== undefined
      ? await this.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.projectId, projectId)).orderBy(desc(knowledgeDocuments.createdAt))
      : await this.db.select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.createdAt));
    return result.map(d => ({ ...d, projectId: d.projectId ?? undefined, chunks: (d.chunks as KnowledgeDocument["chunks"]) || [] }));
  }
  async getKnowledgeDocument(id: string): Promise<KnowledgeDocument | undefined> {
    const result = await this.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    if (!result[0]) return undefined;
    const d = result[0];
    return { ...d, projectId: d.projectId ?? undefined, chunks: (d.chunks as KnowledgeDocument["chunks"]) || [] };
  }
  async createKnowledgeDocument(insertDoc: InsertKnowledgeDocument): Promise<KnowledgeDocument> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await this.db.insert(knowledgeDocuments).values({ ...insertDoc, id, chunks: [], createdAt, projectId: insertDoc.projectId ?? null });
    return { ...insertDoc, id, chunks: [], createdAt };
  }
  async updateKnowledgeDocument(id: string, updates: Partial<KnowledgeDocument>): Promise<KnowledgeDocument | undefined> {
    const existing = await this.getKnowledgeDocument(id);
    if (!existing) return undefined;
    await this.db.update(knowledgeDocuments).set(updates).where(eq(knowledgeDocuments.id, id));
    return { ...existing, ...updates };
  }
  async deleteKnowledgeDocument(id: string): Promise<boolean> {
    const result = await this.db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async searchDocuments(query: string, projectId?: string, topK: number = 3): Promise<{ doc: KnowledgeDocument; chunks: import("@shared/schema").DocumentChunk[] }[]> {
    if (!query?.trim()) return [];
    const docs = await this.getKnowledgeDocuments(projectId);
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (queryTerms.length === 0) return [];
    const results: { doc: KnowledgeDocument; chunks: import("@shared/schema").DocumentChunk[]; score: number }[] = [];
    for (const doc of docs) {
      if (!doc.chunks?.length) continue;
      const matchingChunks: { chunk: import("@shared/schema").DocumentChunk; score: number; position: number }[] = [];
      for (let i = 0; i < doc.chunks.length; i++) {
        const chunk = doc.chunks[i];
        const content = chunk.content.toLowerCase();
        let score = 0;
        for (const term of queryTerms) { if (content.includes(term)) score += 1; }
        if (score > 0) matchingChunks.push({ chunk, score, position: i });
      }
      if (matchingChunks.length > 0) {
        matchingChunks.sort((a, b) => b.score - a.score || a.position - b.position);
        results.push({ doc, chunks: matchingChunks.slice(0, topK).map(m => m.chunk), score: matchingChunks.reduce((s, m) => s + m.score, 0) });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).map(r => ({ doc: r.doc, chunks: r.chunks }));
  }

  async getSettings(): Promise<Settings> {
    const result = await this.db.select().from(settings).where(eq(settings.id, "default"));
    if (!result[0]) return { theme: "system", morningOrientationEnabled: false };
    const s = result[0];
    return {
      defaultConnectionId: s.defaultConnectionId ?? undefined,
      defaultProjectId: s.defaultProjectId ?? undefined,
      theme: (s.theme as Settings["theme"]) ?? "system",
      rootFolder: s.rootFolder ?? undefined,
      libraryPaths: (s.libraryPaths as string[] | null) ?? undefined,
      morningOrientationEnabled: s.morningOrientationEnabled ?? false,
      whisperEndpoint: s.whisperEndpoint ?? undefined,
    };
  }
  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    const existing = await this.getSettings();
    const merged = { ...existing, ...updates };
    const dbRow = {
      id: "default",
      defaultConnectionId: merged.defaultConnectionId ?? null,
      defaultProjectId: merged.defaultProjectId ?? null,
      theme: merged.theme ?? "system",
      rootFolder: merged.rootFolder ?? null,
      libraryPaths: merged.libraryPaths ?? null,
      morningOrientationEnabled: merged.morningOrientationEnabled ?? false,
      whisperEndpoint: merged.whisperEndpoint ?? null,
    };
    await this.db.insert(settings).values(dbRow).onConflictDoUpdate({ target: settings.id, set: dbRow });
    return merged;
  }

  async unifiedSearch(query: string, projectId?: string): Promise<{
    conversations: { id: string; title: string; excerpt: string; matchType: string }[];
    documents: { id: string; title: string; excerpt: string }[];
    memories: { id: string; content: string; scope: string }[];
  }> {
    if (!query?.trim()) return { conversations: [], documents: [], memories: [] };
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (queryTerms.length === 0) return { conversations: [], documents: [], memories: [] };

    const convs: { id: string; title: string; excerpt: string; matchType: string; score: number }[] = [];
    for (const conv of await this.getConversations(projectId)) {
      let score = 0; let matchType = ""; let excerpt = "";
      for (const term of queryTerms) {
        if (conv.title.toLowerCase().includes(term)) { score += 3; matchType = "title"; excerpt = conv.title; }
      }
      for (const msg of conv.messages) {
        if (msg.role === "system") continue;
        const cl = msg.content.toLowerCase();
        for (const term of queryTerms) {
          if (cl.includes(term)) { score += 1; if (!matchType) matchType = "message"; const idx = cl.indexOf(term); excerpt = msg.content.slice(Math.max(0, idx - 30), idx + 80); }
        }
      }
      if (score > 0) convs.push({ id: conv.id, title: conv.title, excerpt, matchType, score });
    }
    convs.sort((a, b) => b.score - a.score);

    const docResults = await this.searchDocuments(query, projectId, 5);
    const documents = docResults.map(({ doc, chunks }) => ({ id: doc.id, title: doc.title, excerpt: chunks[0]?.content.slice(0, 100) + "..." || "" }));

    const memories: { id: string; content: string; scope: string }[] = [];
    for (const mem of await this.getMemoryEntries("global")) {
      const cl = mem.content.toLowerCase();
      if (queryTerms.some(t => cl.includes(t))) memories.push({ id: mem.id, content: mem.content.slice(0, 100), scope: mem.scope });
    }

    return { conversations: convs.slice(0, 5).map(({ score, ...r }) => r), documents, memories: memories.slice(0, 5) };
  }

  // ─── Phase 2: Library ──────────────────────────────────────────────────────

  async getLibraryFolders(parentId?: string | null): Promise<LibraryFolder[]> {
    const result = await this.db.select().from(libraryFolders).orderBy(libraryFolders.name);
    const all = result.map(f => ({ ...f, parentId: f.parentId ?? undefined, description: f.description ?? undefined }));
    if (parentId === undefined) return all;
    return all.filter(f => (parentId === null ? f.parentId == null : f.parentId === parentId));
  }
  async getLibraryFolder(id: string): Promise<LibraryFolder | undefined> {
    const result = await this.db.select().from(libraryFolders).where(eq(libraryFolders.id, id));
    if (!result[0]) return undefined;
    const f = result[0];
    return { ...f, parentId: f.parentId ?? undefined, description: f.description ?? undefined };
  }
  async createLibraryFolder(insertFolder: InsertLibraryFolder): Promise<LibraryFolder> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await this.db.insert(libraryFolders).values({ ...insertFolder, id, createdAt, parentId: insertFolder.parentId ?? null, description: insertFolder.description ?? null });
    return { ...insertFolder, id, createdAt };
  }
  async updateLibraryFolder(id: string, updates: Partial<InsertLibraryFolder>): Promise<LibraryFolder | undefined> {
    const existing = await this.getLibraryFolder(id);
    if (!existing) return undefined;
    await this.db.update(libraryFolders).set(updates).where(eq(libraryFolders.id, id));
    return { ...existing, ...updates };
  }
  async deleteLibraryFolder(id: string): Promise<boolean> {
    await this.db.delete(libraryItems).where(eq(libraryItems.folderId, id));
    const result = await this.db.delete(libraryFolders).where(eq(libraryFolders.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getLibraryItems(folderId?: string | null): Promise<LibraryItem[]> {
    const result = await this.db.select().from(libraryItems).orderBy(desc(libraryItems.createdAt));
    const all = result.map(i => this._mapLibraryItem(i));
    if (folderId === undefined) return all;
    return all.filter(i => (folderId === null ? i.folderId == null : i.folderId === folderId));
  }
  async getLibraryItem(id: string): Promise<LibraryItem | undefined> {
    const result = await this.db.select().from(libraryItems).where(eq(libraryItems.id, id));
    if (!result[0]) return undefined;
    return this._mapLibraryItem(result[0]);
  }
  async getRecentLibraryItems(limit: number = 10): Promise<LibraryItem[]> {
    const result = await this.db.select().from(libraryItems).orderBy(desc(libraryItems.accessedAt)).limit(limit);
    return result.map(i => this._mapLibraryItem(i));
  }
  async createLibraryItem(insertItem: InsertLibraryItem): Promise<LibraryItem> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const row = { ...insertItem, id, createdAt, folderId: insertItem.folderId ?? null, filePath: insertItem.filePath ?? null, mimeType: insertItem.mimeType ?? null, content: insertItem.content ?? null, summary: insertItem.summary ?? null, tags: insertItem.tags ?? null, accessedAt: insertItem.accessedAt ?? null };
    await this.db.insert(libraryItems).values(row);
    return { ...insertItem, id, createdAt };
  }
  async updateLibraryItem(id: string, updates: Partial<InsertLibraryItem>): Promise<LibraryItem | undefined> {
    const existing = await this.getLibraryItem(id);
    if (!existing) return undefined;
    await this.db.update(libraryItems).set(updates).where(eq(libraryItems.id, id));
    return { ...existing, ...updates };
  }
  async deleteLibraryItem(id: string): Promise<boolean> {
    const result = await this.db.delete(libraryItems).where(eq(libraryItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async searchLibraryItems(query: string): Promise<LibraryItem[]> {
    if (!query?.trim()) return [];
    const q = `%${query.toLowerCase()}%`;
    const result = await this.db.select().from(libraryItems).where(
      or(like(sql`lower(${libraryItems.title})`, q), like(sql`lower(coalesce(${libraryItems.content}, ''))`, q), like(sql`lower(coalesce(${libraryItems.summary}, ''))`, q))
    );
    return result.map(i => this._mapLibraryItem(i));
  }
  private _mapLibraryItem(i: typeof libraryItems.$inferSelect): LibraryItem {
    return { ...i, source: i.source as LibraryItem["source"], folderId: i.folderId ?? undefined, filePath: i.filePath ?? undefined, mimeType: i.mimeType ?? undefined, content: i.content ?? undefined, summary: i.summary ?? undefined, tags: (i.tags as string[]) ?? undefined, accessedAt: i.accessedAt ?? undefined };
  }

  // ─── Phase 2: Journal ──────────────────────────────────────────────────────

  async getJournalEntries(limit: number = 50, type?: string): Promise<JournalEntry[]> {
    const result = await this.db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt)).limit(limit);
    const all = result.map(e => this._mapJournalEntry(e));
    return type ? all.filter(e => e.type === type) : all;
  }
  async getJournalEntry(id: string): Promise<JournalEntry | undefined> {
    const result = await this.db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!result[0]) return undefined;
    return this._mapJournalEntry(result[0]);
  }
  async createJournalEntry(insertEntry: InsertJournalEntry): Promise<JournalEntry> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const row = { ...insertEntry, id, createdAt, detail: insertEntry.detail ?? null, relatedPath: insertEntry.relatedPath ?? null, relatedLibraryItemId: insertEntry.relatedLibraryItemId ?? null, relatedConversationId: insertEntry.relatedConversationId ?? null, resolved: insertEntry.resolved ?? false };
    await this.db.insert(journalEntries).values(row);
    return { ...insertEntry, id, createdAt, resolved: insertEntry.resolved ?? false };
  }
  async updateJournalEntry(id: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    const existing = await this.getJournalEntry(id);
    if (!existing) return undefined;
    await this.db.update(journalEntries).set(updates).where(eq(journalEntries.id, id));
    return { ...existing, ...updates };
  }
  async getJournalEntriesSince(since: string): Promise<JournalEntry[]> {
    const result = await this.db.select().from(journalEntries)
      .where(sql`${journalEntries.createdAt} >= ${since}`)
      .orderBy(desc(journalEntries.createdAt));
    return result.map(e => this._mapJournalEntry(e));
  }
  private _mapJournalEntry(e: typeof journalEntries.$inferSelect): JournalEntry {
    return { ...e, type: e.type as JournalEntry["type"], detail: e.detail ?? undefined, relatedPath: e.relatedPath ?? undefined, relatedLibraryItemId: e.relatedLibraryItemId ?? undefined, relatedConversationId: e.relatedConversationId ?? undefined, resolved: e.resolved ?? false };
  }
}

// Use database storage when DATABASE_URL is set, otherwise in-memory
export const storage: IStorage = process.env.DATABASE_URL ? new DatabaseStorage() : new MemStorage();
