import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, getConfig } from "./config";
import { ask, type Answer } from "./openrouter";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (!res.headersSent) {
      const appError = error instanceof AppError ? error : new AppError("Internal server error", { cause: error });
      sendJson(res, appError.status, { error: appError.message, hint: appError.hint });
    } else {
      res.end();
    }
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;

  if (!prompt.trim()) {
    throw new AppError("The prompt is empty.", { status: 400, hint: "Type a question first." });
  }

  const answer: Answer = await ask(prompt, {
    model,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  sendJson(res, 200, answer);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new AppError("Request body is too large.", { status: 413, hint: "Keep the prompt under 16 KB." });
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
  } catch (error) {
    const hint = error instanceof AppError ? error.hint : undefined;
    console.warn(`⚠ ${error instanceof Error ? error.message : String(error)}`);
    if (hint) console.warn(`  ${hint}`);
    console.warn(`  The page loads, but requests will fail until a key is set.`);
  }
});
