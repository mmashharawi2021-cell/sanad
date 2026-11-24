import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, utimes } from "node:fs/promises";
import { constants as osConstants, setPriority, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { AppError } from "./config";
import { getSanadMode, isOnline } from "./offlineBrain";
import { sidecarAvailable, sidecarCall } from "./voiceSidecar";
import { CLOUD_VOICES, LOCAL_VOICES, activeCloudVoice, getVoiceSettings, type Gender } from "./voiceSettings";

/**
 * Sanad's speech output, in order of preference:
 *  1. Cache  — any sentence already spoken with a natural voice (data/voice-cache), works offline.
 *  2. Natural — Microsoft neural Arabic voices through the voice sidecar, when online and allowed.
 *  3. Local  — Piper (male: Kareem, female: Dii), fully offline, ~0.6–1 s per sentence.
 * Piper keeps one warm `--json-input` process per voice (voice + diacritizer load once, ~2 s),
 * stopped after an idle period to free memory.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EXE = join(ROOT, "vendor", "piper", "bin", "piper", "piper.exe");
const VOICES_DIR = join(ROOT, "vendor", "piper", "voices");
const OUT_DIR = join(tmpdir(), "sanad-tts");
const CACHE_DIR = join(ROOT, "data", "voice-cache");
const CACHE_MAX_BYTES = 300 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const CLOUD_TIMEOUT_MS = 12_000;
const MAX_CHARS = 600;

export type SpeechResult = { audio: Buffer; mime: "audio/mpeg" | "audio/wav"; source: "cache" | "natural" | "local"; voice: string };

type Pending = { file: string; resolve: (wav: Buffer) => void; reject: (err: Error) => void; timer: NodeJS.Timeout };
type PiperWorker = { proc: ChildProcessWithoutNullStreams; queue: Pending[]; idle: NodeJS.Timeout | null };

const workers = new Map<string, PiperWorker>();
let cacheWrites = 0;

function exePath(): string {
  return process.env.PIPER_EXE?.trim() || DEFAULT_EXE;
}

function localVoicePath(gender: Gender): string {
  return join(VOICES_DIR, `${LOCAL_VOICES[gender].file}.onnx`);
}

function idleMs(): number {
  const m = Number(process.env.PIPER_IDLE_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : 10) * 60_000;
}

export type VoiceStatus = {
  available: boolean;
  running: boolean;
  engine: "piper";
  voice: string;
  missing: string[];
  natural: boolean;
  voices: { male: boolean; female: boolean };
};

export function getVoiceStatus(): VoiceStatus {
  const has = (g: Gender) => existsSync(localVoicePath(g)) && existsSync(`${localVoicePath(g)}.json`);
  const missing = [exePath(), localVoicePath("male"), localVoicePath("female")].filter((p) => !existsSync(p));
  return {
    available: existsSync(exePath()) && (has("male") || has("female")),
    running: workers.size > 0,
    engine: "piper",
    voice: LOCAL_VOICES.male.file,
    missing,
    natural: sidecarAvailable(),
    voices: { male: has("male"), female: has("female") },
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

/* ---------------------------- cache ---------------------------- */

function cacheFile(voice: string, text: string): string {
  const key = createHash("sha256").update(`${voice}\n${text}`).digest("hex").slice(0, 40);
  return join(CACHE_DIR, `${key}.mp3`);
}

/** Keep the cache under CACHE_MAX_BYTES by deleting the least recently used files. */
async function pruneCache(): Promise<void> {
  const names = await readdir(CACHE_DIR).catch(() => [] as string[]);
  const files = await Promise.all(
    names.filter((n) => n.endsWith(".mp3")).map(async (n) => {
      const p = join(CACHE_DIR, n);
      const s = await stat(p);
      return { p, size: s.size, t: s.mtimeMs };
    }),
  );
  let total = files.reduce((a, f) => a + f.size, 0);
  for (const f of files.sort((a, b) => a.t - b.t)) {
    if (total <= CACHE_MAX_BYTES) break;
    await unlink(f.p).catch(() => undefined);
    total -= f.size;
  }
}

/* ---------------------------- natural voice ---------------------------- */

async function speakNatural(text: string, voice: string, file: string): Promise<Buffer> {
  await mkdir(CACHE_DIR, { recursive: true });
  const r = await sidecarCall("tts", { text, voice, out: file }, CLOUD_TIMEOUT_MS);
  if (!r.ok) throw new Error(String(r.error ?? "tts failed"));
  const audio = await readFile(file);
  if (++cacheWrites % 25 === 0) void pruneCache();
  return audio;
}

/* ---------------------------- Piper (offline) ---------------------------- */

function stopWorker(key: string): void {
  const w = workers.get(key);
  if (!w) return;
  if (w.idle) clearTimeout(w.idle);
  workers.delete(key);
  w.proc.kill();
}

export function stopVoiceWorker(): void {
  for (const key of [...workers.keys()]) stopWorker(key);
}

async function onOutputLine(w: PiperWorker): Promise<void> {
  const p = w.queue.shift();
  if (!p) return;
  clearTimeout(p.timer);
  try {
    // Piper prints the path even when writing failed, so verify the file really exists.
    const info = await stat(p.file);
    if (info.size <= 44) throw new Error("empty audio");
    p.resolve(await readFile(p.file));
  } catch (err) {
    p.reject(new AppError("فشل توليد الصوت محلياً.", { status: 502, hint: (err as Error).message }));
  } finally {
    unlink(p.file).catch(() => undefined);
  }
}

function getWorker(voicePath: string): PiperWorker {
  const existing = workers.get(voicePath);
  if (existing) return existing;

  const exe = exePath();
  const args = ["-m", voicePath, "--json-input"];
  const lengthScale = Number(process.env.PIPER_LENGTH_SCALE);
  if (Number.isFinite(lengthScale) && lengthScale > 0.3 && lengthScale < 3) args.push("--length_scale", String(lengthScale));

  console.log(`[local-voice] تشغيل محرك النطق المحلي (Piper: ${voicePath.split(/[\\/]/).pop()})...`);
  const proc = spawn(exe, args, { cwd: dirname(exe), windowsHide: true }) as ChildProcessWithoutNullStreams;
  const w: PiperWorker = { proc, queue: [], idle: null };
  proc.stdin.setDefaultEncoding("utf8");
  createInterface({ input: proc.stdout }).on("line", (line) => {
    if (line.trim()) void onOutputLine(w);
  });
  proc.stderr.on("data", () => undefined); // Piper logs timing info to stderr; drain it.
  const fail = (msg: string) => {
    if (workers.get(voicePath) === w) workers.delete(voicePath);
    while (w.queue.length) {
      const p = w.queue.shift()!;
      clearTimeout(p.timer);
      p.reject(new AppError(msg, { status: 502 }));
    }
  };
  proc.on("error", (err) => fail(`تعذر تشغيل محرك النطق المحلي: ${err.message}`));
  proc.on("exit", () => fail("توقف محرك النطق المحلي بشكل غير متوقع."));
  proc.unref();
  // The local LLM competes for the CPU while a reply streams; giving Piper a higher priority
  // measured 1,875 → 1,580 ms per sentence under load, with no quality cost.
  try {
    if (proc.pid) setPriority(proc.pid, osConstants.priority.PRIORITY_ABOVE_NORMAL);
  } catch {
    // not permitted on this system — keep normal priority
  }
  workers.set(voicePath, w);
  return w;
}

async function speakLocal(text: string, gender: Gender): Promise<Buffer> {
  let voicePath = localVoicePath(gender);
  if (!existsSync(voicePath)) voicePath = localVoicePath(gender === "male" ? "female" : "male");
  if (!existsSync(exePath()) || !existsSync(voicePath)) {
    throw new AppError("محرك النطق المحلي غير مُثبَّت.", { status: 503, hint: "شغّل scripts/voice-setup.ps1" });
  }
  await mkdir(OUT_DIR, { recursive: true });
  const w = getWorker(voicePath);
  if (w.idle) clearTimeout(w.idle);
  w.idle = setTimeout(() => stopWorker(voicePath), idleMs());
  w.idle.unref();

  const file = join(OUT_DIR, `${randomUUID()}.wav`);
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = w.queue.findIndex((p) => p.file === file);
      if (i >= 0) w.queue.splice(i, 1);
      reject(new AppError("انتهت مهلة توليد الصوت.", { status: 504 }));
    }, REQUEST_TIMEOUT_MS);
    w.queue.push({ file, resolve, reject, timer });
    w.proc.stdin.write(`${JSON.stringify({ text, output_file: file })}\n`);
  });
}

