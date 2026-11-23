/**
 * مطوّر سند الذاتي — يكتب سند «إضافات» لنفسه بطلب من المستخدم.
 *
 * الأمان بالتصميم:
 * - سند لا يعدّل ملفاته الأساسية؛ يكتب ملف إضافة مستقلاً في public/extensions/ يعمل عبر واجهة sanadExt.
 * - الكود المولّد يُفحص (صياغة + قواعد) ويبقى «مسودة» حتى يراه المستخدم ويوافق عليه.
 * - كل إضافة قابلة للإيقاف والحذف من نافذة «الإضافات».
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
export const EXTENSIONS_DIR = join(ROOT, "public", "extensions");
const REGISTRY_PATH = join(ROOT, "data", "extensions.json");

const BACKUP_DIR = join(ROOT, "data", "extensions-backup");

export type ExtensionRecord = {
  id: string;
  name: string;
  description: string;
  request: string;
  model: string;
  createdAt: string;
  updatedAt?: string;
  revisions?: number;
  enabled: boolean;
};

export type ExtensionDraft = {
  draftId: string;
  id: string;
  name: string;
  description: string;
  code: string;
  request: string;
  model: string;
  warnings: string[];
  createdAt: number;
  /** عند تعديل إضافة مثبتة: معرّفها وكودها الحالي (للعرض كفرق) */
  reviseOf?: string;
  previousCode?: string;
};

/** كود الإضافة المثبتة بدون رأس التعليق الذي يضيفه المثبّت. */
async function readInstalledCode(id: string): Promise<string | null> {
  if (!/^[a-z0-9-]{3,48}$/.test(id)) return null;
  try {
    const raw = await readFile(join(EXTENSIONS_DIR, `${id}.js`), "utf8");
    return raw.replace(/^\/\* إضافة سند:[\s\S]*?\*\/\n/, "").trim();
  } catch {
    return null;
  }
}

/* ---------------------------- موجّه المطوّر ---------------------------- */
export const SELF_DEV_SYSTEM_PROMPT = `You are SANAD's self-development engine. SANAD is an Arabic (RTL) desktop assistant whose web UI looks like iOS on an iPhone.
Write ONE browser add-on in plain JavaScript (no imports, no modules, no build step) that implements the user's requested feature.

The add-on MUST be a single call:
sanadExt.register({
  id: "short-kebab-id",
  name: "اسم عربي قصير",
  description: "سطر عربي واحد يشرح ما تفعله الإضافة",
  init(api) { /* your code */ }
});

API available inside init(api):
- api.home.addToDeviceCard(render) — render(container) is called EVERY time the home screen is drawn; container is an empty <div> placed at the bottom of the «حالة الجهاز» (device status) card. Build your UI inside container only.
- api.home.addWidget({ title, icon, render }) — adds a new card to the home screen; render(container) like above.
- api.icon(name) — returns an SVG icon string for: activity, globe, zap, clock, download, upload, gauge, wifi, check, alert, rotate, sparkles, monitor, terminal.
- api.notify.success(body, title) / api.notify.error(body, title) / api.notify.info(body, title) — iOS banners. The FIRST argument is the message body, the second is the title.
- api.css(cssText) — inject CSS. Prefix every selector with a unique class of your add-on.
- api.storage.get(key, fallback) / api.storage.set(key, value) — this add-on's own saved values (JSON-serialisable).
- api.stats() — Promise of { cpuUsagePercent, usedMemoryPercent, batteryPercent, isCharging, diskFreeGb, diskTotalGb }.
- Normal browser APIs: fetch, performance.now(), setTimeout, AbortController. External HTTPS services may be called with fetch if they allow CORS.
  Example: Cloudflare speed test endpoints allow CORS: GET https://speed.cloudflare.com/__down?bytes=N (returns N bytes) and POST https://speed.cloudflare.com/__up (send a body).
  IMPORTANT: __down rejects N >= 100000000 with HTTP 403 and no CORS header (the browser reports "Failed to fetch"). Use N = 25000000 per request.

Design rules (iOS style):
- Arabic text, RTL. Colours ONLY from CSS variables: var(--text-1) var(--text-2) var(--text-3) var(--brand) var(--on-brand) var(--fill) var(--success) var(--warning) var(--danger-1).
- Buttons: border:0; border-radius:999px; padding 6px 14px; background var(--brand); color var(--on-brand). No emoji — use api.icon(...).
- Numbers large and bold, labels small in var(--text-2). Use font-variant-numeric: tabular-nums.

Correctness rules:
- render(container) runs again every time the home screen is redrawn: restore saved values with api.storage.get(...) when rendering, so results are not lost.
- Do not overwrite container.className — use container.classList.add(...).
- Numbers with Latin units inside Arabic text must be wrapped in <bdi> (create a "bdi" element) so "12.5 Mbps" is not reversed.
- Measurements must be real AND work on slow and fast connections alike. Use TIME-BOXED measurement, not a fixed size:
  * Download: request 25 MB (bytes=25000000), read it with res.body.getReader(), count received bytes; if a request finishes before ~8 seconds start another one; stop (reader.cancel() + abort) when ~8 seconds have elapsed. Mbps = bytesReceived*8 / elapsedSeconds / 1e6. Never time only until fetch() resolves (that is just the headers).
  * Upload: send sequential chunks (start ~256 KB, double while each takes < 1 s, cap 8 MB) until ~8 seconds have elapsed; Mbps = totalBytesSent*8 / elapsedSeconds / 1e6.
  * Never let a slow connection turn into a failure: a partial measurement is a valid result. Use a generous overall timeout (~20 s per phase).
- Show progress while measuring (e.g. "جارٍ قياس التنزيل…") and the time of the last measurement.

Code rules:
- Put dynamic text with textContent. Never use innerHTML with data from the network or the user (static markup from api.icon is fine).
- NEVER call SANAD's own server endpoints ("/api/..."); use api.stats() for device data. Do not use eval, new Function, document.cookie, or other localStorage keys. Do not modify page elements outside your container.
- Long operations: disable the button, show progress text, use timeouts (AbortController), catch every error and show it in the UI.
- Under 250 lines. Complete, working code only — no placeholders.

Output format, EXACTLY (nothing before or after):
NAME: <Arabic name>
DESCRIPTION: <one Arabic line>
\`\`\`javascript
<the full add-on code>
\`\`\``;

