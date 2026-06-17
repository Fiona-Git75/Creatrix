import type { CapabilityDefinition } from "./index";

export const libraryCapabilities: CapabilityDefinition[] = [
  {
    name: "search_library",
    description: "Search the local library for documents, notes, and files by title, content, or tags.",
    argsSchema: {
      query: { type: "string", description: "Search query", required: true },
    },
    async handler(args, ctx) {
      if (!ctx.storageRef) throw new Error("Storage not available");
      const results = await ctx.storageRef.searchLibraryItems(args.query as string);
      return {
        query: args.query,
        results: results.map(item => ({
          id: item.id,
          title: item.title,
          source: item.source,
          summary: item.summary,
          filePath: item.filePath,
          tags: item.tags,
          accessedAt: item.accessedAt,
          createdAt: item.createdAt,
        })),
        count: results.length,
      };
    },
  },

  {
    name: "save_conversation",
    description: "Save the current conversation summary to the library as a note.",
    argsSchema: {
      title: { type: "string", description: "Title for the saved note", required: true },
      summary: { type: "string", description: "Summary or content to save", required: true },
      conversationId: { type: "string", description: "ID of the conversation being saved" },
      folderId: { type: "string", description: "Library folder to save into (optional)" },
    },
    async handler(args, ctx) {
      if (!ctx.storageRef) throw new Error("Storage not available");
      const item = await ctx.storageRef.createLibraryItem({
        title: args.title as string,
        source: "note",
        content: args.summary as string,
        summary: (args.summary as string).slice(0, 200),
        folderId: args.folderId as string | undefined,
      });

      // Also log to the journal
      await ctx.storageRef.createJournalEntry({
        type: "created",
        title: `Saved conversation: ${args.title}`,
        detail: `Saved to library${args.folderId ? " in a folder" : ""}`,
        relatedLibraryItemId: item.id,
        relatedConversationId: args.conversationId as string | undefined,
        resolved: false,
      });

      return { itemId: item.id, title: item.title, saved: true };
    },
  },
];
