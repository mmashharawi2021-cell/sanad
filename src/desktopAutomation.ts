import fs from "node:fs";
import { readdir, stat, rename, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launchApp, openFolder, controlKeyboard } from "./systemTools";
import { extractTextFromLocalPath, ExtractedFile } from "./fileReader";

export type OrganizeCategory = {
  key: string;
  nameArabic: string;
  folderName: string;
  extensions: string[];
};

export const FILE_CATEGORIES: OrganizeCategory[] = [
  {
    key: "gis",
    nameArabic: "نظم المعلومات الجغرافية والخرائط",
    folderName: "مشاريع وخرائط GIS",
    extensions: [
      ".aprx", ".mxd", ".shp", ".geojson", ".kml", ".kmz", ".gdb", ".tif",
      ".tiff", ".las", ".laz", ".dwg", ".dxf", ".cpg", ".dbf", ".prj",
      ".sbn", ".sbx", ".shx", ".qgz", ".qgs"
    ],
  },
  {
    key: "documents",
    nameArabic: "المستندات والتقارير",
    folderName: "المستندات والتقارير",
    extensions: [
      ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt",
      ".rtf", ".odt", ".csv", ".tsv"
    ],
  },
  {
    key: "images",
    nameArabic: "الصور والتصاميم",
    folderName: "الصور والتصاميم",
    extensions: [
      ".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".ico",
      ".ai", ".psd"
    ],
  },
  {
    key: "media",
    nameArabic: "الفيديو والصوتيات",
    folderName: "الفيديو والصوتيات",
    extensions: [
      ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".mp3", ".wav", ".flac",
      ".ogg", ".m4a"
    ],
  },
  {
    key: "archives",
    nameArabic: "الملفات المضغوطة والأرشيف",
    folderName: "الملفات المضغوطة والأرشيف",
    extensions: [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"],
  },
  {
    key: "code",
    nameArabic: "أكواد وبرمجيات",
    folderName: "أكواد وبرمجيات",
    extensions: [
      ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json",
      ".sql", ".ipynb", ".cpp", ".java", ".rs", ".go", ".php", ".sh",
      ".bat", ".ps1"
    ],
  },
  {
    key: "installers",
    nameArabic: "برامج التثبيت والتطبيقات",
    folderName: "برامج التثبيت والتطبيقات",
    extensions: [".exe", ".msi", ".iso"],
  },
];

const IGNORED_EXTENSIONS = new Set([".lnk", ".url"]);
const IGNORED_NAMES = new Set(["desktop.ini", "thumbs.db"]);

export type OrganizeResult = {
  success: boolean;
  target: string;
  targetPath: string;
  movedFilesCount: number;
  totalExamined: number;
  byCategory: Record<string, number>;
  message: string;
};

export function resolveFolderPath(target: "desktop" | "downloads" | "documents" | string): string {
  const home = os.homedir();
  const lower = target.toLowerCase().trim();
  if (lower === "desktop" || lower === "سطح المكتب") {
    return path.join(home, "Desktop");
  }
  if (lower === "downloads" || lower === "التنزيلات" || lower === "الداونلود") {
    return path.join(home, "Downloads");
  }
  if (lower === "documents" || lower === "المستندات") {
    return path.join(home, "Documents");
  }
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.join(home, target);
}

export async function getDirectoryStatus(target: "desktop" | "downloads" | string) {
  const targetPath = resolveFolderPath(target);
  try {
    const entries = await readdir(targetPath, { withFileTypes: true });
    let looseFilesCount = 0;
    let foldersCount = 0;
    let shortcutsCount = 0;
    const extensionCounts: Record<string, number> = {};

    for (const entry of entries) {
      if (entry.isDirectory()) {
        foldersCount++;
        continue;
      }
      if (IGNORED_NAMES.has(entry.name.toLowerCase()) || entry.name.startsWith(".")) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORED_EXTENSIONS.has(ext)) {
        shortcutsCount++;
        continue;
      }
      looseFilesCount++;
      extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
    }

    return {
      success: true,
      target,
      targetPath,
      looseFilesCount,
      foldersCount,
      shortcutsCount,
      extensionCounts,
    };
  } catch (err: any) {
    return {
      success: false,
      target,
      targetPath,
      error: err.message,
    };
  }
}

