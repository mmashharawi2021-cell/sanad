// عميل DevTools صغير يقود Microsoft Edge المثبت على الجهاز (بلا أي مكتبة، WebSocket مدمج في Node).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE_PATHS = [
  process.env.SANAD_TEST_BROWSER,
  join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);

export function findBrowser() {
  return EDGE_PATHS.find((p) => existsSync(p)) || null;
}

export async function launchBrowser() {
  const exe = findBrowser();
  if (!exe) throw new Error("لم يُعثر على Edge أو Chrome (أو حدّد SANAD_TEST_BROWSER)");
  const profile = mkdtempSync(join(tmpdir(), "sanad-ui-test-"));
  const proc = spawn(exe, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio",
    "--disable-features=Translate,msEdgeShopping", "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    const f = join(profile, "DevToolsActivePort");
    if (existsSync(f)) port = Number(readFileSync(f, "utf8").split(/\r?\n/)[0]);
    else await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) { proc.kill(); throw new Error("لم يبدأ المتصفح في وضع التحكم"); }

  async function newPage() {
    const info = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    return connect(info.webSocketDebuggerUrl);
  }
  async function close() {
    proc.kill();
    await new Promise((r) => setTimeout(r, 500));
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  return { newPage, close };
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);

  /** قيمة تعبير JavaScript في الصفحة (ينتظر الوعود). */
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function navigate(url) {
    const loaded = new Promise((r) => on("Page.loadEventFired", r));
    await send("Page.navigate", { url });
    await loaded;
  }
  async function screenshot() {
    const r = await send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }
  async function viewport(width, height, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  }
  return { send, on, evaluate, navigate, screenshot, viewport, close: () => ws.close() };
}
