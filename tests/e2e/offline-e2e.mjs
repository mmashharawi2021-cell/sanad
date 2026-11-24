// اختبار شامل لسند أثناء انقطاع الإنترنت (محاكاة على مستوى العملية — الجهاز يبقى متصلاً).
// يحتاج: Ollama ونماذجه، ومكوّنات الصوت (npm.cmd run offline:setup). أبطأ من بقية الاختبارات.
//   npm.cmd run test:e2e              ← المحادثة، الصوت، الأوامر، البحث
//   npm.cmd run test:e2e -- --vision  ← ومعها فحص الشاشة بالنموذج المحلي (~15 ث إضافية)
// لا يغيّر شيئاً على الجهاز: يُرسل فقط أسئلة وطلبات قراءة ونطقاً؛ إعداد السماع يُعاد كما كان.
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { startSanad, ROOT } from "../helpers/sanad-server.mjs";

const VISION = process.argv.includes("--vision");
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push(true);
    console.log(`✓ ${name.padEnd(40)} ${String(Date.now() - t).padStart(6)} ms  ${detail ?? ""}`);
  } catch (e) {
    results.push(false);
    console.log(`✗ ${name.padEnd(40)} ${String(Date.now() - t).padStart(6)} ms  ${e.message}`);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

/** يحوّل صوت WAV (أي تردد) إلى WAV أحادي 16kHz كما تفعل الواجهة قبل الإرسال للتعرّف. */
function toWav16k(w) {
  const rate = w.readUInt32LE(24);
  let p = 12, off = 44, len = w.length - 44;
  while (p < w.length - 8) { const id = w.toString("ascii", p, p + 4), sz = w.readUInt32LE(p + 4); if (id === "data") { off = p + 8; len = sz; break; } p += 8 + sz; }
  const n = len / 2, ratio = rate / 16000, out = Math.floor(n / ratio), pcm = Buffer.alloc(44 + out * 2);
  for (let i = 0; i < out; i++) { const a = Math.floor(i * ratio), b = Math.min(n, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b; j++) s += w.readInt16LE(off + j * 2); pcm.writeInt16LE(Math.round(s / Math.max(1, b - a)), 44 + i * 2); }
  pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + out * 2, 4); pcm.write("WAVEfmt ", 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(16000, 24); pcm.writeUInt32LE(32000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(out * 2, 40);
  return pcm;
}

/** صورة PNG بسيطة (خلفية داكنة + شريط) — تكفي للتأكد أن نموذج الرؤية المحلي يستجيب. */
function tinyPng(w = 320, h = 120) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const bar = y > 50 && y < 70; raw[o] = bar ? 230 : 25; raw[o + 1] = bar ? 60 : 25; raw[o + 2] = bar ? 40 : 30; }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const s = await startSanad({
  env: { SANAD_MODE: "auto", OLLAMA_AUTOSTART: "true" },
  nodeOptions: `--require ${join(ROOT, "tests", "helpers", "offline-preload.cjs").replace(/\\/g, "/")}`,
});
const sttBefore = (await s.request("/api/voice/settings")).json.settings.stt;

try {
  await step("حالة العقل: أوفلاين ومحلي", async () => {
    // إن لم يكن Ollama يعمل، يشغّله سند عند الإقلاع في الخلفية — ننتظر جاهزيته بدل فحص لحظي
    let r;
    for (let i = 0; i < 60; i++) {
      r = (await s.request("/api/brain/status?force=1")).json;
      if (r.mode === "local") break;
      await new Promise((res) => setTimeout(res, 1000));
    }
    must(!r.online && r.mode === "local", JSON.stringify(r));
    return r.localModel;
  });
  await step("محادثة: تحويل تلقائي للعقل المحلي", async () => {
    const r = await s.request("/api/chat/stream", { body: { messages: [{ role: "user", content: "ما عاصمة فرنسا؟ أجب بكلمة." }], model: "" } });
    const text = [...r.text.matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]).join("");
    must(/event: notice/.test(r.text), "لا إشعار تحويل");
    must(/باريس/.test(text), `الرد: ${text.slice(0, 80)}`);
    return text.slice(0, 40);
  });
  await step("أمر فوري: فحص منفذ", async () => {
    const r = (await s.request(`/api/network/port/check?port=${s.port}`)).json;
    must(r.inUse, r.message);
    return r.message;
  });
  await step("البحث في الويب: رسالة واضحة دون إنترنت", async () => {
    const r = (await s.request("/api/web/search", { body: { query: "node.js" } })).json;
    must(r.offline === true, JSON.stringify(r).slice(0, 120));
  });
  let localWav;
  await step("النطق المحلي (Piper)", async () => {
    const r = await fetch(`${s.base}/api/voice/speak`, { method: "POST", headers: { cookie: s.cookie, "x-sanad-request": "1", "content-type": "application/json" }, body: JSON.stringify({ text: "حرر المنفذ ثلاثة آلاف وافحص النت.", engine: "local" }) });
    must(r.ok && r.headers.get("x-voice-source") === "local", `source=${r.headers.get("x-voice-source")}`);
    localWav = Buffer.from(await r.arrayBuffer());
  });
  await step("النطق بصوت طبيعي محفوظ (دون إنترنت)", async () => {
    const r = await fetch(`${s.base}/api/voice/speak`, { method: "POST", headers: { cookie: s.cookie, "x-sanad-request": "1", "content-type": "application/json" }, body: JSON.stringify({ text: "تم بنجاح." }) });
    const src = r.headers.get("x-voice-source");
    must(r.ok && ["cache", "local"].includes(src), `source=${src}`);
    return src === "cache" ? "من الذاكرة المؤقتة" : "لا توجد نسخة محفوظة (npm.cmd run voice:warm)";
  });
  await step("السماع (FastConformer)", async () => {
    await s.request("/api/voice/settings", { body: { stt: "fastconformer" } });
    await s.request("/api/voice/warm", { body: {} });
    // أول تعرّف يحمّل النموذج (~3 ث عادةً، وقد يطول كثيراً إن كانت الرام مزدحمة)
    const r = await s.request("/api/voice/transcribe?lang=ar", { raw: toWav16k(localWav), contentType: "audio/wav", timeoutMs: 150_000 });
    must(r.status === 200 && r.json.text, r.text.slice(0, 120));
    must(/المنفذ/.test(r.json.text), `سمع: ${r.json.text}`);
    return `${r.json.engine}: «${r.json.text}»`;
  });
  if (VISION) {
    await step("فحص الشاشة (رؤية محلية)", async () => {
      const r = await s.request("/api/vision/analyze", { body: { imageBase64: tinyPng().toString("base64"), mimeType: "image/png", prompt: "صف الصورة بجملة." } });
      must(r.status === 200, r.text.slice(0, 120));
      const model = r.json.analysis?.model || r.json.model || "";
      must(/محلي|ollama/i.test(model), `النموذج: ${model}`);
      return model;
    });
  }
} finally {
  await s.request("/api/voice/settings", { body: { stt: sttBefore } }).catch(() => {});
  await s.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} نجح${failed ? ` — ${failed} فشل` : ""} (إعداد السماع أُعيد إلى: ${sttBefore})`);
process.exit(failed ? 1 : 0);
