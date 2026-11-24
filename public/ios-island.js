/* سند — شريط الحالة و Dynamic Island بأسلوب iPhone
   - تستقبل الجزيرة حالتها من setIslandStatus/updateIslandLatest الموجودتين (عبر window.sanadIsland).
   - «يفكر» تُستنتج من ظهور زر إيقاف التوليد (#stop).
   - شريط الحالة: الساعة، الشبكة (navigator.onLine)، البطارية من /api/system/stats. */
(() => {
  const svg = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ======================= Status bar ======================= */
  const bar = el("div", "ios-statusbar");
  bar.setAttribute("aria-hidden", "true"); // معلومات تكميلية؛ لا داعي لأن يقرأها قارئ الشاشة
  const sbTime = el("span", "sb-time");
  const sbRight = el("span", "sb-right");
  const sbWifi = el("span", "sb-wifi");
  sbWifi.innerHTML =
    '<svg viewBox="0 0 18 13" aria-hidden="true"><path d="M9 12.2 6.6 9.8a3.4 3.4 0 0 1 4.8 0z"/><path class="w2" d="M4.4 7.6a6.5 6.5 0 0 1 9.2 0l-1.1 1.1a5 5 0 0 0-7 0z"/><path class="w3" d="M2.2 5.4a9.6 9.6 0 0 1 13.6 0l-1.1 1.1a8 8 0 0 0-11.4 0z"/></svg>';
  const sbBattery = el("span", "sb-battery");
  const sbPct = el("span", "sb-pct", "");
  const sbCell = el("span", "sb-cell");
  const sbFill = el("span", "sb-fill");
  const sbBolt = el("span", "sb-bolt");
  sbBolt.innerHTML = '<svg viewBox="0 0 10 14" aria-hidden="true"><path d="M6 0 0 8h4l-1 6 6-8H5z"/></svg>';
  sbCell.append(sbFill, sbBolt);
  sbBattery.append(sbPct, sbCell);
  sbRight.append(sbWifi, sbBattery);
  bar.append(sbTime, sbRight);

  function tickTime() {
    sbTime.textContent = new Date().toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[ap]m$/i, "");
  }
  function updateNet() {
    bar.classList.toggle("offline", !navigator.onLine);
  }
  async function updateBattery() {
    try {
      const res = await fetch("/api/system/stats", { cache: "no-store" });
      const s = await res.json();
      if (typeof s.batteryPercent !== "number") { sbBattery.hidden = true; return; }
      sbBattery.hidden = false;
      sbPct.textContent = String(s.batteryPercent);
      sbFill.style.width = `${Math.max(4, s.batteryPercent)}%`;
      sbBattery.classList.toggle("low", s.batteryPercent <= 20 && !s.isCharging);
      sbBattery.classList.toggle("charging", !!s.isCharging);
    } catch {
      /* يبقى آخر قيمة معروفة */
    }
  }

  /* ======================= Dynamic Island ======================= */
  const island = el("div", "dyn-island state-idle");
  island.setAttribute("role", "status");
  island.setAttribute("aria-live", "polite");
  island.tabIndex = 0;
  island.title = "سند — انقر للتوسيع";

  const lead = el("span", "di-lead");
  const text = el("span", "di-text");
  const trail = el("span", "di-trail");
  const compact = el("div", "di-compact");
  compact.append(lead, text, trail);

  const expanded = el("div", "di-expanded");
  const exHead = el("div", "di-ex-head");
  const exIcon = el("span", "di-ex-icon");
  exIcon.innerHTML = '<span class="di-orb"></span>';
  const exTitle = el("div", "di-ex-title", "سند");
  const exStatus = el("div", "di-ex-status", "جاهز للأمر");
  const exTitles = el("div", "di-ex-titles");
  exTitles.append(exTitle, exStatus);
  exHead.append(exIcon, exTitles);
  const exLatest = el("div", "di-ex-latest", "اسألني أي شيء، أو اكتب أمراً سريعاً.");
  const quickComposer = document.querySelector(".island-center");
  if (quickComposer) {
    quickComposer.classList.add("di-compose");
    const commandInput = quickComposer.querySelector("input");
    commandInput?.setAttribute("aria-label", "اكتب أمراً لسند");
    if (commandInput) commandInput.dir = "auto";
  }
  const exActions = el("div", "di-ex-actions");
  const action = (icon, label, fn, cls = "") => {
    const b = el("button", `di-act ${cls}`);
    b.type = "button";
    b.innerHTML = svg(icon);
    b.append(el("span", null, label));
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); collapse(); });
    return b;
  };
  const stopAct = action("stop", "إيقاف", () => stopCurrent(), "danger");
  exActions.append(
    action("globe", "وضع العمل", () => window.sanadModePicker?.open()),
    action("command", "الأوامر", () => document.getElementById("paletteBtn")?.click()),
    stopAct,
  );
  const quickActions = el("div", "di-quick-actions");
  const quickAction = (icon, label, onClick) => {
    const b = el("button", "di-quick-action");
    b.type = "button";
    b.innerHTML = svg(icon);
    b.append(el("span", null, label));
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); collapse(); });
    quickActions.append(b);
  };
  [
    ["islandQuickClickBtn", "activity", "نقر"],
    ["islandQuickEnterBtn", "check", "Enter"],
    ["islandQuickSaveBtn", "copy", "حفظ"],
    ["islandQuickNewBtn", "plus", "جديد"],
    ["islandQuickEscBtn", "x", "إلغاء"],
    ["islandOrganizeDesktopBtn", "monitor", "ترتيب المكتب"],
    ["islandRoutineMorningBtn", "sun", "بداية العمل"],
    ["islandRoutineFocusBtn", "activity", "تركيز"],
    ["islandRoutineWrapupBtn", "moon", "نهاية العمل"],
    ["islandProjectsBtn", "code", "المشاريع"],
    ["islandRamBoostBtn", "zap", "تحرير الرام"],
    ["islandDiskCleanBtn", "disk", "تنظيف القرص"],
    ["islandPortsBtn", "terminal", "المنافذ"],
    ["islandPingBtn", "globe", "فحص النت"],
  ].forEach(([id, icon, label]) => {
    quickAction(icon, label, () => document.getElementById(id)?.click());
  });
  const modeAction = el("button", "di-mode-action");
  modeAction.type = "button";
  modeAction.addEventListener("click", (e) => {
    e.stopPropagation();
    window.sanadCompactMode?.toggle();
    collapse();
  });
  expanded.append(exHead, exLatest);
  if (quickComposer) expanded.append(quickComposer);
  expanded.append(exActions, quickActions, modeAction);

  function syncModeAction() {
    const compactMode = document.body.classList.contains("island-only-mode");
    modeAction.innerHTML = `${svg(compactMode ? "monitor" : "island")}<span>${compactMode ? "إظهار الواجهة الكاملة" : "العرض المصغّر"}</span>`;
    modeAction.setAttribute("aria-label", compactMode ? "إظهار الواجهة الكاملة" : "تفعيل العرض المصغّر");
  }
  syncModeAction();
  new MutationObserver(syncModeAction).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  island.append(compact, expanded);

  let state = "idle";
  let statusText = "جاهز للأمر";
  let thinking = false;
  let errorTimer = null;

  function modelName() {
    return document.getElementById("modelBtnName")?.textContent.trim() || "";
  }

  function stopCurrent() {
    const stop = document.getElementById("stop");
    if (stop && !stop.classList.contains("hidden")) stop.click();
  }

  function render() {
    const effective = thinking && (state === "idle" || state === "working") ? "thinking" : state;
    island.className = `dyn-island state-${effective}${island.classList.contains("expanded") ? " expanded" : ""}`;
    lead.innerHTML = "";
    trail.innerHTML = "";
    text.textContent = "";
    switch (effective) {
      case "thinking":
        lead.innerHTML = svg("sparkles");
        text.textContent = "يفكر";
        trail.append(el("span", "di-dots", "•••"));
        break;
      case "working":
        lead.append(el("span", "di-spinner"));
        text.textContent = statusText.replace(/\.{2,}|…$/u, "");
        break;
      case "error":
        lead.innerHTML = svg("alert");
        text.textContent = statusText;
        break;
      default:
        lead.append(el("span", "di-orb"));
    }
    const label = effective === "thinking" ? `يفكر${modelName() ? ` · ${modelName()}` : ""}` : statusText;
    exStatus.textContent = label;
    stopAct.hidden = effective !== "thinking";
  }

  function classify(t) {
    if (/^جاهز|الكبسولة نشطة/.test(t)) return "idle";
    if (/تعذر|تعذّر|يحتاج إنترنت/.test(t)) return "error";
    return "working";
  }

  function setStatus(t) {
    statusText = String(t || "جاهز للأمر").trim();
    state = classify(statusText);
    clearTimeout(errorTimer);
    if (state === "error") errorTimer = setTimeout(() => { state = "idle"; statusText = "جاهز للأمر"; render(); }, 3500);
    render();
  }

  function setLatest(htmlOrText) {
    // قد تكون HTML؛ نعرض نصها فقط. DOMParser خامل (لا يحمّل صوراً ولا ينفّذ onerror)،
    // أما innerHTML على عنصر منفصل فيُطلق <img onerror> — كان هذا ثغرة XSS هنا.
    const doc = new DOMParser().parseFromString(typeof htmlOrText === "string" ? htmlOrText : "", "text/html");
    const plain = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    if (plain) exLatest.textContent = plain.length > 220 ? `${plain.slice(0, 220)}…` : plain;
  }

  function expand() { island.classList.add("expanded"); }
  function collapse() { island.classList.remove("expanded"); }
  island.addEventListener("click", (e) => {
    if (e.target.closest(".di-expanded")) return;
    island.classList.toggle("expanded");
  });
  island.addEventListener("keydown", (e) => {
    if (e.target.closest("button, input, textarea, select, a")) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); island.classList.toggle("expanded"); }
    if (e.key === "Escape") collapse();
  });
  document.addEventListener("click", (e) => { if (!island.contains(e.target)) collapse(); });

  // «يفكر»: زر الإيقاف ظاهر أثناء التوليد
  const stopBtn = document.getElementById("stop");
  if (stopBtn) {
    const sync = () => { thinking = !stopBtn.classList.contains("hidden"); render(); };
    new MutationObserver(sync).observe(stopBtn, { attributes: true, attributeFilter: ["class"] });
    sync();
  }

  window.sanadIsland = { status: setStatus, latest: setLatest, expand, collapse };

  document.body.prepend(bar);
  // عنصر مستقل: شريط الحالة مخفي عن قارئ الشاشة، أما الجزيرة فتعلن الحالة
  document.body.prepend(island);
  document.documentElement.classList.add("has-statusbar");

  tickTime();
  updateNet();
  updateBattery();
  render();
  setInterval(tickTime, 15000);
  setInterval(() => { if (!document.hidden) updateBattery(); }, 30000);
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
})();
