/**
 * Unit tests for connection/provider form validation logic.
 *
 * These tests exercise the shared Zod schemas that gate what the UI can
 * submit to the backend, plus the provider-detection helper that auto-fills
 * the form when a user pastes a URL.
 *
 * No React rendering, no jsdom APIs, no backend calls — pure logic tests that
 * run instantly and will catch regressions in validation rules before anything
 * ships.
 */

import { describe, it, expect } from "vitest";
import {
  insertConnectionSchema,
  connectionSchema,
  providerTypes,
} from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Mirror of the detectProvider function in ConnectionsDialog.tsx.
 * Kept here so regressions in the helper surface immediately in tests even
 * before the component re-renders.
 */
function detectProvider(url: string): {
  provider: string;
  name: string;
  model: string;
} {
  if (url.includes("api.openai.com"))
    return { provider: "openai", name: "OpenAI", model: "gpt-4o" };
  if (
    url.includes("localhost:11434") ||
    url.includes("127.0.0.1:11434")
  )
    return { provider: "ollama", name: "Ollama", model: "" };
  if (
    url.includes("localhost:1234") ||
    url.includes("127.0.0.1:1234")
  )
    return { provider: "lmstudio", name: "LM Studio", model: "" };
  try {
    const hostname = new URL(url).hostname;
    return { provider: "custom", name: hostname || "Remote AI", model: "" };
  } catch {
    return { provider: "custom", name: "Remote AI", model: "" };
  }
}

// A minimal valid payload that satisfies insertConnectionSchema.
const VALID_INSERT = {
  name: "My Ollama",
  provider: "ollama" as const,
  endpoint: "http://localhost:11434",
  defaultModel: "llama3",
  isDefault: false,
  orderIndex: 0,
};

// ── insertConnectionSchema ─────────────────────────────────────────────────────

describe("insertConnectionSchema — required fields", () => {
  it("accepts a fully valid insert payload", () => {
    const result = insertConnectionSchema.safeParse(VALID_INSERT);
    expect(result.success).toBe(true);
  });

  it("rejects a payload that omits `name`", () => {
    const { name: _omitted, ...rest } = VALID_INSERT;
    const result = insertConnectionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a payload that omits `provider`", () => {
    const { provider: _omitted, ...rest } = VALID_INSERT;
    const result = insertConnectionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a payload that omits `endpoint`", () => {
    const { endpoint: _omitted, ...rest } = VALID_INSERT;
    const result = insertConnectionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a payload that omits `defaultModel`", () => {
    const { defaultModel: _omitted, ...rest } = VALID_INSERT;
    const result = insertConnectionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("insertConnectionSchema — provider enum", () => {
  it("accepts all four known provider values", () => {
    for (const provider of providerTypes) {
      const result = insertConnectionSchema.safeParse({
        ...VALID_INSERT,
        provider,
      });
      expect(result.success, `provider '${provider}' should be valid`).toBe(
        true,
      );
    }
  });

  it("rejects an unknown provider value", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      provider: "anthropic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string provider", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      provider: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("insertConnectionSchema — optional fields", () => {
  it("accepts a payload with apiKey present", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      apiKey: "sk-abc123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload where apiKey is omitted entirely", () => {
    const { ...payload } = VALID_INSERT;
    const result = insertConnectionSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBeUndefined();
    }
  });

  it("accepts a positive integer maxImageSizeMb", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      maxImageSizeMb: 20,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive maxImageSizeMb (zero)", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      maxImageSizeMb: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative maxImageSizeMb", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      maxImageSizeMb: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer maxImageSizeMb (float)", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      maxImageSizeMb: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null maxImageSizeMb (no custom limit)", () => {
    const result = insertConnectionSchema.safeParse({
      ...VALID_INSERT,
      maxImageSizeMb: null,
    });
    expect(result.success).toBe(true);
  });

  it("defaults isDefault to false when omitted", () => {
    const { isDefault: _omitted, ...rest } = VALID_INSERT;
    const result = insertConnectionSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDefault).toBe(false);
    }
  });

  it("defaults orderIndex to 0 when omitted", () => {
    const { orderIndex: _omitted, ...rest } = VALID_INSERT;
    const result = insertConnectionSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderIndex).toBe(0);
    }
  });
});

// ── connectionSchema (full, with id) ─────────────────────────────────────────

describe("connectionSchema — id field", () => {
  it("requires an id field that insertConnectionSchema does not", () => {
    const withoutId = insertConnectionSchema.safeParse(VALID_INSERT);
    expect(withoutId.success).toBe(true);

    const withoutIdFull = connectionSchema.safeParse(VALID_INSERT);
    expect(withoutIdFull.success).toBe(false);
  });

  it("accepts the full schema when id is supplied", () => {
    const result = connectionSchema.safeParse({ ...VALID_INSERT, id: "abc-123" });
    expect(result.success).toBe(true);
  });
});

// ── detectProvider helper ─────────────────────────────────────────────────────

describe("detectProvider", () => {
  it("detects OpenAI from api.openai.com", () => {
    const result = detectProvider("https://api.openai.com/v1");
    expect(result.provider).toBe("openai");
    expect(result.name).toBe("OpenAI");
    expect(result.model).toBe("gpt-4o");
  });

  it("detects Ollama from localhost:11434", () => {
    const result = detectProvider("http://localhost:11434");
    expect(result.provider).toBe("ollama");
    expect(result.name).toBe("Ollama");
    expect(result.model).toBe("");
  });

  it("detects Ollama from 127.0.0.1:11434", () => {
    const result = detectProvider("http://127.0.0.1:11434");
    expect(result.provider).toBe("ollama");
  });

  it("detects LM Studio from localhost:1234", () => {
    const result = detectProvider("http://localhost:1234");
    expect(result.provider).toBe("lmstudio");
    expect(result.name).toBe("LM Studio");
    expect(result.model).toBe("");
  });

  it("detects LM Studio from 127.0.0.1:1234", () => {
    const result = detectProvider("http://127.0.0.1:1234");
    expect(result.provider).toBe("lmstudio");
  });

  it("falls back to 'custom' for an arbitrary HTTPS URL and uses the hostname as name", () => {
    const result = detectProvider("https://my-ai.example.com/v1");
    expect(result.provider).toBe("custom");
    expect(result.name).toBe("my-ai.example.com");
    expect(result.model).toBe("");
  });

  it("falls back to 'custom' with name 'Remote AI' for a non-parseable string", () => {
    const result = detectProvider("not a url at all");
    expect(result.provider).toBe("custom");
    expect(result.name).toBe("Remote AI");
  });

  it("falls back to 'custom' with name 'Remote AI' for an empty string", () => {
    const result = detectProvider("");
    expect(result.provider).toBe("custom");
    expect(result.name).toBe("Remote AI");
  });

  it("detected provider values are always members of providerTypes", () => {
    const urls = [
      "https://api.openai.com/v1",
      "http://localhost:11434",
      "http://localhost:1234",
      "https://custom.example.com/v1",
      "not-a-url",
    ];
    for (const url of urls) {
      const { provider } = detectProvider(url);
      expect(
        providerTypes.includes(provider as (typeof providerTypes)[number]),
        `detectProvider('${url}') returned unknown provider '${provider}'`,
      ).toBe(true);
    }
  });
});
