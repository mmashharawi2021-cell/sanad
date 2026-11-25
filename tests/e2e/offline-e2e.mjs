// اختبار شامل لسند أثناء انقطاع الإنترنت (محاكاة على مستوى العملية — الجهاز يبقى متصلاً).
// يحتاج: Ollama ونماذجه (npm.cmd run offline:setup). أبطأ من بقية الاختبارات.
//   npm.cmd run test:e2e              ← المحادثة، وضع العمل، الأوامر، البحث
//   npm.cmd run test:e2e -- --vision  ← ومعها فحص الشاشة بالنموذج المحلي (~15 ث إضافية)
// لا يغيّر شيئاً على الجهاز: يُرسل فقط أسئلة وطلبات قراءة؛ وضع العمل يُعاد إلى التلقائي.
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
  await step("وضع «دون اتصال»: النماذج المحلية فقط", async () => {
    const m = (await s.request("/api/brain/mode", { body: { mode: "offline" } })).json;
    must(m.setting === "offline", JSON.stringify(m).slice(0, 120));
    const models = (await s.request("/api/models")).json.models;
    must(models.length > 0 && models.every((x) => x.id.startsWith("ollama:")), `النماذج: ${models.map((x) => x.id).join(", ")}`);
    await s.request("/api/brain/mode", { body: { mode: "auto" } });
    return `${models.length} نموذج محلي`;
  });
  // أدوات النموذج: الخادم يمرّر الطلب فقط ولا ينفّذ شيئاً (التنفيذ في الواجهة بعد موافقة المستخدم)
  const askTool = async (server, content) => {
    const r = await server.request("/api/chat/stream", { body: { messages: [{ role: "user", content }], model: "" }, timeoutMs: 120_000 });
    const calls = [...r.text.matchAll(/event: tool_call\ndata: (.*)/g)].map((m) => JSON.parse(m[1]));
    const text = [...r.text.matchAll(/event: delta\ndata: (.*)/g)].map((m) => JSON.parse(m[1]).text).join("");
    return { calls, text };
  };
  await step("أداة بالوسوم النصية (الافتراضي محلياً)", async () => {
    const { calls, text } = await askTool(s, "افتح الآلة الحاسبة");
    must(calls.length === 0, "أُرسل tool_call في الوضع النصي");
    must(/<tool_name>\s*launch_app\s*<\/tool_name>/.test(text), `الرد: ${text.slice(0, 120)}`);
    return "launch_app (وسم نصي)";
  });
  {
    const native = await startSanad({
      env: { SANAD_MODE: "offline", SANAD_TOOL_MODE: "native", OLLAMA_AUTOSTART: "true" },
      nodeOptions: `--require ${join(ROOT, "tests", "helpers", "offline-preload.cjs").replace(/\\/g, "/")}`,
    });
    try {
      await step("أداة بالاستدعاء الرسمي (SANAD_TOOL_MODE=native)", async () => {
        const { calls, text } = await askTool(native, "افتح الآلة الحاسبة");
        must(calls.length >= 1 && calls[0].name === "launch_app", `الطلبات: ${JSON.stringify(calls)} | النص: ${text.slice(0, 80)}`);
        must(!/<tool_use>/.test(text), "ظهر وسم نصي في الرد");
        return `launch_app ${calls[0].arguments}`;
      });
      await step("سؤال بالاستدعاء الرسمي ← نص بلا أداة", async () => {
        const { calls, text } = await askTool(native, "ما الأمر لعرض العمليات في PowerShell؟");
        must(calls.length === 0, `استدعى أداة: ${JSON.stringify(calls)}`);
        must(text.trim().length > 0, "لا نص");
        return text.replace(/\s+/g, " ").slice(0, 40);
      });
    } finally {
      await native.stop();
    }
  }
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
  await s.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} نجح${failed ? ` — ${failed} فشل` : ""}`);
process.exit(failed ? 1 : 0);
