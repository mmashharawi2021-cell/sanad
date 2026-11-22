import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { AppError } from "./config";

/**
 * Offline Arabic text-to-speech via Piper (rhasspy/piper, CPU, ~80 MB incl. voice).
 * One persistent `piper --json-input` process is kept warm: loading the voice + Arabic
 * diacritizer costs ~2 s once; each sentence afterwards synthesizes ~8× faster than real time.
 * The process is stopped after an idle period to free memory.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EXE = join(ROOT, "vendor", "piper", "bin", "piper", "piper.exe");
const DEFAULT_VOICE = join(ROOT, "vendor", "piper", "voices", "ar_JO-kareem-medium.onnx");
const OUT_DIR = join(tmpdir(), "sanad-tts");
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CHARS = 600;

type Pending = { file: string; resolve: (wav: Buffer) => void; reject: (err: Error) => void; timer: NodeJS.Timeout };

let worker: ChildProcessWithoutNullStreams | null = null;
const queue: Pending[] = [];
let idleTimer: NodeJS.Timeout | null = null;

function exePath(): string {
  return process.env.PIPER_EXE?.trim() || DEFAULT_EXE;
}

function voicePath(): string {
  return process.env.PIPER_VOICE?.trim() || DEFAULT_VOICE;
}

function idleMs(): number {
  const m = Number(process.env.PIPER_IDLE_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : 10) * 60_000;
}

export type VoiceStatus = { available: boolean; running: boolean; engine: "piper"; voice: string; missing: string[] };

export function getVoiceStatus(): VoiceStatus {
  const required = [exePath(), voicePath(), `${voicePath()}.json`];
  const missing = required.filter((p) => !existsSync(p));
  return {
    available: missing.length === 0,
    running: worker !== null,
    engine: "piper",
    voice: voicePath().split(/[\\/]/).pop()?.replace(/\.onnx$/, "") || "",
    missing,
  };
}

/** Make text speakable: drop code, markdown, links, tool tags and emoji; cap length. */
export function cleanTextForSpeech(text: string): string {
  let t = String(text ?? "");
  t = t.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, " ");
  t = t.replace(/```[\s\S]*?```/g, " كود برمجي. ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/https?:\/\/\S+/g, " رابط ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/[#*_>|~]+/g, " ");
  t = t.replace(/\p{Extended_Pictographic}|️/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS);
    const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("،"), cut.lastIndexOf("؟"), cut.lastIndexOf("!"));
    t = lastStop > MAX_CHARS / 2 ? cut.slice(0, lastStop + 1) : cut;
  }
  return t;
}

function failAll(err: Error): void {
  while (queue.length) {
    const p = queue.shift()!;
    clearTimeout(p.timer);
    p.reject(err);
  }
}

function scheduleIdleStop(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(stopVoiceWorker, idleMs());
  idleTimer.unref();
}

export function stopVoiceWorker(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (worker) {
    console.log("[local-voice] إيقاف محرك النطق المحلي بعد فترة خمول لتوفير الذاكرة.");
    worker.kill();
  }
  worker = null;
}

async function onOutputLine(): Promise<void> {
  const p = queue.shift();
  if (!p) return;
  clearTimeout(p.timer);
  try {
    // Piper prints the path even when writing failed, so verify the file really exists.
    const info = await stat(p.file);
    if (info.size <= 44) throw new Error("empty audio");
    const wav = await readFile(p.file);
    p.resolve(wav);
  } catch (err) {
    p.reject(new AppError("فشل توليد الصوت محلياً.", { status: 502, hint: (err as Error).message }));
  } finally {
    unlink(p.file).catch(() => undefined);
  }
}

function startWorker(): ChildProcessWithoutNullStreams {
  const exe = exePath();
  const args = ["-m", voicePath(), "--json-input"];
  const lengthScale = Number(process.env.PIPER_LENGTH_SCALE);
  if (Number.isFinite(lengthScale) && lengthScale > 0.3 && lengthScale < 3) args.push("--length_scale", String(lengthScale));

  console.log("[local-voice] تشغيل محرك النطق العربي المحلي (Piper)...");
  const child = spawn(exe, args, { cwd: dirname(exe), windowsHide: true });
  child.stdin.setDefaultEncoding("utf8");
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (line.trim()) void onOutputLine();
  });
  child.stderr.on("data", () => undefined); // Piper logs timing info to stderr; drain it.
  child.on("error", (err) => {
    console.warn(`[local-voice] تعذر تشغيل Piper: ${err.message}`);
    worker = null;
    failAll(new AppError("تعذر تشغيل محرك النطق المحلي.", { status: 503, hint: err.message }));
  });
  child.on("exit", () => {
    if (worker === child) worker = null;
    failAll(new AppError("توقف محرك النطق المحلي بشكل غير متوقع.", { status: 502 }));
  });
  child.unref();
  return child;
}

/** Synthesize Arabic speech; returns a 22.05 kHz mono WAV. */
export async function synthesizeSpeech(rawText: string): Promise<Buffer> {
  const text = cleanTextForSpeech(rawText);
  if (!text) throw new AppError("لا يوجد نص قابل للنطق.", { status: 400 });

  const status = getVoiceStatus();
  if (!status.available) {
    throw new AppError("محرك النطق المحلي غير مُثبَّت.", { status: 503, hint: `ملفات ناقصة: ${status.missing.join("، ")}` });
  }

  await mkdir(OUT_DIR, { recursive: true });
  if (!worker) worker = startWorker();
  scheduleIdleStop();

  const file = join(OUT_DIR, `${randomUUID()}.wav`);
  const active = worker;
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = queue.findIndex((p) => p.file === file);
      if (i >= 0) queue.splice(i, 1);
      reject(new AppError("انتهت مهلة توليد الصوت.", { status: 504 }));
    }, REQUEST_TIMEOUT_MS);
    queue.push({ file, resolve, reject, timer });
    active.stdin.write(`${JSON.stringify({ text, output_file: file })}\n`);
  });
}
