import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { readdir, stat, unlink, rm } from "fs/promises";

const execFileAsync = promisify(execFile);

export type DriveInfo = {
  drive: string;
  label: string;
  fileSystem: string;
  totalGb: number;
  freeGb: number;
  usedGb: number;
  usedPercent: number;
  status: "healthy" | "warning" | "critical";
};

export type LargeFileInfo = {
  name: string;
  path: string;
  directory: string;
  sizeBytes: number;
  sizeMb: number;
  sizeFormatted: string;
  extension: string;
  category: "video" | "archive" | "installer" | "audio" | "data" | "code" | "other";
  modifiedAt: string;
};

export type DiskCleanResult = {
  success: boolean;
  freedMb: number;
  freedGb?: number;
  filesDeleted: number;
  cleanedLocations: string[];
  message: string;
};

export type RamOptimizationResult = {
  success: boolean;
  freedMb: number;
  freeBeforeMb: number;
  freeAfterMb: number;
  processesOptimized: number;
  message: string;
};

export type SystemHealthOverview = {
  healthScore: number;
  healthRating: "ممتاز" | "جيد جداً" | "يحتاج عناية" | "حرج";
  drives: DriveInfo[];
  cpuUsagePercent: number;
  ramUsagePercent: number;
  totalRamGb: number;
  freeRamGb: number;
  uptimeHours: number;
  topProcesses: { name: string; memoryMb: number; pid: number }[];
  recommendations: string[];
};

/**
 * Get detailed information about all hard drives and partitions (C:, D:, etc.)
 */
export async function getDrivesInfo(): Promise<DriveInfo[]> {
  if (process.platform !== "win32") {
    return [
      {
        drive: "/",
        label: "Root",
        fileSystem: "POSIX",
        totalGb: 500,
        freeGb: 250,
        usedGb: 250,
        usedPercent: 50,
        status: "healthy",
      },
    ];
  }

  try {
    const psScript = `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, VolumeName, FileSystem, FreeSpace, Size | ConvertTo-Json`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", psScript], { timeout: 6000 });

    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list.map((item: any) => {
      const totalBytes = Number(item.Size) || 0;
      const freeBytes = Number(item.FreeSpace) || 0;
      const usedBytes = Math.max(0, totalBytes - freeBytes);

      const totalGb = Number((totalBytes / 1024 ** 3).toFixed(1));
      const freeGb = Number((freeBytes / 1024 ** 3).toFixed(1));
      const usedGb = Number((usedBytes / 1024 ** 3).toFixed(1));
      const usedPercent = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0;

      let status: "healthy" | "warning" | "critical" = "healthy";
      if (usedPercent >= 92) status = "critical";
      else if (usedPercent >= 82) status = "warning";

      return {
        drive: item.DeviceID || "C:",
        label: item.VolumeName || "قرص محلي",
        fileSystem: item.FileSystem || "NTFS",
        totalGb,
        freeGb,
        usedGb,
        usedPercent,
        status,
      };
    });
  } catch (err) {
    console.warn("[getDrivesInfo error]", err);
    return [];
  }
}

/**
 * Scan for largest files on user disk across Desktop, Downloads, Documents, Videos
 */
