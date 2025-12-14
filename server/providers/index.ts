import { type Connection, type Message } from "@shared/schema";

export interface StreamChunk {
  type: "content" | "done" | "error";
  content?: string;
  error?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface ModelProvider {
  name: string;
  generateStream(
    messages: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<boolean>;
}

// OpenAI-compatible provider (works with OpenAI API)
export class OpenAIProvider implements ModelProvider {
  name = "openai";
  private endpoint: string;
  private apiKey?: string;

  constructor(connection: Connection) {
    this.endpoint = connection.endpoint || "https://api.openai.com/v1";
    this.apiKey = connection.apiKey;
  }

  async generateStream(
    messages: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      onChunk({ type: "error", error: `API error: ${error}` });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onChunk({ type: "error", error: "No response body" });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              onChunk({ type: "done" });
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk({ type: "content", content });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
      onChunk({ type: "done" });
    } catch (error: any) {
      onChunk({ type: "error", error: error.message });
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: "openai",
      }));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Ollama provider for local models
export class OllamaProvider implements ModelProvider {
  name = "ollama";
  private endpoint: string;

  constructor(connection: Connection) {
    this.endpoint = connection.endpoint || "http://localhost:11434";
  }

  async generateStream(
    messages: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        onChunk({ type: "error", error: `Ollama error: ${error}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onChunk({ type: "error", error: "No response body" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              onChunk({ type: "content", content: parsed.message.content });
            }
            if (parsed.done) {
              onChunk({ type: "done" });
              return;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
      onChunk({ type: "done" });
    } catch (error: any) {
      onChunk({ type: "error", error: error.message });
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        provider: "ollama",
      }));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// LM Studio provider (OpenAI-compatible)
export class LMStudioProvider implements ModelProvider {
  name = "lmstudio";
  private endpoint: string;

  constructor(connection: Connection) {
    this.endpoint = connection.endpoint || "http://localhost:1234/v1";
  }

  async generateStream(
    messages: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    // LM Studio uses OpenAI-compatible API
    const openaiProvider = new OpenAIProvider({
      id: "temp",
      name: "temp",
      provider: "lmstudio",
      endpoint: this.endpoint,
      defaultModel: model,
      isDefault: false,
    });
    return openaiProvider.generateStream(messages, model, onChunk);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.endpoint}/models`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: "lmstudio",
      }));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/models`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Provider factory
export function createProvider(connection: Connection): ModelProvider {
  switch (connection.provider) {
    case "openai":
      return new OpenAIProvider(connection);
    case "ollama":
      return new OllamaProvider(connection);
    case "lmstudio":
      return new LMStudioProvider(connection);
    case "custom":
      // Custom providers use OpenAI-compatible API by default
      return new OpenAIProvider(connection);
    default:
      throw new Error(`Unknown provider: ${connection.provider}`);
  }
}
