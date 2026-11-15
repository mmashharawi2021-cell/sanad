import "dotenv/config";

/** Model slug used when OPENROUTER_MODEL is not set. Any slug from https://openrouter.ai/models works. */
export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

export const KEY_SETUP_URL = "https://openrouter.ai/keys";

/** Error that carries an HTTP status and an optional human-readable hint for the UI/CLI. */
export class AppError extends Error {
  readonly status: number;
  readonly hint?: string;

  constructor(message: string, options: { status?: number; hint?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.status = options.status ?? 500;
    this.hint = options.hint;
  }
}

export type Config = {
  apiKey: string;
  model: string;
  /** Tried in order when the primary model fails (rate limit, downtime, …). */
  fallbackModels: string[];
  siteUrl?: string;
  appTitle: string;
};

let cached: Config | undefined;

/** Reads configuration from the environment. Throws AppError when the API key is missing. */
export function getConfig(): Config {
  if (cached) return cached;

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError("OPENROUTER_API_KEY is not set.", {
      status: 500,
      hint: `Create a key at ${KEY_SETUP_URL}, then export it or put it in .env — never commit it.`,
    });
  }

  cached = {
    apiKey,
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    fallbackModels: (process.env.OPENROUTER_FALLBACK_MODELS ?? "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean),
    siteUrl: process.env.OPENROUTER_SITE_URL?.trim() || undefined,
    appTitle: process.env.OPENROUTER_APP_TITLE?.trim() || "opencode",
  };
  return cached;
}
