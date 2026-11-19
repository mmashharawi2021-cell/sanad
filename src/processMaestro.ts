import { exec, execFile, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cleanTemporaryFiles, setVolume, lockWorkstation, controlKeyboard } from "./systemTools";

const execAsync = promisify(exec);

export type ProcessInfo = {
  pid: number;
  name: string;
  ramMb: number;
  category: "browser" | "dev" | "office" | "system" | "media" | "other";
};

const APP_ALIASES: Record<string, string> = {
  chrome: "chrome",
  google_chrome: "chrome",
  كروم: "chrome",
  edge: "msedge",
  مايكروسوفت_ايدج: "msedge",
  firefox: "firefox",
  فايرفوكس: "firefox",
  brave: "brave",
  notepad: "notepad",
  المفكرة: "notepad",
  calculator: "calc",
  الآلة_الحاسبة: "calc",
  الحاسبة: "calc",
  calc: "calc",
  vscode: "code",
  كود: "code",
  فيجوال_ستوديو: "code",
  code: "code",
  word: "winword",
  وورد: "winword",
  excel: "excel",
  اكسل: "excel",
  powerpoint: "powerpnt",
  بوربوينت: "powerpnt",
  taskmgr: "taskmgr",
  مدير_المهام: "taskmgr",
  settings: "ms-settings:",
  الإعدادات: "ms-settings:",
  الاعدادات: "ms-settings:",
  control: "control",
  لوحة_التحكم: "control",
  explorer: "explorer",
  مستكشف_الملفات: "explorer",
  cmd: "cmd",
  موجه_الأوامر: "cmd",
  powershell: "powershell",
  باور_شيل: "powershell",
  terminal: "wt",
  الطرفية: "wt",
  vlc: "vlc",
  spotify: "spotify",
  paint: "mspaint",
  الرسام: "mspaint",
  snippingtool: "snippingtool",
  أداة_القص: "snippingtool",
};

export async function listProcesses(limit: number = 15): Promise<ProcessInfo[]> {
  return new Promise((resolve) => {
    const psScript = `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First ${limit} -Property Id, ProcessName, WorkingSet64 | ConvertTo-Json`;
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", psScript],
      { windowsHide: true },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const results: ProcessInfo[] = list.map((item: any) => {
            const name = String(item.ProcessName || "").toLowerCase();
            const ramMb = Math.round(((item.WorkingSet64 || 0) / (1024 * 1024)) * 10) / 10;

            let category: ProcessInfo["category"] = "other";
            if (/chrome|msedge|firefox|brave|opera/i.test(name)) category = "browser";
            else if (/code|node|py|python|git|wt|powershell|cmd/i.test(name)) category = "dev";
            else if (/winword|excel|powerpnt|notepad|onenote/i.test(name)) category = "office";
            else if (/vlc|spotify|wmplayer|audacity/i.test(name)) category = "media";
            else if (/system|dwm|explorer|csrss|lsass|services/i.test(name)) category = "system";

            return {
              pid: Number(item.Id),
              name: item.ProcessName,
              ramMb,
              category,
            };
          });
          resolve(results);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

export async function killProcess(identifier: string | number): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const isPid = typeof identifier === "number" || /^\d+$/.test(String(identifier).trim());
    const arg = isPid ? `-Id ${identifier}` : `-Name "${String(identifier).trim()}"`;
    const psScript = `Stop-Process ${arg} -Force -ErrorAction Stop`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", psScript],
      { windowsHide: true },
      (err) => {
        if (err) {
          resolve({
            success: false,
            message: `تعذر إغلاق العملية (${identifier}): ${err.message}`,
          });
        } else {
          resolve({
            success: true,
            message: `تم بنجاح إغلاق العملية (${identifier}) وتحرير مواردها.`,
          });
        }
      }
    );
  });
}

