import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./config";
import { sidecarAvailable, sidecarCall, sidecarRunning } from "./voiceSidecar";
import { getVoiceSettings } from "./voiceSettings";

/**
 * Offline speech-to-text via whisper.cpp's `whisper-server` (CPU build, no internet).
 * The server is started lazily on first use and stopped after an idle period to free RAM.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EXE = join(ROOT, "vendor", "whisper", "bin", "Release", "whisper-server.exe");
const DEFAULT_MODEL = join(ROOT, "vendor", "whisper", "models", "ggml-small-q5_1.bin");
const FASTCONFORMER_MODEL = join(ROOT, "vendor", "stt", "fastconformer", "model.onnx");
const HOST = "127.0.0.1";
const BOOT_TIMEOUT_MS = 45_000;
/**
 * Short vocabulary hint. Measured: no hint → "يا سنديفتح العالة الحاسبة … كرم" (2.4–4.8 s);
 * this hint → exact text incl. "3000" as digits (3.5–5.8 s). A longer hint was slower with no accuracy gain.
 */
const DEFAULT_PROMPT = "يا سند، الآلة الحاسبة، كروم، المنفذ 3000.";

let child: ChildProcess | null = null;
let booting: Promise<boolean> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

export type SpeechStatus = {
  available: boolean;
  running: boolean;
  engine: "fastconformer" | "whisper.cpp";
  model: string;
  missing: string[];
};

function exePath(): string {
  return process.env.WHISPER_SERVER_EXE?.trim() || DEFAULT_EXE;
}

function modelPath(): string {
  return process.env.WHISPER_MODEL?.trim() || DEFAULT_MODEL;
}

function port(): number {
  const p = Number(process.env.WHISPER_PORT);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 8178;
}

function baseUrl(): string {
  return `http://${HOST}:${port()}`;
}

function idleMs(): number {
  const m = Number(process.env.WHISPER_IDLE_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : 10) * 60_000;
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSpeechStatus(): Promise<SpeechStatus> {
  const missing = [exePath(), modelPath()].filter((p) => !existsSync(p));
  const whisperOk = missing.length === 0;
  const useFast = (await getVoiceSettings()).stt === "fastconformer" && fastConformerAvailable();
  return {
    available: whisperOk || fastConformerAvailable(),
    running: useFast ? sidecarRunning() : await isServerUp(),
    engine: useFast ? "fastconformer" : "whisper.cpp",
    model: useFast ? "stt_ar_fastconformer_hybrid_large_pc" : modelPath().split(/[\\/]/).pop() || "",
    missing,
  };
}

function scheduleIdleStop(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(stopSpeechServer, idleMs());
  idleTimer.unref();
}

/** Stop the whisper server we started (frees ~300–500 MB RAM). */
export function stopSpeechServer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (child && child.exitCode === null) {
    console.log("[local-speech] إيقاف محرك السماع المحلي بعد فترة خمول لتوفير الذاكرة.");
    child.kill();
  }
  child = null;
}

/** Start whisper-server if needed (shared by concurrent callers). */
export async function ensureSpeechServer(): Promise<boolean> {
  if (await isServerUp()) return true;
  if (booting) return booting;

  const exe = exePath();
  const model = modelPath();
  if (!existsSync(exe) || !existsSync(model)) return false;

  booting = (async () => {
    try {
      const threads = String(Math.max(2, Math.min(8, Number(process.env.WHISPER_THREADS) || cpus().length)));
      // Speed tuning measured on i5-11300H (3.8 s clip): 7.6 s default → 2.2 s with these flags, same text.
      // -ac 512 limits the encoder window to ~10 s (voice commands are short; the UI caps clips at 10 s),
      // -nf -bo 1 = greedy decoding without temperature fallback.
      const audioCtx = String(Number(process.env.WHISPER_AUDIO_CTX) || 512);
      console.log(`[local-speech] تشغيل محرك السماع المحلي (whisper.cpp) على المنفذ ${port()}...`);
      const args = ["-m", model, "--host", HOST, "--port", String(port()), "-l", "ar", "-t", threads, "-ac", audioCtx, "-nf", "-bo", "1"];
      child = spawn(exe, args, {
        cwd: dirname(exe),
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", (err) => console.warn(`[local-speech] تعذر تشغيل whisper-server: ${err.message}`));
      child.on("exit", () => {
        child = null;
      });
      child.unref(); // never keep SANAD's process alive because of the speech engine

      const deadline = Date.now() + BOOT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400));
        if (await isServerUp()) {
          console.log("[local-speech] ✅ محرك السماع المحلي جاهز.");
          return true;
        }
        if (!child) break; // process exited
      }
      console.warn("[local-speech] ⚠ لم يجهز محرك السماع خلال المهلة.");
      return false;
    } finally {
      booting = null;
    }
  })();
  return booting;
}

/** Known Whisper hallucinations on silence/noise (subtitle credits, bracketed sound tags…). */
const HALLUCINATIONS = [
  /ترجمة\s+نانسي\s+قنقر/g,
  /اشتركوا?\s+في\s+القناة/g,
  /شكرا\s+(لكم\s+)?(على\s+)?(ل)?المشاهدة/g,
  /\[[^\]]*\]|\([^)]*موسيق[^)]*\)/g,
  /^\s*(\.|،|!|\?)+\s*$/g,
];

