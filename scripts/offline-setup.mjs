// سند — تجهيز العمل دون إنترنت (مرة واحدة، يحتاج اتصالاً):
//   1) نماذج Ollama المحلية: العقل (OLLAMA_OFFLINE_MODEL) والرؤية (OLLAMA_VISION_MODEL)
//   2) تقرير الجاهزية (scripts/offline-check.mjs)
// الاستخدام: npm.cmd run offline:setup
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readEnv();
const CHAT_MODEL = env.OLLAMA_OFFLINE_MODEL || "qwen3.5:4b";
const VISION_MODEL = env.OLLAMA_VISION_MODEL || "gemma3:4b";
const OLLAMA_HOST = env.OLLAMA_HOST || "http://127.0.0.1:11434";

function readEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const step = (n, title) => console.log(`\n━━ ${n}) ${title}`);
const ok = (msg) => console.log(`   ✓ ${msg}`);
const warn = (msg) => console.log(`   ⚠ ${msg}`);

function findOllama() {
  const local = join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe");
  if (existsSync(local)) return local;
  const where = spawnSync("where", ["ollama"], { encoding: "utf8" });
  return where.status === 0 ? where.stdout.split(/\r?\n/)[0].trim() : null;
}

async function ollamaUp() {
  try {
    return (await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function online() {
  try {
    await fetch("https://huggingface.co", { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", windowsHide: true, ...opts });
    p.on("exit", (code) => resolve(code ?? 1));
    p.on("error", () => resolve(1));
  });
}

let problems = 0;

if (!(await online())) {
  console.log("✗ لا يوجد اتصال بالإنترنت. التجهيز يحتاج اتصالاً مرة واحدة فقط، ثم يعمل سند دونه.");
  process.exit(1);
}

step(1, "نماذج الذكاء المحلية (Ollama)");
const ollama = findOllama();
if (!ollama) {
  warn("Ollama غير مثبت. نزّله من https://ollama.com/download ثم أعد تشغيل هذا الأمر.");
  problems++;
} else {
  if (!(await ollamaUp())) {
    spawn(ollama, ["serve"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let i = 0; i < 60 && !(await ollamaUp()); i++) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!(await ollamaUp())) {
    warn("تعذر تشغيل خادم Ollama.");
    problems++;
  } else {
    for (const [label, model] of [["العقل", CHAT_MODEL], ["الرؤية", VISION_MODEL]]) {
      console.log(`   ${label}: ${model}`);
      const code = await run(ollama, ["pull", model]);
      if (code === 0) ok(`${label} جاهز (${model})`);
      else { warn(`تعذر تنزيل ${model}`); problems++; }
    }
  }
}

step(2, "تقرير الجاهزية");
const check = await run(process.execPath, [join(ROOT, "scripts", "offline-check.mjs")]);
process.exit(problems || check ? 1 : 0);
