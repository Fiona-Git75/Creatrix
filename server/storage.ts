import { 
  type User, type InsertUser, 
  type Conversation, type InsertConversation, type Message,
  type Project, type InsertProject,
  type Connection, type InsertConnection,
  type MemoryEntry, type InsertMemoryEntry,
  type KnowledgeDocument, type InsertKnowledgeDocument,
  type Settings,
} from "@shared/schema";
import { randomUUID } from "crypto";

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
  deleteKnowledgeDocument(id: string): Promise<boolean>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private connections: Map<string, Connection>;
  private projects: Map<string, Project>;
  private conversations: Map<string, Conversation>;
  private memoryEntries: Map<string, MemoryEntry>;
  private knowledgeDocuments: Map<string, KnowledgeDocument>;
  private settings: Settings;

  constructor() {
    this.users = new Map();
    this.connections = new Map();
    this.projects = new Map();
    this.conversations = new Map();
    this.memoryEntries = new Map();
    this.knowledgeDocuments = new Map();
    this.settings = { theme: "system" };

    // Add default Ollama connection
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
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Connections
  async getConnections(): Promise<Connection[]> {
    return Array.from(this.connections.values());
  }

  async getConnection(id: string): Promise<Connection | undefined> {
    return this.connections.get(id);
  }

  async getDefaultConnection(): Promise<Connection | undefined> {
    return Array.from(this.connections.values()).find(c => c.isDefault);
  }

  async createConnection(insertConnection: InsertConnection): Promise<Connection> {
    const id = randomUUID();
    const connection: Connection = { ...insertConnection, id };
    
    // If this is set as default, unset other defaults
    if (connection.isDefault) {
      for (const [key, conn] of this.connections) {
        if (conn.isDefault) {
          this.connections.set(key, { ...conn, isDefault: false });
        }
      }
    }
    
    this.connections.set(id, connection);
    return connection;
  }

  async updateConnection(id: string, updates: Partial<InsertConnection>): Promise<Connection | undefined> {
    const connection = this.connections.get(id);
    if (!connection) return undefined;
    
    // If setting this as default, unset other defaults
    if (updates.isDefault) {
      for (const [key, conn] of this.connections) {
        if (conn.isDefault && key !== id) {
          this.connections.set(key, { ...conn, isDefault: false });
        }
      }
    }
    
    const updated: Connection = { ...connection, ...updates };
    this.connections.set(id, updated);
    return updated;
  }

  async deleteConnection(id: string): Promise<boolean> {
    return this.connections.delete(id);
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = {
      ...insertProject,
      id,
      createdAt: new Date().toISOString(),
    };
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
    // Also delete associated conversations
    for (const [convId, conv] of this.conversations) {
      if (conv.projectId === id) {
        this.conversations.delete(convId);
      }
    }
    return this.projects.delete(id);
  }

  // Conversations
  async getConversations(projectId?: string): Promise<Conversation[]> {
    let convs = Array.from(this.conversations.values());
    if (projectId !== undefined) {
      convs = convs.filter(c => c.projectId === projectId);
    }
    return convs.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const conversation: Conversation = {
      ...insertConversation,
      id,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Pick<Conversation, 'title' | 'messages' | 'model' | 'projectId'>>): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    
    const updated: Conversation = { 
      ...conversation, 
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.conversations.set(id, updated);
    return updated;
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.conversations.delete(id);
  }

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
    const entry: MemoryEntry = {
      ...insertEntry,
      id,
      createdAt: new Date().toISOString(),
    };
    this.memoryEntries.set(id, entry);
    return entry;
  }

  async deleteMemoryEntry(id: string): Promise<boolean> {
    return this.memoryEntries.delete(id);
  }

  async clearMemory(scope: string, scopeId?: string): Promise<boolean> {
    const toDelete: string[] = [];
    for (const [id, entry] of this.memoryEntries) {
      if (entry.scope === scope) {
        if (scope === "global" || 
            (scope === "project" && entry.projectId === scopeId) ||
            (scope === "conversation" && entry.conversationId === scopeId)) {
          toDelete.push(id);
        }
      }
    }
    toDelete.forEach(id => this.memoryEntries.delete(id));
    return true;
  }

  // Knowledge Documents
  async getKnowledgeDocuments(projectId?: string): Promise<KnowledgeDocument[]> {
    let docs = Array.from(this.knowledgeDocuments.values());
    if (projectId !== undefined) {
      docs = docs.filter(d => d.projectId === projectId);
    }
    return docs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getKnowledgeDocument(id: string): Promise<KnowledgeDocument | undefined> {
    return this.knowledgeDocuments.get(id);
  }

  async createKnowledgeDocument(insertDoc: InsertKnowledgeDocument): Promise<KnowledgeDocument> {
    const id = randomUUID();
    const doc: KnowledgeDocument = {
      ...insertDoc,
      id,
      chunks: [],
      createdAt: new Date().toISOString(),
    };
    this.knowledgeDocuments.set(id, doc);
    return doc;
  }

  async deleteKnowledgeDocument(id: string): Promise<boolean> {
    return this.knowledgeDocuments.delete(id);
  }

  // Settings
  async getSettings(): Promise<Settings> {
    return this.settings;
  }

  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    this.settings = { ...this.settings, ...updates };
    return this.settings;
  }
}

export const storage = new MemStorage();
