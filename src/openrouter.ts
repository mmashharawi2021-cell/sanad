import { OpenRouter } from "@openrouter/sdk";
import { AppError, getConfig } from "./config";

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type Answer = {
  text: string;
  model: string;
  usage?: Usage;
  latencyMs: number;
};

export type AskOptions = {
  /** Model slug override, e.g. "anthropic/claude-opus-5.5". */
  model?: string;
  /** Optional system prompt. */
  system?: string;
  /** Full conversation (overrides `prompt` when provided). */
  messages?: ChatTurn[];
  /** Abort signal to cancel the request. */
  signal?: AbortSignal;
};

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; model: string; latencyMs: number; usage?: Usage };

let client: OpenRouter | undefined;

function getClient(): OpenRouter {
  if (!client) {
    const config = getConfig();
    client = new OpenRouter({
      apiKey: config.apiKey,
      httpReferer: config.siteUrl,
      xTitle: config.appTitle,
    });
  }
  return client;
}

function requirePrompt(prompt: string): string {
  const text = prompt?.trim();
  if (!text) {
    throw new AppError("The prompt is empty.", { status: 400, hint: "Type a question first." });
  }
  return text;
}

/** Primary model first, then the configured fallbacks (deduplicated). */
function buildModelChain(primary: string): string[] {
  return [primary, ...getConfig().fallbackModels.filter((slug) => slug !== primary)];
}

function buildMessages(prompt: string, system?: string, turns?: ChatTurn[]) {
  if (turns?.length) {
    return [...(system ? [{ role: "system" as const, content: system }] : []), ...turns];
  }
  return [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    { role: "user" as const, content: prompt },
  ];
}

/** Uses the conversation when present, otherwise the single prompt. */
function resolveMessages(prompt: string, options: AskOptions): ChatTurn[] {
  const turns = options.messages?.filter((turn) => turn.content.trim());
  if (turns?.length) return buildMessages("", options.system, turns);
  return buildMessages(requirePrompt(prompt), options.system);
}

/**
 * Sends one prompt to OpenRouter and returns the assistant reply.
 * Throws AppError with a friendly message + hint on any failure.
 */
export async function ask(prompt: string, options: AskOptions = {}): Promise<Answer> {
  const messages = resolveMessages(prompt, options);
  const config = getConfig();
  const model = options.model?.trim() || config.model;
  const startedAt = Date.now();

  try {
    const response = await getClient().chat.send(
      {
        model,
        models: buildModelChain(model),
        messages,
        temperature: 0.7,
      },
      { signal: options.signal, timeoutMs: 90_000 },
    );

    const choice = response.choices?.[0];
    const content = extractText(choice?.message?.content);

    if (!content) {
      throw new AppError("OpenRouter returned an empty response.", {
        status: 502,
        hint: choice?.finishReason
          ? `The model stopped with finish reason "${choice.finishReason}". Try a different model or prompt.`
          : "Try again, or pick another model slug.",
      });
    }

    return {
      text: content,
      model: response.model || model,
      usage: toUsage(response.usage),
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Same request as {@link ask}, but streams the answer as it is generated.
 * Yields { type: "delta" } events followed by one { type: "done" } event.
 */
export async function* askStream(prompt: string, options: AskOptions = {}): AsyncGenerator<StreamEvent> {
  const messages = resolveMessages(prompt, options);
  const config = getConfig();
  const model = options.model?.trim() || config.model;
  const startedAt = Date.now();

  let servedModel = model;
  let usage: Usage | undefined;
  let received = 0;

  try {
    const stream = await getClient().chat.send(
      {
        model,
        models: buildModelChain(model),
        messages,
        temperature: 0.7,
        stream: true,
        streamOptions: { includeUsage: true },
      },
      { signal: options.signal, timeoutMs: 90_000 },
    );

    for await (const chunk of stream) {
      if (chunk.error) {
        throw new AppError("OpenRouter reported an error mid-stream.", {
          status: chunk.error.code >= 400 && chunk.error.code < 600 ? chunk.error.code : 502,
          hint: chunk.error.message,
        });
      }

      if (chunk.model) servedModel = chunk.model;
      if (chunk.usage) usage = toUsage(chunk.usage);

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        received += delta.length;
        yield { type: "delta", text: delta };
      }
    }
  } catch (error) {
    throw toAppError(error);
  }

  if (received === 0) {
    throw new AppError("The model returned no text.", {
      status: 502,
      hint: "Try again, or pick another free model.",
    });
  }

  yield { type: "done", model: servedModel, latencyMs: Date.now() - startedAt, usage };
}

function toUsage(usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null): Usage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  };
}

/** Assistant content may be a plain string or an array of content parts. */
function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("")
    .trim();
}

/** Maps SDK/network failures onto AppError with an actionable hint. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new AppError("The request was cancelled or timed out.", {
      status: 504,
      hint: "OpenRouter can be slow on large prompts. Try again, or use a faster model.",
      cause: error,
    });
  }

  const status = readNumber(error, "statusCode");
  const details = readString(error, "body") ?? (error instanceof Error ? error.message : String(error));

  switch (status) {
    case 400:
    case 422:
      return new AppError("OpenRouter rejected the request as invalid.", {
        status: 400,
        hint: `Check the model slug and message format. Details: ${truncate(details)}`,
        cause: error,
      });
    case 401:
      return new AppError("OpenRouter rejected the API key.", {
        status: 401,
        hint: `Verify OPENROUTER_API_KEY, or create a new one at https://openrouter.ai/keys.`,
        cause: error,
      });
    case 402:
      return new AppError("Your OpenRouter account is out of credits.", {
        status: 402,
        hint: "Add credits at https://openrouter.ai/credits, or use a cheaper model slug.",
        cause: error,
      });
    case 403:
      return new AppError("This request is not allowed for your OpenRouter account.", {
        status: 403,
        hint: "The model may require extra permissions or a moderation check.",
        cause: error,
      });
    case 404:
      return new AppError("The requested model was not found.", {
        status: 404,
        hint: "Pick a valid slug from https://openrouter.ai/models and set OPENROUTER_MODEL.",
        cause: error,
      });
    case 429:
      return new AppError("Rate limit reached on OpenRouter.", {
        status: 429,
        hint: "Wait a few seconds and retry, or add credits to raise your limits.",
        cause: error,
      });
    default:
      break;
  }

  if (status && status >= 500) {
    return new AppError("OpenRouter or the upstream provider failed.", {
      status: 502,
      hint: `Retry in a moment. Details: ${truncate(details)}`,
      cause: error,
    });
  }

  if (error instanceof TypeError) {
    return new AppError("Could not reach OpenRouter.", {
      status: 503,
      hint: "Check your internet connection, proxy or firewall settings.",
      cause: error,
    });
  }

  return new AppError("Unexpected error while calling OpenRouter.", {
    status: 500,
    hint: truncate(details),
    cause: error,
  });
}

function readNumber(value: unknown, key: string): number | undefined {
  if (value && typeof value === "object" && key in value) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "number") return raw;
  }
  return undefined;
}

function readString(value: unknown, key: string): string | undefined {
  if (value && typeof value === "object" && key in value) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string") return raw;
  }
  return undefined;
}

function truncate(value: string, max = 300): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}
