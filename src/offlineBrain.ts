import { spawn } from "node:child_process";
import { promises as dns } from "node:dns";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "./config";
import { getLocalSystemPromptWithMemory } from "./memory";
import { OLLAMA_HOST, OLLAMA_PREFIX, cleanOllamaModelName, getOllamaStatus, ollamaKeepAlive, ollamaRuntimeOptions, ollamaThink } from "./ollama";

/**
 * Offline brain: connectivity detection, Ollama auto-start, local model selection and warm-up.
 * Lets SANAD keep chatting when the internet (and therefore OpenRouter) is unavailable.
 */

const ONLINE_CACHE_MS = 30_000;
const CONNECTIVITY_HOST = "openrouter.ai";
/** A cold `ollama serve` boot measured 15–25 s on this laptop; leave generous headroom. */
const OLLAMA_BOOT_TIMEOUT_MS = 60_000;
/** Don't spawn a second `ollama serve` while a recent one may still be booting (it would fail to bind). */
const OLLAMA_RESPAWN_GUARD_MS = 90_000;

let onlineCache: { online: boolean; at: number } | null = null;
let ollamaBoot: Promise<boolean> | null = null;
let lastSpawnAt = 0;
let warmedModel: string | null = null;
let warmingModel: Promise<void> | null = null;

export type BrainStatus = {
  online: boolean;
  mode: "cloud" | "local" | "none";
  ollamaRunning: boolean;
  localModel: string | null;
  localModels: string[];
  warmed: boolean;
  /** Configured SANAD_MODE: auto (cloud, local fallback), offline (never cloud), cloud (never local fallback). */
  setting: SanadMode;
};

export type SanadMode = "auto" | "offline" | "cloud";

const SANAD_MODES: readonly SanadMode[] = ["auto", "offline", "cloud"];

/** الوضع الذي اختاره المستخدم من شاشة البداية؛ يتقدّم على SANAD_MODE حتى إعادة تشغيل الخادم. */
let runtimeMode: SanadMode | null = null;

export function isSanadMode(value: unknown): value is SanadMode {
  return typeof value === "string" && (SANAD_MODES as readonly string[]).includes(value);
}

export function getSanadMode(): SanadMode {
  if (runtimeMode) return runtimeMode;
  const v = process.env.SANAD_MODE?.trim().toLowerCase();
  return v === "offline" || v === "cloud" ? v : "auto";
}

/** يبدّل وضع العقل أثناء التشغيل. في وضع «دون اتصال» يُجهَّز النموذج المحلي في الخلفية. */
export function setSanadMode(mode: SanadMode): void {
  runtimeMode = mode;
  console.log(`[offline-brain] وضع العمل الآن: ${mode}`);
  // OLLAMA_WARMUP=false (كما في الاختبارات) يمنع تحميل النموذج في الذاكرة
  if (mode === "offline" && envFlag("OLLAMA_WARMUP", true)) {
    void resolveLocalModel()
      .then((model) => (model ? warmUpModel(model) : undefined))
      .catch((err) => console.warn(`[offline-brain] تعذر تجهيز النموذج المحلي: ${(err as Error).message}`));
  }
}

