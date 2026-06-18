import type { CapabilityDefinition } from "./index";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it in Settings → Secrets to use media capabilities."
    );
  }
  return new OpenAI({ apiKey });
}

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

export const mediaCapabilities: CapabilityDefinition[] = [
  {
    name: "get_youtube_transcript",
    description: "Fetch the transcript/captions of a YouTube video by URL or video ID. The full transcript text is returned so you can summarize, quote, or discuss its content.",
    argsSchema: {
      url: { type: "string", description: "YouTube video URL or 11-character video ID", required: true },
      lang: { type: "string", description: "Preferred language code, e.g. 'en' (default 'en')" },
    },
    async handler(args) {
      const { YoutubeTranscript } = await import("youtube-transcript");
      const input = args.url as string;
      const lang = (args.lang as string) || "en";

      const videoId = extractYouTubeId(input);
      if (!videoId) {
        throw new Error(`Could not extract a YouTube video ID from: ${input}`);
      }

      const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang });

      const text = segments.map((s: any) => s.text).join(" ").replace(/\s+/g, " ").trim();
      const duration = segments.length > 0
        ? Math.round((segments[segments.length - 1] as any).offset / 1000)
        : 0;

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
    description: "Transcribe an audio file to text using OpenAI Whisper. Provide a URL to an audio file (mp3, mp4, wav, m4a, webm, ogg). The full transcript is returned.",
    argsSchema: {
      url: { type: "string", description: "URL to an audio file (mp3, wav, m4a, mp4, webm, ogg)", required: true },
      language: { type: "string", description: "ISO-639-1 language hint, e.g. 'en'. Leave blank for auto-detect." },
    },
    async handler(args) {
      const openai = getOpenAIClient();
      const url = args.url as string;
      const language = args.language as string | undefined;

      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Failed to fetch audio: HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") || "audio/mpeg";
      const buffer = await response.arrayBuffer();
      const ext = url.split(".").pop()?.toLowerCase() || "mp3";
      const filename = `audio.${ext}`;

      const blob = new Blob([buffer], { type: contentType });
      const file = new File([blob], filename, { type: contentType });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        ...(language ? { language } : {}),
      });

      return {
        url,
        transcript: transcription.text,
        detectedLanguage: language || "auto-detected",
      };
    },
  },

  {
    name: "ocr_image",
    description: "Extract all text from an image (OCR). Provide a URL or local file path. Returns the raw text content found in the image.",
    argsSchema: {
      source: { type: "string", description: "URL or absolute local file path to the image", required: true },
    },
    async handler(args, ctx) {
      const openai = getOpenAIClient();
      const source = args.source as string;

      let imageContent: { type: "image_url"; image_url: { url: string } };

      if (source.startsWith("http://") || source.startsWith("https://")) {
        imageContent = { type: "image_url", image_url: { url: source } };
      } else {
        const filePath = ctx.rootFolder
          ? path.resolve(ctx.rootFolder, source)
          : path.resolve(source);
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase() || "png";
        const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        const b64 = data.toString("base64");
        imageContent = { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } };
      }

      const result = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              imageContent,
              { type: "text", text: "Extract all text from this image exactly as it appears. Output only the raw text, preserving layout where possible. If there is no text, say 'No text found.'" },
            ],
          },
        ],
        max_tokens: 2000,
      });

      const extractedText = result.choices[0]?.message?.content || "No text found.";
      return { source, text: extractedText };
    },
  },

  {
    name: "analyze_image",
    description: "Analyze or describe an image or screenshot. Provide a URL or local file path and an optional prompt. Returns a detailed description or answer to your question about the image.",
    argsSchema: {
      source: { type: "string", description: "URL or absolute local file path to the image or screenshot", required: true },
      prompt: { type: "string", description: "What to focus on or ask about the image (default: describe everything)" },
    },
    async handler(args, ctx) {
      const openai = getOpenAIClient();
      const source = args.source as string;
      const prompt = (args.prompt as string) || "Describe this image in detail. If it's a screenshot, describe the UI, content, and any visible text.";

      let imageContent: { type: "image_url"; image_url: { url: string } };

      if (source.startsWith("http://") || source.startsWith("https://")) {
        imageContent = { type: "image_url", image_url: { url: source } };
      } else {
        const filePath = ctx.rootFolder
          ? path.resolve(ctx.rootFolder, source)
          : path.resolve(source);
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase() || "png";
        const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        const b64 = data.toString("base64");
        imageContent = { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } };
      }

      const result = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [imageContent, { type: "text", text: prompt }],
          },
        ],
        max_tokens: 2000,
      });

      const analysis = result.choices[0]?.message?.content || "Could not analyze image.";
      return { source, prompt, analysis };
    },
  },
];
