// سجل كل مسارات الخادم وطريقة اختبار كل منها بأمان.
// اختبار التغطية يفشل إن أُضيف مسار في src/server.ts دون تصنيفه هنا.
//
// الفئات:
//   read      — قراءة فقط: طلب بصلاحية الجلسة ← الحالة المتوقعة (وشكل الرد).
//   validate  — طلب بصلاحية الجلسة بمدخلات خاطئة ← رفض قبل أي إجراء.
//   guardOnly — المسار ينفّذ إجراءً حقيقياً حتى دون مدخلات (يحذف/يشغّل/يحرّك…): لا يُرسل له
//               أي طلب بصلاحية؛ يُختبر فقط أن طبقة الحماية ترفضه دونها.
// كل مسار غير GET يُختبر أيضاً في security.test.mjs: دون رأس/كوكي/من أصل غريب ← 403.

/** @typedef {{ method: string, path: string, kind: "read"|"validate"|"guardOnly", query?: string, body?: unknown, raw?: string, contentType?: string, expect?: number|number[], check?: (json: any) => void, reason?: string }} RouteCase */

const isArr = (v, name) => { if (!Array.isArray(v)) throw new Error(`${name} ليس مصفوفة`); };
const isObj = (v, name) => { if (!v || typeof v !== "object") throw new Error(`${name} ليس كائناً`); };
const falsy = (v, name) => { if (v) throw new Error(`${name} يجب أن يكون false`); };

