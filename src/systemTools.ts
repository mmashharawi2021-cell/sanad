import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import { readdir, stat, unlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { runFile, runPowerShell, startDetached } from "./safeShell";
import { isInsideAny, isSafeToAutoOpen, userRoots } from "./safePaths";

const execAsync = promisify(exec);

// مدخلات التحكم بالفأرة ولوحة المفاتيح قد تأتي من نموذج الرؤية — قوائم بيضاء صارمة
const MOUSE_ACTIONS = new Set(["click", "left_click", "right_click", "double_click", "move"]);
const KEY_RE = /^[a-z0-9]{1,12}$/;
const HOTKEY_RE = /^[a-z0-9]{1,12}(\+[a-z0-9]{1,12}){0,3}$/;

export type SystemStats = {
  platform: string;
  hostname: string;
  uptimeHours: number;
  cpuModel: string;
  cpuCores: number;
  cpuUsagePercent: number;
  totalMemoryGb: number;
  freeMemoryGb: number;
  usedMemoryPercent: number;
  diskFreeGb: number;
  diskTotalGb: number;
  diskUsedPercent: number;
  batteryPercent: number | null;
  isCharging: boolean | null;
};

function sampleCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    for (const t in c.times) {
      total += (c.times as any)[t];
    }
    idle += c.times.idle;
  }
  return { idle, total };
}

async function getLiveCpuUsage(): Promise<number> {
  const first = sampleCpuTimes();
  await new Promise((r) => setTimeout(r, 100));
  const second = sampleCpuTimes();
  const idleDiff = second.idle - first.idle;
  const totalDiff = second.total - first.total;
  if (totalDiff <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - (100 * idleDiff) / totalDiff)));
}

export async function getSystemStats(): Promise<SystemStats> {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  const cpuUsagePercent = await getLiveCpuUsage();

  let diskFreeGb = 0;
  let diskTotalGb = 0;
  let diskUsedPercent = 0;
  try {
    const rootPath = process.platform === "win32" ? "C:\\" : "/";
    const statfs = fs.statfsSync(rootPath);
    diskFreeGb = Number(((statfs.bavail * statfs.bsize) / 1024 ** 3).toFixed(1));
    diskTotalGb = Number(((statfs.blocks * statfs.bsize) / 1024 ** 3).toFixed(1));
    if (diskTotalGb > 0) {
      diskUsedPercent = Math.round(((diskTotalGb - diskFreeGb) / diskTotalGb) * 100);
    }
  } catch {
    // statfs might fail on some environments
  }

  let batteryPercent: number | null = null;
  let isCharging: boolean | null = null;

  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Battery | Select-Object -Property EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json"`,
        { timeout: 4000 },
      );
      if (stdout.trim()) {
        const data = JSON.parse(stdout);
        const item = Array.isArray(data) ? data[0] : data;
        if (item) {
          batteryPercent = Number(item.EstimatedChargeRemaining) || null;
          isCharging = item.BatteryStatus === 2 || item.BatteryStatus === 6;
        }
      }
    } catch {
      // Battery might not exist or error, continue
    }
  }

  return {
    platform: process.platform === "win32" ? "Windows " + os.release() : os.type(),
    hostname: os.hostname(),
    uptimeHours: Number((os.uptime() / 3600).toFixed(1)),
    cpuModel: cpus[0]?.model || "Unknown",
    cpuCores: cpus.length,
    cpuUsagePercent,
    totalMemoryGb: Number((totalMem / (1024 ** 3)).toFixed(1)),
    freeMemoryGb: Number((freeMem / (1024 ** 3)).toFixed(1)),
    usedMemoryPercent: usedMemPercent,
    diskFreeGb,
    diskTotalGb,
    diskUsedPercent,
    batteryPercent,
    isCharging,
  };
}

