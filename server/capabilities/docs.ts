import type { CapabilityDefinition } from "./index";

export const docsCapabilities: CapabilityDefinition[] = [
  {
    name: "list_docs",
    description: "List workspace documents. Returns titles, IDs, and excerpts. Omit projectId for global docs; pass it to scope to a project.",
    argsSchema: {
      projectId: { type: "string", description: "Filter to a specific project (omit for global docs)" },
    },
    handler: async (args, ctx) => {
      if (!ctx.storageRef) throw new Error("No storage available");
      const pid = (args.projectId as string | undefined) ?? ctx.projectId ?? undefined;
      const docs = await ctx.storageRef.getWorkspaceDocs(pid ?? null);
      return docs.map(d => ({
        id: d.id,
        title: d.title,
        projectId: d.projectId,
        updatedAt: d.updatedAt,
        excerpt: d.content.slice(0, 200),
      }));
    },
  },

  {
    name: "read_doc",
    description: "Read the full content of a workspace document by ID. Use list_docs first to find the ID. Returns the title and complete markdown content.",
    argsSchema: {
      docId: { type: "string", description: "Document ID (from list_docs)", required: true },
    },
    handler: async (args, ctx) => {
      if (!ctx.storageRef) throw new Error("No storage available");
      const doc = await ctx.storageRef.getWorkspaceDoc(args.docId as string);
      if (!doc) throw new Error(`Document not found: ${args.docId}`);
      return { id: doc.id, title: doc.title, content: doc.content, updatedAt: doc.updatedAt };
    },
  },

  {
    name: "write_doc",
    description: "Create or overwrite a workspace document by title. If a doc with that title already exists in the same scope, its content is replaced. Returns the document ID.",
    argsSchema: {
      title:     { type: "string", description: "Document title",                                              required: true },
      content:   { type: "string", description: "Full markdown content",                                       required: true },
      projectId: { type: "string", description: "Associate with this project (omit for global scratchpad)" },
    },
    handler: async (args, ctx) => {
      if (!ctx.storageRef) throw new Error("No storage available");
      const title   = args.title   as string;
      const content = args.content as string;
      const pid     = (args.projectId as string | undefined) ?? ctx.projectId ?? undefined;

      const existing = await ctx.storageRef.getWorkspaceDocByTitle(title, pid ?? null);
      if (existing) {
        await ctx.storageRef.updateWorkspaceDoc(existing.id, { content });
        return { id: existing.id, title, created: false };
      }
      const doc = await ctx.storageRef.createWorkspaceDoc({ title, content, projectId: pid });
      return { id: doc.id, title, created: true };
    },
  },

  {
    name: "edit_doc",
    description: "Edit an existing workspace document. action='append' adds to end, 'prepend' adds to start, 'replace' overwrites entirely.",
    argsSchema: {
      docId:   { type: "string", description: "Document ID (from list_docs)", required: true },
      action:  { type: "string", description: "'append' | 'prepend' | 'replace'",           required: true },
      content: { type: "string", description: "Content to add or replace with",              required: true },
    },
    handler: async (args, ctx) => {
      if (!ctx.storageRef) throw new Error("No storage available");
      const doc = await ctx.storageRef.getWorkspaceDoc(args.docId as string);
      if (!doc) throw new Error(`Document not found: ${args.docId}`);

      let newContent: string;
      if (args.action === "append")  newContent = doc.content + "\n\n" + (args.content as string);
      else if (args.action === "prepend") newContent = (args.content as string) + "\n\n" + doc.content;
      else                           newContent = args.content as string;

      await ctx.storageRef.updateWorkspaceDoc(doc.id, { content: newContent });
      return { id: doc.id, title: doc.title, length: newContent.length };
    },
  },
];