/* ------------------------------ السجل ------------------------------ */
async function readRegistry(): Promise<ExtensionRecord[]> {
  try {
    const raw = await readFile(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistry(list: ExtensionRecord[]): Promise<void> {
  await mkdir(dirname(REGISTRY_PATH), { recursive: true });
  const tmp = `${REGISTRY_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await rename(tmp, REGISTRY_PATH);
}

export async function listExtensions(): Promise<Array<ExtensionRecord & { hasBackup: boolean }>> {
  const list = (await readRegistry()).filter((e) => existsSync(join(EXTENSIONS_DIR, `${e.id}.js`)));
  return Promise.all(list.map(async (e) => ({ ...e, hasBackup: await hasPreviousVersion(e.id) })));
}

/* ----------------------------- المسودات ----------------------------- */
const drafts = new Map<string, ExtensionDraft>();
const DRAFT_TTL_MS = 30 * 60 * 1000;

function pruneDrafts(): void {
  const now = Date.now();
  for (const [k, d] of drafts) if (now - d.createdAt > DRAFT_TTL_MS) drafts.delete(k);
}

/* ---------------------- تحليل رد النموذج والتحقق ---------------------- */
export function parseModelOutput(text: string): { name: string; description: string; code: string } {
  const name = /NAME:\s*(.+)/i.exec(text)?.[1]?.trim() ?? "";
  const description = /DESCRIPTION:\s*(.+)/i.exec(text)?.[1]?.trim() ?? "";
  const fenced = /```(?:javascript|js)?\s*\n([\s\S]*?)```/i.exec(text);
  let code = fenced?.[1]?.trim() ?? "";
  if (!code && /sanadExt\.register\s*\(/.test(text)) code = text.slice(text.indexOf("sanadExt.register")).trim();
  return { name, description, code };
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/["'`]\/api\//, "يستدعي واجهات خادم سند مباشرة (/api/) — ممنوع للإضافات."],
  [/\beval\s*\(|new\s+Function\s*\(/, "يستخدم eval أو new Function."],
  [/document\.cookie/, "يقرأ أو يكتب الكوكيز."],
  [/localStorage\.(clear|removeItem)\s*\(/, "يحذف من التخزين المحلي العام."],
  [/sanad-token|X-Sanad-Token|__sanadNativeFetch/i, "يحاول الوصول إلى رمز جلسة سند."],
  [/\bimport\s*\(|^\s*import\s|^\s*export\s/m, "يستخدم وحدات import/export (غير مدعومة في الإضافات)."],
];

export function validateExtensionCode(code: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!code) errors.push("لم يُرجع النموذج أي كود.");
  if (code.length > 60_000) errors.push("الكود أطول من الحد المسموح (60 ألف حرف).");
  if (code && !/sanadExt\.register\s*\(/.test(code)) errors.push("الكود لا يستدعي sanadExt.register(...).");
  for (const [re, msg] of FORBIDDEN) if (re.test(code)) errors.push(msg);
  try {
    // فحص صياغة فقط — لا تنفيذ
    new Script(code, { filename: "extension.js" });
  } catch (e) {
    errors.push(`خطأ في صياغة الكود: ${(e as Error).message}`);
  }
  if (/innerHTML\s*=/.test(code)) warnings.push("يستخدم innerHTML — تأكد أنه لا يُدرج بيانات من الشبكة.");
  if (/https?:\/\//.test(code)) {
    const hosts = [...new Set([...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase()))];
    warnings.push(`يتصل بخدمات خارجية: ${hosts.join("، ")}`);
  }
  return { errors, warnings };
}

function slugId(code: string, name: string): string {
  const fromCode = /id\s*:\s*["'`]([a-z0-9-]{3,40})["'`]/i.exec(code)?.[1]?.toLowerCase();
  const base = fromCode || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ext";
  return `${base.slice(0, 32)}-${randomBytes(3).toString("hex")}`;
}

/* ------------------------------ الاقتراح ------------------------------ */
export type Generate = (system: string, prompt: string) => Promise<{ text: string; model: string }>;

export async function proposeExtension(request: string, generate: Generate, reviseId?: string): Promise<
  { success: true; draft: Omit<ExtensionDraft, "createdAt"> } | { success: false; message: string; errors?: string[]; raw?: string }
> {
  const clean = String(request || "").trim().slice(0, 2000);
  if (clean.length < 6) return { success: false, message: "صف الميزة التي تريد إضافتها بجملة واضحة." };

  // وضع التعديل: نعطي النموذج الكود الحالي ليعدّله بدل كتابة إضافة جديدة
  let previousCode: string | null = null;
  let existing: ExtensionRecord | undefined;
  if (reviseId) {
    existing = (await readRegistry()).find((e) => e.id === reviseId);
    previousCode = await readInstalledCode(reviseId);
    if (!existing || !previousCode) return { success: false, message: "الإضافة المطلوب تعديلها غير موجودة." };
  }

  const prompt = previousCode
    ? `عدّل إضافة سند المثبتة «${existing!.name}» حسب طلب المستخدم. أعد الإضافة كاملة (ليس فرقاً فقط)، بنفس قيمة id، مع إصلاح كل ما يذكره الطلب ومراعاة كل القواعد.\n\nطلب المستخدم:\n${clean}\n\nالكود الحالي:\n\`\`\`javascript\n${previousCode}\n\`\`\``
    : `طلب المستخدم (أضِف هذه الميزة إلى سند):\n${clean}`;
  let attempt = await generate(SELF_DEV_SYSTEM_PROMPT, prompt);
  let parsed = parseModelOutput(attempt.text);
  let check = validateExtensionCode(parsed.code);

  // محاولة إصلاح واحدة: نعيد للنموذج الأخطاء المحددة
  if (check.errors.length) {
    const fixPrompt = `${prompt}\n\nمحاولتك السابقة رُفضت للأسباب التالية:\n- ${check.errors.join("\n- ")}\n\nأعد كتابة الإضافة كاملة مع إصلاح هذه الأسباب، بنفس صيغة الإخراج تماماً.`;
    attempt = await generate(SELF_DEV_SYSTEM_PROMPT, fixPrompt);
    parsed = parseModelOutput(attempt.text);
    check = validateExtensionCode(parsed.code);
  }

  if (check.errors.length) {
    return { success: false, message: "لم يتمكن النموذج من كتابة إضافة صالحة.", errors: check.errors, raw: attempt.text.slice(0, 4000) };
  }

  pruneDrafts();
  const draft: ExtensionDraft = {
    draftId: randomBytes(12).toString("hex"),
    id: existing ? existing.id : slugId(parsed.code, parsed.name),
    name: (parsed.name || existing?.name || "إضافة جديدة").slice(0, 80),
    description: (parsed.description || existing?.description || clean).slice(0, 300),
    code: parsed.code,
    request: clean,
    model: attempt.model,
    warnings: check.warnings,
    createdAt: Date.now(),
    ...(existing && previousCode ? { reviseOf: existing.id, previousCode } : {}),
  };
  drafts.set(draft.draftId, draft);
  const { createdAt: _c, ...publicDraft } = draft;
  return { success: true, draft: publicDraft };
}

/* ------------------------- التثبيت والإدارة ------------------------- */
export async function installDraft(draftId: string): Promise<{ success: boolean; message: string; extension?: ExtensionRecord }> {
  pruneDrafts();
  const draft = drafts.get(String(draftId));
  if (!draft) return { success: false, message: "المسودة غير موجودة أو انتهت صلاحيتها. اطلب الميزة من جديد." };

  // إعادة التحقق قبل الكتابة (لا ثقة بحالة سابقة)
  const check = validateExtensionCode(draft.code);
  if (check.errors.length) return { success: false, message: check.errors.join(" ") };

  await mkdir(EXTENSIONS_DIR, { recursive: true });
  const target = join(EXTENSIONS_DIR, `${draft.id}.js`);
  // تعديل: نحفظ النسخة الحالية قبل استبدالها (للتراجع)
  if (draft.reviseOf && existsSync(target)) {
    await mkdir(BACKUP_DIR, { recursive: true });
    await writeFile(join(BACKUP_DIR, `${draft.id}.${Date.now()}.js`), await readFile(target, "utf8"), "utf8");
  }
  const header =
    `/* إضافة سند: ${draft.name.replace(/\*\//g, "")}\n` +
    `   الطلب: ${draft.request.replace(/\*\//g, "").slice(0, 300)}\n` +
    `   كتبها: ${draft.model.replace(/\*\//g, "")} — ${new Date().toISOString()}\n` +
    `   أُنشئت بواسطة مطوّر سند الذاتي وثُبّتت بموافقة المستخدم. */\n`;
  await writeFile(target, header + draft.code + "\n", "utf8");

  const now = new Date().toISOString();
  const all = await readRegistry();
  const prev = all.find((e) => e.id === draft.id);
  const record: ExtensionRecord = {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    request: prev && draft.reviseOf ? `${prev.request}\n— تعديل: ${draft.request}` : draft.request,
    model: draft.model,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    revisions: (prev?.revisions ?? 0) + (draft.reviseOf ? 1 : 0),
    enabled: true,
  };
  await writeRegistry([...all.filter((e) => e.id !== draft.id), record]);
  drafts.delete(draft.draftId);
  return { success: true, message: draft.reviseOf ? `عُدّلت الإضافة «${draft.name}».` : `ثُبّتت الإضافة «${draft.name}».`, extension: record };
}

/** التراجع إلى آخر نسخة محفوظة قبل التعديل الأخير. */
export async function restorePreviousVersion(id: string): Promise<{ success: boolean; message: string }> {
  if (!/^[a-z0-9-]{3,48}$/.test(id)) return { success: false, message: "معرّف غير صالح." };
  const backups = (await readdir(BACKUP_DIR).catch(() => [] as string[]))
    .filter((f) => f.startsWith(`${id}.`) && f.endsWith(".js"))
    .sort();
  const latest = backups.pop();
  if (!latest) return { success: false, message: "لا توجد نسخة سابقة لهذه الإضافة." };
  const target = join(EXTENSIONS_DIR, `${id}.js`);
  const restored = await readFile(join(BACKUP_DIR, latest), "utf8");
  await writeFile(target, restored, "utf8");
  await unlink(join(BACKUP_DIR, latest)).catch(() => undefined);
  const list = await readRegistry();
  const item = list.find((e) => e.id === id);
  if (item) {
    item.updatedAt = new Date().toISOString();
    item.revisions = Math.max(0, (item.revisions ?? 1) - 1);
    await writeRegistry(list);
  }
  return { success: true, message: `أُعيدت «${item?.name ?? id}» إلى نسختها السابقة.` };
}

export async function hasPreviousVersion(id: string): Promise<boolean> {
  return (await readdir(BACKUP_DIR).catch(() => [] as string[])).some((f) => f.startsWith(`${id}.`));
}

export async function setExtensionEnabled(id: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
  const list = await readRegistry();
  const item = list.find((e) => e.id === id);
  if (!item) return { success: false, message: "الإضافة غير موجودة." };
  item.enabled = enabled;
  await writeRegistry(list);
  return { success: true, message: enabled ? `فُعّلت «${item.name}».` : `أُوقفت «${item.name}».` };
}

export async function deleteExtension(id: string): Promise<{ success: boolean; message: string }> {
  if (!/^[a-z0-9-]{3,48}$/.test(id)) return { success: false, message: "معرّف غير صالح." };
  const list = await readRegistry();
  const item = list.find((e) => e.id === id);
  await unlink(join(EXTENSIONS_DIR, `${id}.js`)).catch(() => undefined);
  await writeRegistry(list.filter((e) => e.id !== id));
  return { success: true, message: item ? `حُذفت «${item.name}».` : "حُذفت الإضافة." };
}