export async function cleanTemporaryFiles(): Promise<{
  success: boolean;
  freedMb: number;
  filesDeleted: number;
  message: string;
}> {
  const tmpDir = os.tmpdir();
  let freedBytes = 0;
  let filesDeleted = 0;

  try {
    const entries = await readdir(tmpDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(tmpDir, entry.name);
      try {
        const s = await stat(fullPath);
        // لا نحذف ما عُدّل خلال آخر 24 ساعة (قد يكون قيد الاستخدام)
        if (Date.now() - s.mtimeMs < 24 * 60 * 60 * 1000) continue;
        if (entry.isFile()) {
          freedBytes += s.size;
          await unlink(fullPath);
          filesDeleted++;
        } else if (entry.isDirectory()) {
          await rm(fullPath, { recursive: true, force: true });
          filesDeleted++;
        }
      } catch {
        // Locked files or permission errors in Temp are expected on Windows
      }
    }

    const freedMb = Number((freedBytes / (1024 * 1024)).toFixed(1));
    return {
      success: true,
      freedMb,
      filesDeleted,
      message: `تم تنظيف مجلد الملفات المؤقتة بنجاح، تم حذف ${filesDeleted} عنصر وتحرير ${freedMb} ميجابايت من المساحة.`,
    };
  } catch (err: any) {
    return {
      success: false,
      freedMb: 0,
      filesDeleted: 0,
      message: `حدث خطأ أثناء تنظيف الملفات المؤقتة: ${err.message}`,
    };
  }
}

const ALLOWED_APPS: Record<string, { cmd: string; args?: string[] }> = {
  calc: { cmd: "calc.exe" },
  calculator: { cmd: "calc.exe" },
  حاسبة: { cmd: "calc.exe" },
  الآلة_الحاسبة: { cmd: "calc.exe" },
  notepad: { cmd: "notepad.exe" },
  مفكرة: { cmd: "notepad.exe" },
  المفكرة: { cmd: "notepad.exe" },
  code: { cmd: "code.cmd" },
  vscode: { cmd: "code.cmd" },
  كود: { cmd: "code.cmd" },
  فيجوال_ستوديو: { cmd: "code.cmd" },
  فيجوال_ستوديو_كود: { cmd: "code.cmd" },
  فيجوال: { cmd: "code.cmd" },
  visual_studio: { cmd: "code.cmd" },
  visual_studio_code: { cmd: "code.cmd" },
  explorer: { cmd: "explorer.exe" },
  ملفات: { cmd: "explorer.exe" },
  الملفات: { cmd: "explorer.exe" },
  cmd: { cmd: "cmd.exe", args: ["/c", "start", "cmd.exe"] },
  terminal: { cmd: "wt.exe" },
  powershell: { cmd: "powershell.exe", args: ["-NoExit"] },
  edge: { cmd: "msedge" },
  chrome: { cmd: "chrome" },
  متصفح: { cmd: "msedge" },
  المتصفح: { cmd: "msedge" },
  spotify: { cmd: "spotify" },
  taskmgr: { cmd: "taskmgr.exe" },
  مدير_المهام: { cmd: "taskmgr.exe" },
  arcgis: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  arcgis_pro: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  arc_pro: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  arc: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  ارك: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  ارك_برو: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  ارك_بروه: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  ارك_بروا: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  اركش: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  اركش_برو: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  ارك_جي_اي_اس: { cmd: "C:\\Program Files\\ArcGIS\\Pro\\bin\\ArcGISPro.exe" },
  arcmap: { cmd: "C:\\Program Files (x86)\\ArcGIS\\Desktop10.8\\bin\\ArcMap.exe" },
  ارك_ماب: { cmd: "C:\\Program Files (x86)\\ArcGIS\\Desktop10.8\\bin\\ArcMap.exe" },
};

export async function launchApp(
  target: string,
  options?: { createProject?: boolean }
): Promise<{ success: boolean; message: string }> {
  const key = target.trim().toLowerCase().replace(/\s+/g, "_");
  const found = ALLOWED_APPS[key];

  let cmd = found?.cmd;
  let args = found?.args || [];

  if (!cmd) {
    // «برنامج وسيط» (مثل notepad file.txt): كان shell:true يفصلهما؛ نفصلهما هنا بأمان كوسيط حرفي
    const m = /^("([^"]+)"|[^\s"]+)\s+(.+)$/.exec(target.trim());
    if (m && !fs.existsSync(target.trim())) {
      cmd = m[2] ?? m[1]!;
      args = [m[3]!.replace(/^"|"$/g, "")];
    } else {
      cmd = target;
    }
  }

  try {
    startDetached(cmd, args);

    let msg = `تم تشغيل ${target} بنجاح على اللابتوب.`;
    if (key.includes("arc") || key.includes("ارك")) {
      msg = options?.createProject
        ? "تم تشغيل برنامج ArcGIS Pro بنجاح وجاري تجهيز واجهة إنشاء مشروع جديد."
        : "تم تشغيل برنامج ArcGIS Pro بنجاح على اللابتوب.";
    }
    return { success: true, message: msg };
  } catch (err: any) {
    return { success: false, message: `تعذر تشغيل ${target}: ${err.message}` };
  }
}

