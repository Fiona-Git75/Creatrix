// ── web.ts — web_search and web_fetch tool definitions ────────────────────────
// The SearXNG HTTP client (callSearXNG) lives in its service file alongside the
// probe and troubleshooting guide. This file only wraps it in an AI tool schema.
// See:  server/runtime/services/searxng.ts

import type { CapabilityDefinition } from "./index";
import { callSearXNG } from "../runtime/services/searxng";

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Search backends ───────────────────────────────────────────────────────────

async function searchViaDDGHtml(
  query: string,
  maxResults: number
): Promise<{ title: string; url: string; snippet: string }[]> {
  // POST to DDG's HTML endpoint — returns real ranked results, no API key needed
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (compatible; Creatrix/1.0)",
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);
  const html = await res.text();

  const titles: { url: string; title: string }[] = [];
  const snippets: string[] = [];

  const titleRe = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let tm: RegExpExecArray | null;
  while ((tm = titleRe.exec(html)) !== null && titles.length < maxResults) {
    titles.push({ url: tm[1], title: stripTags(tm[2]) });
  }

  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(stripTags(sm[1]));
  }

  return titles.slice(0, maxResults).map((t, i) => ({
    title: t.title,
    url: t.url,
    snippet: snippets[i] ?? "",
  }));
}

// ── Bot/challenge page detection ──────────────────────────────────────────────

function detectChallengePage(
  html: string,
  headers: Headers
): { blocked: boolean; reason: string } | null {
  if (headers.get("cf-mitigated") === "challenge") {
    return { blocked: true, reason: "Cloudflare challenge — page requires browser verification" };
  }
  if (
    headers.get("server")?.toLowerCase().includes("cloudflare") &&
    (html.includes("Just a moment") || html.includes("Checking your browser"))
  ) {
    return { blocked: true, reason: "Cloudflare bot challenge — page requires browser verification" };
  }
  const stripped = stripTags(html);
  if (stripped.length < 300) {
    if (/sign in|log in|login required|access denied|403 forbidden/i.test(stripped)) {
      return { blocked: true, reason: "Page requires authentication or login" };
    }
    if (/enable javascript|javascript required/i.test(stripped)) {
      return { blocked: true, reason: "Page requires JavaScript to render — not accessible via fetch" };
    }
  }
  return null;
}

// ── Capabilities ──────────────────────────────────────────────────────────────

export const webCapabilities: CapabilityDefinition[] = [
  {
    name: "web_search",
    description:
      "Search the web and return ranked results. Returns: query, results array (each with title, url, snippet), and source backend. " +
      "Uses your configured SearXNG endpoint if set, otherwise falls back to DuckDuckGo. " +
      "Follow up with retrieve_url to read the full text of any result.",
    argsSchema: {
      query: { type: "string", description: "The search query", required: true },
      maxResults: { type: "number", description: "Max results to return (default 5, max 10)" },
    },
    async handler(args, ctx) {
      const query = args.query as string;
      const maxResults = Math.min((args.maxResults as number) || 5, 10);

      let results: { title: string; url: string; snippet: string }[];
      let source: string;

      if (ctx.searchEndpoint) {
        results = await callSearXNG(ctx.searchEndpoint, query, maxResults);
        source = "SearXNG";
      } else {
        results = await searchViaDDGHtml(query, maxResults);
        source = "DuckDuckGo";
      }

      if (results.length === 0) {
        return {
          query,
          results: [],
          source,
          note: "No results found. Try rephrasing the query, or use retrieve_url to fetch a specific page directly.",
        };
      }

      return { query, results, source };
    },
  },

  {
    name: "retrieve_url",
    description:
      "Fetch and read the text content of a URL. Returns: url, content (plain text), truncated flag, and length. " +
      "Returns blocked: true with blockReason if the page has a bot challenge, paywall, or login wall. " +
      "Only works on publicly accessible, server-rendered pages.",
    argsSchema: {
      url: { type: "string", description: "The URL to retrieve", required: true },
      maxLength: { type: "number", description: "Max characters to return (default 8000, max 20000)" },
    },
    async handler(args) {
      const url = args.url as string;
      const maxLength = Math.min((args.maxLength as number) || 8000, 20000);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Creatrix/1.0)",
          Accept: "text/html,text/plain,*/*",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        if (response.status === 403) {
          return { url, blocked: true, blockReason: "HTTP 403 — access forbidden (bot block or paywall)" };
        }
        if (response.status === 401) {
          return { url, blocked: true, blockReason: "HTTP 401 — authentication required" };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text")) {
        throw new Error(
          `Cannot read content type "${contentType}" — retrieve_url only works on text/html pages.`
        );
      }

      const html = await response.text();

      const challenge = detectChallengePage(html, response.headers);
      if (challenge) {
        return { url, blocked: true, blockReason: challenge.reason };
      }

      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, " ")
        .trim();

      return {
        url,
        content: text.slice(0, maxLength),
        truncated: text.length > maxLength,
        length: text.length,
      };
    },
  },
];
