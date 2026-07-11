import type { CapabilityDefinition } from "./index";

export const libraryCapabilities: CapabilityDefinition[] = [
  {
    name: "search_library",
    description: "Search the library for saved items — notes, files, URLs, and documents. Uses keyword search across titles, content, summaries, and tags.",
    argsSchema: {
      query: { type: "string", description: "Search query — describe what you're looking for", required: true },
    },
    async handler(args, ctx) {
      if (!ctx.storageRef) throw new Error("Storage not available");
      const query = args.query as string;

      const libraryResults = await ctx.storageRef.searchLibraryItems(query);

      return {
        query,
        library_items: libraryResults.slice(0, 10).map(item => ({
          id: item.id,
          title: item.title,
          source: item.source,
          summary: item.summary,
          filePath: item.filePath,
          tags: item.tags,
          accessedAt: item.accessedAt,
          createdAt: item.createdAt,
        })),
        total_found: libraryResults.length,
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