function envFlag(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Fast connectivity probe (DNS resolve of the cloud provider), cached for 30 s. */
export async function isOnline(force = false): Promise<boolean> {
  if (!force && onlineCache && Date.now() - onlineCache.at < ONLINE_CACHE_MS) return onlineCache.online;
  let online: boolean;
  try {
    await Promise.race([
      dns.lookup(CONNECTIVITY_HOST),
      new Promise((_, reject) => setTimeout(() => reject(new Error("dns timeout")), 2500)),
    ]);
    online = true;
  } catch {
    online = false;
  }
  setOnline(online);
  return online;
}

function setOnline(online: boolean): void {
  const wasOnline = onlineCache?.online;
  onlineCache = { online, at: Date.now() };
  if (!online && wasOnline !== false) {
    console.warn("[offline-brain] 🔌 لا يوجد اتصال بالإنترنت — التحويل إلى العقل المحلي (Ollama).");
    // Pre-load the local model so the first offline answer is fast.
    void resolveLocalModel().then((m) => (m ? warmUpModel(m) : undefined)).catch(() => undefined);
  } else if (online && wasOnline === false) {
    console.log("[offline-brain] 🌐 عاد الاتصال بالإنترنت — العودة للنماذج السحابية.");
  }
}

/** Call when a cloud request failed with a network error. */
export function markOffline(): void {
  setOnline(false);
}

const NETWORK_ERROR_PATTERN =
  /fetch failed|unable to make request|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT|getaddrinfo|socket hang up|network/i;

/** True when an error (or anything in its cause chain) is a connectivity failure, not an API/model error. */
export function isNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth++) {
    if (current instanceof AppError) {
      // HTTP-level errors from OpenRouter (401, 402, 429…) mean we *are* online.
      if ([400, 401, 402, 403, 404, 422, 429].includes(current.status)) return false;
      if (NETWORK_ERROR_PATTERN.test(`${current.message} ${current.hint ?? ""}`)) return true;
    } else if (current instanceof Error) {
      const code = (current as Error & { code?: unknown }).code;
      if (typeof code === "string" && NETWORK_ERROR_PATTERN.test(code)) return true;
      if (NETWORK_ERROR_PATTERN.test(current.message)) return true;
    } else if (typeof current === "string" && NETWORK_ERROR_PATTERN.test(current)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function findOllamaExecutable(): string {
  const fromEnv = process.env.OLLAMA_EXE?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const candidate = join(localAppData, "Programs", "Ollama", "ollama.exe");
    if (existsSync(candidate)) return candidate;
  }
  return "ollama"; // rely on PATH
}

function isLocalOllamaHost(): boolean {
  try {
    const host = new URL(OLLAMA_HOST).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Make sure the Ollama server is up. Starts `ollama serve` detached (non-blocking) when needed.
 * Concurrent callers share the same boot attempt.
 */
export async function ensureOllamaRunning(): Promise<boolean> {
  if ((await getOllamaStatus()).running) return true;
  if (!envFlag("OLLAMA_AUTOSTART", true) || !isLocalOllamaHost()) return false;
  if (ollamaBoot) return ollamaBoot;

  ollamaBoot = (async () => {
    try {
      if (Date.now() - lastSpawnAt > OLLAMA_RESPAWN_GUARD_MS) {
        const exe = findOllamaExecutable();
        console.log(`[offline-brain] تشغيل خادم Ollama تلقائياً: ${exe} serve`);
        lastSpawnAt = Date.now();
        const child = spawn(exe, ["serve"], { detached: true, stdio: "ignore", windowsHide: true });
        child.on("error", (err) => console.warn(`[offline-brain] تعذر تشغيل Ollama: ${err.message}`));
        child.unref();
      } else {
        console.log("[offline-brain] Ollama قيد الإقلاع من محاولة سابقة — بانتظار جاهزيته...");
      }

      const deadline = Date.now() + OLLAMA_BOOT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        if ((await getOllamaStatus()).running) {
          console.log("[offline-brain] ✅ خادم Ollama جاهز.");
          return true;
        }
      }
      console.warn("[offline-brain] ⚠ لم يستجب Ollama خلال المهلة.");
      return false;
    } finally {
      ollamaBoot = null;
    }
  })();
  return ollamaBoot;
}

/** Pick the local model to use offline: OLLAMA_OFFLINE_MODEL if installed, else the first installed model. */
export async function resolveLocalModel(): Promise<string | null> {
  if (!(await ensureOllamaRunning())) return null;
  const status = await getOllamaStatus();
  if (!status.models.length) return null;
  const preferred = process.env.OLLAMA_OFFLINE_MODEL?.trim();
  if (preferred) {
    const id = preferred.startsWith(OLLAMA_PREFIX) ? preferred : `${OLLAMA_PREFIX}${preferred}`;
    if (status.models.some((m) => m.id === id)) return id;
  }
  return status.models[0]?.id ?? null;
}

/** Like resolveLocalModel, but throws a clear Arabic error when no local brain is available. */
export async function requireLocalModel(): Promise<string> {
  const model = await resolveLocalModel();
  if (model) return model;
  throw new AppError("لا يوجد اتصال بالإنترنت ولا يوجد نموذج محلي جاهز.", {
    status: 503,
    hint: "ثبّت Ollama من ollama.com ثم نزّل نموذجاً وأنت متصل، مثلاً: ollama pull qwen2.5-coder:7b",
  });
}

/**
 * Load a model into memory ahead of time and pre-evaluate SANAD's system prompt, so Ollama's
 * prompt cache already holds it and the first real answer skips ~1000 tokens of CPU prompt eval.
 * Uses the same options as chat requests to avoid a reload.
 */
export async function warmUpModel(modelId: string): Promise<void> {
  if (warmedModel === modelId) return;
  if (warmingModel) return warmingModel;
  const name = cleanOllamaModelName(modelId);
  warmingModel = (async () => {
    const started = Date.now();
    try {
      const system = await getLocalSystemPromptWithMemory();
      const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: name,
          messages: [
            { role: "system", content: system },
            { role: "user", content: "." },
          ],
          stream: false,
          keep_alive: ollamaKeepAlive(),
          think: ollamaThink(),
          options: ollamaRuntimeOptions({ num_predict: 1 }),
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) {
        await res.text();
        warmedModel = modelId;
        console.log(`[offline-brain] 🔥 تم تحميل ${name} في الذاكرة خلال ${((Date.now() - started) / 1000).toFixed(1)} ث.`);
      }
    } catch (err) {
      console.warn(`[offline-brain] تعذر تسخين ${name}: ${(err as Error).message}`);
    } finally {
      warmingModel = null;
    }
  })();
  return warmingModel;
}

export async function getBrainStatus(force = false): Promise<BrainStatus> {
  const setting = getSanadMode();
  // Offline mode never probes the network (no DNS queries leave the machine).
  const [online, status] = await Promise.all([setting === "offline" ? Promise.resolve(false) : isOnline(force), getOllamaStatus()]);
  const localModels = status.models.map((m) => m.id);
  const preferred = process.env.OLLAMA_OFFLINE_MODEL?.trim();
  const localModel =
    (preferred && localModels.find((id) => cleanOllamaModelName(id) === cleanOllamaModelName(preferred))) || localModels[0] || null;
  const useLocal = setting === "offline" || (setting === "auto" && !online);
  const mode: BrainStatus["mode"] = useLocal ? (localModel ? "local" : "none") : online ? "cloud" : "none";
  return { online, mode, ollamaRunning: status.running, localModel, localModels, warmed: warmedModel !== null && warmedModel === localModel, setting };
}

/** Called once at server start: boot Ollama in the background, optionally warm the model. */
export function initOfflineBrain(): void {
  void (async () => {
    const ready = await ensureOllamaRunning();
    if (!ready) {
      console.warn("[offline-brain] Ollama غير متاح — لن يعمل سند دون إنترنت حتى يتم تثبيته وتشغيله.");
      return;
    }
    const setting = getSanadMode();
    if (setting === "cloud") return;
    console.log(`[offline-brain] وضع التشغيل: SANAD_MODE=${setting}`);
    const online = setting === "offline" ? false : await isOnline(true);
    if (setting === "offline" || !online || envFlag("OLLAMA_WARMUP", false)) {
      const model = await resolveLocalModel();
      if (model) await warmUpModel(model);
    }
  })().catch((err) => console.warn(`[offline-brain] init error: ${(err as Error).message}`));
}