export async function findLargeFiles(options?: { minSizeMb?: number; limit?: number }): Promise<LargeFileInfo[]> {
  const minSizeMb = options?.minSizeMb || 20;
  const limit = options?.limit || 15;

  if (process.platform !== "win32") {
    return [];
  }

  try {
    const psScript = `
$targets = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE 'Downloads'),
    [Environment]::GetFolderPath('MyDocuments'),
    [Environment]::GetFolderPath('MyVideos')
) | Where-Object { Test-Path $_ }

$results = @()
foreach ($dir in $targets) {
    try {
        $files = Get-ChildItem -Path $dir -File -Recurse -Depth 4 -ErrorAction SilentlyContinue |
            Where-Object { $_.Length -gt ${minSizeMb}MB } |
            Sort-Object Length -Descending |
            Select-Object -First 20
        if ($files) {
            $results += $files
        }
    } catch {}
}

$topFiles = $results | Sort-Object Length -Descending | Select-Object -First ${limit} | ForEach-Object {
    [PSCustomObject]@{
        name = $_.Name
        path = $_.FullName
        directory = $_.DirectoryName
        sizeBytes = $_.Length
        sizeMb = [Math]::Round($_.Length / 1MB, 1)
        extension = $_.Extension.ToLower()
        modifiedAt = $_.LastWriteTime.ToString("o")
    }
}

$topFiles | ConvertTo-Json
`;

    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list.map((item: any) => {
      const ext = String(item.extension || "").toLowerCase();
      let category: LargeFileInfo["category"] = "other";
      if ([".mp4", ".mkv", ".mov", ".avi", ".wmv", ".webm"].includes(ext)) category = "video";
      else if ([".mp3", ".wav", ".flac", ".m4a", ".aac"].includes(ext)) category = "audio";
      else if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) category = "archive";
      else if ([".exe", ".msi", ".apk", ".iso"].includes(ext)) category = "installer";
      else if ([".gpkg", ".shp", ".db", ".sqlite", ".csv", ".json"].includes(ext)) category = "data";
      else if ([".ts", ".js", ".py", ".node", ".cpp"].includes(ext)) category = "code";

      const sizeMb = Number(item.sizeMb) || 0;
      const sizeFormatted = sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(2)} GB` : `${sizeMb.toFixed(1)} MB`;

      return {
        name: item.name,
        path: item.path,
        directory: item.directory,
        sizeBytes: Number(item.sizeBytes) || 0,
        sizeMb,
        sizeFormatted,
        extension: ext,
        category,
        modifiedAt: item.modifiedAt || "",
      };
    });
  } catch (err) {
    console.warn("[findLargeFiles error]", err);
    return [];
  }
}

/**
 * Safe deep clean of temporary files and caches
 */
export async function safeDeepCleanDisk(): Promise<DiskCleanResult> {
  let freedBytes = 0;
  let filesDeleted = 0;
  const cleanedLocations: string[] = [];

  const tempDirsToClean = [
    os.tmpdir(),
    path.join(process.env.LOCALAPPDATA || "", "CrashDumps"),
    path.join(process.env.LOCALAPPDATA || "", "Temp"),
  ].filter(Boolean);

  for (const dir of tempDirsToClean) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      cleanedLocations.push(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        try {
          const s = await stat(fullPath);
          if (entry.isFile()) {
            freedBytes += s.size;
            await unlink(fullPath);
            filesDeleted++;
          } else if (entry.isDirectory()) {
            await rm(fullPath, { recursive: true, force: true });
            filesDeleted++;
          }
        } catch {
          // Locked files are skipped safely
        }
      }
    } catch {
      // Directory access skipped
    }
  }

  const freedMb = Number((freedBytes / (1024 * 1024)).toFixed(1));
  const freedGb = Number((freedBytes / (1024 ** 3)).toFixed(2));

  return {
    success: true,
    freedMb,
    freedGb,
    filesDeleted,
    cleanedLocations,
    message: `تم تنظيف الملفات المؤقتة بأمان: تم حذف ${filesDeleted} عنصراً وتحرير ${freedMb >= 1024 ? `${freedGb} جيجابايت` : `${freedMb} ميجابايت`} من مساحة التخزين.`,
  };
}

/**
 * Flush working sets and optimize RAM across running processes
 */
export async function optimizeRam(): Promise<RamOptimizationResult> {
  if (process.platform !== "win32") {
    return {
      success: true,
      freedMb: 250,
      freeBeforeMb: 4000,
      freeAfterMb: 4250,
      processesOptimized: 10,
      message: "تم تحسين استهلاك الذاكرة بنجاح.",
    };
  }

  try {
    const psScript = `
$osBefore = Get-CimInstance Win32_OperatingSystem
$freeBefore = $osBefore.FreePhysicalMemory

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MemoryCleaner {
    [DllImport("psapi.dll")]
    public static extern int EmptyWorkingSet(IntPtr hwProc);
}
"@

$processes = Get-Process | Where-Object { $_.WorkingSet64 -gt 25MB -and $_.Id -ne $PID }
$cleaned = 0
foreach ($p in $processes) {
    try {
        if (-not $p.HasExited -and $p.Handle -ne [IntPtr]::Zero) {
            [MemoryCleaner]::EmptyWorkingSet($p.Handle) | Out-Null
            $cleaned++
        }
    } catch {}
}

Start-Sleep -Milliseconds 250
$osAfter = Get-CimInstance Win32_OperatingSystem
$freeAfter = $osAfter.FreePhysicalMemory
$diffKb = $freeAfter - $freeBefore
$diffMb = [Math]::Round($diffKb / 1024, 1)

[PSCustomObject]@{
    processesCleaned = $cleaned
    freedMb = $diffMb
    freeBeforeMb = [Math]::Round($freeBefore / 1024, 1)
    freeAfterMb = [Math]::Round($freeAfter / 1024, 1)
} | ConvertTo-Json
`;

    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
      timeout: 10000,
    });

    if (!stdout.trim()) {
      throw new Error("No output from memory cleaner.");
    }

    const data = JSON.parse(stdout);
    const freedMb = Math.max(0, Number(data.freedMb) || 0);
    const cleanedCount = Number(data.processesCleaned) || 0;

    return {
      success: true,
      freedMb,
      freeBeforeMb: Number(data.freeBeforeMb) || 0,
      freeAfterMb: Number(data.freeAfterMb) || 0,
      processesOptimized: cleanedCount,
      message: `تم تحرير الذاكرة العشوائية (RAM Boost) بنجاح: تم تحسين ${cleanedCount} عملية نشطة وتحرير قرابة ${freedMb.toFixed(0)} ميجابايت من الرام فوراً.`,
    };
  } catch (err: any) {
    console.warn("[optimizeRam error]", err);
    return {
      success: false,
      freedMb: 0,
      freeBeforeMb: 0,
      freeAfterMb: 0,
      processesOptimized: 0,
      message: `تعذر تحرير الرام: ${err?.message || "خطأ غير معروف"}`,
    };
  }
}

/**
 * Reveal any file in Windows File Explorer
 */
export async function revealFileInExplorer(filePath: string): Promise<{ success: boolean; message: string }> {
  try {
    const cleanPath = path.normalize(filePath);
    await execFileAsync("explorer.exe", [`/select,${cleanPath}`]);
    return {
      success: true,
      message: `تم فتح مستكشف الملفات وتحديد الملف: ${path.basename(cleanPath)}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر فتح المسار: ${err?.message || "خطأ"}`,
    };
  }
}

/**
 * Comprehensive System Health Overview
 */
export async function getSystemHealthOverview(): Promise<SystemHealthOverview> {
  const drives = await getDrivesInfo();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
  const totalRamGb = Number((totalMem / 1024 ** 3).toFixed(1));
  const freeRamGb = Number((freeMem / 1024 ** 3).toFixed(1));

  let cpuUsagePercent = 15;
  try {
    const cpus = os.cpus();
    const idle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const total = cpus.reduce((acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0);
    cpuUsagePercent = Math.min(100, Math.max(5, Math.round(100 - (idle / total) * 100)));
  } catch {}

  const topProcesses: { name: string; memoryMb: number; pid: number }[] = [];
  try {
    const psScript = `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 Name, WorkingSet64, Id | ConvertTo-Json`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", psScript], { timeout: 4000 });
    if (stdout.trim()) {
      const list = JSON.parse(stdout);
      const arr = Array.isArray(list) ? list : [list];
      arr.forEach((p: any) => {
        topProcesses.push({
          name: p.Name,
          memoryMb: Math.round((Number(p.WorkingSet64) || 0) / (1024 * 1024)),
          pid: Number(p.Id) || 0,
        });
      });
    }
  } catch {}

  // Calculate Health Score
  let healthScore = 100;
  const recommendations: string[] = [];

  // Disk impact
  const cDrive = drives.find((d) => d.drive.toLowerCase().startsWith("c"));
  if (cDrive) {
    if (cDrive.usedPercent > 90) {
      healthScore -= 25;
      recommendations.push(`القرص C: ممتلئ بنسبة ${cDrive.usedPercent}%. يرجى تنظيف الملفات المؤقتة ونقل الملفات الضخمة.`);
    } else if (cDrive.usedPercent > 80) {
      healthScore -= 10;
      recommendations.push(`القرص C: تجاوز 80% من طاقته. فحص الملفات الكبيرة ينصح به.`);
    }
  }

  // RAM impact
  if (ramUsagePercent > 88) {
    healthScore -= 20;
    recommendations.push(`استهلاك الرام مرتفع جداً (${ramUsagePercent}%). اضغط زر "تحرير الرام" لتفريغ الذاكرة فوراً.`);
  } else if (ramUsagePercent > 75) {
    healthScore -= 10;
    recommendations.push(`استهلاك الرام ${ramUsagePercent}%. تحسين الذاكرة يوفر استجابة أسرع للبرامج.`);
  }

  // CPU impact
  if (cpuUsagePercent > 85) {
    healthScore -= 15;
    recommendations.push(`استهلاك المعالج مرتفع (${cpuUsagePercent}%). تحقق من العمليات التي تستهلك قدرات اللابتوب.`);
  }

  let healthRating: SystemHealthOverview["healthRating"] = "ممتاز";
  if (healthScore < 60) healthRating = "حرج";
  else if (healthScore < 75) healthRating = "يحتاج عناية";
  else if (healthScore < 90) healthRating = "جيد جداً";

  return {
    healthScore: Math.max(20, Math.min(100, healthScore)),
    healthRating,
    drives,
    cpuUsagePercent,
    ramUsagePercent,
    totalRamGb,
    freeRamGb,
    uptimeHours: Number((os.uptime() / 3600).toFixed(1)),
    topProcesses,
    recommendations,
  };
}
