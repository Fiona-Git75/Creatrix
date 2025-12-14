import { type User, type InsertUser, type Conversation, type InsertConversation, type Message } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Pick<Conversation, 'title' | 'messages' | 'model'>>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<boolean>;
  addMessageToConversation(id: string, message: Message): Promise<Conversation | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private conversations: Map<string, Conversation>;

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
  }

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

  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort((a, b) => {
      return b.id.localeCompare(a.id);
    });
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const messages: Message[] = (insertConversation.messages as Message[]) || [];
    const conversation: Conversation = {
      id,
      title: insertConversation.title,
      messages,
      model: insertConversation.model || "gpt-4o",
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Pick<Conversation, 'title' | 'messages' | 'model'>>): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    
    const updated: Conversation = { ...conversation, ...updates };
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
      messages: [...conversation.messages, message],
    };
    this.conversations.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
