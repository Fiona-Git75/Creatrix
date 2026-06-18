import type { CapabilityDefinition } from "./index";
import fs from "fs/promises";
import path from "path";

function extractYouTubeId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = re.exec(input);
    if (m) return m[1];
  }
  return null;
}

async function imageToBase64(source: string, rootFolder?: string): Promise<{ dataUrl: string; mime: string }> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/png";
    const mime = ct.split(";")[0].trim();
    return { dataUrl: `data:${mime};base64,${buffer.toString("base64")}`, mime };
  } else {
    const filePath = rootFolder ? path.resolve(rootFolder, source) : path.resolve(source);
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase() || "png";
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return { dataUrl: `data:${mime};base64,${data.toString("base64")}`, mime };
  }
}

export const mediaCapabilities: CapabilityDefinition[] = [
  {
    name: "get_youtube_transcript",
    description: "Fetch the full transcript/captions of a YouTube video by URL or video ID. No API key required — runs locally.",
    argsSchema: {
      url: { type: "string", description: "YouTube video URL or 11-character video ID", required: true },
      lang: { type: "string", description: "Preferred language code, e.g. 'en' (default 'en')" },
    },
    async handler(args) {
      const { YoutubeTranscript } = await import("youtube-transcript");
      const input = args.url as string;
      const lang = (args.lang as string) || "en";

      const videoId = extractYouTubeId(input);
      if (!videoId) throw new Error(`Could not extract a YouTube video ID from: ${input}`);

      const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const text = segments.map((s: any) => s.text).join(" ").replace(/\s+/g, " ").trim();
      const duration = segments.length > 0 ? Math.round((segments[segments.length - 1] as any).offset / 1000) : 0;

      return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        language: lang,
        segmentCount: segments.length,
        durationSeconds: duration,
        transcript: text,
      };
    },
  },

  {
    name: "transcribe_audio",
    description: "Transcribe an audio file to text using a local Whisper server (whisper.cpp). Requires a whisper endpoint configured in Settings. Provide a URL to an audio file.",
    argsSchema: {
      url: { type: "string", description: "URL to an audio file (mp3, wav, m4a, mp4, webm, ogg)", required: true },
      language: { type: "string", description: "ISO-639-1 language hint, e.g. 'en'. Leave blank for auto-detect." },
    },
    async handler(args, ctx) {
      if (!ctx.storageRef) throw new Error("Storage not available.");
      const settings = await ctx.storageRef.getSettings();

      if (!settings.whisperEndpoint) {
        throw new Error(
          "No Whisper endpoint configured. Start a local whisper.cpp server and add its URL in Settings → Whisper Endpoint (e.g. http://localhost:8080/v1)."
        );
      }

      const url = args.url as string;
      const language = args.language as string | undefined;

      const audioRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!audioRes.ok) throw new Error(`Failed to fetch audio: HTTP ${audioRes.status}`);

      const buffer = await audioRes.arrayBuffer();
      const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "mp3";
      const contentType = audioRes.headers.get("content-type") || "audio/mpeg";

      const formData = new FormData();
      formData.append("file", new Blob([buffer], { type: contentType }), `audio.${ext}`);
      formData.append("model", "whisper-1");
      if (language) formData.append("language", language);

      const base = settings.whisperEndpoint.replace(/\/$/, "");
      const transcribeUrl = base.endsWith("/audio/transcriptions")
        ? base
        : `${base}/audio/transcriptions`;

      const response = await fetch(transcribeUrl, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Transcription failed (${response.status}): ${err.slice(0, 200)}`);
      }

      const result = await response.json() as any;
      return {
        url,
        transcript: result.text,
        engine: "Whisper (local)",
      };
    },
  },

  {
    name: "ocr_image",
    description: "Extract all text from an image using local OCR (Tesseract). Fully local — no API key required. Provide a URL or local file path.",
    argsSchema: {
      source: { type: "string", description: "URL or absolute local file path to the image", required: true },
    },
    async handler(args, ctx) {
      const { createWorker } = await import("tesseract.js");
      const source = args.source as string;

      let imageInput: Buffer | string;

      if (source.startsWith("http://") || source.startsWith("https://")) {
        const res = await fetch(source, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`);
        imageInput = Buffer.from(await res.arrayBuffer());
      } else {
        const filePath = ctx.rootFolder ? path.resolve(ctx.rootFolder, source) : path.resolve(source);
        imageInput = await fs.readFile(filePath);
      }

      const worker = await createWorker("eng");
      try {
        const { data } = await worker.recognize(imageInput);
        return {
          source,
          text: data.text.trim(),
          confidence: Math.round(data.confidence),
          engine: "Tesseract (local)",
        };
      } finally {
        await worker.terminate();
      }
    },
  },

  {
    name: "analyze_image",
    description: "Analyze or describe an image or screenshot using your active connection's vision model (e.g. Ollama llava, moondream). Provide a URL or local file path and an optional question.",
    argsSchema: {
      source: { type: "string", description: "URL or absolute local file path to the image or screenshot", required: true },
      prompt: { type: "string", description: "What to ask about the image (default: describe everything)" },
    },
    async handler(args, ctx) {
      if (!ctx.connection) {
        throw new Error("No active connection. Configure one in Settings — for local use, connect to Ollama with a vision model (llava, moondream, etc.).");
      }

      const source = args.source as string;
      const prompt = (args.prompt as string) || "Describe this image in detail. If it is a screenshot, describe the UI, layout, and all visible text.";

      const { dataUrl } = await imageToBase64(source, ctx.rootFolder);

      // Build OpenAI-compatible endpoint — Ollama exposes /v1 for compatibility
      const base = (ctx.connection.endpoint || "https://api.openai.com/v1").replace(/\/$/, "");
      const chatEndpoint =
        ctx.connection.provider === "ollama" && !base.includes("/v1")
          ? `${base}/v1/chat/completions`
          : `${base}/chat/completions`;

      const model = ctx.model || ctx.connection.defaultModel;

      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ctx.connection.apiKey ? { Authorization: `Bearer ${ctx.connection.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: dataUrl } },
                { type: "text", text: prompt },
              ],
            },
          ],
          stream: false,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Vision request failed (${response.status}): ${err.slice(0, 200)}`);
      }

      const data = await response.json() as any;
      const analysis = data.choices?.[0]?.message?.content || "No description returned.";
      return { source, prompt, analysis, model };
    },
  },
];
