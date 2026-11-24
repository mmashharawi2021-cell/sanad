/* سند — ورقة «وضع العمل» بأسلوب iOS
   - تظهر عند فتح سند: «العمل باتصال» (كل النماذج، مع تحويل تلقائي للمحلي عند الانقطاع)
     أو «العمل دون اتصال» (النماذج المحلية فقط، لا يغادر أي طلب جهازك).
   - الاختيار يُرسل للخادم (POST /api/brain/mode) ثم تُعاد قائمة النماذج وحالة العقل.
   - تُفتح لاحقاً من شارة العقل في الشريط العلوي، أو تبويب «الاتصال»، أو لوحة الأوامر. */
(() => {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const notify = (opts) => window.sanadNotify?.(opts);
  const LAST_KEY = "sanad.workMode";
  const readLast = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };
  const saveLast = (v) => { try { localStorage.setItem(LAST_KEY, v); } catch {} };

  const MODES = [
    {
      value: "auto",
      icon: "globe",
      title: "العمل باتصال",
      desc: "كل النماذج: السحابية والمحلية. إن انقطع الإنترنت يتحوّل سند تلقائياً إلى العقل المحلي.",
    },
    {
      value: "offline",
      icon: "monitor",
      title: "العمل دون اتصال",
      desc: "النماذج المحلية على جهازك فقط. لا يُرسَل أي سؤال إلى الإنترنت.",
    },
  ];

  /* ---------- Sheet ---------- */
  const backdrop = el("div", "mode-backdrop");
  backdrop.hidden = true;
  const sheet = el("div", "ios-sheet mode-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "modeSheetTitle");
  backdrop.append(sheet);

  const head = el("div", "mode-head");
  head.append(el("span", "sheet-grabber"));
  const title = el("h2", "sheet-title");
  title.id = "modeSheetTitle";
  const appIcon = el("span", "sheet-app-icon mode-app-icon");
  appIcon.innerHTML = icon("bot");
  title.append(appIcon, el("span", null, "كيف يعمل سند الآن؟"));
  const done = el("button", "sheet-done", "تم");
  done.type = "button";
  done.addEventListener("click", () => close());
  head.append(title, done);

  const body = el("div", "mode-body");
  const group = el("div", "mode-group");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-labelledby", "modeSheetTitle");
  const footer = el("p", "mode-footer", "");
  body.append(group, footer);
  sheet.append(head, body);

  let status = null; // آخر رد من /api/brain/status
  let busy = false;

  function currentMode() {
    if (!status) return readLast();
    return status.setting === "offline" ? "offline" : "auto";
  }

  function availability(value) {
    if (!status) return { text: "جارٍ الفحص…", ok: true };
    const localCount = (status.localModels || []).length;
    if (value === "offline") {
      if (localCount) return { text: `${localCount} نموذج محلي جاهز`, ok: true };
      return { text: status.ollamaRunning ? "لا يوجد نموذج محلي — npm.cmd run offline:setup" : "Ollama لا يعمل الآن — سيحاول سند تشغيله", ok: false };
    }
    const online = status.setting === "offline" ? navigator.onLine : status.online;
    return online ? { text: "الإنترنت متاح", ok: true } : { text: "لا يوجد إنترنت الآن — سيُستخدم العقل المحلي", ok: false };
  }

  function render() {
    group.textContent = "";
    const selected = currentMode();
    for (const m of MODES) {
      const cell = el("button", "mode-cell");
      cell.type = "button";
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", String(m.value === selected));
      cell.disabled = busy;
      const ico = el("span", `mode-cell-icon mode-${m.value}`);
      ico.innerHTML = icon(m.icon);
      const text = el("span", "mode-cell-text");
      const a = availability(m.value);
      const avail = el("span", `mode-avail${a.ok ? "" : " warn"}`, a.text);
      text.append(el("span", "mode-cell-title", m.title), el("span", "mode-cell-desc", m.desc), avail);
      const check = el("span", "mode-check");
      if (m.value === selected) check.innerHTML = icon("check");
      cell.append(ico, text, check);
      cell.addEventListener("click", () => choose(m.value));
      group.append(cell);
    }
    footer.textContent = "يمكنك تغيير الوضع في أي وقت من شارة الحالة في الشريط العلوي أو من لوحة الأوامر (Ctrl+K).";
  }

  /* ---------- ما يتبع الوضع في الواجهة ----------
     دون اتصال: سطر أسفل صندوق الكتابة يذكر النماذج المحلية بدل OpenRouter، وبطاقة حد OpenRouter تُخفى. */
  const footNote = document.querySelector(".composer .foot-note");
  const onlineFoot = footNote ? [...footNote.childNodes].map((n) => n.cloneNode(true)) : [];
  function applyMode() {
    const offline = status?.setting === "offline";
    document.body.classList.toggle("work-offline", offline);
    if (!footNote) return;
    if (offline) footNote.textContent = "دون اتصال — النماذج المحلية على جهازك فقط · الردود قد تكون غير دقيقة";
    else footNote.replaceChildren(...onlineFoot.map((n) => n.cloneNode(true)));
  }

  async function loadStatus() {
    try {
      const res = await fetch("/api/brain/status");
      if (res.ok) status = await res.json();
    } catch {}
    applyMode();
    if (!backdrop.hidden) render();
  }

  async function choose(value) {
    if (busy) return;
    busy = true;
    render();
    try {
      const res = await fetch("/api/brain/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      status = data;
      saveLast(value);
      applyMode();
      busy = false;
      close();
      await Promise.all([window.reloadModels?.(), window.refreshBrainStatus?.(true)]);
      const local = (data.localModels || []).length;
      notify(value === "offline"
        ? { type: local ? "success" : "warning", title: "العمل دون اتصال", body: local ? "تظهر الآن النماذج المحلية فقط." : "لا يوجد نموذج محلي جاهز بعد. شغّل npm.cmd run offline:setup وأنت متصل." }
        : { type: "success", title: "العمل باتصال", body: "تظهر الآن كل النماذج." });
    } catch (e) {
      busy = false;
      render();
      notify({ type: "error", title: "تعذر تغيير وضع العمل", body: String(e.message || e) });
    }
  }

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    if (!backdrop.isConnected) document.body.append(backdrop);
    backdrop.hidden = false;
    render();
    loadStatus();
    requestAnimationFrame(() => (group.querySelector('[aria-checked="true"]') || group.querySelector(".mode-cell"))?.focus());
  }
  function close() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    document.dispatchEvent(new CustomEvent("sanad:mode-picker-closed"));
    if (lastFocus && typeof lastFocus.focus === "function" && lastFocus.isConnected) lastFocus.focus();
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", (e) => {
    if (backdrop.hidden) return;
    if (e.key === "Escape") close();
    // الأسهم تتنقل بين الخيارين كمجموعة أزرار راديو
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key) && group.contains(document.activeElement)) {
      e.preventDefault();
      const cells = [...group.querySelectorAll(".mode-cell")];
      const i = cells.indexOf(document.activeElement);
      cells[(i + (e.key === "ArrowDown" || e.key === "ArrowLeft" ? 1 : cells.length - 1)) % cells.length]?.focus();
    }
  });

  window.sanadModePicker = { open, close, isOpen: () => !backdrop.hidden };

  function start() {
    open(); // عند فتح سند: اختر طريقة العمل
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
