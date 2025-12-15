import { randomUUID } from "crypto";
import type { DocumentChunk } from "@shared/schema";

interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 50;

function splitLongText(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];
  
  const parts: string[] = [];
  let remaining = text;
  
  while (remaining.length > maxSize) {
    let splitIndex = remaining.lastIndexOf(" ", maxSize);
    if (splitIndex === -1 || splitIndex < maxSize / 2) {
      splitIndex = maxSize;
    }
    parts.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }
  
  if (remaining) {
    parts.push(remaining);
  }
  
  return parts;
}

export function chunkText(
  text: string,
  options: ChunkingOptions = {}
): DocumentChunk[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
  } = options;

  if (!text || !text.trim()) return [];

  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const chunks: DocumentChunk[] = [];
  let currentChunk = "";
  let currentPosition = 0;

  const emitChunk = (content: string) => {
    if (content.trim()) {
      chunks.push({
        id: randomUUID(),
        content: content.trim(),
        metadata: { position: String(currentPosition) },
      });
      currentPosition++;
    }
  };

  const getOverlapText = (text: string): string => {
    const words = text.split(/\s+/);
    const overlapWordCount = Math.max(1, Math.ceil(overlapWords(words.length)));
    return words.slice(-overlapWordCount).join(" ");
  };

  const overlapWords = (totalWords: number): number => {
    return Math.min(totalWords, Math.ceil(chunkOverlap / 6));
  };

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    
    if (trimmed.length > chunkSize) {
      if (currentChunk) {
        emitChunk(currentChunk);
        currentChunk = "";
      }
      
      const parts = splitLongText(trimmed, chunkSize - chunkOverlap);
      for (let i = 0; i < parts.length; i++) {
        emitChunk(parts[i]);
      }
      continue;
    }
    
    const combined = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
    
    if (combined.length > chunkSize) {
      const overlap = getOverlapText(currentChunk);
      emitChunk(currentChunk);
      currentChunk = overlap ? overlap + " " + trimmed : trimmed;
    } else {
      currentChunk = combined;
    }
  }

  if (currentChunk.trim()) {
    emitChunk(currentChunk);
  }

  return chunks;
}

export function simpleSearch(
  query: string,
  chunks: DocumentChunk[],
  topK: number = 3
): DocumentChunk[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  
  if (queryTerms.length === 0) return chunks.slice(0, topK);

  const scored = chunks.map((chunk) => {
    const content = chunk.content.toLowerCase();
    let score = 0;
    
    for (const term of queryTerms) {
      const regex = new RegExp(term, "gi");
      const matches = content.match(regex);
      if (matches) {
        score += matches.length;
        if (content.includes(term)) score += 0.5;
      }
    }
    
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}
