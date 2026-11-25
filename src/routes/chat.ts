import type { IncomingMessage } from "node:http";
import { AppError, getConfig, SANAD_LOCAL_NATIVE_PROMPT, SANAD_NATIVE_TOOLS_PROMPT } from "../config";
import { readModelCatalog, toChatModels, type ChatModel, type OpenRouterModel } from "../models";
import { ask, askStream, toAppError, type Answer, type ChatTurn } from "../openrouter";
import { askOllama, askOllamaStream, cleanOllamaModelName, getOllamaChatModels, getOllamaStatus, isOllamaModel, ollamaSupportsTools } from "../ollama";
import { toolDefinitions } from "../modelTools";
import { getLocalSystemPromptWithMemory, getSystemPromptWithMemory } from "../memory";
import { ensureOllamaRunning, getBrainStatus, getSanadMode, isNetworkError, isOnline, isSanadMode, markOffline, requireLocalModel, resolveLocalModel, setSanadMode } from "../offlineBrain";
import type { Generate } from "../selfDev";
import { frame, readJsonBody, sendJson, write } from "../http/core";
import type { Route, RouteContext } from "../http/router";

/** المحادثة والعقل: توجيه كل طلب للسحابة أو للعقل المحلي، والبث الحي، وقائمة النماذج. */

const MAX_TURNS = 60;
const MAX_TURN_CHARS = 150_000; // Allow up to 150,000 characters per turn for large files and codebases
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

function offlineNotice(localModel: string): string {
  return `🔌 لا يوجد اتصال بالإنترنت — تم التحويل تلقائياً إلى العقل المحلي (${cleanOllamaModelName(localModel)}).`;
}

type ChatRoute = { kind: "local"; model: string; notice?: string } | { kind: "cloud"; fallbackToLocal: boolean };

/**
 * Decide where a chat goes, honouring SANAD_MODE:
 * - offline: always the local brain (cloud is never contacted);
 * - cloud:   always OpenRouter (no local fallback);
 * - auto:    OpenRouter when online, local brain when offline or on a network failure.
 */
async function decideChatRoute(model: string | undefined): Promise<ChatRoute> {
  if (model && isOllamaModel(model)) return { kind: "local", model };
  const setting = getSanadMode();
  if (setting === "offline") {
    const localModel = await requireLocalModel();
    const notice = model ? `🔒 وضع أوفلاين مفعّل — تم استخدام العقل المحلي (${cleanOllamaModelName(localModel)}) بدل الموديل السحابي.` : undefined;
    return { kind: "local", model: localModel, notice };
  }
  if (setting === "cloud") return { kind: "cloud", fallbackToLocal: false };
  if (!(await isOnline())) {
    const localModel = await requireLocalModel();
    return { kind: "local", model: localModel, notice: offlineNotice(localModel) };
  }
  return { kind: "cloud", fallbackToLocal: true };
}

/** مولّد نص للمطوّر الذاتي يتبع نفس توجيه المحادثة (سحابي مع احتياط محلي، أو محلي). */
export function selfDevGenerator(model: string | undefined): Generate {
  return async (system, prompt) => {
    const route = await decideChatRoute(model);
    const local = async (localModel: string) => {
      await ensureOllamaRunning();
      const a = await askOllama(prompt, { model: localModel, system, signal: AbortSignal.timeout(180_000) });
      return { text: a.text, model: a.model };
    };
    if (route.kind === "local") return local(route.model);
    try {
      const a = await ask(prompt, { model, system, signal: AbortSignal.timeout(150_000) });
      return { text: a.text, model: a.model };
    } catch (error) {
      if (!route.fallbackToLocal || !isNetworkError(error)) throw error;
      markOffline();
      return local(await requireLocalModel());
    }
  };
}

