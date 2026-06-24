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
  type WorkspaceDoc, type InsertWorkspaceDoc,
  type SystemLog,
  type Consultant, type InsertConsultant,
  users, connections, projects, conversations, memoryEntries, knowledgeDocuments, settings,
  libraryFolders, libraryItems, journalEntries, systemLogs, workspaceDocs, consultants,
} from "@shared/schema";
import { getLogs, clearLogs } from "./syslog";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, like, or, desc, sql } from "drizzle-orm";
import pg from "pg";

export interface IStorage {
  // Lifecycle
  initialize?(): Promise<void>;

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

  // ─── Workspace Documents ───────────────────────────────────────────────────
  getWorkspaceDocs(projectId?: string | null): Promise<WorkspaceDoc[]>;
  getWorkspaceDoc(id: string): Promise<WorkspaceDoc | undefined>;
  getWorkspaceDocByTitle(title: string, projectId: string | null): Promise<WorkspaceDoc | undefined>;
  createWorkspaceDoc(doc: InsertWorkspaceDoc): Promise<WorkspaceDoc>;
  updateWorkspaceDoc(id: string, updates: Partial<Pick<WorkspaceDoc, 'title' | 'content'>>): Promise<WorkspaceDoc | undefined>;
  deleteWorkspaceDoc(id: string): Promise<boolean>;

  // ─── System Logs ───────────────────────────────────────────────────────────
  addSystemLog(entry: { level: string; category: string; message: string; detail?: string }): Promise<void>;
  getSystemLogs(opts?: { level?: string; category?: string; limit?: number }): Promise<SystemLog[]>;
  clearSystemLogs(): Promise<void>;
  pruneSystemLogs(olderThanDays: number): Promise<void>;

  // ─── Consultants ───────────────────────────────────────────────────────────
  getConsultants(projectId: string): Promise<Consultant[]>;
  getConsultant(id: string): Promise<Consultant | undefined>;
  createConsultant(consultant: InsertConsultant): Promise<Consultant>;
  updateConsultant(id: string, updates: Partial<InsertConsultant>): Promise<Consultant | undefined>;
  deleteConsultant(id: string): Promise<boolean>;

  // ─── Vector / Semantic Search ──────────────────────────────────────────────
  initVectorStore?(): Promise<void>;
  storeChunkEmbeddings?(docId: string, chunks: { id: string; content: string; embedding: number[] }[]): Promise<void>;
  deleteChunkEmbeddings?(docId: string): Promise<void>;
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
  private _consultants: Map<string, Consultant>;
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
    this._consultants = new Map();
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

  // ─── Workspace Documents ────────────────────────────────────────────────────
  private _workspaceDocs = new Map<string, WorkspaceDoc>();

  async getWorkspaceDocs(projectId?: string | null): Promise<WorkspaceDoc[]> {
    const all = Array.from(this._workspaceDocs.values());
    if (projectId === null) return all.filter(d => !d.projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (projectId === undefined) return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return all.filter(d => d.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getWorkspaceDoc(id: string): Promise<WorkspaceDoc | undefined> { return this._workspaceDocs.get(id); }
  async getWorkspaceDocByTitle(title: string, projectId: string | null): Promise<WorkspaceDoc | undefined> {
    return Array.from(this._workspaceDocs.values()).find(d =>
      d.title.toLowerCase() === title.toLowerCase() && (projectId === null ? !d.projectId : d.projectId === projectId)
    );
  }
  async createWorkspaceDoc(doc: InsertWorkspaceDoc): Promise<WorkspaceDoc> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const created: WorkspaceDoc = { ...doc, id, createdAt: now, updatedAt: now, content: doc.content ?? "", projectId: doc.projectId ?? undefined };
    this._workspaceDocs.set(id, created);
    return created;
  }
  async updateWorkspaceDoc(id: string, updates: Partial<Pick<WorkspaceDoc, 'title' | 'content'>>): Promise<WorkspaceDoc | undefined> {
    const existing = this._workspaceDocs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this._workspaceDocs.set(id, updated);
    return updated;
  }
  async deleteWorkspaceDoc(id: string): Promise<boolean> { return this._workspaceDocs.delete(id); }

  // ─── Consultants ───────────────────────────────────────────────────────────
  async getConsultants(projectId: string): Promise<Consultant[]> {
    return Array.from(this._consultants.values()).filter(c => c.projectId === projectId);
  }
  async getConsultant(id: string): Promise<Consultant | undefined> {
    return this._consultants.get(id);
  }
  async createConsultant(insert: InsertConsultant): Promise<Consultant> {
    const id = randomUUID();
    const consultant: Consultant = { ...insert, id, createdAt: new Date().toISOString() };
    this._consultants.set(id, consultant);
    return consultant;
  }
  async updateConsultant(id: string, updates: Partial<InsertConsultant>): Promise<Consultant | undefined> {
    const existing = this._consultants.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this._consultants.set(id, updated);
    return updated;
  }
  async deleteConsultant(id: string): Promise<boolean> {
    return this._consultants.delete(id);
  }

  async addSystemLog(_entry: { level: string; category: string; message: string; detail?: string }): Promise<void> {
    // In-memory mode: syslog buffer already holds the entry
  }
  async getSystemLogs(opts?: { level?: string; category?: string; limit?: number }): Promise<SystemLog[]> {
    return getLogs(opts).map(e => ({
      id: parseInt(e.id),
      timestamp: new Date(e.timestamp),
      level: e.level,
      category: e.category,
      message: e.message,
      detail: e.detail ?? null,
    }));
  }
  async clearSystemLogs(): Promise<void> {
    clearLogs();
  }
  async pruneSystemLogs(_olderThanDays: number): Promise<void> {
    // In-memory mode: no persistence to prune
  }
}

// ─── Database Storage Implementation ─────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private _settings: Settings | null = null;

  constructor() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    this.db = drizzle(pool);
  }

