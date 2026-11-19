import { AppError, JARVIS_SYSTEM_PROMPT } from "./config";
import type { ChatModel } from "./models";
import type { Answer, AskOptions, ChatTurn, StreamEvent, Usage } from "./openrouter";

export const OLLAMA_HOST = process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434";
export const OLLAMA_PREFIX = "ollama:";

export type OllamaTag = {
  name: string;
  model: string;
  size: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
};

export type OllamaStatus = {
  running: boolean;
  host: string;
  models: { id: string; name: string; sizeGb: number; parameterSize?: string }[];
  error?: string;
};

export function isOllamaModel(model?: string): boolean {
  if (!model) return false;
  return model.startsWith(OLLAMA_PREFIX);
}

export function cleanOllamaModelName(model: string): string {
  return model.startsWith(OLLAMA_PREFIX) ? model.slice(OLLAMA_PREFIX.length) : model;
}

/** Check if Ollama is running and fetch installed models */
export async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      return {
        running: false,
        host: OLLAMA_HOST,
        models: [],
        error: `Ollama returned HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as { models?: OllamaTag[] };
    const rawList = Array.isArray(data.models) ? data.models : [];

    const models = rawList.map((m) => ({
      id: `${OLLAMA_PREFIX}${m.name}`,
      name: m.name,
      sizeGb: Number((m.size / 1024 ** 3).toFixed(1)),
      parameterSize: m.details?.parameter_size,
    }));

    return {
      running: true,
      host: OLLAMA_HOST,
      models,
    };
  } catch {
    return {
      running: false,
      host: OLLAMA_HOST,
      models: [],
      error: "Ollama is not running or unreachable.",
    };
  }
}

/** Convert Ollama models to ChatModel format for the UI */
export async function getOllamaChatModels(): Promise<ChatModel[]> {
  const status = await getOllamaStatus();
  if (!status.running || !status.models.length) return [];

  return status.models.map((m) => ({
    id: m.id,
    name: `Ollama: ${m.name} (${m.sizeGb} GB)`,
    provider: "Ollama (محلي أوفلاين)",
    contextLength: 128000,
    maxOutput: 4096,
    inputModalities: ["text"],
    description: `نموذج ذكاء اصطناعي محلي يعمل على جهازك بالكامل دون اتصال بالإنترنت. الحجم: ${m.sizeGb} GB.`,
  }));
}

function resolveOllamaMessages(prompt: string, options: AskOptions): ChatTurn[] {
  const turns = options.messages?.filter((m) => m.content.trim()) || [];
  const systemPrompt = options.system?.trim() || JARVIS_SYSTEM_PROMPT;
  const systemTurn: ChatTurn = { role: "system", content: systemPrompt };

  if (turns.length) {
    const nonSystem = turns.filter((m) => m.role !== "system");
    return [systemTurn, ...nonSystem];
  }

  const text = prompt.trim();
  if (!text) {
    throw new AppError("The prompt is empty.", { status: 400, hint: "Type a question first." });
  }
  return [systemTurn, { role: "user", content: text }];
}

/** Ask Ollama (non-streaming) */
export async function askOllama(prompt: string, options: AskOptions = {}): Promise<Answer> {
  const modelName = cleanOllamaModelName(options.model || "llama3.2");
  const messages = resolveOllamaMessages(prompt, options);
  const startedAt = Date.now();

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          num_gpu: 0,
          temperature: 0.7,
        },
      }),
      signal: options.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new AppError(`Ollama error (HTTP ${res.status}): ${errText}`, {
        status: res.status,
        hint: `Make sure the model "${modelName}" is pulled (run: ollama pull ${modelName}).`,
      });
    }

    const data = (await res.json()) as any;
    const content = data.message?.content || "";
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;

    return {
      text: content,
      model: `Ollama: ${modelName}`,
      latencyMs: Date.now() - startedAt,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Could not reach Ollama at ${OLLAMA_HOST}.`, {
      status: 502,
      hint: "Make sure Ollama is installed and running on your laptop. Run `ollama serve` in terminal.",
    });
  }
}

/** Stream response from Ollama */
export async function* askOllamaStream(
  prompt: string,
  options: AskOptions = {},
): AsyncGenerator<StreamEvent, void, unknown> {
  const modelName = cleanOllamaModelName(options.model || "llama3.2");
  const messages = resolveOllamaMessages(prompt, options);
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          num_gpu: 0,
          temperature: 0.7,
        },
      }),
      signal: options.signal,
    });
  } catch {
    throw new AppError(`Could not reach Ollama at ${OLLAMA_HOST}.`, {
      status: 502,
      hint: "Make sure Ollama is running on your laptop. Run `ollama serve` in terminal.",
    });
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new AppError(`Ollama error (HTTP ${res.status}): ${errText}`, {
      status: res.status,
      hint: `Make sure the model "${modelName}" is downloaded (run: ollama pull ${modelName}).`,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalModel = `Ollama: ${modelName}`;
  let usage: Usage | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const chunk = JSON.parse(trimmed);
          if (chunk.message?.content) {
            yield { type: "delta", text: chunk.message.content };
          }
          if (chunk.done) {
            const promptTokens = chunk.prompt_eval_count || 0;
            const completionTokens = chunk.eval_count || 0;
            usage = {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            };
            if (chunk.model) finalModel = `Ollama: ${chunk.model}`;
          }
        } catch {
          // ignore malformed line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    type: "done",
    model: finalModel,
    latencyMs: Date.now() - startedAt,
    usage,
  };
}
