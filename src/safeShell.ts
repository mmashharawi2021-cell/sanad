/**
 * تشغيل آمن للبرامج والملفات والأوامر على Windows — بلا shell:true وبلا دمج نصي في cmd.exe.
 *
 * لماذا؟ مع shell:true أو `cmd /c start "" <قيمة>` يفسّر cmd.exe المحارف & | ^ < > % في القيمة،
 * فاسم ملف مثل `x & calc` يشغّل أمراً إضافياً. هنا تُمرَّر القيم إلى PowerShell كنصوص حرفية
 * بين علامتي اقتباس مفردتين (مع مضاعفة كل علامة اقتباس) عبر -EncodedCommand، فلا تُفسَّر أبداً.
 */
import { execFile, spawn } from "node:child_process";

/** نص حرفي في PowerShell: '…' مع مضاعفة ' وعلامات الاقتباس الذكية التي يعدّها PowerShell اقتباساً أيضاً. */
export function psQuote(value: string): string {
  return `'${String(value).replace(/['‘’‚‛]/g, "$&$&")}'`;
}

function encode(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

const PS_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"];

/** يشغّل سكربت PowerShell وينتظر نتيجته. */
export function runPowerShell(
  script: string,
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [...PS_ARGS, encode(script)],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: options.maxBuffer ?? 5 * 1024 * 1024,
        windowsHide: true,
        env: options.env,
      },
      (error, stdout, stderr) => {
        const rawCode = (error as { code?: unknown } | null)?.code;
        const exitCode = error ? (typeof rawCode === "number" ? rawCode : 1) : 0;
        const errText = String(stderr ?? "") || (error ? error.message : "");
        resolve({ stdout: String(stdout ?? ""), stderr: errText, exitCode });
      },
    );
  });
}

/** يشغّل سكربت PowerShell منفصلاً دون انتظار (لا يحجب الخادم). */
export function runPowerShellDetached(script: string): void {
  const child = spawn("powershell.exe", ["-WindowStyle", "Hidden", ...PS_ARGS, encode(script)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

/**
 * يفتح برنامجاً أو ملفاً أو مجلداً أو رابطاً (مثل ms-settings:) كما يفعل `start`، لكن بأمان.
 * الوسائط تُقتبس بعلامات " لأن Start-Process يضمّها بمسافات؛ ونحذف " منها (غير مسموحة في مسارات Windows).
 */
export function startDetached(target: string, args: string[] = []): void {
  const clean = String(target).trim();
  if (!clean) throw new Error("لا يوجد هدف للتشغيل.");
  const argList = args
    .map((a) => String(a).replace(/"/g, ""))
    .filter(Boolean)
    .map((a) => (/\s/.test(a) ? `"${a}"` : a));
  const script =
    `Start-Process -FilePath ${psQuote(clean)}` + (argList.length ? ` -ArgumentList ${argList.map(psQuote).join(",")}` : "");
  runPowerShellDetached(script);
}

/** يشغّل ملفاً تنفيذياً مع وسائطه مباشرة (بلا shell) وينتظر النتيجة. */
export function runFile(
  file: string,
  args: string[],
  timeoutMs = 4000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}
