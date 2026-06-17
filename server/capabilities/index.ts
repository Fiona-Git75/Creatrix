import type { CapabilityName, CapabilityInvocation } from "@shared/schema";
import { filesystemCapabilities } from "./filesystem";
import { webCapabilities } from "./web";
import { libraryCapabilities } from "./library";
import { notionCapabilities } from "./notion";

export interface CapabilityContext {
  rootFolder?: string;
  storageRef?: import("../storage").IStorage;
}

export type CapabilityHandler = (
  args: Record<string, unknown>,
  ctx: CapabilityContext
) => Promise<unknown>;

export interface CapabilityDefinition {
  name: CapabilityName;
  description: string;
  requiresConfirmation?: boolean;
  argsSchema: Record<string, { type: string; description: string; required?: boolean }>;
  handler: CapabilityHandler;
}

const registry = new Map<CapabilityName, CapabilityDefinition>();

function register(def: CapabilityDefinition) {
  registry.set(def.name, def);
}

// Register all capabilities
for (const cap of [...filesystemCapabilities, ...webCapabilities, ...libraryCapabilities, ...notionCapabilities]) {
  register(cap);
}

export function getCapability(name: CapabilityName): CapabilityDefinition | undefined {
  return registry.get(name);
}

export function listCapabilities(): CapabilityDefinition[] {
  return Array.from(registry.values());
}

export async function invokeCapability(
  name: CapabilityName,
  args: Record<string, unknown>,
  ctx: CapabilityContext
): Promise<CapabilityInvocation> {
  const cap = registry.get(name);
  if (!cap) {
    return { capability: name, args, status: "error", error: `Unknown capability: ${name}` };
  }

  // Validate required args
  for (const [key, schema] of Object.entries(cap.argsSchema)) {
    if (schema.required && args[key] === undefined) {
      return { capability: name, args, status: "error", error: `Missing required argument: ${key}` };
    }
  }

  try {
    const result = await cap.handler(args, ctx);
    return { capability: name, args, status: "success", result };
  } catch (err: any) {
    return { capability: name, args, status: "error", error: err?.message || String(err) };
  }
}

export function getCapabilitySummary(): string {
  return listCapabilities().map(c =>
    `- **${c.name}**: ${c.description}${c.requiresConfirmation ? " *(requires confirmation)*" : ""}`
  ).join("\n");
}
