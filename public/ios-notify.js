/* سند — إشعارات النظام ونوافذ التأكيد بأسلوب iOS
   sanadNotify({ type, title, body, duration })   أو  sanadNotify.success(body, title)
   sanadConfirm({ title, message, confirmText, cancelText, destructive }) → Promise<boolean>
   كل النصوص تُدرج عبر textContent (قد تأتي من الخادم). */
(() => {
  const TYPES = {
    success: { icon: '<path d="M20 6 9 17l-5-5"/>', title: "تم بنجاح", ms: 4500 },
    error: { icon: '<path d="M12 8v4"/><path d="M12 16h.01"/>', title: "تعذّر التنفيذ", ms: 7000 },
    warning: { icon: '<path d="M12 9v4"/><path d="M12 17h.01"/>', title: "تنبيه", ms: 6000 },
    info: { icon: '<path d="M12 16v-4"/><path d="M12 8h.01"/>', title: "سند", ms: 4500 },
  };
  const MAX_VISIBLE = 3;
  let stack = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function ensureStack() {
    if (stack && document.body.contains(stack)) return stack;
    stack = el("div", "ios-banners");
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
    return stack;
  }

  function relayout() {
    const items = [...stack.querySelectorAll(".ios-banner:not(.leaving)")];
    items.forEach((b, i) => {
      // الأحدث في الأعلى، والأقدم يتراكم خلفه كما في iOS
      b.style.setProperty("--i", String(i));
      b.classList.toggle("stacked", i > 0);
      b.classList.toggle("hidden-in-stack", i >= MAX_VISIBLE);
    });
  }

  function dismiss(banner) {
    if (!banner || banner.classList.contains("leaving")) return;
    clearTimeout(banner._timer);
    banner.classList.add("leaving");
    relayout();
    banner.addEventListener("transitionend", () => banner.remove(), { once: true });
    setTimeout(() => banner.remove(), 600);
  }

  function notify(opts = {}) {
    const type = TYPES[opts.type] ? opts.type : "info";
    const def = TYPES[type];
    const root = ensureStack();

    const banner = el("div", `ios-banner ios-banner--${type}`);
    banner.setAttribute("role", type === "error" ? "alert" : "status");

    const icon = el("div", "ios-banner-icon");
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${def.icon}</svg>`;

    const content = el("div", "ios-banner-content");
    const head = el("div", "ios-banner-head");
    head.append(el("span", "ios-banner-app", "سند"), el("span", "ios-banner-time", "الآن"));
    content.append(head, el("div", "ios-banner-title", opts.title || def.title));
    if (opts.body) content.append(el("div", "ios-banner-body", opts.body));
    banner.append(icon, content);

    // سحب للأعلى للإغلاق، أو نقرة
    let startY = null;
    banner.addEventListener("pointerdown", (e) => {
      startY = e.clientY;
      banner.setPointerCapture(e.pointerId);
      clearTimeout(banner._timer);
    });
    banner.addEventListener("pointermove", (e) => {
      if (startY == null) return;
      const dy = Math.min(0, e.clientY - startY);
      banner.style.transform = `translate(-50%, ${dy}px)`;
    });
    const end = (e) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      startY = null;
      banner.style.transform = "";
      if (dy < -30 || Math.abs(dy) < 4) dismiss(banner);
      else banner._timer = setTimeout(() => dismiss(banner), 2500);
    };
    banner.addEventListener("pointerup", end);
    banner.addEventListener("pointercancel", end);

    root.prepend(banner);
    requestAnimationFrame(() => {
      banner.classList.add("in");
      relayout();
    });
    banner._timer = setTimeout(() => dismiss(banner), opts.duration || def.ms);
    return banner;
  }

  notify.success = (body, title) => notify({ type: "success", body, title });
  notify.error = (body, title) => notify({ type: "error", body, title });
  notify.warning = (body, title) => notify({ type: "warning", body, title });
  notify.info = (body, title) => notify({ type: "info", body, title });

  /* ---------- iOS Alert (تأكيد) ---------- */
  function confirmDialog(opts = {}) {
    return new Promise((resolve) => {
      const lastFocus = /** @type {HTMLElement | null} */ (document.activeElement);
      const backdrop = el("div", "ios-alert-backdrop");
      const box = el("div", "ios-alert");
      box.setAttribute("role", "alertdialog");
      box.setAttribute("aria-modal", "true");

      const text = el("div", "ios-alert-text");
      const title = el("div", "ios-alert-title", opts.title || "تأكيد");
      title.id = `ios-alert-title-${Date.now()}`;
      box.setAttribute("aria-labelledby", title.id);
      text.append(title);
      if (opts.message) text.append(el("div", "ios-alert-message", opts.message));

      const actions = el("div", "ios-alert-actions");
      const cancel = el("button", "ios-alert-btn ios-alert-btn--cancel", opts.cancelText || "إلغاء");
      const ok = el("button", `ios-alert-btn${opts.destructive ? " ios-alert-btn--destructive" : " ios-alert-btn--default"}`, opts.confirmText || "موافق");
      cancel.type = ok.type = "button";
      actions.append(cancel, ok);
      box.append(text, actions);
      backdrop.append(box);
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.classList.add("in"));

      const done = (value) => {
        document.removeEventListener("keydown", onKey, true);
        backdrop.classList.remove("in");
        backdrop.classList.add("leaving");
        setTimeout(() => backdrop.remove(), 220);
        if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
        if (e.key === "Tab") { e.preventDefault(); (document.activeElement === ok ? cancel : ok).focus(); }
      };
      document.addEventListener("keydown", onKey, true);
      cancel.addEventListener("click", () => done(false));
      ok.addEventListener("click", () => done(true));
      // الافتراضي الآمن: التركيز على «إلغاء» في الإجراءات الخطرة
      (opts.destructive ? cancel : ok).focus();
    });
  }

  window.sanadNotify = notify;
  window.sanadConfirm = confirmDialog;
})();
