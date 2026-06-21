import type { CapabilityDefinition } from "./index";

export const libraryCapabilities: CapabilityDefinition[] = [
  {
    name: "search_library",
    description: "Search the knowledge base and library for documents, notes, and files. Uses semantic (meaning-based) search when available, falling back to keyword search.",
    argsSchema: {
      query: { type: "string", description: "Search query — describe what you're looking for, not just keywords", required: true },
      projectId: { type: "string", description: "Limit search to a specific project (optional)" },
    },
    async handler(args, ctx) {
      if (!ctx.storageRef) throw new Error("Storage not available");
      const query = args.query as string;
      const projectId = args.projectId as string | undefined;

      // Semantic search over knowledge documents (chunks)
      const docResults = await ctx.storageRef.searchDocuments(query, projectId, 5);

      // Keyword search over library items (notes, saved files, URLs)
      const libraryResults = await ctx.storageRef.searchLibraryItems(query);

      return {
        query,
        knowledge_documents: docResults.map(({ doc, chunks }) => ({
          id: doc.id,
          title: doc.title,
          source: doc.source,
          projectId: doc.projectId,
          excerpts: chunks.map(c => c.content),
        })),
        library_items: libraryResults.slice(0, 5).map(item => ({
          id: item.id,
          title: item.title,
          source: item.source,
          summary: item.summary,
          filePath: item.filePath,
          tags: item.tags,
          accessedAt: item.accessedAt,
          createdAt: item.createdAt,
        })),
        total_found: docResults.length + libraryResults.length,
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
