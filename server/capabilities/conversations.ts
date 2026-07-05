import type { CapabilityDefinition } from "./index";

export const conversationCapabilities: CapabilityDefinition[] = [
  {
    name: "list_conversations",
    description: "List past conversations, optionally filtered by project. Returns titles, dates, and IDs so you can decide which to read in full.",
    argsSchema: {
      projectId: { type: "string", description: "Filter to a specific project ID (optional — omit for all conversations)" },
      limit: { type: "string", description: "Maximum number of conversations to return (default 20)" },
    },
    async handler(args, ctx) {
      if (!ctx.storageRef) throw new Error("Storage not available");
      const projectId = args.projectId as string | undefined;
      const limit = Math.min(parseInt((args.limit as string) || "20", 10) || 20, 100);

      const all = await ctx.storageRef.getConversations(projectId);
      const sorted = [...all].sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      const sliced = sorted.slice(0, limit);

      return {
        total: all.length,
        showing: sliced.length,
        conversations: sliced.map(c => {
          let msgCount = 0;
          try { msgCount = JSON.parse(c.messages).length; } catch { /* skip */ }
          return {
            id: c.id,
            title: c.title,
            projectId: c.projectId ?? null,
            model: c.model,
            messageCount: msgCount,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          };
        }),
      };
    },
  },

  {
    name: "read_conversation",
    description: "Read the full message history of a past conversation by its ID. Use list_conversations first to find the ID.",
    argsSchema: {
      conversationId: { type: "string", description: "The ID of the conversation to retrieve", required: true },
    },
    async handler(args, ctx) {
      if (!ctx.storageRef) throw new Error("Storage not available");
      const id = args.conversationId as string;
      if (!id) throw new Error("conversationId is required");

      const conv = await ctx.storageRef.getConversation(id);
      if (!conv) return { error: `No conversation found with id: ${id}` };

      let messages: unknown[] = [];
      try { messages = JSON.parse(conv.messages); } catch { /* malformed */ }

      return {
        id: conv.id,
        title: conv.title,
        projectId: conv.projectId ?? null,
        model: conv.model,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages,
      };
    },
  },
];
