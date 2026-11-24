/**
 * مراقب الشبكة الحي — سرعة الإرسال والاستقبال الآن، كما في «مدير المهام» (الأداء ← Wi-Fi).
 *
 * عملية PowerShell واحدة دائمة تقرأ عدادات بطاقة الشبكة (Get-NetAdapterStatistics) كل ثانية
 * وتطبع سطر JSON؛ Node يحسب الفرق بين قراءتين = البايتات في الثانية.
 * تبدأ عند أول طلب وتتوقف تلقائياً بعد 30 ثانية بلا طلبات (لا استهلاك في الخلفية).
 */
import { spawn, type ChildProcess } from "node:child_process";

export type ThroughputSample = { t: number; rxBps: number; txBps: number };

const HISTORY = 60; // آخر 60 ثانية — مثل رسم مدير المهام
const IDLE_STOP_MS = 30_000;

// يخرج السكربت بنفسه إن توقف خادم سند (مثلاً عند إعادة تشغيل tsx watch) — لا عمليات يتيمة
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$parentPid = ${process.pid}
$i = 0
$up = @()
while ($true) {
  if (-not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { break }
  if ($i % 10 -eq 0) { $up = @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up') }
  $i++
  $names = @($up | ForEach-Object { $_.Name })
  $stats = @(Get-NetAdapterStatistics | Where-Object { $names -contains $_.Name })
  $rx = ($stats | Measure-Object ReceivedBytes -Sum).Sum
  $tx = ($stats | Measure-Object SentBytes -Sum).Sum
  $o = [pscustomobject]@{
    t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    rx = [int64]$rx
    tx = [int64]$tx
    name = ($names -join ', ')
    link = (@($up | ForEach-Object { $_.LinkSpeed }) -join ', ')
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}
`;

let child: ChildProcess | null = null;
let lastRequest = 0;
let idleTimer: NodeJS.Timeout | null = null;
let prev: { t: number; rx: number; tx: number } | null = null;
let adapter = "";
let linkSpeed = "";
const history: ThroughputSample[] = [];

/** يُنظّف الحالة لعملية معيّنة فقط — خروج عملية قديمة لا يمسح مرجع عملية أحدث. */
function cleanup(proc: ChildProcess | null): void {
  if (proc && child !== proc) return;
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = null;
  child = null;
  prev = null;
}

function stop(): void {
  const proc = child;
  cleanup(proc);
  proc?.kill();
}

function start(): void {
  if (child) return;
  const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
  // stderr يُتجاهل (لا أنبوب يمتلئ فيعلق السكربت)، و stdin مغلق
  const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  child = proc;
  // فشل التشغيل (PowerShell غير موجود…) يُسجَّل ولا يُسقط الخادم
  proc.on("error", (err) => {
    console.warn(`[netMonitor] تعذر تشغيل مراقب الشبكة: ${err.message}`);
    cleanup(proc);
  });
  proc.on("exit", () => cleanup(proc));
  let buffer = "";
  const stdout = proc.stdout!;
  stdout.setEncoding("utf8");
  stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("{")) continue;
      try {
        const s = JSON.parse(line) as { t: number; rx: number; tx: number; name: string; link: string };
        adapter = s.name || adapter;
        linkSpeed = s.link || linkSpeed;
        if (prev && s.t > prev.t) {
          const dt = (s.t - prev.t) / 1000;
          // عداد أُعيد ضبطه (تغيّر البطاقة/إعادة اتصال) → لا قيمة سالبة
          const rxBps = Math.max(0, (s.rx - prev.rx) / dt);
          const txBps = Math.max(0, (s.tx - prev.tx) / dt);
          history.push({ t: s.t, rxBps, txBps });
          if (history.length > HISTORY) history.splice(0, history.length - HISTORY);
        }
        prev = { t: s.t, rx: s.rx, tx: s.tx };
      } catch {
        /* سطر غير مكتمل */
      }
    }
  });
  idleTimer = setInterval(() => {
    if (Date.now() - lastRequest > IDLE_STOP_MS) stop();
  }, 5_000);
}

process.on("exit", stop);

/** آخر قراءات سرعة الشبكة. أول طلب يشغّل المراقب (تظهر القيم بعد ~2 ثانية). */
export function getThroughput(): {
  success: true;
  running: boolean;
  adapter: string;
  linkSpeed: string;
  rxBps: number;
  txBps: number;
  history: ThroughputSample[];
} {
  lastRequest = Date.now();
  start();
  const last = history[history.length - 1];
  return {
    success: true,
    running: Boolean(child),
    adapter,
    linkSpeed,
    rxBps: last?.rxBps ?? 0,
    txBps: last?.txBps ?? 0,
    history: [...history],
  };
}
