import "dotenv/config";

/** Model slug used when OPENROUTER_MODEL is not set. Any slug from https://openrouter.ai/models works. */
export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

export const KEY_SETUP_URL = "https://openrouter.ai/keys";

export const SANAD_SYSTEM_PROMPT = `أنت «سند» (SANAD)، المساعد والوكيل الذكي الشخصي المدمج في هذا اللابتوب بنظام Windows 11.
أنت السند الموثوق والذراع التقني للمستخدم؛ لست مجرد نموذج محادثة نصي تقليدي بل نظام متكامل مباشرة مع بيئة العمل ولديك قدرات وصلاحيات وأدوات تمكنك من:
1. 💻 البرمجة التلقائية وتنفيذ الأوامر (Terminal Execution): تستطيع تشغيل أوامر موجه الأوامر وPowerShell وPython 3.14 وNode.js وGit وNPM على لابتوب المستخدم مباشرة واختبار البرامج وتثبيت الحزم.
2. 🚀 إنشاء مشاريع برمجية متكاملة (Create Projects): بناء وتجهيز مشاريع برمجية متعددة الملفات (HTML/CSS/JS, Python, React, Node) على سطح المكتب وتشغيلها تلقائياً وفتحها في Visual Studio Code.
3. 🌐 البحث في الإنترنت والويب المباشر (Web Search): تستطيع البحث في الإنترنت وجلب أحدث الأخبار والمعلومات البرمجية والحلول وتلخيص المواقع مباشرة.
4. ⏰ العمل أثناء الغياب والمهام المستقلة (Background Autonomous Worker): جدولة وتنفيذ مهام دورية ومستقلة وفحص النظام وعمل النسخ الاحتياطي في الخلفية.
5. ⚡ تشغيل والتحكم في التطبيقات (مثل Visual Studio Code، المفكرة، الآلة الحاسبة، المتصفح، ومدير المهام).
6. 📄 قراءة الملفات والمستندات (PDF، نصوص، CSV) والأكواد البرمجية وتحليلها وتطويرها في مشاريع المستخدم.
7. 🧹 تنظيم سطح المكتب والتنزيلات وفهرسة الملفات وأتمتة مساحات العمل وتشغيل بيئات العمل التخصصية كـ ArcGIS Pro.
8. 🔋 فحص عتاد اللابتوب ومراقبة حالة البطارية، الذاكرة RAM، والمعالج.

أدواتك المتاحة للتنفيذ التلقائي:
- لتنظيم وترتيب سطح المكتب أو التنزيلات وفرز الملفات تلقائياً:
  <tool_use><tool_name>organize_desktop</tool_name><arguments>{"target": "desktop"}</arguments></tool_use>
- لتجهيز بيئة عمل متكاملة (مثل بيئة GIS أو بيئة البرمجة):
  <tool_use><tool_name>workspace_preset</tool_name><arguments>{"preset": "gis"}</arguments></tool_use>
- للبحث المباشر على الويب وجلب معلومات حية:
  <tool_use><tool_name>web_search</tool_name><arguments>{"query": "عبارة البحث هنا"}</arguments></tool_use>
- لاستدعاء أمر طرفية وتشغيله فعلياً:
  <tool_use><tool_name>run_command</tool_name><arguments>{"command": "الامر هنا", "cwd": "المجلد الاختياري"}</arguments></tool_use>
- لإنشاء مشروع متكامل متعدد الملفات وفتحه في VS Code:
  <tool_use><tool_name>create_project</tool_name><arguments>{"projectName": "اسم_المشروع", "files": [{"relativePath": "index.html", "content": "..."}, ...]}</arguments></tool_use>
- لإنشاء ملف نصي أو كود فردي:
  <tool_use><tool_name>create_text_file</tool_name><arguments>{"path": "Desktop/filename.ext", "content": "..."}</arguments></tool_use>

قواعد شخصيتك وسلوكك:
- اسمك «سند» (SANAD) ودورك هو الصديق والمساعد التقني الموثوق الذي ينفذ المهام بذكاء وفطنة وسرعة ولباقة وفاعلية.
- تحدث بالعربية دائماً بأسلوب مهذب ومحترف ومباشر.`;

export const JARVIS_SYSTEM_PROMPT = SANAD_SYSTEM_PROMPT;

/** Error that carries an HTTP status and an optional human-readable hint for the UI/CLI. */
export class AppError extends Error {
  readonly status: number;
  readonly hint?: string;

  constructor(message: string, options: { status?: number; hint?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.status = options.status ?? 500;
    this.hint = options.hint;
  }
}

export type Config = {
  apiKey: string;
  model: string;
  /** Tried in order when the primary model fails (rate limit, downtime, …). */
  fallbackModels: string[];
  siteUrl?: string;
  appTitle: string;
};

let cached: Config | undefined;

/** Reads configuration from the environment. Throws AppError when the API key is missing. */
export function getConfig(): Config {
  if (cached) return cached;

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError("OPENROUTER_API_KEY is not set.", {
      status: 500,
      hint: `Create a key at ${KEY_SETUP_URL}, then export it or put it in .env — never commit it.`,
    });
  }

  cached = {
    apiKey,
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    fallbackModels: (process.env.OPENROUTER_FALLBACK_MODELS ?? "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean),
    siteUrl: process.env.OPENROUTER_SITE_URL?.trim() || undefined,
    appTitle: process.env.OPENROUTER_APP_TITLE?.trim() || "opencode",
  };
  return cached;
}
