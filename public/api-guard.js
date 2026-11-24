/* سند — حارس طلبات الواجهة إلى الخادم
   - رمز الجلسة في كوكي HttpOnly يرسله المتصفح تلقائياً؛ لا يراه أي سكربت (ولا هذا الملف).
   - يضيف الرأس X-Sanad-Request: 1 إلى كل طلب يغيّر الحالة نحو /api/ على نفس الأصل
     (الخادم يرفض الطلب بدونه، وأي أصل آخر لا يستطيع إرساله دون preflight مرفوض).
   - يضبط Content-Type: application/json إن كان الجسم نصاً بلا نوع (الخادم يرفض غيره).
   يُحمَّل قبل أي سكربت آخر. */
(() => {
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
    "/api/vision/workflows": "حذف مسار محفوظ",
    // /api/vision/execute غير مدرج عمداً: runVisualAgentLoop يعرض الخطة كاملة ويطلب الموافقة بنفسه
  };
  window.__sanadModelActing = 0;

  // محارف التحكم بالاتجاه قد تُخفي جزءاً من الأمر أو تقلبه بصرياً — نُظهرها كرموز مرئية
  const BIDI = /[‎‏‪-‮⁦-⁩؜]/g;
  const showBidi = (s) => s.replace(BIDI, (c) => `⟦U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}⟧`);
  const MAX_FIELD = 8000;
  const RISKY_FILE = /(^|[\\/])\.vscode[\\/]|\.(bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|url|exe|com|scr|msi|reg|pif|cpl|py|pyw|jar|msc)$/i;

  function describe(path, method, body) {
    let data = {};
    try { data = typeof body === "string" ? JSON.parse(body) : {}; } catch {}
    const fields = ["command", "action", "process", "name", "port", "path", "filePath", "target", "projectName", "title", "actionValue", "goal", "content", "preset", "routine", "url"];
    const details = fields
      .filter((k) => data[k] != null && String(data[k]).trim() !== "")
      .map((k) => {
        const v = String(data[k]);
        // لا قطع صامت: الأمر يُعرض كاملاً، وإن تجاوز الحد نقول ذلك صراحة
        const shown = v.length > MAX_FIELD ? `${v.slice(0, MAX_FIELD)}\n⚠️ … قُطع ${v.length - MAX_FIELD} حرفاً من هذا الحقل — لا توافق إن لم تكن متأكداً` : v;
        return `${k}: ${showBidi(shown)}`;
      });
    // ملفات ستُكتب (إنشاء مشروع): الأسماء والأحجام، مع تنبيه على التنفيذية وملفات .vscode
    if (Array.isArray(data.files) && data.files.length) {
      details.push(`ملفات ستُكتب (${data.files.length}):`);
      for (const f of data.files.slice(0, 60)) {
        const name = String(f?.relativePath || f?.path || f?.name || "?");
        const size = typeof f?.content === "string" ? `${f.content.length} حرف` : "";
        details.push(`  ${RISKY_FILE.test(name) ? "⚠️ " : ""}${showBidi(name)}${size ? ` (${size})` : ""}`);
      }
      if (data.files.length > 60) details.push(`  … و${data.files.length - 60} ملفاً آخر`);
      if (data.files.some((f) => RISKY_FILE.test(String(f?.relativePath || f?.path || f?.name || "")))) {
        details.push("⚠️ بين الملفات ملفات تنفيذية أو إعدادات VS Code قد تشغّل أوامر عند فتح المجلد.");
      }
    }
    if (BIDI.test(body || "")) details.push("⚠️ يحتوي الطلب على محارف تحكم بالاتجاه (قد تُخفي جزءاً من النص).");
    BIDI.lastIndex = 0;
    return `${SENSITIVE[path] || "إجراء"}${method === "DELETE" ? " (حذف)" : ""}\n\n${details.join("\n") || path}`;
  }

  async function confirmModelAction(path, method, body) {
    const message = describe(path, method, body);
    if (typeof window.sanadConfirm === "function") {
      return window.sanadConfirm({
        title: "سند يطلب تنفيذ إجراء من رد النموذج",
        message: `${message}\n\nنفّذ فقط إن كنت تتوقع هذا الإجراء.`,
        confirmText: "نفّذ",
        cancelText: "إلغاء",
        destructive: true,
      });
    }
    // نافذة التأكيد غير محمّلة (خطأ تحميل؟) → الرفض هو الخيار الآمن، لا تنفيذ بلا موافقة ولا confirm() بدائي
    console.warn("[api-guard] sanadConfirm غير متاحة — رُفض الإجراء:", path);
    window.sanadNotify?.({ type: "error", title: "لم يُنفَّذ الإجراء", body: "تعذر عرض نافذة التأكيد. أعد تحميل الصفحة ثم حاول مجدداً." });
    return false;
  }

  window.fetch = async function sanadFetch(input, init = {}) {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!isOwnApi(url) || method === "GET" || method === "HEAD") return nativeFetch(input, init);

    const path = new URL(url, location.href).pathname;
    if (window.__sanadModelActing > 0 && SENSITIVE[path]) {
      const ok = await confirmModelAction(path, method, init.body);
      if (!ok) {
        return new Response(JSON.stringify({ success: false, cancelled: true, message: "ألغيتَ تنفيذ هذا الإجراء.", error: "ألغيتَ تنفيذ هذا الإجراء." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("X-Sanad-Request", "1");
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
})();
