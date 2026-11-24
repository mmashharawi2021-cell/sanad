/* سند — مركز التحكم بأسلوب iPhone
   يفتح من زر في الشريط العلوي، أو بالضغط المطوّل على Dynamic Island، أو Ctrl+Shift+C.
   كل بلاطة تستدعي الوظيفة الموجودة نفسها (أزرار/دوال قائمة) — لا تكرار للمنطق. */
(() => {
  const use = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const raw = (paths) =>
    `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    sliders: raw('<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>'),
    wifi: raw('<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>'),
    plug: raw('<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>'),
    sunrise: raw('<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>'),
    target: raw('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
    disk: raw('<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>'),
  };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const click = (id) => document.getElementById(id)?.click();
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  /* ---------- Build ---------- */
  const backdrop = el("div", "ios-cc-backdrop");
  backdrop.id = "controlCenterBackdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "مركز التحكم");
  backdrop.hidden = true;
  const grid = el("div", "ios-cc");
  grid.id = "controlCenter";
  const dismiss = el("button", "cc-dismiss");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "إغلاق مركز التحكم");
  dismiss.innerHTML = use("x");
  dismiss.addEventListener("click", close);
  backdrop.append(dismiss, grid);

  function roundBtn(iconHtml, label, onClick, cls = "") {
    const b = el("button", `cc-round ${cls}`);
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = iconHtml;
    b.addEventListener("click", onClick);
    return b;
  }

  // 1) الاتصال (2×2)
  const conn = el("div", "cc-tile cc-conn");
  conn.append(
    roundBtn(ICON.wifi, "فحص الإنترنت", () => click("islandPingBtn"), "c-blue"),
    roundBtn(ICON.plug, "المنافذ", () => { close(); click("islandPortsBtn"); }, "c-green"),
    roundBtn(use("radio"), "بث مباشر", () => { close(); click("liveStreamBtn"); }, "c-red"),
    roundBtn(use("eye"), "فحص الشاشة", () => { close(); click("topScreenVisionBtn"); }, "c-teal"),
  );

  // 2) التركيز / الروتين (2×2)
  const focus = el("div", "cc-tile cc-focus");
  const focusHead = el("div", "cc-tile-head");
  focusHead.innerHTML = use("moon");
  focusHead.append(el("span", null, "التركيز"));
  focus.append(focusHead);
  const routines = [
    { id: "islandRoutineMorningBtn", icon: ICON.sunrise, label: "بداية العمل" },
    { id: "islandRoutineFocusBtn", icon: ICON.target, label: "تركيز" },
    { id: "islandRoutineWrapupBtn", icon: use("moon"), label: "نهاية العمل" },
  ];
  const routineBtns = routines.map((r) => {
    const b = el("button", "cc-focus-item");
    b.type = "button";
    b.innerHTML = r.icon;
    b.append(el("span", null, r.label));
    b.addEventListener("click", () => {
      routineBtns.forEach((x) => x.classList.toggle("on", x === b));
      store.set("sanad.cc.focus", r.id);
      click(r.id);
    });
    if (store.get("sanad.cc.focus", "") === r.id) b.classList.add("on");
    focus.append(b);
    return b;
  });

  // 3) السطوع (عمودي 1×2)
  const bright = el("div", "cc-tile cc-slider");
  bright.setAttribute("role", "slider");
  bright.setAttribute("aria-label", "سطوع الشاشة");
  bright.setAttribute("aria-valuemin", "0");
  bright.setAttribute("aria-valuemax", "100");
  bright.tabIndex = 0;
  const brightFill = el("div", "cc-slider-fill");
  const brightIcon = el("div", "cc-slider-icon");
  brightIcon.innerHTML = use("sun");
  bright.append(brightFill, brightIcon);
  let brightness = Number(store.get("sanad.cc.brightness", "70")) || 70;
  let brightTimer = null;
  function paintBright() {
    brightFill.style.height = `${brightness}%`;
    bright.setAttribute("aria-valuenow", String(brightness));
    bright.setAttribute("aria-valuetext", `${brightness}%`);
  }
  async function sendBright() {
    store.set("sanad.cc.brightness", String(brightness));
    try {
      const res = await fetch("/api/system/brightness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percent: brightness }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) window.sanadNotify?.error(data.message || "الشاشة لا تدعم التحكم بالسطوع.", "تعذّر ضبط السطوع");
    } catch (e) {
      window.sanadNotify?.error(e.message, "تعذّر ضبط السطوع");
    }
  }
  function setFromPointer(e) {
    const r = bright.getBoundingClientRect();
    brightness = Math.round(Math.max(0, Math.min(1, (r.bottom - e.clientY) / r.height)) * 100);
    paintBright();
  }
  bright.addEventListener("pointerdown", (e) => {
    bright.setPointerCapture(e.pointerId);
    bright.classList.add("active");
    setFromPointer(e);
  });
  bright.addEventListener("pointermove", (e) => { if (bright.hasPointerCapture(e.pointerId)) setFromPointer(e); });
  bright.addEventListener("pointerup", () => { bright.classList.remove("active"); sendBright(); });
  bright.addEventListener("keydown", (e) => {
    const step = { ArrowUp: 10, ArrowRight: 10, ArrowDown: -10, ArrowLeft: -10 }[e.key];
    if (!step) return;
    e.preventDefault();
    brightness = Math.max(0, Math.min(100, brightness + step));
    paintBright();
    clearTimeout(brightTimer);
    brightTimer = setTimeout(sendBright, 400);
  });
  paintBright();

  // 4) المظهر + الأوامر
  const themeTile = roundBtn(use("moon"), "المظهر الداكن", () => { click("theme"); syncTheme(); }, "cc-square c-theme");
  function syncTheme() {
    const dark = document.documentElement.dataset.theme !== "light";
    themeTile.classList.toggle("on", dark);
    themeTile.innerHTML = use(dark ? "moon" : "sun");
    themeTile.title = dark ? "المظهر الداكن" : "المظهر الفاتح";
  }
  const paletteTile = roundBtn(use("command"), "لوحة الأوامر", () => { close(); click("paletteBtn"); }, "cc-square cc-palette");

  // 5) بلاطات عريضة: الرام والقرص
  function wideTile(iconHtml, title, cls, onClick) {
    const b = el("button", `cc-tile cc-wide ${cls}`);
    b.type = "button";
    const ic = el("span", "cc-wide-icon");
    ic.innerHTML = iconHtml;
    const txt = el("span", "cc-wide-text");
    const t = el("strong", null, title);
    const sub = el("span", "cc-wide-sub", "—");
    txt.append(t, sub);
    b.append(ic, txt);
    b.addEventListener("click", onClick);
    return { node: b, sub };
  }
  const ram = wideTile(use("zap"), "تحرير الذاكرة", "c-purple cc-ram", () => window.triggerOptimizeRam?.());
  const disk = wideTile(ICON.disk, "تنظيف القرص", "c-orange cc-disk", () => window.triggerCleanDisk?.());

  // 6) صف التطبيقات الصغيرة
  const apps = el("div", "cc-apps");
  [
    ["terminalBtn", "terminal", "الطرفية"],
    ["desktopManagerBtn", "monitor", "سطح المكتب"],
    ["memoryBtn", "memory", "الذاكرة"],
    ["tasksBtn", "clock", "المهام"],
  ].forEach(([id, icon, label]) => apps.append(roundBtn(use(icon), label, () => { close(); click(id); }, "cc-square")));

  grid.append(conn, focus, bright, themeTile, paletteTile, ram.node, disk.node, apps);
  document.body.append(backdrop);

  /* ---------- Live data ---------- */
  async function refreshStats() {
    try {
      const s = await (await fetch("/api/system/stats", { cache: "no-store" })).json();
      ram.sub.textContent = `${s.usedMemoryPercent}% مستخدمة`;
      disk.sub.textContent = `${s.diskFreeGb} GB متاحة`;
    } catch {
      ram.sub.textContent = disk.sub.textContent = "تعذّرت القراءة";
    }
  }

  /* ---------- Open / close ---------- */
  let lastFocus = null;
  function open() {
    if (!backdrop.hidden) return;
    lastFocus = document.activeElement;
    syncTheme();
    refreshStats();
    backdrop.hidden = false;
    document.getElementById("controlCenterBtn")?.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => backdrop.classList.add("in"));
    window.sanadIsland?.collapse();
    setTimeout(() => grid.querySelector("button, [tabindex]")?.focus(), 60);
  }
  function close() {
    if (backdrop.hidden) return;
    backdrop.classList.remove("in");
    document.getElementById("controlCenterBtn")?.setAttribute("aria-expanded", "false");
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 320;
    setTimeout(() => {
      backdrop.hidden = true;
      if (lastFocus?.isConnected && typeof lastFocus.focus === "function") lastFocus.focus();
    }, delay);
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) { e.stopPropagation(); close(); }
    if (e.key === "Tab" && !backdrop.hidden) {
      const focusable = [...backdrop.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
        .filter((node) => !node.hidden && node.getClientRects().length);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") { e.preventDefault(); backdrop.hidden ? open() : close(); }
  });
  // سحب للأعلى للإغلاق
  let sy = null;
  backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) sy = e.clientY; });
  backdrop.addEventListener("pointerup", (e) => { if (sy != null && sy - e.clientY > 60) close(); sy = null; });

  /* ---------- Entry points ---------- */
  // زر في الشريط العلوي بجانب «الأوامر»
  const palette = document.getElementById("paletteBtn");
  if (palette) {
    const b = el("button", "jarvis-voice-btn cc-trigger");
    b.type = "button";
    b.id = "controlCenterBtn";
    b.title = "مركز التحكم (Ctrl+Shift+C)";
    b.setAttribute("aria-label", "مركز التحكم");
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-controls", backdrop.id);
    b.setAttribute("aria-expanded", "false");
    b.innerHTML = ICON.sliders;
    b.addEventListener("click", open);
    palette.before(b);
  }
  // ضغط مطوّل على Dynamic Island
  const island = document.querySelector(".dyn-island");
  if (island) {
    let t = null;
    let longPressed = false;
    island.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".di-expanded")) return;
      longPressed = false;
      t = setTimeout(() => { longPressed = true; open(); }, 480);
    });
    const cancel = () => clearTimeout(t);
    island.addEventListener("pointerup", cancel);
    island.addEventListener("pointerleave", cancel);
    // نمنع النقرة التي تلي الضغط المطوّل من توسيع الجزيرة
    island.addEventListener("click", (e) => { if (longPressed) { e.stopImmediatePropagation(); longPressed = false; } }, true);
  }

  window.sanadControlCenter = { open, close };
})();