/* ---------------------------- public API ---------------------------- */

/**
 * Speak `rawText` with the user's chosen voice. `override` lets the settings sheet preview
 * a specific voice/gender without saving it.
 */
export async function synthesizeSpeech(
  rawText: string,
  override: { gender?: Gender; voice?: string; forceLocal?: boolean } = {},
): Promise<SpeechResult> {
  const text = cleanTextForSpeech(rawText);
  if (!text) throw new AppError("لا يوجد نص قابل للنطق.", { status: 400 });

  const settings = await getVoiceSettings();
  if (override.forceLocal) {
    const g = override.gender ?? settings.gender;
    return { audio: await speakLocal(text, g), mime: "audio/wav", source: "local", voice: LOCAL_VOICES[g].file };
  }
  const voiceOverride = override.voice && CLOUD_VOICES[override.voice] ? override.voice : undefined;
  const gender: Gender = voiceOverride ? CLOUD_VOICES[voiceOverride]!.gender : override.gender ?? settings.gender;
  const cloudVoice = voiceOverride ?? activeCloudVoice({ ...settings, gender });

  // 1) Natural voice already spoken once → instant, works offline.
  const cached = cacheFile(cloudVoice, text);
  if (existsSync(cached)) {
    const now = new Date();
    utimes(cached, now, now).catch(() => undefined); // LRU
    return { audio: await readFile(cached), mime: "audio/mpeg", source: "cache", voice: cloudVoice };
  }

  // 2) Natural voice online.
  const allowCloud = settings.naturalOnline && getSanadMode() !== "offline" && sidecarAvailable();
  if (allowCloud && (await isOnline())) {
    try {
      return { audio: await speakNatural(text, cloudVoice, cached), mime: "audio/mpeg", source: "natural", voice: cloudVoice };
    } catch (err) {
      console.warn(`[voice] تعذر الصوت الطبيعي، التحويل للصوت المحلي: ${(err as Error).message}`);
    }
  }

  // 3) Offline voice.
  return { audio: await speakLocal(text, gender), mime: "audio/wav", source: "local", voice: LOCAL_VOICES[gender].file };
}

/** Pre-render phrases with the natural voices so they also sound natural offline. */
export async function warmVoiceCache(phrases: string[], voices: string[]): Promise<{ created: number; skipped: number; failed: number }> {
  let created = 0, skipped = 0, failed = 0;
  for (const voice of voices) {
    for (const raw of phrases) {
      const text = cleanTextForSpeech(raw);
      const file = cacheFile(voice, text);
      if (!text || existsSync(file)) { skipped++; continue; }
      try {
        await speakNatural(text, voice, file);
        created++;
      } catch {
        failed++;
      }
    }
  }
  await pruneCache();
  return { created, skipped, failed };
}
