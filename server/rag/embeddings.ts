import type { IStorage } from "../storage";

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const OLLAMA_DEFAULT_MODEL   = "nomic-embed-text";

async function embedWithOllama(
  text: string,
  endpoint: string,
  model: string
): Promise<number[] | null> {
  const base = endpoint.replace(/\/$/, "");

  // New Ollama API (>= 0.2):  POST /api/embed  →  { embeddings: [[...]] }
  try {
    const res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }),
    });
    if (res.ok) {
      const data = await res.json() as { embeddings?: number[][] };
      if (data.embeddings?.[0]?.length) return data.embeddings[0];
    }
  } catch {}

  // Legacy Ollama API:  POST /api/embeddings  →  { embedding: [...] }
  try {
    const res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text.slice(0, 8000) }),
    });
    if (res.ok) {
      const data = await res.json() as { embedding?: number[] };
      if (data.embedding?.length) return data.embedding;
    }
  } catch {}

  return null;
}

export async function embedText(text: string, storage: IStorage): Promise<number[] | null> {
  try {
    const [connections, settings] = await Promise.all([
      storage.getConnections(),
      storage.getSettings(),
    ]);

    const embeddingModel = (settings as any).embeddingModel?.trim() || OLLAMA_DEFAULT_MODEL;

    // Local-first: prefer any Ollama connection
    const ollamaConn = connections.find(c => c.provider === "ollama");
    if (ollamaConn) {
      return embedWithOllama(text, ollamaConn.endpoint, embeddingModel);
    }

    // Remote fallback: OpenAI (produces 1536-dim vectors — only works when DB column is vector(1536))
    const openaiConn = connections.find(c => c.provider === "openai" && c.apiKey);
    if (openaiConn) {
      const base = openaiConn.endpoint.replace(/\/$/, "");
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiConn.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: text.slice(0, 8000) }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { data: { embedding: number[] }[] };
      return data.data[0].embedding;
    }

    return null;
  } catch {
    return null;
  }
}

export async function embedChunks(
  chunks: { id: string; content: string }[],
  storage: IStorage
): Promise<{ id: string; content: string; embedding: number[] }[]> {
  const results: { id: string; content: string; embedding: number[] }[] = [];
  for (const chunk of chunks) {
    const embedding = await embedText(chunk.content, storage);
    if (embedding) results.push({ id: chunk.id, content: chunk.content, embedding });
  }
  return results;
}
