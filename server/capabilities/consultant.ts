import { readFileSync } from "fs";
import path from "path";
import type { CapabilityDefinition, CapabilityContext } from "./index";
import { createProvider } from "../providers";
import type { MultimodalMessage } from "../providers";

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
]);

function resolveImagePath(
  filePath: string,
  ctx: Pick<CapabilityContext, "rootFolder" | "libraryPaths">
): string {
  const resolved = path.resolve(filePath);

  // Extension check — reject non-image files before any path check
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(
      `image_path must point to an image file (${[...ALLOWED_IMAGE_EXTENSIONS].join(", ")}). ` +
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

    // Resolve image data
    let imageBase64: string | undefined;
    if (imagePath) {
      const safePath = resolveImagePath(imagePath, ctx);
      const buf = readFileSync(safePath);
      imageBase64 = buf.toString("base64");
    } else if (imageBase64Arg) {
      imageBase64 = imageBase64Arg;
    }

    const userMessage: MultimodalMessage = {
      role: "user",
      content: question,
      ...(imageBase64 ? { images: [imageBase64] } : {}),
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
