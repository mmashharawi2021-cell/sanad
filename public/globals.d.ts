/* سند — تعريفات الأنواع للأسماء العامة التي تتشاركها سكربتات الواجهة (فحص TypeScript فقط؛ لا يُحمَّل في الصفحة).
   كل وحدة تضع واجهتها على window؛ هنا شكلها حتى يكشف `npm.cmd run typecheck:ui` أي استدعاء لاسم غير موجود
   أو بشكل خاطئ عبر الملفات. أضف هنا أي window.X جديد. */

type SanadNotifyOptions = { type?: "success" | "error" | "warning" | "info"; title?: string; body?: string; duration?: number };
type SanadNotify = ((opts: SanadNotifyOptions) => void) & {
  success: (body: string, title?: string) => void;
  error: (body: string, title?: string) => void;
  warning: (body: string, title?: string) => void;
  info: (body: string, title?: string) => void;
};
type SanadConfirmOptions = { title?: string; message?: string; confirmText?: string; cancelText?: string; destructive?: boolean };
type SanadConfirm = (opts: SanadConfirmOptions) => Promise<boolean>;

interface Window {
  /** إشعارات iOS (ios-notify.js) */
  sanadNotify: SanadNotify;
  /** نافذة تأكيد iOS بدل confirm() (ios-notify.js) */
  sanadConfirm: SanadConfirm;
  /** Dynamic Island (ios-island.js) */
  sanadIsland: { status: (text: string) => void; latest: (htmlOrText: string) => void; expand: () => void; collapse: () => void };
  /** أوامر الشبكة الفورية (instant-commands.js) */
  sanadIntents: { matches: (text: string) => boolean; handle: (text: string, conv: any, assistant: any, ctx: any) => Promise<boolean>; normalizeTranscript: (text: string) => string; parse: (text: string) => any };
  /** سجل الأوامر المحلية (command-registry.js) */
  sanadCommands: { handle: (text: string, conv: any, assistant: any, deps: any) => Promise<boolean>; match: (text: string) => any; matchAll: (text: string) => any[]; paletteEntries: () => Array<{ id: string; label: string; prompt: string; group: string; risk: string }> };
  /** أدوات النموذج (model-tools.js) */
  sanadModelTools: {
    execute: (text: string, ctx: any) => Promise<{ content: string; executed?: string | null } | null>;
    executeCalls: (text: string, calls: Array<{ name: string; arguments: unknown }>, ctx: any) => Promise<{ content: string; executed?: string | null } | null>;
  };
  /** ورقة «وضع العمل» (mode-picker.js) */
  sanadModePicker: { open: () => void; close: () => void; isOpen: () => boolean };
  /** مطوّر سند الذاتي (selfdev-ui.js) */
  sanadSelfDev: { matches: (text: string) => boolean; handle: (text: string, conv: any, assistant: any, ctx: any) => Promise<boolean>; openManager: () => void };
  sanadCompactMode: { toggle: () => void; [k: string]: any };
  sanadControlCenter: { open: () => void; close: () => void; [k: string]: any };
  /** يبني الشاشة الرئيسية (home.js) */
  sanadHomeScreen: (opts?: { onSuggest?: (prompt: string) => void }) => HTMLElement;
  /** واجهة الإضافات المعزولة (extensions-runtime.js) */
  sanadExt: { [k: string]: any };
  /** يعيد تحميل قائمة النماذج (models-ui.js) */
  reloadModels: () => Promise<void>;
  /** عدّاد تنفيذ أدوات النموذج: api-guard.js يطلب الموافقة على الطلبات الحساسة ما دام > 0 */
  __sanadModelActing: number;
  /** يُسلَّم fetch الأصلي مرة واحدة لبيئة الإضافات ثم يُحذف (api-guard.js) */
  __sanadTakeNativeFetch?: () => typeof fetch | null;
  /** Safari القديم */
  webkitAudioContext?: typeof AudioContext;
}

/* الأسماء على window متاحة أيضاً كأسماء عامة مباشرة في السكربتات العادية */
declare var sanadNotify: SanadNotify;
declare var sanadConfirm: SanadConfirm;

/* مشاركة الشاشة: قيد cursor من مواصفة Screen Capture غير موجود في تعريفات DOM القياسية */
interface MediaTrackConstraintSet {
  cursor?: "always" | "motion" | "never";
}
