import { type Connection, type Message } from "@shared/schema";

// A chat message that may carry base64 image data for vision models.
// - `images`: base64-encoded image strings (Ollama native format)
// - For OpenAI-compatible providers the images are converted to content-array
//   format (image_url parts) before the request is sent.
export interface MultimodalMessage {
  role: string;
  content: string;
  images?: string[];       // base64, no data-URI prefix
  imageMimeTypes?: string[]; // parallel to images; defaults to image/jpeg if absent
}

export interface StreamChunk {
  type: "content" | "done" | "error" | "tool_call";
  content?: string;
  error?: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size?: string;
}

export interface ModelsResponse {
  status: "ok" | "offline" | "empty" | "error";
  message?: string;
  models: ModelInfo[];
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

// OpenAI-compatible tool definition format (also accepted by Ollama)
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
}

export interface ModelProvider {
  name: string;
  generateStream(
    messages: Array<MultimodalMessage>,
    model: string,
    onChunk: (chunk: StreamChunk) => void,
    tools?: ToolDefinition[]
  ): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  listModelsWithStatus(): Promise<ModelsResponse>;
  healthCheck(): Promise<boolean>;
  pullModel?(modelName: string, onProgress: (progress: PullProgress) => void): Promise<void>;
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
    messages: Array<MultimodalMessage>,
    model: string,
    onChunk: (chunk: StreamChunk) => void,
    _tools?: ToolDefinition[]
  ): Promise<void> {
    // Convert MultimodalMessage[] to OpenAI content-array format when images present
    const openaiMessages = messages.map((msg) => {
      if (!msg.images || msg.images.length === 0) {
        return { role: msg.role, content: msg.content };
      }
      const contentParts: Array<Record<string, unknown>> = [
        { type: "text", text: msg.content },
        ...msg.images.map((b64, i) => ({
          type: "image_url",
          image_url: { url: `data:${msg.imageMimeTypes?.[i] ?? "image/jpeg"};base64,${b64}` },
        })),
      ];
      return { role: msg.role, content: contentParts };
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
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
    const result = await this.listModelsWithStatus();
    return result.models;
  }

  async listModelsWithStatus(): Promise<ModelsResponse> {
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      if (!response.ok) {
        return { status: "error", message: `API returned ${response.status}`, models: [] };
      }
      const data = await response.json();
      const models = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: "openai",
      }));
      if (models.length === 0) {
        return { status: "empty", message: "No models available", models: [] };
      }
      return { status: "ok", models };
    } catch (error: any) {
      return { status: "offline", message: "Cannot connect to OpenAI API", models: [] };
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
    messages: Array<MultimodalMessage>,
    model: string,
    onChunk: (chunk: StreamChunk) => void,
    tools?: ToolDefinition[]
  ): Promise<void> {
    try {
      // Ollama natively supports an `images` field per message; pass it through as-is
      const body: Record<string, unknown> = { model, messages, stream: true };
      if (tools && tools.length > 0) body.tools = tools;

      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

            // Native Jinja tool calls — Ollama parses the model's native format
            // and surfaces them as structured tool_calls (no text parsing needed)
            if (parsed.message?.tool_calls?.length > 0) {
              for (const tc of parsed.message.tool_calls) {
                if (tc.function?.name) {
                  onChunk({
                    type: "tool_call",
                    toolCall: {
                      name: tc.function.name,
                      args: tc.function.arguments ?? {},
                    },
                  });
                }
              }
            }

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
    const result = await this.listModelsWithStatus();
    return result.models;
  }

  async listModelsWithStatus(): Promise<ModelsResponse> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`);
      if (!response.ok) {
        return { status: "error", message: `Ollama returned ${response.status}`, models: [] };
      }
      const data = await response.json();
      const models = (data.models || []).map((m: any) => {
        const sizeGB = m.size ? (m.size / 1e9).toFixed(1) + "GB" : undefined;
        return {
          id: m.name,
          name: m.name,
          provider: "ollama",
          size: sizeGB,
        };
      });
      if (models.length === 0) {
        return {
          status: "empty",
          message: "Ollama is running but no models are installed. Download a model to get started.",
          models: [],
        };
      }
      return { status: "ok", models };
    } catch (error: any) {
      return {
        status: "offline",
        message: "Cannot connect to Ollama. Make sure Ollama is running on your system.",
        models: [],
      };
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

  async pullModel(modelName: string, onProgress: (progress: PullProgress) => void): Promise<void> {
    const response = await fetch(`${this.endpoint}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to pull model: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
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
          onProgress({
            status: parsed.status || "downloading",
            digest: parsed.digest,
            total: parsed.total,
            completed: parsed.completed,
          });
          if (parsed.status === "success") {
            return;
          }
        } catch {
          // Skip invalid JSON
        }
      }
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
    messages: Array<MultimodalMessage>,
    model: string,
    onChunk: (chunk: StreamChunk) => void,
    tools?: ToolDefinition[]
  ): Promise<void> {
    const openaiProvider = new OpenAIProvider({
      id: "temp",
      name: "temp",
      provider: "lmstudio",
      endpoint: this.endpoint,
      defaultModel: model,
      isDefault: false,
      orderIndex: 0,
    });
    return openaiProvider.generateStream(messages, model, onChunk, tools);
  }

  async listModels(): Promise<ModelInfo[]> {
    const result = await this.listModelsWithStatus();
    return result.models;
  }

  async listModelsWithStatus(): Promise<ModelsResponse> {
    try {
      const response = await fetch(`${this.endpoint}/models`);
      if (!response.ok) {
        return { status: "error", message: `LM Studio returned ${response.status}`, models: [] };
      }
      const data = await response.json();
      const models = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: "lmstudio",
      }));
      if (models.length === 0) {
        return {
          status: "empty",
          message: "LM Studio is running but no models are loaded. Load a model in LM Studio to continue.",
          models: [],
        };
      }
      return { status: "ok", models };
    } catch (error: any) {
      return {
        status: "offline",
        message: "Cannot connect to LM Studio. Make sure LM Studio is running with the local server enabled.",
        models: [],
      };
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
      return new OpenAIProvider(connection);
    default:
      throw new Error(`Unknown provider: ${connection.provider}`);
  }
}