/** @type {RouteCase[]} */
export const ROUTES = [
  // --- المحادثة والنماذج ---
  { method: "POST", path: "/api/chat", kind: "validate", body: { prompt: "" }, expect: 400 },
  { method: "POST", path: "/api/chat/stream", kind: "validate", body: { prompt: "" }, expect: 400 },
  { method: "GET", path: "/api/models", kind: "read", expect: 200, check: (j) => isArr(j.models, "models") },
  { method: "GET", path: "/api/ollama/status", kind: "read", expect: 200, check: (j) => { if (typeof j.running !== "boolean") throw new Error("running"); } },
  { method: "GET", path: "/api/brain/status", kind: "read", expect: 200, check: (j) => { if (!["cloud", "local", "none"].includes(j.mode)) throw new Error(`mode=${j.mode}`); } },

  // --- الذاكرة والمهام ---
  { method: "GET", path: "/api/memory", kind: "read", expect: 200, check: (j) => isArr(j.memories, "memories") },
  { method: "POST", path: "/api/memory", kind: "validate", body: { content: "" }, expect: 400 },
  { method: "DELETE", path: "/api/memory", kind: "validate", body: {}, expect: 400 },
  { method: "GET", path: "/api/tasks", kind: "read", expect: 200, check: (j) => isArr(j.tasks, "tasks") },
  { method: "POST", path: "/api/tasks", kind: "validate", body: { title: "" }, expect: 400 },
  { method: "POST", path: "/api/tasks/toggle", kind: "validate", body: { id: "no-such-task" }, expect: 404 },
  { method: "POST", path: "/api/tasks/run", kind: "validate", body: { id: "no-such-task" }, expect: 200, check: (j) => falsy(j.success, "success") },
  { method: "DELETE", path: "/api/tasks", kind: "guardOnly", reason: "يكتب ملف المهام حتى مع معرّف فارغ" },

  // --- الإضافات والمطوّر الذاتي ---
  { method: "GET", path: "/api/extensions", kind: "read", expect: 200, check: (j) => isArr(j.extensions, "extensions") },
  { method: "POST", path: "/api/selfdev/propose", kind: "validate", body: { request: "x" }, expect: 200, check: (j) => falsy(j.success, "success") },
  { method: "POST", path: "/api/extensions/restore", kind: "validate", body: { id: "!!" }, expect: 200, check: (j) => falsy(j.success, "success") },
  { method: "POST", path: "/api/extensions/install", kind: "validate", body: { draftId: "no-such-draft" }, expect: 200, check: (j) => falsy(j.success, "success") },
  { method: "POST", path: "/api/extensions/toggle", kind: "validate", body: { id: "no-such-extension", enabled: false }, expect: 200, check: (j) => falsy(j.success, "success") },
  { method: "DELETE", path: "/api/extensions", kind: "validate", body: { id: "!!" }, expect: 200, check: (j) => falsy(j.success, "success") },

  // --- الطرفية والمشاريع ---
  { method: "POST", path: "/api/terminal/exec", kind: "validate", body: { command: "" }, expect: 400 },
  { method: "POST", path: "/api/terminal/run", kind: "guardOnly", reason: "ينفّذ أمراً في الطرفية" },
  { method: "POST", path: "/api/project/create", kind: "validate", body: {}, expect: 400 },
  { method: "POST", path: "/api/project/build", kind: "guardOnly", reason: "يبني مشروعاً على سطح المكتب حتى دون مدخلات" },
  { method: "GET", path: "/api/project/preview", kind: "validate", expect: 400 },
  { method: "GET", path: "/api/project/list", kind: "read", expect: 200, check: (j) => isArr(j.projects, "projects") },
  { method: "POST", path: "/api/project/tree", kind: "read", body: { path: "." }, expect: [200, 403] },

  // --- الويب والرؤية ---
  { method: "POST", path: "/api/web/search", kind: "validate", body: { query: "" }, expect: 400 },
  { method: "POST", path: "/api/web/read", kind: "validate", body: { url: "" }, expect: 400 },
  { method: "POST", path: "/api/vision/analyze", kind: "validate", body: {}, expect: 400 },
  { method: "POST", path: "/api/vision/act", kind: "validate", body: {}, expect: 400 },
  { method: "POST", path: "/api/vision/execute", kind: "guardOnly", reason: "يحرّك الفأرة ويكتب بلوحة المفاتيح" },
  { method: "GET", path: "/api/vision/workflows", kind: "read", expect: 200, check: (j) => isArr(j.workflows, "workflows") },
  { method: "DELETE", path: "/api/vision/workflows", kind: "validate", body: {}, expect: 400 },

  // --- النظام ---
  { method: "GET", path: "/api/system/stats", kind: "read", expect: 200, check: (j) => isObj(j, "stats") },
  { method: "GET", path: "/api/system/processes", kind: "read", query: "?limit=5", expect: 200, check: (j) => isArr(j.processes, "processes") },
  { method: "GET", path: "/api/system/disks", kind: "read", expect: 200, check: (j) => isArr(j.drives, "drives") },
  { method: "GET", path: "/api/system/health", kind: "read", expect: 200, check: (j) => isObj(j.health, "health") },
  { method: "POST", path: "/api/system/action", kind: "validate", body: { action: "__not_an_action__" }, expect: 400 },
  { method: "POST", path: "/api/system/kill-process", kind: "guardOnly", reason: "ينهي عملية" },
  { method: "POST", path: "/api/system/brightness", kind: "guardOnly", reason: "يغيّر سطوع الشاشة (70% افتراضياً)" },
  { method: "POST", path: "/api/system/routine", kind: "guardOnly", reason: "يشغّل روتين البرامج (الصباح افتراضياً)" },
  { method: "POST", path: "/api/system/large-files", kind: "guardOnly", reason: "فحص ثقيل للقرص" },
  { method: "POST", path: "/api/system/clean-disk", kind: "guardOnly", reason: "يحذف الملفات المؤقتة ولا يقرأ أي مدخلات" },
  { method: "POST", path: "/api/system/optimize-ram", kind: "guardOnly", reason: "يفرّغ ذاكرة البرامج ولا يقرأ أي مدخلات" },
  { method: "POST", path: "/api/system/reveal-file", kind: "validate", body: {}, expect: 400 },
  { method: "GET", path: "/api/network/throughput", kind: "read", expect: 200, check: (j) => isObj(j, "throughput") },

  // --- سطح المكتب والملفات ---
  { method: "GET", path: "/api/desktop/status", kind: "read", expect: 200, check: (j) => isObj(j, "status") },
  { method: "POST", path: "/api/desktop/organize", kind: "guardOnly", reason: "ينقل ملفات سطح المكتب" },
  { method: "POST", path: "/api/desktop/preset", kind: "guardOnly", reason: "يشغّل برامج بيئة العمل" },
  { method: "POST", path: "/api/desktop/inspect", kind: "validate", body: {}, expect: 400 },
  { method: "POST", path: "/api/files/extract", kind: "validate", body: { filePath: "C:\\Windows\\System32\\config\\SAM" }, expect: 403 },

  // --- الصوت ---
  { method: "GET", path: "/api/voice/status", kind: "read", expect: 200, check: (j) => { if (typeof j.available !== "boolean" || !j.tts) throw new Error("available/tts"); } },
  { method: "POST", path: "/api/voice/speak", kind: "validate", body: { text: "🚀" }, expect: 400 },
  { method: "POST", path: "/api/voice/warm", kind: "guardOnly", reason: "يحمّل محرك السماع في الذاكرة" },
  { method: "GET", path: "/api/voice/settings", kind: "read", expect: 200, check: (j) => { isObj(j.settings, "settings"); isArr(j.cloudVoices, "cloudVoices"); } },
  // قيمة غير مسموحة تُتجاهل: الإعدادات تبقى كما هي (يتحقق الاختبار من عدم تغيّرها)
  { method: "POST", path: "/api/voice/settings", kind: "validate", body: { gender: "robot", stt: "evil", maleVoice: "x; rm" }, expect: 200 },
  { method: "POST", path: "/api/voice/transcribe", kind: "validate", raw: "not a wav file", contentType: "audio/wav", expect: 400 },

  // --- الشبكة ---
  { method: "GET", path: "/api/network/ports", kind: "read", query: "?udp=0", expect: 200, check: (j) => isArr(j.ports, "ports") },
  { method: "GET", path: "/api/network/port/check", kind: "validate", query: "?port=abc", expect: 200, check: (j) => falsy(j.inUse, "inUse") },
  { method: "GET", path: "/api/network/info", kind: "read", expect: 200, check: (j) => isArr(j.adapters, "adapters") },
  { method: "POST", path: "/api/network/kill-port", kind: "validate", body: { port: "abc" }, expect: 200, check: (j) => falsy(j.success, "success") },
  { method: "POST", path: "/api/network/ping", kind: "validate", body: { host: "8.8.8.8; calc" }, expect: 200, check: (j) => falsy(j.success, "success") },
];
