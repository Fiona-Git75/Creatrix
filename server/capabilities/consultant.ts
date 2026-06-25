import { readFileSync } from "fs";
import path from "path";
import type { CapabilityDefinition, CapabilityContext } from "./index";
import { createProvider } from "../providers";
import type { MultimodalMessage } from "../providers";

// ── Per-provider image size limits ───────────────────────────────────────────
// OpenAI enforces a hard 20 MB cap on image payloads.
// Ollama has no API cap but large images consume context tokens rapidly;
// 10 MB is a practical ceiling that avoids silent OOM/timeout failures.
const IMAGE_SIZE_LIMITS: Record<string, number> = {
  openai:   20 * 1024 * 1024,
  ollama:   10 * 1024 * 1024,
  lmstudio: 20 * 1024 * 1024,
  custom:   20 * 1024 * 1024,
};
const DEFAULT_IMAGE_SIZE_LIMIT = 20 * 1024 * 1024;

function checkImageSize(bytes: number, provider: string): void {
  const limit = IMAGE_SIZE_LIMITS[provider] ?? DEFAULT_IMAGE_SIZE_LIMIT;
  if (bytes > limit) {
    const mb      = (bytes          / (1024 * 1024)).toFixed(1);
    const limitMb = (limit          / (1024 * 1024)).toFixed(0);
    throw new Error(
      `Image is too large to send to a vision model (${mb} MB). ` +
      `The limit for ${provider} is ${limitMb} MB. ` +
      `Please resize the image before sharing it.`
    );
  }
}

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".bmp":  "image/bmp",
};

const ALLOWED_IMAGE_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_MIME));

function resolveImagePath(
  filePath: string,
  ctx: Pick<CapabilityContext, "rootFolder" | "libraryPaths">
): string {
  const resolved = path.resolve(filePath);

  // Extension check — reject non-image files before any path check
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(
      `image_path must point to an image file (${Array.from(ALLOWED_IMAGE_EXTENSIONS).join(", ")}). ` +
      `Got extension: "${ext || "(none)"}"`
    );
  }

  // Root boundary check — same logic as filesystem capability's sanitizePath
  const allRoots = [
    ...(ctx.rootFolder ? [path.resolve(ctx.rootFolder)] : []),
    ...(ctx.libraryPaths || []).map(p => path.resolve(p)),
  ];
  if (allRoots.length > 0 && !allRoots.some(root => resolved.startsWith(root + path.sep) || resolved === root)) {
    throw new Error(
      `image_path "${filePath}" is outside all configured library paths (${allRoots.join(", ")}). ` +
      `Only files within the project's root folder or library paths may be shared with consultants.`
    );
  }

  return resolved;
}

export const consultantCapability: CapabilityDefinition = {
  name: "ask_consultant",
  description:
    "Ask a specialist consultant model a question. Each consultant has a dedicated role and context. " +
    "Use this when the user's request benefits from a specialist perspective. " +
    "Available consultants depend on the active project. " +
    "Vision consultants (e.g. Moondream, LLaVA) can analyse images — pass the image via " +
    "`image_base64` (a base64-encoded string) or `image_path` (path to a file within the " +
    "project folder). Provide only one of the two; supplying both is an error.",
  argsSchema: {
    consultant_name: {
      type: "string",
      description: "The exact name of the consultant to ask (as configured in the project)",
      required: true,
    },
    question: {
      type: "string",
      description: "The question or request to send to the consultant",
      required: true,
    },
    image_path: {
      type: "string",
      description:
        "Path to a local image file (within the project root folder or a configured library path) " +
        "to include in the request. Supported formats: jpg, jpeg, png, gif, webp, bmp. " +
        "Mutually exclusive with image_base64.",
      required: false,
    },
    image_base64: {
      type: "string",
      description:
        "Base64-encoded image data (without the data-URI prefix) to include in the request. " +
        "Use this when you already have base64 image content. Mutually exclusive with image_path.",
      required: false,
    },
  },
  async handler(args, ctx) {
    const consultantName = args.consultant_name as string;
    const question = args.question as string;
    const imagePath = args.image_path as string | undefined;
    const imageBase64Arg = args.image_base64 as string | undefined;

    if (!ctx.storageRef) throw new Error("No storage available in capability context");
    if (!ctx.projectId) throw new Error("ask_consultant requires an active project");

    // Mutual exclusivity
    if (imagePath && imageBase64Arg) {
      throw new Error(
        "Provide either image_path or image_base64, not both."
      );
    }

    const allConsultants = await ctx.storageRef.getConsultants(ctx.projectId);
    const consultant = allConsultants.find(c => c.name === consultantName);
    if (!consultant) {
      throw new Error(
        `Consultant "${consultantName}" not found in this project. Available: ${allConsultants.map(c => c.name).join(", ") || "none"}`
      );
    }

    const connection = await ctx.storageRef.getConnection(consultant.connectionId);
    if (!connection) {
      throw new Error(`Connection for consultant "${consultantName}" is no longer configured`);
    }

    // Resolve image data — size-check before encoding to give a clear error
    // rather than a silent API failure or OOM deep in the provider stack.
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    if (imagePath) {
      const safePath = resolveImagePath(imagePath, ctx);
      const ext = path.extname(safePath).toLowerCase();
      imageMimeType = EXTENSION_TO_MIME[ext] ?? "image/jpeg";
      const buf = readFileSync(safePath);
      checkImageSize(buf.byteLength, connection.provider);
      imageBase64 = buf.toString("base64");
    } else if (imageBase64Arg) {
      // Base64 inflates by ~4/3 — reverse to estimate original byte count.
      checkImageSize(Math.ceil(imageBase64Arg.length * 0.75), connection.provider);
      imageBase64 = imageBase64Arg;
    }

    const userMessage: MultimodalMessage = {
      role: "user",
      content: question,
      ...(imageBase64 ? {
        images: [imageBase64],
        imageMimeTypes: [imageMimeType ?? "image/jpeg"],
      } : {}),
    };

    const provider = createProvider(connection);
    const messages: MultimodalMessage[] = [
      { role: "system", content: consultant.systemPrompt },
      userMessage,
    ];

    let answer = "";
    await provider.generateStream(messages, consultant.model, (chunk) => {
      if (chunk.type === "content" && chunk.content) {
        answer += chunk.content;
      }
    });

    return {
      consultant: consultantName,
      question,
      answer: answer.trim(),
    };
  },
};
