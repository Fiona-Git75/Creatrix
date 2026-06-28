/**
 * Tests for image MIME-type detection and OpenAI provider image_url construction.
 *
 * Part 1 — Unit tests for detectMimeTypeFromBase64:
 *   Verifies the magic-byte sniffer returns the correct MIME type for each
 *   supported format (JPEG, PNG, GIF, WebP, BMP) and falls back to image/jpeg
 *   for an unrecognised header.
 *
 * Part 2 — Integration test for OpenAIProvider.generateStream:
 *   Confirms that the provider emits the correct `data:<mime>;base64,…` prefix
 *   for each image when imageMimeTypes is set on a MultimodalMessage.
 *
 * No live network, database, or AI provider is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectMimeTypeFromBase64 } from "@server/capabilities/consultant";
import { OpenAIProvider } from "@server/providers";

// ── Helpers: build minimal base64 strings from magic bytes ───────────────────

function magicBase64(bytes: number[]): string {
  return Buffer.from(bytes).toString("base64");
}

const JPEG_B64 = magicBase64([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_B64  = magicBase64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const GIF_B64  = magicBase64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP_B64 = magicBase64([
  0x52, 0x49, 0x46, 0x46,
  0x24, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);
const BMP_B64    = magicBase64([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00]);
const UNKNOWN_B64 = magicBase64([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

// ── Part 1: detectMimeTypeFromBase64 unit tests ───────────────────────────────

describe("detectMimeTypeFromBase64 — magic-byte MIME detection", () => {
  it("returns image/jpeg for a JPEG header (FF D8 FF)", () => {
    expect(detectMimeTypeFromBase64(JPEG_B64)).toBe("image/jpeg");
  });

  it("returns image/png for a PNG header (89 50 4E 47 0D 0A 1A 0A)", () => {
    expect(detectMimeTypeFromBase64(PNG_B64)).toBe("image/png");
  });

  it("returns image/gif for a GIF header (47 49 46 38)", () => {
    expect(detectMimeTypeFromBase64(GIF_B64)).toBe("image/gif");
  });

  it("returns image/webp for a WebP header (RIFF....WEBP)", () => {
    expect(detectMimeTypeFromBase64(WEBP_B64)).toBe("image/webp");
  });

  it("returns image/bmp for a BMP header (42 4D)", () => {
    expect(detectMimeTypeFromBase64(BMP_B64)).toBe("image/bmp");
  });

  it("falls back to image/jpeg for an unrecognised header", () => {
    expect(detectMimeTypeFromBase64(UNKNOWN_B64)).toBe("image/jpeg");
  });

  it("falls back to image/jpeg for an empty string", () => {
    expect(detectMimeTypeFromBase64("")).toBe("image/jpeg");
  });
});

// ── Part 2: OpenAIProvider integration — correct data URI prefix emitted ──────

type FakeConnection = {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  apiKey: string | null;
  defaultModel: string | null;
  isDefault: boolean;
  orderIndex: number;
  maxImageSizeMb: number | null;
  systemPrompt: string | null;
};

const FAKE_CONN: FakeConnection = {
  id: "conn-1",
  name: "Test OpenAI",
  provider: "openai",
  endpoint: "https://api.openai.test/v1",
  apiKey: "sk-test",
  defaultModel: "gpt-4o",
  isDefault: false,
  orderIndex: 0,
  maxImageSizeMb: null,
  systemPrompt: null,
};

function makeSseStream(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = [
    `data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n`,
    "data: [DONE]\n\n",
  ];
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

describe("OpenAIProvider.generateStream — data URI MIME prefix", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(makeSseStream("ok"), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("emits data:image/png;base64,… when imageMimeTypes contains image/png", async () => {
    const provider = new OpenAIProvider(FAKE_CONN as any);
    const chunks: string[] = [];

    await provider.generateStream(
      [
        {
          role: "user",
          content: "describe this image",
          images: [PNG_B64],
          imageMimeTypes: ["image/png"],
        },
      ],
      "gpt-4o",
      (chunk) => { if (chunk.content) chunks.push(chunk.content); }
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const userMsg = body.messages.find((m: any) => m.role === "user");
    const imagePart = userMsg.content.find((p: any) => p.type === "image_url");
    expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("emits data:image/webp;base64,… when imageMimeTypes contains image/webp", async () => {
    const provider = new OpenAIProvider(FAKE_CONN as any);

    await provider.generateStream(
      [
        {
          role: "user",
          content: "describe this image",
          images: [WEBP_B64],
          imageMimeTypes: ["image/webp"],
        },
      ],
      "gpt-4o",
      vi.fn()
    );

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const userMsg = body.messages.find((m: any) => m.role === "user");
    const imagePart = userMsg.content.find((p: any) => p.type === "image_url");
    expect(imagePart.image_url.url).toMatch(/^data:image\/webp;base64,/);
  });

  it("defaults to data:image/jpeg;base64,… when imageMimeTypes is absent", async () => {
    const provider = new OpenAIProvider(FAKE_CONN as any);

    await provider.generateStream(
      [
        {
          role: "user",
          content: "describe this image",
          images: [JPEG_B64],
        },
      ],
      "gpt-4o",
      vi.fn()
    );

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const userMsg = body.messages.find((m: any) => m.role === "user");
    const imagePart = userMsg.content.find((p: any) => p.type === "image_url");
    expect(imagePart.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("applies the correct MIME type to each image independently in a multi-image message", async () => {
    const provider = new OpenAIProvider(FAKE_CONN as any);

    await provider.generateStream(
      [
        {
          role: "user",
          content: "compare these images",
          images: [PNG_B64, WEBP_B64, JPEG_B64],
          imageMimeTypes: ["image/png", "image/webp", "image/jpeg"],
        },
      ],
      "gpt-4o",
      vi.fn()
    );

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const userMsg = body.messages.find((m: any) => m.role === "user");
    const imageParts = userMsg.content.filter((p: any) => p.type === "image_url");

    expect(imageParts).toHaveLength(3);
    expect(imageParts[0].image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(imageParts[1].image_url.url).toMatch(/^data:image\/webp;base64,/);
    expect(imageParts[2].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });
});
