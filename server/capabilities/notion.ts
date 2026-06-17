// Notion integration via Replit connectors-sdk proxy
// Uses ReplitConnectors.proxy("notion", ...) — token refresh handled automatically
import { ReplitConnectors } from "@replit/connectors-sdk";
import type { CapabilityDefinition } from "./index";

function getConnectors() {
  return new ReplitConnectors();
}

function extractPageTitle(page: any): string {
  if (!page?.properties) return page?.id ?? "Untitled";
  for (const prop of Object.values(page.properties) as any[]) {
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      return prop.title.map((t: any) => t.plain_text).join("") || "Untitled";
    }
  }
  return "Untitled";
}

function blocksToText(blocks: any[]): string {
  return blocks
    .map((block: any) => {
      const type = block.type;
      const content = block[type];
      if (!content) return "";
      if (Array.isArray(content?.rich_text)) {
        return content.rich_text.map((t: any) => t.plain_text).join("");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export const notionCapabilities: CapabilityDefinition[] = [
  {
    name: "notion_search",
    description: "Search your Notion workspace for pages and databases by title or content.",
    argsSchema: {
      query: { type: "string", description: "Search query", required: true },
      maxResults: { type: "number", description: "Max results to return (default 10)" },
    },
    async handler(args) {
      const connectors = getConnectors();
      const maxResults = Math.min((args.maxResults as number) || 10, 20);
      const res = await connectors.proxy("notion", "/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: args.query as string, page_size: maxResults }),
      });
      if (!res.ok) throw new Error(`Notion search failed: ${res.status} ${await res.text()}`);
      const data = await res.json() as any;
      const results = (data.results ?? []).map((item: any) => ({
        id: item.id,
        type: item.object,
        title: extractPageTitle(item),
        url: item.url,
        lastEdited: item.last_edited_time,
      }));
      return { query: args.query, results, total: results.length };
    },
  },

  {
    name: "notion_get_page",
    description: "Read the full content of a Notion page by its ID or URL.",
    argsSchema: {
      pageId: { type: "string", description: "Notion page ID or URL", required: true },
    },
    async handler(args) {
      const connectors = getConnectors();
      // Extract ID from URL if needed
      let id = (args.pageId as string).trim();
      const urlMatch = id.match(/([a-f0-9]{32})(?:[?#]|$)/i) ?? id.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (urlMatch) id = urlMatch[1].replace(/-/g, "");

      // Fetch page metadata
      const pageRes = await connectors.proxy("notion", `/v1/pages/${id}`, { method: "GET" });
      if (!pageRes.ok) throw new Error(`Failed to get page: ${pageRes.status} ${await pageRes.text()}`);
      const page = await pageRes.json() as any;

      // Fetch blocks (content)
      const blocksRes = await connectors.proxy("notion", `/v1/blocks/${id}/children?page_size=100`, { method: "GET" });
      if (!blocksRes.ok) throw new Error(`Failed to get page content: ${blocksRes.status}`);
      const blocks = await blocksRes.json() as any;

      const title = extractPageTitle(page);
      const content = blocksToText(blocks.results ?? []);

      return {
        id,
        title,
        url: page.url,
        lastEdited: page.last_edited_time,
        content: content.slice(0, 12000),
        truncated: content.length > 12000,
      };
    },
  },

  {
    name: "notion_create_page",
    description: "Create a new page in Notion under a parent page or database.",
    requiresConfirmation: true,
    argsSchema: {
      parentId: { type: "string", description: "Parent page ID or database ID to create under", required: true },
      title: { type: "string", description: "Page title", required: true },
      content: { type: "string", description: "Page body content (plain text, becomes a paragraph block)" },
    },
    async handler(args) {
      const connectors = getConnectors();
      const children = args.content
        ? [{
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: (args.content as string).slice(0, 2000) } }],
            },
          }]
        : [];

      const body: any = {
        parent: { page_id: args.parentId as string },
        properties: {
          title: {
            title: [{ type: "text", text: { content: args.title as string } }],
          },
        },
        children,
      };

      const res = await connectors.proxy("notion", "/v1/pages", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed to create page: ${res.status} ${await res.text()}`);
      const page = await res.json() as any;
      return { id: page.id, title: args.title, url: page.url };
    },
  },

  {
    name: "notion_query_database",
    description: "Query a Notion database and return its rows/entries.",
    argsSchema: {
      databaseId: { type: "string", description: "Notion database ID", required: true },
      filter: { type: "string", description: "Optional JSON filter string (Notion filter object)" },
      maxResults: { type: "number", description: "Max results to return (default 20)" },
    },
    async handler(args) {
      const connectors = getConnectors();
      const maxResults = Math.min((args.maxResults as number) || 20, 50);
      const body: any = { page_size: maxResults };
      if (args.filter) {
        try { body.filter = JSON.parse(args.filter as string); } catch {}
      }
      const res = await connectors.proxy("notion", `/v1/databases/${args.databaseId}/query`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed to query database: ${res.status} ${await res.text()}`);
      const data = await res.json() as any;
      const rows = (data.results ?? []).map((item: any) => ({
        id: item.id,
        title: extractPageTitle(item),
        url: item.url,
        lastEdited: item.last_edited_time,
        properties: Object.fromEntries(
          Object.entries(item.properties ?? {}).map(([k, v]: [string, any]) => {
            let val: unknown = null;
            if (v.type === "title") val = v.title?.map((t: any) => t.plain_text).join("") ?? "";
            else if (v.type === "rich_text") val = v.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
            else if (v.type === "number") val = v.number;
            else if (v.type === "select") val = v.select?.name;
            else if (v.type === "multi_select") val = v.multi_select?.map((s: any) => s.name);
            else if (v.type === "checkbox") val = v.checkbox;
            else if (v.type === "date") val = v.date?.start;
            else if (v.type === "url") val = v.url;
            else if (v.type === "email") val = v.email;
            return [k, val];
          })
        ),
      }));
      return { databaseId: args.databaseId, rows, total: rows.length, hasMore: data.has_more };
    },
  },

  {
    name: "notion_append_block",
    description: "Append content (text) to an existing Notion page.",
    requiresConfirmation: true,
    argsSchema: {
      pageId: { type: "string", description: "Notion page ID to append to", required: true },
      content: { type: "string", description: "Text content to append as a paragraph", required: true },
    },
    async handler(args) {
      const connectors = getConnectors();
      const body = {
        children: [{
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: (args.content as string).slice(0, 2000) } }],
          },
        }],
      };
      const res = await connectors.proxy("notion", `/v1/blocks/${args.pageId}/children`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed to append to page: ${res.status} ${await res.text()}`);
      return { success: true, pageId: args.pageId };
    },
  },
];
