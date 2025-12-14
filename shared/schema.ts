import { pgTable, text, varchar, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type Message = z.infer<typeof messageSchema>;

export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: text("title").notNull(),
  messages: jsonb("messages").$type<Message[]>().notNull().default([]),
  model: text("model").notNull().default("gpt-4o"),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export const chatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1),
  model: z.string().default("gpt-4o"),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