export async function launchAnyApp(
  appNameOrPath: string
): Promise<{ success: boolean; message: string; fullCommand?: string }> {
  const norm = appNameOrPath.toLowerCase().trim().replace(/^(فتح|شغل|قم بفتح|برنامج)\s+/i, "");
  const target = APP_ALIASES[norm] || norm;

  return new Promise((resolve) => {
    try {
      if (target.includes(":")) {
        const child = spawn("powershell.exe", ["-NoProfile", "-Command", `Start-Process "${target}"`], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
      } else {
        const child = spawn("cmd.exe", ["/c", "start", "", target], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
      }

      resolve({
        success: true,
        message: `تم فتح وتشغيل ${appNameOrPath} بنجاح.`,
        fullCommand: target,
      });
    } catch (err: any) {
      resolve({
        success: false,
        message: `تعذر تشغيل ${appNameOrPath}: ${err.message}`,
      });
    }
  });
}

export async function setScreenBrightness(percent: number): Promise<{ success: boolean; brightness: number; message: string }> {
  const clamped = Math.max(10, Math.min(100, Math.round(percent)));
  return new Promise((resolve) => {
    const psScript = `Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout = 1; Brightness = ${clamped}}`;
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", psScript],
      { windowsHide: true },
      (err) => {
        if (err) {
          resolve({
            success: false,
            brightness: clamped,
            message: `تعذر تعديل سطوع الشاشة: الشاشة الحالية قد لا تدعم التحكم عبر WMI.`,
          });
        } else {
          resolve({
            success: true,
            brightness: clamped,
            message: `تم ضبط سطوع الشاشة بنجاح على ${clamped}%.`,
          });
        }
      }
    );
  });
}

export async function executeDailyRoutine(routine: "morning" | "focus" | "wrapup" | string): Promise<{
  success: boolean;
  routine: string;
  message: string;
  actionsTaken: string[];
}> {
  const norm = routine.toLowerCase().trim();
  const actions: string[] = [];

  if (norm === "morning" || norm === "بداية_العمل" || norm === "صباح_الخير") {
    // 1. Open VS Code
    await launchAnyApp("vscode").then(() => actions.push("تم فتح بيئة التطوير Visual Studio Code"));
    // 2. Set comfortable sound volume
    await setVolume("down", 3).then(() => actions.push("تم ضبط مستوى الصوت المريح"));
    // 3. Set brightness to 70%
    await setScreenBrightness(70).then((r) => { if (r.success) actions.push("تم ضبط سطوع الشاشة على 70%"); });

    return {
      success: true,
      routine: "morning",
      message: `صباح الخير والإنتاجية يا صديقي! تم تجهيز لابتوبك لبدء يوم عمل ناجح:\n${actions.map((a) => `• ${a}`).join("\n")}`,
      actionsTaken: actions,
    };
  }

  if (norm === "focus" || norm === "تركيز" || norm === "وضع_التركيز") {
    // 1. Mute audio
    await setVolume("mute").then(() => actions.push("تم كتم الصوت لمنع المشتتات"));
    // 2. Minimize all distracting windows
    await controlKeyboard({ action: "hotkey", hotkey: "win+d" }).then(() => actions.push("تم تصغير النوافذ المشتتة"));
    // 3. Bring VS Code or active app
    await launchAnyApp("vscode").then(() => actions.push("تم إبراز مساحة الكود والعمل"));

    return {
      success: true,
      routine: "focus",
      message: `تم تفعيل وضع التركيز الصامت (Deep Focus Mode):\n${actions.map((a) => `• ${a}`).join("\n")}`,
      actionsTaken: actions,
    };
  }

  if (norm === "wrapup" || norm === "نهاية_العمل" || norm === "مساء_الخير" || norm === "انهاء_العمل") {
    // 1. Clean temporary files and caches
    const cleanRes = await cleanTemporaryFiles().catch(() => ({ freedMb: 0 }));
    actions.push(`تم تنظيف الكاش والملفات المؤقتة وتحرير ${cleanRes.freedMb || 0} MB`);
    // 2. Minimize all windows
    await controlKeyboard({ action: "hotkey", hotkey: "win+d" }).then(() => actions.push("تم تصغير وإغلاق واجهات العمل"));
    // 3. Dim brightness to 20%
    await setScreenBrightness(20).then((r) => { if (r.success) actions.push("تم خفض سطوع الشاشة إلى 20%"); });

    return {
      success: true,
      routine: "wrapup",
      message: `عمل عظيم اليوم! تم إنهاء وتجهيز لابتوبك للاستراحة:\n${actions.map((a) => `• ${a}`).join("\n")}`,
      actionsTaken: actions,
    };
  }

  return {
    success: false,
    routine: norm,
    message: `الروتين المطلوب غير معروف (${routine}). الخيارات المتاحة: morning (ابدأ العمل), focus (وضع التركيز), wrapup (إنهاء العمل).`,
    actionsTaken: [],
  };
}
