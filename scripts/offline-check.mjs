// سند — تقرير جاهزية العمل دون إنترنت (لا يحتاج اتصالاً، ولا يغيّر شيئاً).
// الاستخدام: npm.cmd run offline:check      ← رمز الخروج 1 إذا نقص مكوّن أساسي
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...s) => join(ROOT, ...s);
const env = (() => {
  const out = {};
  try {
    for (const line of readFileSync(p(".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
})();
const CHAT_MODEL = env.OLLAMA_OFFLINE_MODEL || "qwen3.5:4b";
const VISION_MODEL = env.OLLAMA_VISION_MODEL || "gemma3:4b";
const OLLAMA_HOST = env.OLLAMA_HOST || "http://127.0.0.1:11434";

let critical = 0, warnings = 0;
const rows = [];
function row(group, label, state, detail = "", level = "critical") {
  rows.push({ group, label, state, detail });
  if (!state) level === "critical" ? critical++ : warnings++;
}
const mb = (n) => `${(n / 1024 / 1024).toFixed(0)}MB`;
const size = (f) => (existsSync(f) ? statSync(f).size : 0);

/* ---------- الأساس ---------- */
const nodeMajor = Number(process.versions.node.split(".")[0]);
row("الأساس", "Node.js 20 أو أحدث", nodeMajor >= 20, `v${process.versions.node}`);
const depsOk = existsSync(p("node_modules", "tsx"));
row("الأساس", "حزم المشروع مثبتة", depsOk, depsOk ? "" : "npm.cmd install");
row("الأساس", "وضع التشغيل", true, `SANAD_MODE=${env.SANAD_MODE || "auto"} (offline = دون أي اتصال بالسحابة)`);
{
  const { freemem, totalmem } = await import("node:os");
  const freeGb = freemem() / 1024 ** 3, totalGb = totalmem() / 1024 ** 3;
  // Cold starts of local models become very slow when RAM is nearly full (measured: 92 s at 0.6 GB free).
  row("الأساس", "الذاكرة المتاحة", freeGb >= 2, `${freeGb.toFixed(1)} من ${totalGb.toFixed(1)} GB${freeGb < 2 ? " — أغلق برامج ثقيلة ليعمل العقل والصوت بسرعة" : ""}`, "warning");
}

/* ---------- العقل المحلي ---------- */
const ollamaExe = [join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe")].find(existsSync)
  || (spawnSync("where", ["ollama"], { encoding: "utf8" }).status === 0 ? "PATH" : null);
row("العقل المحلي", "Ollama مثبت", !!ollamaExe, ollamaExe ? "" : "https://ollama.com/download");
let tags = null;
try {
  const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2500) });
  tags = res.ok ? (await res.json()).models.map((m) => m.name) : null;
} catch {}
row("العقل المحلي", "خادم Ollama يعمل", !!tags, tags ? "" : "يُشغّله سند تلقائياً عند الإقلاع", "warning");
if (tags) {
  const has = (m) => tags.includes(m) || tags.includes(`${m}:latest`);
  row("العقل المحلي", `نموذج المحادثة ${CHAT_MODEL}`, has(CHAT_MODEL), has(CHAT_MODEL) ? "" : `ollama pull ${CHAT_MODEL}`);
  row("العقل المحلي", `نموذج الرؤية ${VISION_MODEL}`, has(VISION_MODEL), has(VISION_MODEL) ? "" : `ollama pull ${VISION_MODEL}`, "warning");
}
const gpu = spawnSync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"], { encoding: "utf8" });
row("العقل المحلي", "كرت الشاشة", gpu.status === 0, gpu.status === 0 ? gpu.stdout.trim() : "غير متاح — سيعمل العقل على المعالج (أبطأ)", "warning");

/* ---------- الصوت ---------- */
const piper = p("vendor", "piper", "bin", "piper", "piper.exe");
row("الصوت", "محرك النطق المحلي (Piper)", existsSync(piper));
row("الصوت", "صوت الرجل (كريم)", size(p("vendor", "piper", "voices", "ar_JO-kareem-medium.onnx")) > 1e6);
row("الصوت", "صوت الفتاة (دي)", size(p("vendor", "piper", "voices", "dii_ar.onnx")) > 1e6, "", "warning");
row("الصوت", "السماع: FastConformer", size(p("vendor", "stt", "fastconformer", "model.onnx")) > 1e8, "", "warning");
row("الصوت", "السماع الاحتياطي: whisper", existsSync(p("vendor", "whisper", "bin", "Release", "whisper-server.exe")) && size(p("vendor", "whisper", "models", "ggml-small-q5_1.bin")) > 1e8);
const py = p("vendor", "py", "Scripts", "python.exe");
const pyOk = existsSync(py) && spawnSync(py, ["-c", "import edge_tts, onnx_asr, soundfile, numpy"], { encoding: "utf8" }).status === 0;
row("الصوت", "العملية الصوتية المساعدة (Python)", pyOk, pyOk ? "" : "powershell -File scripts\\voice-setup.ps1", "warning");
let cacheFiles = [];
try { cacheFiles = readdirSync(p("data", "voice-cache")).filter((f) => f.endsWith(".mp3")); } catch {}
const cacheBytes = cacheFiles.reduce((a, f) => a + size(p("data", "voice-cache", f)), 0);
row("الصوت", "عبارات محفوظة بالصوت الطبيعي", cacheFiles.length >= 20, `${cacheFiles.length} عبارة (${mb(cacheBytes)})${cacheFiles.length < 20 ? " — npm.cmd run voice:warm وأنت متصل" : ""}`, "warning");

/* ---------- الواجهة ---------- */
const fonts = ["400", "500", "700"].every((w) => existsSync(p("public", "fonts", `ibm-plex-sans-arabic-arabic-${w}-normal.woff2`)));
row("الواجهة", "الخط محلي (IBM Plex Sans Arabic)", fonts && existsSync(p("public", "fonts", "fonts.css")));
// أي رابط خارجي يُحمَّل تلقائياً (src/href/url()/@import) في ملفات الواجهة
const external = [];
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    if (statSync(f).isDirectory()) { if (!["lab", "extensions"].includes(name)) scan(f); continue; }
    if (!/\.(html|css|js)$/.test(name)) continue;
    const text = readFileSync(f, "utf8");
    const re = /(?:<(?:script|link|img|iframe)[^>]*\s(?:src|href)\s*=\s*["']|url\(\s*["']?|@import\s+["'])(https?:\/\/[^"')\s]+)/gi;
    for (const m of text.matchAll(re)) external.push(`${relative(ROOT, f)} → ${m[1]}`);
  }
}
scan(p("public"));
row("الواجهة", "لا تحميل لموارد من الإنترنت", external.length === 0, external.slice(0, 5).join(" | "));

/* ---------- التقرير ---------- */
let group = "";
console.log("\nتقرير جاهزية سند للعمل دون إنترنت\n");
for (const r of rows) {
  if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
  console.log(`  ${r.state ? "✓" : "✗"} ${r.label}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log(`\n${critical ? `✗ ${critical} مكوّن أساسي ناقص` : "✓ المكوّنات الأساسية جاهزة"}${warnings ? ` · ${warnings} تنبيه` : ""}.`);
if (critical || warnings) console.log("لإكمال الناقص وأنت متصل: npm.cmd run offline:setup");
process.exit(critical ? 1 : 0);
