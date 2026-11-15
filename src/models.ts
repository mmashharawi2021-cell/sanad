import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** A free model that can answer a text chat turn. */
export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  maxOutput: number | null;
  inputModalities: string[];
  description?: string;
};

/** Shape of an entry from https://openrouter.ai/api/v1/models (only the fields used here). */
export type OpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number | null };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
};

export type ModelCatalog = {
  generatedAt?: string;
  models: ChatModel[];
};

export const ROUTER_MODEL: ChatModel = {
  id: "openrouter/free",
  name: "OpenRouter: Free Router",
  provider: "OpenRouter",
  contextLength: 0,
  maxOutput: null,
  inputModalities: ["text"],
  description: "Automatically routes each request to an available free model.",
};

const CATALOG_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "free-models.json");

let catalogCache: ModelCatalog | undefined;

/** Free = both prompt and completion cost exactly 0 (these are the `:free` variants). */
function isFree(model: OpenRouterModel): boolean {
  return Number(model.pricing?.prompt) === 0 && Number(model.pricing?.completion) === 0;
}

/** Chat-capable = takes text and returns text only (audio/image models cannot answer a chat turn). */
function isTextChat(model: OpenRouterModel): boolean {
  const inputs = model.architecture?.input_modalities ?? ["text"];
  const outputs = model.architecture?.output_modalities ?? ["text"];
  return (
    inputs.includes("text") &&
    outputs.includes("text") &&
    !outputs.includes("audio") &&
    !outputs.includes("image")
  );
}

function providerOf(id: string, name?: string): string {
  const prefix = name?.includes(":") ? name.slice(0, name.indexOf(":")).trim() : "";
  return prefix || id.split("/")[0] || "OpenRouter";
}

/** Keeps every free text-chat model, de-duplicates it, and puts the router first. */
export function toChatModels(raw: OpenRouterModel[]): ChatModel[] {
  const seen = new Set<string>();
  const models: ChatModel[] = [];

  for (const model of raw) {
    if (!model?.id || model.id === ROUTER_MODEL.id) continue;
    if (seen.has(model.id) || !isFree(model) || !isTextChat(model)) continue;

    seen.add(model.id);
    models.push({
      id: model.id,
      name: model.name || model.id,
      provider: providerOf(model.id, model.name),
      contextLength: model.context_length ?? 0,
      maxOutput: model.top_provider?.max_completion_tokens ?? null,
      inputModalities: model.architecture?.input_modalities ?? ["text"],
      description: model.description,
    });
  }

  models.sort((a, b) => b.contextLength - a.contextLength || a.name.localeCompare(b.name));
  return [ROUTER_MODEL, ...models];
}

function parseChatModel(value: unknown): ChatModel[] {
  if (!value || typeof value !== "object") return [];
  const model = value as Partial<ChatModel>;
  if (typeof model.id !== "string" || !model.id.trim()) return [];

  return [
    {
      id: model.id,
      name: typeof model.name === "string" && model.name.trim() ? model.name : model.id,
      provider: typeof model.provider === "string" && model.provider.trim() ? model.provider : providerOf(model.id),
      contextLength: typeof model.contextLength === "number" && model.contextLength >= 0 ? model.contextLength : 0,
      maxOutput: typeof model.maxOutput === "number" ? model.maxOutput : null,
      inputModalities: Array.isArray(model.inputModalities)
        ? model.inputModalities.filter((item): item is string => typeof item === "string")
        : ["text"],
      description: typeof model.description === "string" ? model.description : undefined,
    },
  ];
}

export function parseCatalog(payload: unknown): ModelCatalog {
  if (!payload || typeof payload !== "object") return { models: [] };

  const record = payload as { generatedAt?: unknown; models?: unknown };
  const models = Array.isArray(record.models) ? record.models.flatMap(parseChatModel) : [];

  return {
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
    models,
  };
}

/** The committed snapshot: used when OpenRouter cannot be reached (or MODELS_SOURCE=catalog). */
export async function readModelCatalog(): Promise<ModelCatalog> {
  if (catalogCache) return catalogCache;

  try {
    catalogCache = parseCatalog(JSON.parse(await readFile(CATALOG_FILE, "utf8")));
  } catch {
    catalogCache = { models: [] };
  }

  return catalogCache;
}
