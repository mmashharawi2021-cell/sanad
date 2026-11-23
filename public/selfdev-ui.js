/* سند — واجهة «مطوّر سند الذاتي»
   1) يتعرّف على طلبات تطوير سند في المحادثة (مثل: «ضيف في بطاقة حالة الجهاز قياس سرعة الإنترنت»).
   2) يطلب من المحرك (/api/selfdev/propose) كتابة إضافة، ثم يعرض الكود في ورقة iOS للموافقة.
   3) نافذة «الإضافات»: تفعيل/إيقاف/حذف ما ثُبّت. */
(() => {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  /* ---------- التعرّف على الطلب ---------- */
  const normalize = (s) => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

  // قائمة الإضافات المثبتة (لتمييز طلبات التعديل مثل «أصلح إضافة سرعة الانترنت»)
  let installed = [];
  async function refreshInstalled() {
    try {
      installed = (await (await fetch("/api/extensions", { cache: "no-store" })).json()).extensions || [];
    } catch {}
    return installed;
  }
  refreshInstalled();

  const FIX_VERB = /(^|\s)(اصلح|صلح|صحح|عدل|حسن|طور|غير|حدث)(\s|$)/;
  /** الإضافة المثبتة المقصودة في النص (بالاسم)، إن وُجدت. */
  function findTarget(text) {
    const q = normalize(text);
    let best = null;
    let bestScore = 0;
    for (const ext of installed) {
      const words = normalize(ext.name).split(/\s+/).filter((w) => w.length > 2);
      const hits = words.filter((w) => q.includes(w)).length;
      const score = words.length ? hits / words.length : 0;
      if (score > bestScore) { best = ext; bestScore = score; }
    }
    return bestScore >= 0.5 ? best : null;
  }

  function matches(text) {
    const q = normalize(text).trim();
    if (/^(طور|طوير)\s*(سند|نفسك)|^\/(طور|dev)\b|^تطوير سند/.test(q)) return true;
    // تعديل إضافة مثبتة: فعل إصلاح/تعديل + اسم الإضافة (أو كلمة «اضافه»)
    if (FIX_VERB.test(q) && (findTarget(text) || /اضافه/.test(q))) return true;
    const verb = /(^|\s)(ضيف|اضف|اضيف|ضف|زود|ابني|انشئ اضافه)(\s|$)/.test(q);
    const place = /(بطاقه|تبويب|ودجت|widget|ميزه|خاصيه|زر|الشاشه الرئيسيه|حاله الجهاز|واجهه|لسند|الي سند|في سند|اضافه جديده)/.test(q);
    return verb && place;
  }

  /* ---------- فرق الأسطر (LCS) لعرض التعديل ---------- */
  function lineDiff(oldText, newText) {
    const a = oldText.split("\n");
    const b = newText.split("\n");
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push([" ", a[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(["-", a[i++]]);
      else out.push(["+", b[j++]]);
    }
    while (i < n) out.push(["-", a[i++]]);
    while (j < m) out.push(["+", b[j++]]);
    return out;
  }

  function renderDiff(oldText, newText) {
    const pre = el("pre", "selfdev-code selfdev-diff");
    const rows = lineDiff(oldText, newText);
    let added = 0, removed = 0;
    // نعرض الأسطر المتغيرة مع سطرين من السياق حولها
    const keep = new Set();
    rows.forEach(([t], idx) => { if (t !== " ") for (let k = idx - 2; k <= idx + 2; k++) keep.add(k); });
    let skipped = false;
    rows.forEach(([t, line], idx) => {
      if (t === "+") added++;
      if (t === "-") removed++;
      if (!keep.has(idx)) { if (!skipped) { pre.append(el("div", "diff-skip", "⋯")); skipped = true; } return; }
      skipped = false;
      pre.append(el("div", t === "+" ? "diff-add" : t === "-" ? "diff-del" : "diff-ctx", `${t} ${line}`));
    });
    return { pre, added, removed };
  }

  /* ---------- ورقة iOS عامة ---------- */
  function openSheet({ title, iconName = "puzzle", color = "purple", build }) {
    const backdrop = el("div", "memory-modal-backdrop open selfdev-backdrop");
    const sheet = el("div", "memory-modal ios-sheet selfdev-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.append(el("div", "sheet-grabber"));
    const header = el("div", "memory-header");
    const h = el("h2", "sheet-title");
    const appIcon = el("span", `sheet-app-icon app-${color}`);
    appIcon.innerHTML = icon(iconName);
    h.append(appIcon, document.createTextNode(title));
    const done = el("button", "memory-close-btn sheet-done", "تم");
    done.type = "button";
    header.append(h, done);
    const body = el("div", "memory-body");
    sheet.append(header, body);
    backdrop.append(sheet);
    document.body.append(backdrop);
    body.addEventListener("scroll", () => sheet.classList.toggle("scrolled", body.scrollTop > 8), { passive: true });

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    done.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    build(body, close);
    return close;
  }

  /* ---------- مراجعة المسودة ---------- */
  function reviewDraft(draft) {
    return new Promise((resolve) => {
      let decided = false;
      const finish = (v) => { if (!decided) { decided = true; resolve(v); } };
      const close = openSheet({
        title: draft.reviseOf ? "مراجعة التعديل" : "مراجعة الإضافة",
        build(body, closeSheet) {
          const intro = el(
            "p",
            "memory-desc",
            draft.reviseOf
              ? "عدّل سند هذه الإضافة بناءً على طلبك. الأسطر الخضراء أُضيفت والحمراء حُذفت. تُحفظ النسخة الحالية تلقائياً لتستعيدها إن لزم."
              : "كتب سند هذه الإضافة لنفسه بناءً على طلبك. راجعها قبل التثبيت — لن يتغير شيء حتى تضغط «تثبيت».",
          );
          const card = el("div", "selfdev-card");
          card.append(el("div", "selfdev-name", draft.name), el("div", "selfdev-desc", draft.description));
          const meta = el("div", "selfdev-meta");
          meta.append(el("span", null, `الطلب: ${draft.request}`), el("span", null, `كتبها: ${draft.model}`));
          card.append(meta);
          body.append(intro, card);

          if (draft.warnings?.length) {
            const warn = el("div", "selfdev-warn");
            warn.append(el("strong", null, "تنبيهات"));
            for (const w of draft.warnings) warn.append(el("div", null, w));
            body.append(warn);
          }

          if (draft.previousCode) {
            const { pre: diffPre, added, removed } = renderDiff(draft.previousCode, draft.code);
            body.append(el("h3", null, `التغييرات: +${added} سطراً / −${removed} سطراً`), diffPre);
          }
          const pre = el("pre", "selfdev-code");
          const code = el("code");
          code.textContent = draft.code;
          pre.append(code);
          if (draft.previousCode) {
            // الكود الكامل مطوي في وضع التعديل
            const details = el("details", "selfdev-full");
            details.append(el("summary", null, "الكود الكامل بعد التعديل"), pre);
            body.append(details);
          } else {
            body.append(el("h3", null, "الكود"), pre);
          }

          body.append(el("p", "memory-desc", "تعمل الإضافة داخل واجهة سند بصلاحيات الصفحة. ثبّتها فقط إن كان الكود يفعل ما طلبته."));

          const actions = el("div", "selfdev-actions");
          const install = el("button", "memory-add-btn", draft.reviseOf ? "تطبيق التعديل" : "تثبيت وتشغيل");
          const cancel = el("button", "memory-add-btn v-secondary", "إلغاء");
          install.type = cancel.type = "button";
          install.addEventListener("click", () => { finish(true); closeSheet(); });
          cancel.addEventListener("click", () => { finish(false); closeSheet(); });
          actions.append(install, cancel);
          body.append(actions);
        },
      });
      // إغلاق الورقة بـ «تم» أو Esc أو النقر خارجها = إلغاء
      const observer = new MutationObserver(() => {
        if (!document.querySelector(".selfdev-backdrop")) { observer.disconnect(); finish(false); }
      });
      observer.observe(document.body, { childList: true });
      void close;
    });
  }

  /* ---------- التدفق من المحادثة ---------- */
  async function handle(text, conv, assistant, ctx) {
    const show = (content, extra = {}) => {
      Object.assign(assistant, { content, pending: false, model: "SANAD Self-Dev", ...extra });
      ctx.save?.();
      ctx.render?.();
    };
    await refreshInstalled();
    const target = FIX_VERB.test(normalize(text)) ? findTarget(text) : null;
    window.setIslandStatus?.(target ? "يعدّل إضافة..." : "يطوّر إضافة جديدة...", true);
    show(
      target
        ? `### تطوير سند\n\nأعدّل الآن إضافتي «${target.name}» حسب طلبك. سأعرض عليك التغييرات للموافقة قبل تطبيقها — قد يستغرق هذا دقيقة.`
        : "### تطوير سند\n\nأكتب الآن إضافة جديدة لنفسي تنفّذ طلبك. سأعرض عليك الكود للموافقة قبل تثبيت أي شيء — قد يستغرق هذا دقيقة.",
    );

    let data;
    try {
      const res = await fetch("/api/selfdev/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: text, model: ctx.model || "", reviseId: target?.id || "" }),
      });
      data = await res.json();
    } catch (e) {
      window.setIslandStatus?.("جاهز للأمر", false);
      show(`تعذر الاتصال بمحرك التطوير: ${e.message}`, { error: { message: e.message } });
      return true;
    }
    window.setIslandStatus?.("جاهز للأمر", false);

    if (!data?.success) {
      const reasons = (data?.errors || []).map((r) => `- ${r}`).join("\n");
      show(`### لم أتمكن من كتابة الإضافة\n\n${data?.message || data?.error || "خطأ غير معروف."}${reasons ? `\n\n${reasons}` : ""}\n\nجرّب صياغة أوضح، أو اختر موديلاً أقوى في البرمجة من قائمة الموديلات.`);
      return true;
    }

    const d = data.draft;
    show(`### كتبتُ إضافة: ${d.name}\n\n${d.description}\n\nراجع الكود في النافذة المفتوحة، ثم اختر «تثبيت وتشغيل» أو «إلغاء».`);
    const ok = await reviewDraft(d);
    if (!ok) {
      show(`### لم تُثبّت الإضافة\n\nألغيتَ تثبيت «${d.name}». لم يتغير شيء في سند.`);
      return true;
    }

    try {
      const res = await fetch("/api/extensions/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: d.draftId }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message || "فشل التثبيت");
      await refreshInstalled();
      if (d.reviseOf) {
        // النسخة القديمة محمّلة في الصفحة؛ إعادة التحميل تطبّق الجديدة (المحادثة محفوظة)
        show(`### عُدّلت الإضافة «${d.name}»\n\n${d.description}\n\nسيُعاد تحميل الصفحة الآن لتطبيق التعديل. النسخة السابقة محفوظة في «الإضافات» إن أردت التراجع.`);
        window.sanadNotify?.success("سيُعاد تحميل الصفحة لتطبيق التعديل.", "عُدّلت الإضافة");
        setTimeout(() => location.reload(), 1800);
        return true;
      }
      await window.sanadExt?.reload?.();
      window.sanadNotify?.success(`«${d.name}» تعمل الآن. افتح الشاشة الرئيسية (محادثة جديدة) لتراها.`, "ثُبّتت الإضافة");
      show(`### ثُبّتت الإضافة «${d.name}»\n\n${d.description}\n\nتظهر في الشاشة الرئيسية (اضغط زر «محادثة جديدة»). يمكنك إيقافها أو حذفها من «الإضافات» في الأدوات.`);
    } catch (e) {
      show(`تعذر تثبيت الإضافة: ${e.message}`, { error: { message: e.message } });
    }
    return true;
  }

  /* ---------- نافذة إدارة الإضافات ---------- */
  async function openManager() {
    let list = [];
    try {
      list = (await (await fetch("/api/extensions", { cache: "no-store" })).json()).extensions || [];
    } catch {}
    openSheet({
      title: "الإضافات",
      build(body) {
        body.append(el("p", "memory-desc", "ميزات كتبها سند لنفسه بطلب منك. لإضافة ميزة جديدة اكتب في المحادثة مثلاً: «طوّر سند: أضف إلى بطاقة حالة الجهاز …»."));
        if (!list.length) {
          body.append(el("div", "memory-empty", "لا توجد إضافات بعد."));
          return;
        }
        const group = el("div", "memory-list");
        for (const ext of list) {
          const row = el("div", "memory-card selfdev-row");
          const info = el("div", "memory-card-content");
          info.append(el("div", "selfdev-name", ext.name), el("div", "selfdev-desc", ext.description));
          const controls = el("div", "selfdev-row-controls");
          const sw = el("input");
          sw.type = "checkbox";
          sw.checked = !!ext.enabled;
          sw.setAttribute("aria-label", `تفعيل ${ext.name}`);
          sw.addEventListener("change", async () => {
            const r = await (await fetch("/api/extensions/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ext.id, enabled: sw.checked }) })).json();
            window.sanadNotify?.[r.success ? "success" : "error"](sw.checked ? r.message : `${r.message} يُطبَّق الإيقاف بعد إعادة تحميل الصفحة.`, "الإضافات");
            if (sw.checked) window.sanadExt?.reload?.();
          });
          const del = el("button", "memory-del-btn", "حذف");
          del.type = "button";
          del.addEventListener("click", async () => {
            const ok = await window.sanadConfirm?.({ title: `حذف «${ext.name}»؟`, message: "سيُحذف ملف الإضافة نهائياً. يمكنك طلبها من سند مجدداً لاحقاً.", confirmText: "حذف", destructive: true });
            if (!ok) return;
            const r = await (await fetch("/api/extensions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ext.id }) })).json();
            window.sanadNotify?.[r.success ? "success" : "error"](`${r.message} أعد تحميل الصفحة لإزالتها من الواجهة.`, "الإضافات");
            if (r.success) row.remove();
          });
          if (ext.hasBackup) {
            const restore = el("button", "memory-add-btn v-secondary v-sm", "استعادة النسخة السابقة");
            restore.type = "button";
            restore.addEventListener("click", async () => {
              const ok = await window.sanadConfirm?.({ title: `استعادة «${ext.name}»؟`, message: "ستعود الإضافة إلى نسختها قبل آخر تعديل، ثم يُعاد تحميل الصفحة.", confirmText: "استعادة" });
              if (!ok) return;
              const r = await (await fetch("/api/extensions/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ext.id }) })).json();
              window.sanadNotify?.[r.success ? "success" : "error"](r.message, "الإضافات");
              if (r.success) setTimeout(() => location.reload(), 1200);
            });
            controls.append(restore);
          }
          controls.append(sw, del);
          row.append(info, controls);
          group.append(row);
        }
        body.append(group);
      },
    });
  }

  document.getElementById("extensionsBtn")?.addEventListener("click", openManager);
  window.sanadSelfDev = { matches, handle, openManager };
})();