export async function openFolder(folderKey: string): Promise<{ success: boolean; message: string }> {
  const home = os.homedir();
  let folderPath = "";

  const key = folderKey.trim().toLowerCase();
  if (key === "downloads" || key === "تنزيلات" || key === "التنزيلات") {
    folderPath = path.join(home, "Downloads");
  } else if (key === "desktop" || key === "سطح_المكتب" || key === "سطح المكتب") {
    folderPath = path.join(home, "Desktop");
  } else if (key === "documents" || key === "مستندات" || key === "المستندات") {
    folderPath = path.join(home, "Documents");
  } else if (key === "project" || key === "المشروع") {
    folderPath = process.cwd();
  } else {
    folderPath = path.isAbsolute(folderKey) ? folderKey : path.join(home, folderKey);
  }

  try {
    const child = spawn("explorer.exe", [folderPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { success: true, message: `تم فتح المجلد: ${folderPath}` };
  } catch (err: any) {
    return { success: false, message: `تعذر فتح المجلد: ${err.message}` };
  }
}

export async function openMediaFile(
  folderKey: string = "desktop",
  type: "image" | "pdf" | "any" = "image",
): Promise<{ success: boolean; message: string; path?: string }> {
  const home = os.homedir();
  let dir = "";
  const key = folderKey.trim().toLowerCase();
  if (key.includes("downloads") || key.includes("تنزيلات")) {
    dir = path.join(home, "Downloads");
  } else {
    dir = path.join(home, "Desktop");
  }

  const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];
  const PDF_EXTS = [".pdf"];

  try {
    const files = await readdir(dir);
    const matched = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      if (type === "image") return IMAGE_EXTS.includes(ext);
      if (type === "pdf") return PDF_EXTS.includes(ext);
      return true;
    });

    if (!matched.length) {
      return {
        success: false,
        message: `لم يتم العثور على أي ${type === "image" ? "صورة" : "ملف"} في ${path.basename(dir)}.`,
      };
    }

    const chosen = matched[Math.floor(Math.random() * matched.length)]!;
    const fullPath = path.join(dir, chosen);

    startDetached(fullPath);

    return {
      success: true,
      message: `تم فتح الصورة: ${chosen}`,
      path: fullPath,
    };
  } catch (err: any) {
    return { success: false, message: `خطأ أثناء فتح الملف: ${err.message}` };
  }
}

export async function openFileDirectly(filePath: string): Promise<{ success: boolean; message: string }> {
  try {
    startDetached(filePath);
    return { success: true, message: `تم فتح: ${path.basename(filePath)}` };
  } catch (err: any) {
    return { success: false, message: `تعذر فتح الملف: ${err.message}` };
  }
}

