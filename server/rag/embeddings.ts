import type { IStorage } from "../storage";

const EMBEDDING_MODEL = "text-embedding-3-small";

export async function embedText(text: string, storage: IStorage): Promise<number[] | null> {
  try {
    const connections = await storage.getConnections();
    const openaiConn = connections.find(c => c.provider === "openai" && c.apiKey);
    if (!openaiConn) return null;

    const base = openaiConn.endpoint.replace(/\/$/, "");
    const response = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiConn.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
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
