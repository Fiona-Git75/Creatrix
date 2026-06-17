import type { CapabilityDefinition } from "./index";

export const webCapabilities: CapabilityDefinition[] = [
  {
    name: "web_search",
    description: "Search the web for information using a query string.",
    argsSchema: {
      query: { type: "string", description: "The search query", required: true },
      maxResults: { type: "number", description: "Maximum number of results to return (default 5)" },
    },
    async handler(args) {
      const query = encodeURIComponent(args.query as string);
      const maxResults = Math.min((args.maxResults as number) || 5, 10);

      // Use DuckDuckGo Instant Answer API (no key required)
      const ddgUrl = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;

      try {
        const response = await fetch(ddgUrl, {
          headers: { "User-Agent": "ResidentStudy/1.0" },
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as any;

        const results: { title: string; url: string; snippet: string }[] = [];

        // Abstract answer
        if (data.AbstractText) {
          results.push({
            title: data.Heading || "Summary",
            url: data.AbstractURL || "",
            snippet: data.AbstractText,
          });
        }

        // Related topics
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 60),
                url: topic.FirstURL,
                snippet: topic.Text,
              });
            }
          }
        }

        return {
          query: args.query,
          results: results.slice(0, maxResults),
          source: "DuckDuckGo",
        };
      } catch (err: any) {
        throw new Error(`Web search failed: ${err.message}`);
      }
    },
  },

  {
    name: "retrieve_url",
    description: "Fetch and read the text content of a URL.",
    argsSchema: {
      url: { type: "string", description: "The URL to retrieve", required: true },
      maxLength: { type: "number", description: "Max characters to return (default 8000)" },
    },
    async handler(args) {
      const url = args.url as string;
      const maxLength = Math.min((args.maxLength as number) || 8000, 20000);

      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "ResidentStudy/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text")) {
          throw new Error(`Non-text content type: ${contentType}`);
        }

        const html = await response.text();

        // Basic HTML-to-text stripping
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
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
      } catch (err: any) {
        throw new Error(`Failed to retrieve URL: ${err.message}`);
      }
    },
  },
];
