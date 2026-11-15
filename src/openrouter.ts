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
  /** Abort signal to cancel the request. */
  signal?: AbortSignal;
};

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

/**
 * Sends one prompt to OpenRouter and returns the assistant reply.
 * Throws AppError with a friendly message + hint on any failure.
 */
export async function ask(prompt: string, options: AskOptions = {}): Promise<Answer> {
  const text = prompt?.trim();
  if (!text) {
    throw new AppError("The prompt is empty.", {
      status: 400,
      hint: "Type a question first.",
    });
  }

  const config = getConfig();
  const model = options.model?.trim() || config.model;
  const modelChain = [model, ...config.fallbackModels.filter((slug) => slug !== model)];
  const startedAt = Date.now();

  try {
    const response = await getClient().chat.send(
      {
        model,
        models: modelChain,
        messages: [
          ...(options.system ? [{ role: "system" as const, content: options.system }] : []),
          { role: "user" as const, content: text },
        ],
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
      usage: response.usage
        ? {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
          }
        : undefined,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw toAppError(error);
  }
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
function toAppError(error: unknown): AppError {
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
