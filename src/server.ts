import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, getConfig } from "./config";
import { readModelCatalog, toChatModels, type ChatModel, type OpenRouterModel } from "./models";
import { ask, askStream, toAppError, type Answer, type ChatTurn } from "./openrouter";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 128 * 1024;
const MAX_TURNS = 40;
const MAX_TURN_CHARS = 8_000;
const REQUEST_TIMEOUT_MS = 90_000;
const STREAM_TIMEOUT_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const MODELS_TTL_MS = 10 * 60_000;

type ModelsResult = {
  at: number;
  models: ChatModel[];
  source: "live" | "catalog";
  generatedAt?: string;
};

let modelsCache: ModelsResult | undefined;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const appError = toAppError(error);
    sendJson(res, appError.status, { error: appError.message, hint: appError.hint });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat/stream") {
    await handleStream(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    await handleModels(res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { prompt, model, messages } = await readChatRequest(req);

  const answer: Answer = await ask(prompt, {
    model,
    messages,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  sendJson(res, 200, answer);
}

/** All free text-chat models for the UI picker, cached for 10 minutes. */
async function handleModels(res: ServerResponse): Promise<void> {
  const result = await resolveModels();

  sendJson(res, 200, {
    default: getConfig().model,
    source: result.source,
    generatedAt: result.generatedAt,
    count: result.models.length,
    models: result.models,
  });
}

/**
 * Tries OpenRouter first, then falls back to the committed snapshot in
 * `data/free-models.json`. Set MODELS_SOURCE=catalog to skip the network entirely.
 */
async function resolveModels(): Promise<ModelsResult> {
  if (modelsCache && Date.now() - modelsCache.at <= MODELS_TTL_MS) return modelsCache;

  if (process.env.MODELS_SOURCE !== "catalog") {
    try {
      const config = getConfig();
      const upstream = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });

      if (!upstream.ok) {
        throw new AppError("Could not load the model list from OpenRouter.", {
          status: 502,
          hint: `Upstream returned HTTP ${upstream.status}. Try again in a moment.`,
        });
      }

      const payload = (await upstream.json()) as { data?: OpenRouterModel[] };
      const models = toChatModels(payload.data ?? []);

      if (!models.length) {
        throw new AppError("OpenRouter returned no free chat models.", { status: 502 });
      }

      modelsCache = { at: Date.now(), models, source: "live" };
      return modelsCache;
    } catch (error) {
      console.warn(`[models] live list failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const catalog = await readModelCatalog();
  if (catalog.models.length) {
    modelsCache = {
      at: Date.now(),
      models: catalog.models,
      source: "catalog",
      generatedAt: catalog.generatedAt,
    };
    return modelsCache;
  }

  throw new AppError("Could not load the list of free models.", {
    status: 502,
    hint: "Check your connection, or run `npm run models:refresh` while online to rebuild the offline list.",
  });
}

/** Server-sent events: delta… delta, then done (or a single error event). */
async function handleStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { prompt, model, messages } = await readChatRequest(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Stop calling OpenRouter as soon as the browser goes away.
  const clientGone = new AbortController();
  const onClose = () => clientGone.abort();
  req.on("close", onClose);

  const heartbeat = setInterval(() => write(res, ": keep-alive\n\n"), HEARTBEAT_MS);

  try {
    const signal = AbortSignal.any([clientGone.signal, AbortSignal.timeout(STREAM_TIMEOUT_MS)]);

    for await (const event of askStream(prompt, { model, messages, signal })) {
      if (clientGone.signal.aborted) break;
      write(res, frame(event.type, event));
    }
  } catch (error) {
    if (!clientGone.signal.aborted) {
      const appError = toAppError(error);
      write(res, frame("error", { error: appError.message, hint: appError.hint }));
    }
  } finally {
    clearInterval(heartbeat);
    req.off("close", onClose);
    if (!res.writableEnded) res.end();
  }
}

async function readChatRequest(req: IncomingMessage): Promise<{ prompt: string; model?: string; messages?: ChatTurn[] }> {
  const body = await readJsonBody(req);
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  const messages = parseMessages(body.messages);

  if (!messages?.length && !prompt.trim()) {
    throw new AppError("The prompt is empty.", { status: 400, hint: "Type a question first." });
  }

  return { prompt, model, messages };
}

function parseMessages(value: unknown): ChatTurn[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new AppError("messages must be an array.", { status: 400, hint: "Each item needs role and content." });
  }
  if (value.length === 0) return undefined;
  if (value.length > MAX_TURNS) {
    throw new AppError(`Too many messages (max ${MAX_TURNS}).`, { status: 413, hint: "Start a new conversation." });
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new AppError(`messages[${index}] is not an object.`, { status: 400 });
    }

    const { role, content } = item as { role?: unknown; content?: unknown };

    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw new AppError(`messages[${index}].role is invalid.`, {
        status: 400,
        hint: 'Use "system", "user" or "assistant".',
      });
    }
    if (typeof content !== "string") {
      throw new AppError(`messages[${index}].content must be text.`, { status: 400 });
    }
    if (content.length > MAX_TURN_CHARS) {
      throw new AppError(`messages[${index}].content is too long.`, {
        status: 413,
        hint: `Keep each message under ${MAX_TURN_CHARS} characters.`,
      });
    }

    return { role, content };
  });
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function write(res: ServerResponse, chunk: string): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(chunk);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new AppError("Request body is too large.", { status: 413, hint: "Keep the conversation under 128 KB." });
    }
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};

  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError("Request body must be a JSON object.", { status: 400 });
  }
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = normalize(join(PUBLIC_DIR, relative));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

server.listen(PORT, () => {
  try {
    const config = getConfig();
    console.log(`OpenRouter demo running at http://localhost:${PORT}`);
    console.log(`Default model: ${config.model}`);
    if (config.fallbackModels.length) console.log(`Fallbacks: ${config.fallbackModels.join(" → ")}`);
  } catch (error) {
    const appError = toAppError(error);
    console.warn(`⚠ ${appError.message}`);
    if (appError.hint) console.warn(`  ${appError.hint}`);
    console.warn(`  The page loads, but requests will fail until a key is set.`);
  }
});
