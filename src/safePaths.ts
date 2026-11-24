/**
 * حدود المسارات المسموحة لسند.
 * المسارات قد تأتي من المستخدم أو من رد نموذج لغوي (قابل للحقن)، لذا:
 * - الكتابة والفرز داخل سطح المكتب والمستندات والتنزيلات فقط.
 * - لا خروج من مجلد المشروع بـ `..` ولا بمسارات مطلقة.
 * - لا قراءة للأسرار (.env، مفاتيح SSH، ملفات المفاتيح).
 */
import os from "node:os";
import path from "node:path";

export function userRoots(): string[] {
  const home = os.homedir();
  return [path.join(home, "Desktop"), path.join(home, "Documents"), path.join(home, "Downloads")];
}

/** هل target داخل base (أو هو نفسه)؟ يقارن بعد resolve ويرفض `..` والمسارات المطلقة الأخرى. */
export function isInside(base: string, target: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function isInsideAny(bases: string[], target: string): boolean {
  return bases.some((b) => isInside(b, target));
}

/** يحلّ مساراً نسبياً داخل base أو يرمي خطأ إن حاول الخروج منه. */
export function resolveInside(base: string, relative: string): string {
  const full = path.resolve(base, relative);
  if (!isInside(base, full)) throw new Error(`المسار يخرج عن المجلد المسموح: ${relative}`);
  return full;
}

/** اسم مجلد/مشروع بسيط: بلا فواصل مسارات ولا `..` ولا محرف قرص. */
export function isSimpleName(name: string): boolean {
  const n = String(name).trim();
  return n.length > 0 && n.length <= 120 && !/[\\/:*?"<>|]/.test(n) && n !== "." && n !== "..";
}

// امتدادات تُنفَّذ عند فتحها — لا يكتبها سند ثم يفتحها تلقائياً
const EXECUTABLE_EXT = new Set([".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".hta", ".lnk", ".url", ".exe", ".com", ".scr", ".msi", ".reg", ".pif", ".cpl"]);
export function isExecutableExtension(file: string): boolean {
  return EXECUTABLE_EXT.has(path.extname(file).toLowerCase());
}

// قائمة سماح للفتح التلقائي بعد الإنشاء: مستندات وبيانات وصور فقط (أي امتداد آخر قد يُنفَّذ عند فتحه)
const AUTO_OPEN_SAFE = new Set([".txt", ".md", ".csv", ".tsv", ".json", ".log", ".xml", ".yaml", ".yml", ".ini", ".css", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf", ".docx", ".xlsx", ".pptx", ".odt", ".rtf"]);
export function isSafeToAutoOpen(file: string): boolean {
  return AUTO_OPEN_SAFE.has(path.extname(file).toLowerCase());
}

// ملفات/مجلدات الأسرار — لا تُقرأ ولا تُرسل إلى أي نموذج
const SECRET_DIRS = new Set([".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker", ".git"]);
export function isSecretPath(file: string): boolean {
  const parts = path.resolve(file).split(/[\\/]+/).map((p) => p.toLowerCase());
  const base = parts[parts.length - 1] || "";
  if (parts.some((p) => SECRET_DIRS.has(p))) return true;
  if (base === ".env" || (base.startsWith(".env.") && base !== ".env.example")) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)/.test(base)) return true;
  if (/\.(pem|key|pfx|p12|kdbx)$/.test(base)) return true;
  if (base === "credentials.json" || base === "secrets.json") return true;
  return false;
}

/** القراءة مسموحة داخل مجلد المستخدم فقط، وليست لأسرار. */
export function assertReadable(file: string): string {
  const full = path.resolve(file);
  if (!isInside(os.homedir(), full)) throw new Error("قراءة الملفات مسموحة داخل مجلد المستخدم فقط.");
  if (isSecretPath(full)) throw new Error("هذا الملف يحوي أسراراً (مفاتيح/كلمات مرور) ولا يُقرأ عبر سند.");
  return full;
}
