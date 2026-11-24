import { applySttEngine, getSpeechStatus, transcribeWav, warmSpeech } from "../localSpeech";
import { getVoiceStatus, synthesizeSpeech } from "../localVoice";
import { CLOUD_VOICES, LOCAL_VOICES, getVoiceSettings, updateVoiceSettings } from "../voiceSettings";
import { readJsonBody, readRawBody, sendJson } from "../http/core";
import type { Route } from "../http/router";

/** الصوت: النطق والسماع والإعدادات. */
export const voiceRoutes: Route[] = [
  {
    method: "GET", path: "/api/voice/status", handler: async ({ res }) => {
      const status = await getSpeechStatus();
      sendJson(res, 200, { success: true, ...status, tts: getVoiceStatus() });
    },
  },
  {
    method: "POST", path: "/api/voice/speak", handler: async ({ req, res }) => {
      const body = await readJsonBody(req, 64 * 1024);
      const gender = body.gender === "male" || body.gender === "female" ? body.gender : undefined;
      const voice = typeof body.voice === "string" ? body.voice : undefined; // validated against an allow-list
      const result = await synthesizeSpeech(String(body.text ?? ""), { gender, voice, forceLocal: body.engine === "local" });
      res.writeHead(200, {
        "Content-Type": result.mime,
        "Content-Length": result.audio.length,
        "Cache-Control": "no-store",
        "X-Voice-Source": result.source,
      });
      res.end(result.audio);
    },
  },
  {
    method: "POST", path: "/api/voice/warm", handler: async ({ res }) => {
      void warmSpeech(); // background: returns immediately
      sendJson(res, 202, { success: true });
    },
  },
  {
    method: "GET", path: "/api/voice/settings", handler: async ({ res }) => {
      sendJson(res, 200, {
        success: true,
        settings: await getVoiceSettings(),
        cloudVoices: Object.entries(CLOUD_VOICES).map(([id, v]) => ({ id, ...v })),
        localVoices: LOCAL_VOICES,
      });
    },
  },
  {
    method: "POST", path: "/api/voice/settings", handler: async ({ req, res }) => {
      const body = await readJsonBody(req, 4 * 1024);
      const before = (await getVoiceSettings()).stt;
      const settings = await updateVoiceSettings(body);
      if (settings.stt !== before) void applySttEngine(settings.stt); // free the recognizer no longer used
      sendJson(res, 200, { success: true, settings });
    },
  },
  {
    method: "POST", path: "/api/voice/transcribe", handler: async ({ req, res, url }) => {
      const wav = await readRawBody(req, 8 * 1024 * 1024); // ~4 min of 16 kHz mono PCM
      const lang = url.searchParams.get("lang") || "ar";
      const result = await transcribeWav(wav, lang);
      sendJson(res, 200, { success: true, ...result });
    },
  },
];
