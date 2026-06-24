import type { CapabilityDefinition } from "./index";
import { createProvider } from "../providers";

export const consultantCapability: CapabilityDefinition = {
  name: "ask_consultant",
  description:
    "Ask a specialist consultant model a question. Each consultant has a dedicated role and context. " +
    "Use this when the user's request benefits from a specialist perspective. " +
    "Available consultants depend on the active project.",
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
  },
  async handler(args, ctx) {
    const consultantName = args.consultant_name as string;
    const question = args.question as string;

    if (!ctx.storageRef) throw new Error("No storage available in capability context");
    if (!ctx.projectId) throw new Error("ask_consultant requires an active project");

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

    const provider = createProvider(connection);
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: consultant.systemPrompt },
      { role: "user", content: question },
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
