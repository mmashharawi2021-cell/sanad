// يشغّل خادم سند للاختبار على منفذ عشوائي بإعدادات آمنة، ويعطي دالة طلب بصلاحيات الجلسة أو بدونها.
// إعدادات الاختبار: لا تشغيل تلقائي لـ Ollama ولا تحميل للنموذج (OLLAMA_AUTOSTART/OLLAMA_WARMUP=false).
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * @param {{ env?: Record<string,string>, nodeOptions?: string }} [opts]
 */
export async function startSanad(opts = {}) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    OLLAMA_AUTOSTART: "false",
    OLLAMA_WARMUP: "false",
    ...(opts.env || {}),
  };
  if (opts.nodeOptions) env.NODE_OPTIONS = opts.nodeOptions;
  const child = spawn(process.execPath, [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), join(ROOT, "src", "server.ts")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  const deadline = Date.now() + 60_000;
  let home = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${log}`);
    try {
      home = await fetch(`${base}/`);
      if (home.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!home || !home.ok) {
    child.kill();
    throw new Error(`server did not start on ${base}:\n${log}`);
  }
  const setCookie = home.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];

  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown, raw?: Buffer|string, auth?: boolean, headers?: Record<string,string>, contentType?: string, timeoutMs?: number }} [o]
   */
  async function request(path, o = {}) {
    const method = o.method || (o.body !== undefined || o.raw !== undefined ? "POST" : "GET");
    const headers = { ...(o.headers || {}) };
    if (o.auth !== false && method !== "GET") {
      headers["x-sanad-request"] = "1";
      headers.cookie = cookie;
    }
    let body;
    if (o.raw !== undefined) {
      body = o.raw;
      headers["content-type"] = o.contentType || "application/octet-stream";
    } else if (o.body !== undefined) {
      body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
      headers["content-type"] = o.contentType || "application/json";
    }
    const res = await fetch(`${base}${path}`, { method, headers, body, signal: AbortSignal.timeout(o.timeoutMs ?? 60_000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, text, json };
  }

  async function stop() {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((r) => child.once("exit", r));
    }
  }

  return { base, port, cookie, setCookie, request, stop, log: () => log };
}

/**
 * كل مسارات API المعرَّفة في src/routes/*.ts بالصيغة { method: "…", path: "/api/…", handler } —
 * مصدر الحقيقة لاختبار التغطية. (قبل تقسيم الخادم كانت في src/server.ts بصيغة req.method === … فنقرأ الصيغتين.)
 */
export async function routesInServer() {
  const { readFile, readdir } = await import("node:fs/promises");
  const files = [join(ROOT, "src", "server.ts")];
  try {
    for (const f of await readdir(join(ROOT, "src", "routes"))) if (f.endsWith(".ts")) files.push(join(ROOT, "src", "routes", f));
  } catch {}
  const out = [];
  for (const f of files) {
    const src = await readFile(f, "utf8");
    for (const m of src.matchAll(/req\.method === "(\w+)" && url\.pathname === "([^"]+)"/g)) out.push({ method: m[1], path: m[2] });
    for (const m of src.matchAll(/method:\s*"(\w+)",\s*path:\s*"(\/api\/[^"]+)"/g)) out.push({ method: m[1], path: m[2] });
  }
  return out;
}
