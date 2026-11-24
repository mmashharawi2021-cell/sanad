import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * User voice preferences, persisted in data/voice-settings.json.
 * Only values from the allow-lists below are accepted (the file and the API never take free text).
 */

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "voice-settings.json");

export type Gender = "male" | "female";
export type SttEngine = "fastconformer" | "whisper";

/** Natural (online) Microsoft neural voices offered in the UI. */
export const CLOUD_VOICES: Record<string, { label: string; gender: Gender }> = {
  "ar-SA-HamedNeural": { label: "حامد — سعودي", gender: "male" },
  "ar-SA-ZariyahNeural": { label: "زارية — سعودية", gender: "female" },
  "ar-EG-ShakirNeural": { label: "شاكر — مصري", gender: "male" },
  "ar-EG-SalmaNeural": { label: "سلمى — مصرية", gender: "female" },
  "ar-JO-TaimNeural": { label: "تيم — أردني", gender: "male" },
  "ar-JO-SanaNeural": { label: "سناء — أردنية", gender: "female" },
  "ar-AE-HamdanNeural": { label: "حمدان — إماراتي", gender: "male" },
  "ar-AE-FatimaNeural": { label: "فاطمة — إماراتية", gender: "female" },
  "ar-LB-RamiNeural": { label: "رامي — لبناني", gender: "male" },
  "ar-LB-LaylaNeural": { label: "ليلى — لبنانية", gender: "female" },
};

/** Offline Piper voices (file stem in vendor/piper/voices) per gender. */
export const LOCAL_VOICES: Record<Gender, { file: string; label: string }> = {
  male: { file: "ar_JO-kareem-medium", label: "كريم" },
  female: { file: "dii_ar", label: "دي" },
};

export type VoiceSettings = {
  gender: Gender;
  maleVoice: string;
  femaleVoice: string;
  /** Use natural online voices when connected (otherwise always the offline voice). */
  naturalOnline: boolean;
  stt: SttEngine;
};

const DEFAULTS: VoiceSettings = {
  gender: "male",
  maleVoice: "ar-SA-HamedNeural",
  femaleVoice: "ar-SA-ZariyahNeural",
  naturalOnline: true,
  stt: "fastconformer",
};

let cached: VoiceSettings | null = null;

function sanitize(input: Partial<Record<keyof VoiceSettings, unknown>>, base: VoiceSettings): VoiceSettings {
  const out = { ...base };
  if (input.gender === "male" || input.gender === "female") out.gender = input.gender;
  if (typeof input.maleVoice === "string" && CLOUD_VOICES[input.maleVoice]?.gender === "male") out.maleVoice = input.maleVoice;
  if (typeof input.femaleVoice === "string" && CLOUD_VOICES[input.femaleVoice]?.gender === "female") out.femaleVoice = input.femaleVoice;
  if (typeof input.naturalOnline === "boolean") out.naturalOnline = input.naturalOnline;
  if (input.stt === "fastconformer" || input.stt === "whisper") out.stt = input.stt;
  return out;
}

export async function getVoiceSettings(): Promise<VoiceSettings> {
  if (cached) return cached;
  try {
    cached = sanitize(JSON.parse(await readFile(FILE, "utf8")), DEFAULTS);
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

export async function updateVoiceSettings(patch: Record<string, unknown>): Promise<VoiceSettings> {
  const next = sanitize(patch, await getVoiceSettings());
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  cached = next;
  return next;
}

/** The voice currently selected for natural (online) speech. */
export function activeCloudVoice(s: VoiceSettings): string {
  return s.gender === "female" ? s.femaleVoice : s.maleVoice;
}