async function handleChat({ req, res }: RouteContext): Promise<void> {
  const { prompt, model, messages } = await readChatRequest(req);
  const askLocal = async (localModel: string, notice?: string): Promise<void> => {
    await ensureOllamaRunning();
    const answer: Answer = await askOllama(prompt, {
      model: localModel,
      messages,
      system: await getLocalSystemPromptWithMemory(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    sendJson(res, 200, notice ? { ...answer, notice } : answer);
  };

  const route = await decideChatRoute(model);
  if (route.kind === "local") {
    await askLocal(route.model, route.notice);
    return;
  }

  try {
    const answer: Answer = await ask(prompt, {
      model,
      messages,
      system: await getSystemPromptWithMemory(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    sendJson(res, 200, answer);
  } catch (error) {
    if (!route.fallbackToLocal || !isNetworkError(error)) throw error;
    markOffline();
    const localModel = await requireLocalModel();
    await askLocal(localModel, offlineNotice(localModel));
  }
}

/** All free text-chat models for the UI picker, cached for 10 minutes. */
async function handleModels({ res }: RouteContext): Promise<void> {
  if (getSanadMode() === "offline") {
    // Offline mode: only local models, never contact OpenRouter.
    const local = await getOllamaChatModels();
    const localModel = await resolveLocalModel();
    sendJson(res, 200, { default: localModel ?? "", source: "catalog", count: local.length, models: local });
    return;
  }

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
  const ollamaModels = await getOllamaChatModels();

  if (modelsCache && Date.now() - modelsCache.at <= MODELS_TTL_MS) {
    if (ollamaModels.length) {
      const merged = [
        ...ollamaModels,
        ...modelsCache.models.filter((m) => !isOllamaModel(m.id)),
      ];
      return { ...modelsCache, models: merged };
    }
    return modelsCache;
  }

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
      const baseModels = toChatModels(payload.data ?? []);

      if (!baseModels.length) {
        throw new AppError("OpenRouter returned no free chat models.", { status: 502 });
      }

      const models = [...ollamaModels, ...baseModels];
      modelsCache = { at: Date.now(), models, source: "live" };
      return modelsCache;
    } catch (error) {
      console.warn(`[models] live list failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const catalog = await readModelCatalog();
  if (catalog.models.length) {
    const models = [...ollamaModels, ...catalog.models];
    modelsCache = {
      at: Date.now(),
      models,
      source: "catalog",
      generatedAt: catalog.generatedAt,
    };
    return modelsCache;
  }

  if (ollamaModels.length) {
    modelsCache = {
      at: Date.now(),
      models: ollamaModels,
      source: "catalog",
    };
    return modelsCache;
  }

  throw new AppError("Could not load the list of free models.", {
    status: 502,
    hint: "Check your connection, or run `npm run models:refresh` while online to rebuild the offline list.",
  });
}

/**
 * طريقة طلب النموذج للأدوات (SANAD_TOOL_MODE):
 * - auto (الافتراضي): «استدعاء الأدوات» الرسمي للنماذج السحابية التي تعلن دعمه، والوسوم النصية للنموذج المحلي
 *   (قياس على qwen3.5:4b: الدقة نفسها 12/12، والرسمي أبطأ بنحو 65% لأن تعريفات الأدوات تُضاف لكل طلب).
 * - native: الرسمي حيثما أمكن (والمحلي إن كان يدعمه).   - text: الوسوم النصية دائماً.
 */
type ToolMode = "auto" | "native" | "text";
function getToolMode(): ToolMode {
  const v = process.env.SANAD_TOOL_MODE?.trim().toLowerCase();
  return v === "native" || v === "text" ? v : "auto";
}

async function cloudUsesNativeTools(model: string | undefined): Promise<boolean> {
  const mode = getToolMode();
  if (mode !== "auto") return mode === "native";
  const id = model || getConfig().model;
  const known = modelsCache?.models.find((m) => m.id === id) ?? (await readModelCatalog()).models.find((m) => m.id === id);
  return known?.tools === true;
}

async function localUsesNativeTools(model: string): Promise<boolean> {
  return getToolMode() === "native" && (await ollamaSupportsTools(model));
}

/** Server-sent events: delta… delta, then done (or a single error event). */
async function handleStream({ req, res }: RouteContext): Promise<void> {
  const { prompt, model, messages } = await readChatRequest(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Stop calling provider as soon as the browser goes away.
  const clientGone = new AbortController();
  const onClose = () => clientGone.abort();
  req.on("close", onClose);

  const heartbeat = setInterval(() => write(res, ": keep-alive\n\n"), HEARTBEAT_MS);

  try {
    const signal = AbortSignal.any([clientGone.signal, AbortSignal.timeout(STREAM_TIMEOUT_MS)]);
    const streamLocal = async (localModel: string, notice?: string): Promise<void> => {
      if (notice) write(res, frame("notice", { message: notice, model: localModel }));
      await ensureOllamaRunning();
      const native = await localUsesNativeTools(localModel);
      const system = await getLocalSystemPromptWithMemory(native ? SANAD_LOCAL_NATIVE_PROMPT : undefined);
      const tools = native ? toolDefinitions() : undefined;
      for await (const event of askOllamaStream(prompt, { model: localModel, messages, system, signal, tools })) {
        if (clientGone.signal.aborted) break;
        write(res, frame(event.type, event));
      }
    };

    const route = await decideChatRoute(model);
    if (route.kind === "local") {
      await streamLocal(route.model, route.notice);
    } else {
      let sentDeltas = 0;
      const streamCloud = async (native: boolean): Promise<void> => {
        const system = await getSystemPromptWithMemory(native ? SANAD_NATIVE_TOOLS_PROMPT : undefined);
        const tools = native ? toolDefinitions() : undefined;
        for await (const event of askStream(prompt, { model, messages, system, signal, tools })) {
          if (clientGone.signal.aborted) break;
          if (event.type === "delta" || event.type === "tool_call") sentDeltas++;
          write(res, frame(event.type, event));
        }
      };
      try {
        const native = await cloudUsesNativeTools(model);
        try {
          await streamCloud(native);
        } catch (error) {
          // مزوّد رفض الأدوات الرسمية قبل أي رد ← نفس الطلب بالوسوم النصية (المسار الاحتياطي)
          if (!native || sentDeltas > 0 || clientGone.signal.aborted || isNetworkError(error)) throw error;
          console.warn(`[tools] الأدوات الرسمية رُفضت (${toAppError(error).message}) — إعادة بالوسوم النصية`);
          await streamCloud(false);
        }
      } catch (error) {
        // Only fall back when nothing was streamed yet and the failure is connectivity, not an API error.
        if (!route.fallbackToLocal || sentDeltas > 0 || clientGone.signal.aborted || !isNetworkError(error)) throw error;
        markOffline();
        const localModel = await requireLocalModel();
        await streamLocal(localModel, offlineNotice(localModel));
      }
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

export const chatRoutes: Route[] = [
  { method: "POST", path: "/api/chat", handler: handleChat },
  { method: "POST", path: "/api/chat/stream", handler: handleStream },
  { method: "GET", path: "/api/models", handler: handleModels },
  {
    method: "GET", path: "/api/ollama/status", handler: async ({ res }) => {
      const status = await getOllamaStatus();
      sendJson(res, 200, status);
    },
  },
  {
    method: "GET", path: "/api/brain/status", handler: async ({ res, url }) => {
      const status = await getBrainStatus(url.searchParams.get("force") === "1");
      sendJson(res, 200, { success: true, ...status });
    },
  },
  {
    // اختيار وضع العمل من شاشة البداية: auto (باتصال، مع احتياط محلي) أو offline (النماذج المحلية فقط).
    method: "POST", path: "/api/brain/mode", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      if (!isSanadMode(body.mode)) {
        sendJson(res, 400, { success: false, error: "وضع غير معروف.", hint: 'استخدم "auto" أو "offline" أو "cloud".' });
        return;
      }
      setSanadMode(body.mode);
      const status = await getBrainStatus(true);
      sendJson(res, 200, { success: true, ...status });
    },
  },
];
