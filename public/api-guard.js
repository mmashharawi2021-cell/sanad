/* سند — حارس طلبات الواجهة إلى الخادم
   - يضيف رمز الجلسة (X-Sanad-Token) إلى كل طلب يغيّر الحالة نحو /api/ على نفس الأصل.
   - يضبط Content-Type: application/json إن كان الجسم نصاً بلا نوع (الخادم يرفض غيره).
   يُحمَّل قبل أي سكربت آخر. الرمز يأتي من <meta name="sanad-token"> الذي يحقنه الخادم. */
(() => {
  // يُقرأ عند كل طلب: وسم meta يُحقن قبل </head> أي بعد تحميل هذا السكربت
  let cachedToken = "";
  const getToken = () => cachedToken || (cachedToken = document.querySelector('meta[name="sanad-token"]')?.content || "");
  const nativeFetch = window.fetch.bind(window);

  function isOwnApi(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin && u.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }

  /* ---------- تأكيد بشري لما يطلبه النموذج ----------
     أثناء تنفيذ أدوات من رد النموذج (window.__sanadModelActing > 0) لا يُرسل أي طلب
     يغيّر النظام أو يقرأ ملفات إلا بعد موافقة المستخدم على بطاقة تعرض الإجراء حرفياً.
     ردود النماذج قد تحمل تعليمات محقونة من صفحات ويب أو ملفات أو لقطات شاشة. */
  const SENSITIVE = {
    "/api/terminal/exec": "تشغيل أمر في الطرفية",
    "/api/terminal/run": "تشغيل أمر في الطرفية",
    "/api/system/kill-process": "إنهاء عملية",
    "/api/network/kill-port": "تحرير منفذ بإنهاء العملية المحتجزة له",
    "/api/system/action": "إجراء على النظام",
    "/api/desktop/organize": "نقل الملفات وفرزها في مجلد",
    "/api/desktop/preset": "تجهيز بيئة عمل (تشغيل برامج)",
    "/api/system/clean-disk": "حذف الملفات المؤقتة",
    "/api/system/routine": "تشغيل روتين يومي",
    "/api/project/build": "إنشاء مشروع وكتابة ملفات",
    "/api/project/create": "إنشاء مشروع وكتابة ملفات",
    "/api/project/tree": "قراءة محتوى مجلد",
    "/api/files/extract": "قراءة ملف من القرص",
    "/api/desktop/inspect": "قراءة ملف من القرص",
    "/api/tasks": "إنشاء أو حذف مهمة مجدولة تعمل في الخلفية",
    "/api/tasks/run": "تشغيل مهمة مجدولة",
    "/api/tasks/toggle": "تفعيل أو إيقاف مهمة مجدولة",
    "/api/memory": "تعديل ذاكرة سند الدائمة",
    "/api/vision/act": "التحكم بالفأرة ولوحة المفاتيح",
    "/api/vision/workflows": "حذف مسار محفوظ",
  };
  window.__sanadModelActing = 0;
  // أوامر صوتية: صوت من فيديو أو شخص آخر قد يقول «يا سند نفذ أمر …»
  window.__sanadVoiceActing = 0;
  // إجراءات صوتية آمنة تبقى بلا تأكيد (يدان حرتان): فتح برامج/مجلدات، الصوت، القفل، السطوع
  const VOICE_SAFE_ACTIONS = new Set(["launch-app", "launch-any-app", "open-app", "start-app", "open-folder", "open-media", "volume", "set-volume", "lock", "lock-screen", "lock-workstation", "brightness", "set-brightness"]);
  const VOICE_SAFE_PATHS = new Set(["/api/system/routine", "/api/desktop/preset", "/api/tasks/toggle"]);
  function needsVoiceConfirm(path, body) {
    if (!SENSITIVE[path] || VOICE_SAFE_PATHS.has(path)) return false;
    if (path === "/api/system/action") {
      try { return !VOICE_SAFE_ACTIONS.has(String(JSON.parse(body || "{}").action || "")); } catch { return true; }
    }
    return true;
  }

  function describe(path, method, body) {
    let data = {};
    try { data = typeof body === "string" ? JSON.parse(body) : {}; } catch {}
    const fields = ["command", "action", "process", "name", "port", "path", "filePath", "target", "projectName", "title", "actionValue", "goal", "content", "preset", "routine", "url"];
    const details = fields
      .filter((k) => data[k] != null && String(data[k]).trim() !== "")
      .map((k) => `${k}: ${String(data[k]).slice(0, 300)}`)
      .join("\n");
    return `${SENSITIVE[path] || "إجراء"}${method === "DELETE" ? " (حذف)" : ""}\n\n${details || path}`;
  }

  async function confirmModelAction(path, method, body, source = "model") {
    const message = describe(path, method, body);
    if (typeof window.sanadConfirm === "function") {
      return window.sanadConfirm({
        title: source === "voice" ? "سند سمع أمراً صوتياً يتطلب تنفيذ إجراء" : "سند يطلب تنفيذ إجراء من رد النموذج",
        message: `${message}\n\nنفّذ فقط إن كنت تتوقع هذا الإجراء.`,
        confirmText: "نفّذ",
        cancelText: "إلغاء",
        destructive: true,
      });
    }
    return window.confirm(`سند يطلب تنفيذ إجراء من رد النموذج:\n\n${message}`);
  }

  window.fetch = async function sanadFetch(input, init = {}) {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!isOwnApi(url) || method === "GET" || method === "HEAD") return nativeFetch(input, init);

    const path = new URL(url, location.href).pathname;
    const fromModel = window.__sanadModelActing > 0 && SENSITIVE[path];
    const fromVoice = !fromModel && window.__sanadVoiceActing > 0 && needsVoiceConfirm(path, init.body);
    if (fromModel || fromVoice) {
      const ok = await confirmModelAction(path, method, init.body, fromModel ? "model" : "voice");
      if (!ok) {
        return new Response(JSON.stringify({ success: false, cancelled: true, message: "ألغيتَ تنفيذ هذا الإجراء.", error: "ألغيتَ تنفيذ هذا الإجراء." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const token = getToken();
    if (token) headers.set("X-Sanad-Token", token);
    if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return nativeFetch(input, { ...init, headers });
  };

  // fetch الأصلي يُسلَّم مرة واحدة فقط لبيئة الإضافات (extensions-runtime.js) ثم يختفي —
  // لا متغير عام يتيح تجاوز الحارس.
  let handedOver = false;
  window.__sanadTakeNativeFetch = () => {
    if (handedOver) return null;
    handedOver = true;
    delete window.__sanadTakeNativeFetch;
    return nativeFetch;
  };

  // نحتفظ بالرمز في هذا الإغلاق ونزيل وسم meta من الصفحة (دفاع إضافي ضد أي XSS)
  const hideToken = () => {
    getToken();
    document.querySelector('meta[name="sanad-token"]')?.remove();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hideToken, { once: true });
  else hideToken();
})();