export async function createOrWriteTextFile(options: {
  filePath?: string;
  folder?: string;
  filename?: string;
  content: string;
  openAfterCreate?: boolean;
}): Promise<{ success: boolean; message: string; fullPath: string }> {
  const home = os.homedir();
  let targetPath = "";

  if (options.filePath) {
    let cleanPath = options.filePath.trim().replace(/^['"]|['"]$/g, "");
    if (cleanPath.toLowerCase().startsWith("desktop/") || cleanPath.toLowerCase().startsWith("desktop\\")) {
      cleanPath = path.join(home, "Desktop", cleanPath.replace(/^desktop[\/\\]/i, ""));
    } else if (cleanPath.toLowerCase().startsWith("downloads/") || cleanPath.toLowerCase().startsWith("downloads\\")) {
      cleanPath = path.join(home, "Downloads", cleanPath.replace(/^downloads[\/\\]/i, ""));
    } else if (cleanPath.toLowerCase().startsWith("documents/") || cleanPath.toLowerCase().startsWith("documents\\")) {
      cleanPath = path.join(home, "Documents", cleanPath.replace(/^documents[\/\\]/i, ""));
    }

    if (path.isAbsolute(cleanPath)) {
      targetPath = cleanPath;
    } else {
      targetPath = path.join(home, "Desktop", cleanPath);
    }
  } else {
    let targetDir = path.join(home, "Desktop");
    const folder = (options.folder || "desktop").toLowerCase();
    if (folder.includes("download") || folder.includes("تنزيل")) {
      targetDir = path.join(home, "Downloads");
    } else if (folder.includes("document") || folder.includes("مستند")) {
      targetDir = path.join(home, "Documents");
    }

    let name = (options.filename || "مستند_جديد.txt").trim();
    if (!path.extname(name)) {
      name += ".txt";
    }
    targetPath = path.join(targetDir, name);
  }

  // الكتابة داخل سطح المكتب والمستندات والتنزيلات فقط (كان يقبل أي مسار، ومنه مجلد بدء التشغيل)
  targetPath = path.resolve(targetPath);
  if (!isInsideAny(userRoots(), targetPath)) {
    return {
      success: false,
      message: "إنشاء الملفات مسموح داخل سطح المكتب أو المستندات أو التنزيلات فقط.",
      fullPath: targetPath,
    };
  }
  const safeToOpen = isSafeToAutoOpen(targetPath);

  try {
    await writeFile(targetPath, options.content || "", "utf8");

    // قائمة سماح: فتح امتداد غير معروف قد يعني تشغيله، فلا نفتح إلا المستندات والصور
    if (options.openAfterCreate !== false && safeToOpen) {
      startDetached(targetPath);
    }
    if (!safeToOpen && options.openAfterCreate !== false) {
      return {
        success: true,
        message: `تم حفظ الملف ${path.basename(targetPath)} دون فتحه تلقائياً، لأن نوعه قد يُشغَّل عند فتحه. افتحه بنفسك إن كنت تثق بمحتواه.`,
        fullPath: targetPath,
      };
    }

    return {
      success: true,
      message: `تم إنشاء وحفظ الملف: ${path.basename(targetPath)}`,
      fullPath: targetPath,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر إنشاء الملف: ${err.message}`,
      fullPath: targetPath,
    };
  }
}

export async function setVolume(
  action: "up" | "down" | "mute" | "max" | "min",
  steps: number = 5,
): Promise<{ success: boolean; message: string }> {
  try {
    steps = Math.max(1, Math.min(50, Math.round(Number(steps) || 5)));
    let script = "";
    if (action === "up") {
      script = `1..${steps} | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]175) }`;
    } else if (action === "down") {
      script = `1..${steps} | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]174) }`;
    } else if (action === "mute") {
      script = `(New-Object -ComObject WScript.Shell).SendKeys([char]173)`;
    } else if (action === "max") {
      script = `1..50 | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]175) }`;
    } else if (action === "min") {
      script = `1..50 | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]174) }`;
    }

    if (!script) return { success: false, message: "إجراء صوت غير معروف." };
    await runPowerShell(script, { timeoutMs: 4000 });

    let msg = "تم تعديل مستوى الصوت بنجاح.";
    if (action === "up") msg = "تم رفع مستوى صوت اللابتوب.";
    else if (action === "down") msg = "تم خفض مستوى صوت اللابتوب.";
    else if (action === "mute") msg = "تم تبديل كتم الصوت (Mute/Unmute).";
    else if (action === "max") msg = "تم رفع الصوت إلى الحد الأقصى (100%).";
    else if (action === "min") msg = "تم خفض الصوت إلى أدنى حد (0%).";

    return { success: true, message: msg };
  } catch (err: any) {
    return { success: false, message: `تعذر تعديل الصوت: ${err.message}` };
  }
}

export async function lockWorkstation(): Promise<{ success: boolean; message: string }> {
  try {
    const child = spawn("rundll32.exe", ["user32.dll,LockWorkStation"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { success: true, message: "تم قفل شاشة اللابتوب بنجاح لحماية خصوصيتك." };
  } catch (err: any) {
    return { success: false, message: `تعذر قفل الشاشة: ${err.message}` };
  }
}

export async function controlMouse(options: {
  action: "click" | "left_click" | "right_click" | "double_click" | "move";
  x?: number;
  y?: number;
}): Promise<{ success: boolean; message: string; x?: number; y?: number }> {
  try {
    const action = options.action || "click";
    if (!MOUSE_ACTIONS.has(action)) return { success: false, message: `إجراء فأرة غير مسموح: ${String(action).slice(0, 30)}` };
    const xArg = Number.isFinite(options.x) ? String(Math.round(options.x as number)) : "-1";
    const yArg = Number.isFinite(options.y) ? String(Math.round(options.y as number)) : "-1";

    const scriptPath = path.join(process.cwd(), "scripts", "mouseController.py");
    await runFile("py", [scriptPath, action, xArg, yArg]);

    let msg = "تم تنفيذ أمر الفأرة بنجاح.";
    if (action === "click" || action === "left_click") {
      msg = options.x !== undefined && options.y !== undefined
        ? `تم النقر بالزر الأيسر عند (${options.x}, ${options.y}).`
        : "تم النقر بزر الفأرة الأيسر فوراً.";
    } else if (action === "right_click") {
      msg = options.x !== undefined && options.y !== undefined
        ? `تم النقر بالزر الأيمن عند (${options.x}, ${options.y}).`
        : "تم النقر بزر الفأرة الأيمن فوراً.";
    } else if (action === "double_click") {
      msg = "تم النقر المزدوج (Double Click) بزر الفأرة فوراً.";
    } else if (action === "move") {
      msg = `تم تحريك مؤشر الفأرة إلى (${options.x}, ${options.y}).`;
    }

    return { success: true, message: msg, x: options.x, y: options.y };
  } catch (err: any) {
    return { success: false, message: `تعذر التحكم بالفأرة: ${err.message}` };
  }
}

export async function controlKeyboard(options: {
  action: "type" | "press" | "hotkey";
  text?: string;
  key?: string;
  hotkey?: string;
  pressEnter?: boolean;
}): Promise<{ success: boolean; message: string }> {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "keyboardController.py");
    const action = options.action;

    if (action === "type") {
      const text = options.text || "";
      const pressEnter = options.pressEnter ? "enter" : "none";
      const safeTempPath = path.join(os.tmpdir(), `sanad_type_${Date.now()}.txt`);
      await writeFile(safeTempPath, text, "utf8");
      await runFile("py", [scriptPath, "type", "--file", safeTempPath, pressEnter]);
      try { await unlink(safeTempPath); } catch {}
      return { success: true, message: `تمت كتابة النص بنجاح: "${text.slice(0, 40)}${text.length > 40 ? "..." : ""}"` };
    }

    if (action === "press") {
      const key = (options.key || "enter").toLowerCase().trim();
      if (!KEY_RE.test(key)) return { success: false, message: `مفتاح غير مسموح: ${key.slice(0, 20)}` };
      await runFile("py", [scriptPath, "press", key]);
      let keyLabel = key;
      if (key === "enter") keyLabel = "Enter (إدخال)";
      else if (key === "esc") keyLabel = "Escape (هروب)";
      else if (key === "tab") keyLabel = "Tab (انتقال)";
      return { success: true, message: `تم الضغط على مفتاح ${keyLabel}.` };
    }

    if (action === "hotkey") {
      const hotkey = (options.hotkey || "ctrl+s").toLowerCase().replace(/\s+/g, "");
      if (!HOTKEY_RE.test(hotkey)) return { success: false, message: `اختصار غير مسموح: ${hotkey.slice(0, 30)}` };
      await runFile("py", [scriptPath, "hotkey", hotkey]);
      let hotkeyLabel = hotkey;
      if (hotkey === "ctrl+s") hotkeyLabel = "Ctrl+S (حفظ)";
      else if (hotkey === "ctrl+n") hotkeyLabel = "Ctrl+N (جديد)";
      else if (hotkey === "ctrl+c") hotkeyLabel = "Ctrl+C (نسخ)";
      else if (hotkey === "ctrl+v") hotkeyLabel = "Ctrl+V (لصق)";
      else if (hotkey === "alt+f4") hotkeyLabel = "Alt+F4 (إغلاق)";
      return { success: true, message: `تم تنفيذ الاختصار ${hotkeyLabel} بنجاح.` };
    }

    return { success: false, message: "إجراء غير معروف للوحة المفاتيح." };
  } catch (err: any) {
    return { success: false, message: `تعذر تنفيذ أمر لوحة المفاتيح: ${err.message}` };
  }
}
