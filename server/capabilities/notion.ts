// Notion integration — dual-path:
//   1. Inside Replit: uses @replit/connectors-sdk proxy (token refresh automatic)
//   2. Native / Docker: uses NOTION_TOKEN env var, calls api.notion.com directly
import type { CapabilityDefinition } from "./index";

const NOTION_API = "https://api.notion.com";
const NOTION_VERSION = "2022-06-28";

// ── Transport abstraction ─────────────────────────────────────────────────────

async function notionFetch(
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<Response> {
  const token = process.env.NOTION_TOKEN;

  if (token) {
    // Native path: call Notion API directly with the integration token
    return fetch(`${NOTION_API}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: options.body,
    });
  }

  // Replit path: proxy through connectors-sdk (handles token refresh)
  try {
    const { ReplitConnectors } = await import("@replit/connectors-sdk");
    const connectors = new ReplitConnectors();
    return connectors.proxy("notion", path, {
      method: options.method ?? "GET",
      body: options.body,
    }) as Promise<Response>;
  } catch {
    throw new Error(
      "Notion not configured. Set NOTION_TOKEN in your environment, or connect Notion via Replit Integrations.",
    );
  }
}

// ── Connectivity probe (cached 5 min) ─────────────────────────────────────────

let _notionProbeCache: { connected: boolean; at: number } | null = null;
const NOTION_PROBE_TTL = 5 * 60_000;

export async function probeNotionConnected(): Promise<boolean> {
  if (_notionProbeCache && Date.now() - _notionProbeCache.at < NOTION_PROBE_TTL) {
    return _notionProbeCache.connected;
  }
  try {
    const res = await Promise.race([
      notionFetch("/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: "", page_size: 1 }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000),
      ),
    ]);
    const connected = (res as Response).status < 500;
    _notionProbeCache = { connected, at: Date.now() };
    return connected;
  } catch {
    _notionProbeCache = { connected: false, at: Date.now() };
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Capabilities ──────────────────────────────────────────────────────────────

export const notionCapabilities: CapabilityDefinition[] = [
  {
    name: "notion_search",
    description:
      "Search your Notion workspace for pages and databases by title or content. Returns: query, results array (each with id, type, title, url, lastEdited), and total count.",
    requires: { notion: true },
    argsSchema: {
      query: { type: "string", description: "Search query", required: true },
      maxResults: { type: "number", description: "Max results to return (default 10)" },
    },
    async handler(args) {
      const maxResults = Math.min((args.maxResults as number) || 10, 20);
      const res = await notionFetch("/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: args.query as string, page_size: maxResults }),
      });
      if (!res.ok) throw new Error(`Notion search failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as any;
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
    description:
      "Read the full content of a Notion page. Returns: id, title, url, lastEdited, content (plain text, up to 12 000 chars), and truncated flag if content was cut.",
    requires: { notion: true },
    argsSchema: {
      pageId: { type: "string", description: "Notion page ID or page URL", required: true },
    },
    async handler(args) {
      let id = (args.pageId as string).trim();
      const urlMatch =
        id.match(/([a-f0-9]{32})(?:[?#]|$)/i) ??
        id.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (urlMatch) id = urlMatch[1].replace(/-/g, "");

      const pageRes = await notionFetch(`/v1/pages/${id}`, { method: "GET" });
      if (!pageRes.ok)
        throw new Error(`Failed to get page: ${pageRes.status} ${await pageRes.text()}`);
      const page = (await pageRes.json()) as any;

      const blocksRes = await notionFetch(`/v1/blocks/${id}/children?page_size=100`, {
        method: "GET",
      });
      if (!blocksRes.ok)
        throw new Error(`Failed to get page content: ${blocksRes.status}`);
      const blocks = (await blocksRes.json()) as any;

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
    description:
      "Create a new Notion page under a parent page or database. Requires user confirmation. Returns: id, title, and url of the new page.",
    requiresConfirmation: true,
    requires: { notion: true },
    argsSchema: {
      parentId: { type: "string", description: "Parent page ID or database ID", required: true },
      title: { type: "string", description: "Page title", required: true },
      content: {
        type: "string",
        description: "Page body (plain text, becomes a paragraph block)",
      },
    },
    async handler(args) {
      const children = args.content
        ? [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: (args.content as string).slice(0, 2000) },
                  },
                ],
              },
            },
          ]
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

      const res = await notionFetch("/v1/pages", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok)
        throw new Error(`Failed to create page: ${res.status} ${await res.text()}`);
      const page = (await res.json()) as any;
      return { id: page.id, title: args.title, url: page.url };
    },
  },

  {
    name: "notion_query_database",
    description:
      "Query a Notion database and return its rows. Returns: databaseId, rows array (each with id, title, url, lastEdited, and all property values), total count, and hasMore flag.",
    requires: { notion: true },
    argsSchema: {
      databaseId: { type: "string", description: "Notion database ID", required: true },
      filter: {
        type: "string",
        description: "Optional JSON filter string (Notion filter object)",
      },
      maxResults: { type: "number", description: "Max rows to return (default 20)" },
    },
    async handler(args) {
      const maxResults = Math.min((args.maxResults as number) || 20, 50);
      const body: any = { page_size: maxResults };
      if (args.filter) {
        try {
          body.filter = JSON.parse(args.filter as string);
        } catch {}
      }
      const res = await notionFetch(`/v1/databases/${args.databaseId}/query`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok)
        throw new Error(`Failed to query database: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as any;
      const rows = (data.results ?? []).map((item: any) => ({
        id: item.id,
        title: extractPageTitle(item),
        url: item.url,
        lastEdited: item.last_edited_time,
        properties: Object.fromEntries(
          Object.entries(item.properties ?? {}).map(([k, v]: [string, any]) => {
            let val: unknown = null;
            if (v.type === "title") val = v.title?.map((t: any) => t.plain_text).join("") ?? "";
            else if (v.type === "rich_text")
              val = v.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
            else if (v.type === "number") val = v.number;
            else if (v.type === "select") val = v.select?.name;
            else if (v.type === "multi_select") val = v.multi_select?.map((s: any) => s.name);
            else if (v.type === "checkbox") val = v.checkbox;
            else if (v.type === "date") val = v.date?.start;
            else if (v.type === "url") val = v.url;
            else if (v.type === "email") val = v.email;
            return [k, val];
          }),
        ),
      }));
      return { databaseId: args.databaseId, rows, total: rows.length, hasMore: data.has_more };
    },
  },

  {
    name: "notion_append_block",
    description:
      "Append a paragraph of text to an existing Notion page. Requires user confirmation. Returns: success: true and the pageId.",
    requiresConfirmation: true,
    requires: { notion: true },
    argsSchema: {
      pageId: { type: "string", description: "Notion page ID to append to", required: true },
      content: {
        type: "string",
        description: "Text to append as a paragraph",
        required: true,
      },
    },
    async handler(args) {
      const body = {
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: (args.content as string).slice(0, 2000) },
                },
              ],
            },
          },
        ],
      };
      const res = await notionFetch(`/v1/blocks/${args.pageId}/children`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok)
        throw new Error(`Failed to append to page: ${res.status} ${await res.text()}`);
      return { success: true, pageId: args.pageId };
    },
  },
];