export async function organizeDirectory(
  target: "desktop" | "downloads" | string
): Promise<OrganizeResult> {
  const targetPath = resolveFolderPath(target);
  if (!fs.existsSync(targetPath)) {
    return {
      success: false,
      target,
      targetPath,
      movedFilesCount: 0,
      totalExamined: 0,
      byCategory: {},
      message: `المجلد غير موجود: ${targetPath}`,
    };
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const byCategory: Record<string, number> = {};
  let movedFilesCount = 0;
  let totalExamined = 0;

  // Build extension -> category map
  const extToCategory = new Map<string, OrganizeCategory>();
  for (const cat of FILE_CATEGORIES) {
    for (const ext of cat.extensions) {
      extToCategory.set(ext.toLowerCase(), cat);
    }
  }

  // Set of category folder names to avoid moving inside themselves
  const categoryFolderNames = new Set(FILE_CATEGORIES.map((c) => c.folderName.toLowerCase()));

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const name = entry.name;
    const nameLower = name.toLowerCase();

    if (IGNORED_NAMES.has(nameLower) || name.startsWith(".")) continue;

    const ext = path.extname(name).toLowerCase();
    if (IGNORED_EXTENSIONS.has(ext)) continue;

    totalExamined++;
    const matchedCategory = extToCategory.get(ext);
    if (!matchedCategory) {
      // Uncategorized loose files can remain or be put into a general 'متنوعات' folder if needed
      continue;
    }

    // Destination directory
    const destDir = path.join(targetPath, matchedCategory.folderName);
    if (!fs.existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }

    // Determine target file name to prevent collision
    let destFile = path.join(destDir, name);
    if (fs.existsSync(destFile)) {
      const extName = path.extname(name);
      const baseName = path.basename(name, extName);
      let count = 1;
      while (fs.existsSync(path.join(destDir, `${baseName}_${count}${extName}`))) {
        count++;
      }
      destFile = path.join(destDir, `${baseName}_${count}${extName}`);
    }

    const srcFile = path.join(targetPath, name);
    try {
      await rename(srcFile, destFile);
      movedFilesCount++;
      byCategory[matchedCategory.folderName] = (byCategory[matchedCategory.folderName] || 0) + 1;
    } catch (moveErr) {
      console.warn(`[SANAD Organizer] Failed to move ${name}:`, moveErr);
    }
  }

  const catBreakdown = Object.entries(byCategory)
    .map(([cat, count]) => `• ${cat}: ${count} ملف`)
    .join("\n");

  const message =
    movedFilesCount > 0
      ? `تم بنجاح تنظيم وترتيب ${movedFilesCount} ملف في ${target === "desktop" ? "سطح المكتب" : target} وتصنيفها بأمان:\n${catBreakdown}`
      : `سطح المكتب/المجلد منظم ومثالي بالفعل! لم يتم العثور على ملفات مبعثرة بحاجة للفرز.`;

  return {
    success: true,
    target,
    targetPath,
    movedFilesCount,
    totalExamined,
    byCategory,
    message,
  };
}

export async function setupWorkspacePreset(
  preset: "gis" | "coding" | "clean" | string
): Promise<{ success: boolean; message: string; details?: any }> {
  const norm = preset.toLowerCase().trim();

  if (norm === "gis" || norm === "نظم_المعلومات" || norm === "ارك_برو") {
    // 1. Launch ArcGIS Pro
    const appResult = await launchApp("arcgis");
    // 2. Open or ensure GIS Projects folder
    const desktopPath = resolveFolderPath("desktop");
    const gisDir = path.join(desktopPath, "مشاريع وخرائط GIS");
    if (!fs.existsSync(gisDir)) {
      await mkdir(gisDir, { recursive: true });
    }
    await openFolder(gisDir);

    return {
      success: true,
      message: "تم تجهيز بيئة نظم المعلومات الجغرافية (GIS) بنجاح: تم تشغيل برنامج ArcGIS Pro 3.7 وفتح مجلد مشاريع وخرائط GIS للعمل المباشر.",
      details: { appResult, gisDir },
    };
  }

  if (norm === "coding" || norm === "برمجة" || norm === "تطوير") {
    const projectDir = process.cwd();
    const appResult = await launchApp("vscode").catch(() => null);
    await openFolder(projectDir);
    return {
      success: true,
      message: `تم تجهيز بيئة البرمجة: تم فتح مساحة المشروع الحالية (${projectDir}) والبدء في وضع التطوير.`,
      details: { projectDir, appResult },
    };
  }

  if (norm === "clean" || norm === "صفاء" || norm === "تقليل_النوافذ") {
    // Minimize all windows (Win + D)
    await controlKeyboard({ keyboardAction: "hotkey", hotkey: "win+d" });
    return {
      success: true,
      message: "تم تنظيف الشاشة وإظهار سطح المكتب فوراً وتصغير كافة النوافذ المشتتة.",
    };
  }

  return {
    success: false,
    message: `البيئة المطلوبة غير معروفة (${preset}). الخيارات المتاحة: gis (نظم المعلومات), coding (البرمجة), clean (تنظيف الشاشة).`,
  };
}

export async function inspectAndSummarizeFile(
  filePath: string
): Promise<{ success: boolean; data?: ExtractedFile; message: string }> {
  try {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(os.homedir(), "Desktop", filePath);

    const extracted = await extractTextFromLocalPath(resolvedPath);
    return {
      success: true,
      data: extracted,
      message: `تم فحص الملف "${extracted.filename}" بنجاح (${(extracted.sizeBytes / 1024).toFixed(1)} KB).`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر فحص وتلخيص الملف: ${err.message}`,
    };
  }
}