export function cleanTranscript(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  for (const re of HALLUCINATIONS) t = t.replace(re, " ");
  t = t.replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : "";
}

/**
 * Transcribe a 16 kHz mono WAV buffer (produced by the browser) to text.
 * Default engine: NVIDIA FastConformer Arabic via the voice sidecar (measured on this laptop:
 * ~0.16 s and 97% accuracy vs whisper-small's ~1.9 s and 92%). whisper.cpp stays as the fallback.
 */
export async function transcribeWav(wav: Buffer, language = "ar"): Promise<{ text: string; latencyMs: number; engine: string }> {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new AppError("ملف الصوت غير صالح (يجب أن يكون WAV).", { status: 400 });
  }
  const settings = await getVoiceSettings();
  if (settings.stt === "fastconformer" && language === "ar" && fastConformerAvailable()) {
    const started = Date.now();
    const file = join(tmpdir(), `sanad-stt-${randomUUID()}.wav`);
    try {
      await writeFile(file, wav);
      // Generous timeout: if the model is still loading (cold start), wait for it rather than
      // falling back to whisper, which would cold-start a second engine.
      const r = await sidecarCall("stt", { wav: file }, 90_000);
      if (!r.ok) throw new Error(String(r.error ?? "stt failed"));
      if (child) void applySttEngine("fastconformer"); // a fallback whisper is no longer needed
      return { text: cleanTranscript(String(r.text ?? "")), latencyMs: Date.now() - started, engine: "fastconformer" };
    } catch (err) {
      const msg = (err as Error).message;
      // Still loading: starting whisper as well would load a second engine (~850 MB) on top.
      // (Very long loads were once caused by a stdin/DLL-load hang in the sidecar — fixed there.)
      if (/timed out/i.test(msg) && sidecarRunning()) {
        throw new AppError("محرك السماع ما زال يُحمَّل، والذاكرة مزدحمة. أعد المحاولة بعد لحظات.", {
          status: 503,
          hint: "أغلق بعض البرامج الثقيلة لتسريع التحميل.",
        });
      }
      console.warn(`[local-speech] FastConformer تعذر، التحويل إلى whisper: ${msg}`);
    } finally {
      unlink(file).catch(() => undefined);
    }
  }
  return { ...(await transcribeWithWhisper(wav, language)), engine: "whisper.cpp" };
}

/**
 * Keep only one recognizer in memory. Measured private memory: whisper-server ≈ 850 MB,
 * FastConformer (in the voice sidecar) ≈ 780 MB — both loaded at once cost ~1.6 GB.
 * Called when the setting changes, and after each transcription as a safety net.
 */
export async function applySttEngine(engine: "fastconformer" | "whisper"): Promise<void> {
  if (engine === "fastconformer") {
    if (child) {
      console.log("[local-speech] إيقاف whisper لأن FastConformer هو المحرك المختار (توفير ~850MB).");
      stopSpeechServer();
    }
  } else if (sidecarRunning()) {
    const r = await sidecarCall("unload_stt", {}, 15_000).catch(() => null);
    if (r?.ok && r.unloaded) console.log("[local-speech] تفريغ FastConformer لأن whisper هو المحرك المختار (توفير ~780MB).");
  }
}

let warming: Promise<void> | null = null;

/**
 * Load the speech recognizer ahead of time (called when the user opens the mic or voice mode),
 * so the first utterance is not delayed by a cold model load.
 */
export function warmSpeech(): Promise<void> {
  if (warming) return warming;
  warming = (async () => {
    const s = await getVoiceSettings();
    if (s.stt === "fastconformer" && fastConformerAvailable()) {
      const r = await sidecarCall("warm", {}, 120_000);
      if (r.ok && !r.alreadyLoaded) console.log(`[local-speech] ✅ FastConformer جاهز (${r.ms} ms).`);
    } else {
      await ensureSpeechServer();
    }
  })()
    .catch((err) => console.warn(`[local-speech] تعذر تسخين محرك السماع: ${(err as Error).message}`))
    .finally(() => {
      warming = null;
    });
  return warming;
}

function fastConformerAvailable(): boolean {
  return sidecarAvailable() && existsSync(FASTCONFORMER_MODEL);
}

async function transcribeWithWhisper(wav: Buffer, language: string): Promise<{ text: string; latencyMs: number }> {
  const ready = await ensureSpeechServer();
  if (!ready) {
    throw new AppError("محرك السماع المحلي غير متاح.", {
      status: 503,
      hint: "شغّل أمر التجهيز لتنزيل whisper.cpp ونموذج الصوت (vendor/whisper).",
    });
  }
  scheduleIdleStop();

  const started = Date.now();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "speech.wav");
  form.append("response_format", "json");
  form.append("temperature", "0.0");
  form.append("language", /^[a-z]{2}$/.test(language) ? language : "ar");
  // Vocabulary hint: biases Whisper toward SANAD's wake word, commands and app names.
  form.append("prompt", process.env.WHISPER_PROMPT?.trim() || DEFAULT_PROMPT);

  const res = await fetch(`${baseUrl()}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppError(`فشل التعرف على الصوت محلياً (HTTP ${res.status}).`, { status: 502, hint: body.slice(0, 200) });
  }
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new AppError(`خطأ في محرك السماع: ${data.error}`, { status: 502 });
  return { text: cleanTranscript(String(data.text ?? "")), latencyMs: Date.now() - started };
}