  // Hydrate settings from DB at startup so every subsequent getSettings()
  // call returns the persisted row, never the hardcoded in-memory default.
  async initialize(): Promise<void> {
    const rawUrl = process.env.DATABASE_URL ?? "";
    const maskedUrl = rawUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
    console.log(`[Creatrix] database: ${maskedUrl}`);
    // Read settings with a raw SQL query that lists columns explicitly.
    // This makes startup resilient to schema drift — if schema.ts has new columns
    // that haven't been pushed to the DB yet, we still read everything that exists
    // rather than crashing or silently discarding all persisted data.
    let rawRow: Record<string, any> | null = null;
    try {
      // Probe which optional columns are present, then build a safe SELECT.
      const colCheck = await this.db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'settings'
      `);
      const present = new Set((colCheck.rows as any[]).map((r: any) => r.column_name as string));

      const optionals = ["whisper_endpoint", "search_endpoint", "embedding_model"]
        .filter(c => present.has(c))
        .map(c => `"${c}"`)
        .join(", ");

      const selectSql = `
        SELECT id, default_connection_id, default_project_id, theme,
               root_folder, library_paths, morning_orientation_enabled
               ${optionals ? ", " + optionals : ""}
        FROM settings WHERE id = 'default'
      `;
      const result = await this.db.execute(sql.raw(selectSql));
      rawRow = (result.rows[0] as Record<string, any>) ?? null;
    } catch (err: any) {
      console.warn(`[storage] Settings read failed: ${err.message}`);
    }

    if (!rawRow) {
      // No row yet — insert the canonical defaults
      try {
        await this.db.execute(sql`
          INSERT INTO settings (id, theme, morning_orientation_enabled)
          VALUES ('default', 'system', false)
          ON CONFLICT (id) DO NOTHING
        `);
      } catch {}
      this._settings = { theme: "system", morningOrientationEnabled: false };
    } else {
      this._settings = {
        defaultConnectionId: rawRow.default_connection_id ?? undefined,
        defaultProjectId: rawRow.default_project_id ?? undefined,
        theme: (rawRow.theme as Settings["theme"]) ?? "system",
        rootFolder: rawRow.root_folder ?? undefined,
        libraryPaths: (rawRow.library_paths as string[] | null) ?? undefined,
        morningOrientationEnabled: rawRow.morning_orientation_enabled ?? false,
        whisperEndpoint: rawRow.whisper_endpoint ?? undefined,
        searchEndpoint: rawRow.search_endpoint ?? undefined,
        embeddingModel: rawRow.embedding_model ?? undefined,
      };
    }
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

    // Try semantic search first if chunk_embeddings table has data
    try {
      const { embedText } = await import("./rag/embeddings");
      const queryEmbedding = await embedText(query, this);
      if (queryEmbedding) {
        const vectorStr = `[${queryEmbedding.join(",")}]`;
        const rows = await this.db.execute(
          projectId
            ? sql`SELECT ce.id as chunk_id, ce.document_id, ce.content,
                         1 - (ce.embedding <=> ${vectorStr}::vector) as score
                  FROM chunk_embeddings ce
                  JOIN knowledge_documents kd ON kd.id = ce.document_id
                  WHERE kd.project_id = ${projectId}
                  ORDER BY ce.embedding <=> ${vectorStr}::vector
                  LIMIT ${topK * 3}`
            : sql`SELECT ce.id as chunk_id, ce.document_id, ce.content,
                         1 - (ce.embedding <=> ${vectorStr}::vector) as score
                  FROM chunk_embeddings ce
                  ORDER BY ce.embedding <=> ${vectorStr}::vector
                  LIMIT ${topK * 3}`
        ) as { rows: { chunk_id: string; document_id: string; content: string; score: number }[] };

        if (rows.rows.length > 0) {
          const docIds = [...new Set(rows.rows.map(r => r.document_id))].slice(0, topK);
          const results: { doc: KnowledgeDocument; chunks: import("@shared/schema").DocumentChunk[] }[] = [];
          for (const docId of docIds) {
            const doc = await this.getKnowledgeDocument(docId);
            if (!doc) continue;
            const docChunks = rows.rows
              .filter(r => r.document_id === docId)
              .map(r => ({ id: r.chunk_id, content: r.content, metadata: {} }));
            results.push({ doc, chunks: docChunks });
          }
          return results;
        }
      }
    } catch {
      // pgvector not available or embedding failed — fall through to keyword search
    }

    // Keyword fallback
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
    // Return the in-memory cache populated by initialize().
    // Fall back to a live DB read only if initialize() was never called
    // (e.g. tests or MemStorage fallback paths).
    if (this._settings) return this._settings;
    const result = await this.db.select().from(settings).where(eq(settings.id, "default"));
    if (!result[0]) return { theme: "system", morningOrientationEnabled: false };
    const s = result[0];
    this._settings = {
      defaultConnectionId: s.defaultConnectionId ?? undefined,
      defaultProjectId: s.defaultProjectId ?? undefined,
      theme: (s.theme as Settings["theme"]) ?? "system",
      rootFolder: s.rootFolder ?? undefined,
      libraryPaths: (s.libraryPaths as string[] | null) ?? undefined,
      morningOrientationEnabled: s.morningOrientationEnabled ?? false,
      whisperEndpoint: s.whisperEndpoint ?? undefined,
      searchEndpoint: (s as any).searchEndpoint ?? undefined,
      embeddingModel: (s as any).embeddingModel ?? undefined,
    };
    return this._settings;
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
      searchEndpoint: merged.searchEndpoint ?? null,
    };
    await this.db.insert(settings).values(dbRow).onConflictDoUpdate({ target: settings.id, set: dbRow });
    // Keep the in-memory cache in sync so subsequent getSettings() calls
    // reflect the update without another DB round-trip.
    this._settings = merged;
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

  // ─── Workspace Documents ────────────────────────────────────────────────────
  async getWorkspaceDocs(projectId?: string | null): Promise<WorkspaceDoc[]> {
    let rows;
    if (projectId === null) {
      rows = await this.db.select().from(workspaceDocs).where(sql`${workspaceDocs.projectId} is null`).orderBy(desc(workspaceDocs.updatedAt));
    } else if (projectId === undefined) {
      rows = await this.db.select().from(workspaceDocs).orderBy(desc(workspaceDocs.updatedAt));
    } else {
      rows = await this.db.select().from(workspaceDocs).where(eq(workspaceDocs.projectId, projectId)).orderBy(desc(workspaceDocs.updatedAt));
    }
    return rows.map(r => ({ ...r, projectId: r.projectId ?? undefined }));
  }
  async getWorkspaceDoc(id: string): Promise<WorkspaceDoc | undefined> {
    const rows = await this.db.select().from(workspaceDocs).where(eq(workspaceDocs.id, id));
    if (!rows[0]) return undefined;
    return { ...rows[0], projectId: rows[0].projectId ?? undefined };
  }
  async getWorkspaceDocByTitle(title: string, projectId: string | null): Promise<WorkspaceDoc | undefined> {
    let rows;
    if (projectId === null) {
      rows = await this.db.select().from(workspaceDocs).where(and(sql`lower(${workspaceDocs.title}) = lower(${title})`, sql`${workspaceDocs.projectId} is null`));
    } else {
      rows = await this.db.select().from(workspaceDocs).where(and(sql`lower(${workspaceDocs.title}) = lower(${title})`, eq(workspaceDocs.projectId, projectId)));
    }
    if (!rows[0]) return undefined;
    return { ...rows[0], projectId: rows[0].projectId ?? undefined };
  }
  async createWorkspaceDoc(doc: InsertWorkspaceDoc): Promise<WorkspaceDoc> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row = { id, title: doc.title, content: doc.content ?? "", projectId: doc.projectId ?? null, createdAt: now, updatedAt: now };
    await this.db.insert(workspaceDocs).values(row);
    return { ...row, projectId: row.projectId ?? undefined };
  }
  async updateWorkspaceDoc(id: string, updates: Partial<Pick<WorkspaceDoc, 'title' | 'content'>>): Promise<WorkspaceDoc | undefined> {
    const existing = await this.getWorkspaceDoc(id);
    if (!existing) return undefined;
    const updatedAt = new Date().toISOString();
    await this.db.update(workspaceDocs).set({ ...updates, updatedAt }).where(eq(workspaceDocs.id, id));
    return { ...existing, ...updates, updatedAt };
  }
  async deleteWorkspaceDoc(id: string): Promise<boolean> {
    const result = await this.db.delete(workspaceDocs).where(eq(workspaceDocs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Consultants ───────────────────────────────────────────────────────────
  async getConsultants(projectId: string): Promise<Consultant[]> {
    const rows = await this.db.select().from(consultants).where(eq(consultants.projectId, projectId));
    return rows.map(r => ({ ...r }));
  }
  async getConsultant(id: string): Promise<Consultant | undefined> {
    const rows = await this.db.select().from(consultants).where(eq(consultants.id, id));
    return rows[0] ? { ...rows[0] } : undefined;
  }
  async createConsultant(insert: InsertConsultant): Promise<Consultant> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const row = { ...insert, id, createdAt };
    await this.db.insert(consultants).values(row);
    return row;
  }
  async updateConsultant(id: string, updates: Partial<InsertConsultant>): Promise<Consultant | undefined> {
    const rows = await this.db.update(consultants).set(updates).where(eq(consultants.id, id)).returning();
    return rows[0] ? { ...rows[0] } : undefined;
  }
  async deleteConsultant(id: string): Promise<boolean> {
    const result = await this.db.delete(consultants).where(eq(consultants.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async addSystemLog(entry: { level: string; category: string; message: string; detail?: string }): Promise<void> {
    await this.db.insert(systemLogs).values(entry);
  }
  async getSystemLogs(opts?: { level?: string; category?: string; limit?: number }): Promise<SystemLog[]> {
    const limit = opts?.limit ?? 200;
    let rows = await this.db.select().from(systemLogs)
      .orderBy(desc(systemLogs.timestamp))
      .limit(limit * 4); // over-fetch to allow client-side filter
    if (opts?.level && opts.level !== "all") {
      if (opts.level === "issues") {
        rows = rows.filter(r => r.level === "warn" || r.level === "error");
      } else {
        rows = rows.filter(r => r.level === opts.level);
      }
    }
    if (opts?.category) rows = rows.filter(r => r.category === opts.category);
    return rows.slice(0, limit);
  }
  async clearSystemLogs(): Promise<void> {
    await this.db.delete(systemLogs);
  }
  async pruneSystemLogs(olderThanDays: number): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    await this.db.delete(systemLogs).where(sql`${systemLogs.timestamp} < ${cutoff}`);
  }

  async initVectorStore(): Promise<void> {
    try {
      await this.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

      // Migrate column from vector(1536) → vector(768) if needed.
      // nomic-embed-text (and most local Ollama embedding models) produce 768-dim vectors.
      // OpenAI text-embedding-3-small produces 1536. Since Creatrix is local-first,
      // we default to 768. Existing 1536-dim embeddings are cleared (they'd be
      // incompatible with a local model anyway — re-indexing is automatic on next use).
      await this.db.execute(sql`
        DO $$
        DECLARE
          current_dim integer;
        BEGIN
          SELECT atttypmod INTO current_dim
          FROM pg_attribute
          WHERE attrelid = 'chunk_embeddings'::regclass
            AND attname = 'embedding'
            AND attnum > 0;
          IF current_dim IS NOT NULL AND current_dim <> 768 THEN
            TRUNCATE chunk_embeddings;
            EXECUTE 'ALTER TABLE chunk_embeddings ALTER COLUMN embedding TYPE vector(768)';
          END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$
      `);

      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS chunk_embeddings (
          id VARCHAR(36) PRIMARY KEY,
          document_id VARCHAR(36) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(768)
        )
      `);
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_doc
        ON chunk_embeddings (document_id)
      `);
    } catch {
      // pgvector not installed — semantic search will fall back to keyword search
    }
  }

  async storeChunkEmbeddings(docId: string, chunks: { id: string; content: string; embedding: number[] }[]): Promise<void> {
    for (const chunk of chunks) {
      const vectorStr = `[${chunk.embedding.join(",")}]`;
      await this.db.execute(sql`
        INSERT INTO chunk_embeddings (id, document_id, content, embedding)
        VALUES (${chunk.id}, ${docId}, ${chunk.content}, ${vectorStr}::vector)
        ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding
      `);
    }
  }

  async deleteChunkEmbeddings(docId: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM chunk_embeddings WHERE document_id = ${docId}`);
  }
}

if (!process.env.DATABASE_URL) {
  console.warn(
    "[Creatrix] DATABASE_URL is not set — running with in-memory storage.\n" +
    "  Data will not persist across restarts.\n" +
    "  Set DATABASE_URL in .env (local) or as a Replit secret to enable persistence."
  );
}

export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new MemStorage();
