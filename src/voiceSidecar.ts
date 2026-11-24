import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

/**
 * Manages scripts/sanad_voice.py (natural neural voices + FastConformer STT) running in vendor/py.
 * Started lazily on the first request, stopped after an idle period to free memory.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = join(ROOT, "vendor", "py", "Scripts", "python.exe");
const SCRIPT = join(ROOT, "scripts", "sanad_voice.py");
const BOOT_TIMEOUT_MS = 20_000;

type Reply = { id: string | null; ok: boolean; error?: string; [k: string]: unknown };
type Waiter = { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

let child: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<void> | null = null;
let seq = 0;
const waiters = new Map<string, Waiter>();
let idleTimer: NodeJS.Timeout | null = null;

export function sidecarAvailable(): boolean {
  return existsSync(PYTHON) && existsSync(SCRIPT);
}

export function sidecarRunning(): boolean {
  return child !== null;
}

function idleMs(): number {
  const m = Number(process.env.VOICE_SIDECAR_IDLE_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : 10) * 60_000;
}

function failAll(err: Error): void {
  for (const [id, w] of waiters) {
    clearTimeout(w.timer);
    w.reject(err);
    waiters.delete(id);
  }
}

export function stopSidecar(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (child) {
    console.log("[voice] إيقاف العملية الصوتية المساعدة بعد فترة خمول لتوفير الذاكرة.");
    child.kill();
  }
  child = null;
  ready = null;
}

function start(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON, [SCRIPT], {
      cwd: ROOT,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    }) as ChildProcessWithoutNullStreams;
    child = proc;
    const boot = setTimeout(() => reject(new Error("voice sidecar did not start in time")), BOOT_TIMEOUT_MS);

    createInterface({ input: proc.stdout }).on("line", (line) => {
      let msg: Reply;
      try {
        msg = JSON.parse(line) as Reply;
      } catch {
        return;
      }
      if (msg.ready) {
        clearTimeout(boot);
        resolve();
        return;
      }
      const w = msg.id ? waiters.get(msg.id) : undefined;
      if (!w || !msg.id) return;
      waiters.delete(msg.id);
      clearTimeout(w.timer);
      w.resolve(msg);
    });
    proc.stderr.on("data", () => undefined); // library warnings; replies come on stdout
    proc.on("error", (err) => {
      clearTimeout(boot);
      reject(err);
    });
    proc.on("exit", () => {
      if (child === proc) {
        child = null;
        ready = null;
      }
      failAll(new Error("voice sidecar exited"));
    });
    proc.unref();
  });
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

/** Send one request to the sidecar and wait for its reply. */
export async function sidecarCall(op: string, payload: Record<string, unknown>, timeoutMs = 15_000): Promise<Reply> {
  if (!sidecarAvailable()) throw new Error("voice sidecar is not installed (run scripts/voice-setup.ps1)");
  await start();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(stopSidecar, idleMs());
  idleTimer.unref();

  const id = String(++seq);
  return new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`voice sidecar timed out (${op})`));
    }, timeoutMs);
    waiters.set(id, { resolve, reject, timer });
    child!.stdin.write(`${JSON.stringify({ id, op, ...payload })}\n`);
  });
}
