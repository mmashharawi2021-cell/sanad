/* سند — الشاشة الرئيسية بأسلوب iPhone (تظهر عندما لا توجد رسائل)
   window.sanadHomeScreen({ onSuggest(text) }) → عنصر DOM جاهز.
   التطبيقات تفتح الأدوات بالنقر على أزرارها الموجودة (نفس المعرّفات)، فلا تكرار للمنطق. */
(() => {
  const svg = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  const APPS = [
    { id: "sysStatsBtn", icon: "activity", label: "نبض النظام", color: "green" },
    { id: "netMaestroBtn", icon: "globe", label: "الشبكة", color: "blue" },
    { id: "terminalBtn", icon: "terminal", label: "الطرفية", color: "graphite" },
    { id: "desktopManagerBtn", icon: "monitor", label: "سطح المكتب", color: "indigo" },
    { id: "topScreenVisionBtn", icon: "eye", label: "فحص الشاشة", color: "teal" },
    { id: "liveStreamBtn", icon: "radio", label: "بث مباشر", color: "red" },
    { id: "memoryBtn", icon: "memory", label: "الذاكرة", color: "pink" },
    { id: "tasksBtn", icon: "clock", label: "المهام", color: "orange" },
    { id: "workflowsBtn", icon: "zap", label: "المسارات", color: "yellow" },
    { id: "projectPreviewBtn", icon: "code", label: "المشاريع", color: "purple" },
    { id: "toggleIslandBtn", icon: "island", label: "الكبسولة", color: "cyan" },
    { id: "paletteBtn", icon: "command", label: "الأوامر", color: "gray" },
  ];

  // النص المُرسل هو نفسه السابق (قد تعتمد عليه مطابقة الأوامر المحلية)
  const SUGGESTIONS = [
    { icon: "mic", text: "تحدث معي بالصوت", prompt: "🎙️ تحدث معي بالصوت (الوضع الصوتي)" },
    { icon: "eye", text: "افحص الشاشة واشرح ما تراه", prompt: "👁️ افحص الشاشة واشرح ما تراه" },
    { icon: "activity", text: "كيف وضع جهازي؟", prompt: "📊 كيف وضع جهازي والمعالج؟" },
    { icon: "sparkles", text: "نظّف الملفات المؤقتة", prompt: "🧹 نظف الملفات المؤقتة والكاش" },
    { icon: "code", text: "اكتب كود بايثون", prompt: "💻 اكتب كود بايثون لاختبار سرعة الخوارزمية" },
    { icon: "memory", text: "ماذا تعرف عني؟", prompt: "🧠 ماذا تعرف عني في الذاكرة الدائمة؟" },
  ];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---------- Clock widget ---------- */
  function clockWidget() {
    const w = el("section", "widget widget-clock");
    w.setAttribute("aria-label", "الساعة والتاريخ");
    const day = el("div", "wc-day");
    const time = el("div", "wc-time");
    const date = el("div", "wc-date");
    w.append(day, time, date);
    const tick = () => {
      const now = new Date();
      day.textContent = now.toLocaleDateString("ar-u-nu-latn", { weekday: "long" });
      // الساعة كبيرة و«ص/م» صغيرة كما في iOS
      const parts = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" }).formatToParts(now);
      const clockText = parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim();
      const period = parts.find((p) => p.type === "dayPeriod")?.value || "";
      time.textContent = clockText;
      if (period) time.append(el("span", "wc-period", period));
      date.textContent = now.toLocaleDateString("ar-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
    };
    tick();
    return { node: w, tick };
  }

  /* ---------- System rings widget ---------- */
  function ring(label, cls) {
    const R = 26;
    const C = 2 * Math.PI * R;
    const box = el("div", `ws-ring ${cls}`);
    box.innerHTML =
      `<svg viewBox="0 0 64 64" aria-hidden="true">` +
      `<circle class="track" cx="32" cy="32" r="${R}"/>` +
      `<circle class="bar" cx="32" cy="32" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>`;
    const val = el("div", "ws-val", "—");
    const name = el("div", "ws-label", label);
    box.append(val);
    const wrap = el("div", "ws-item");
    wrap.append(box, name);
    const bar = box.querySelector(".bar");
    return {
      node: wrap,
      set(pct, text) {
        const p = Math.max(0, Math.min(100, Number(pct) || 0));
        bar.style.strokeDashoffset = String(C * (1 - p / 100));
        val.textContent = text ?? `${Math.round(p)}%`;
      },
    };
  }

  function systemWidget() {
    const w = el("section", "widget widget-system");
    w.setAttribute("aria-label", "حالة الجهاز");
    const head = el("div", "widget-head");
    head.innerHTML = svg("activity");
    head.append(el("span", null, "حالة الجهاز"));
    const rings = el("div", "ws-rings");
    const cpu = ring("المعالج", "r-cpu");
    const ram = ring("الذاكرة", "r-ram");
    const bat = ring("البطارية", "r-bat");
    rings.append(cpu.node, ram.node, bat.node);
    const foot = el("div", "ws-foot", "جارٍ القراءة…");
    w.append(head, rings, foot);
    w.addEventListener("click", () => document.getElementById("sysStatsBtn")?.click());

    async function refresh() {
      try {
        const res = await fetch("/api/system/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const s = await res.json();
        cpu.set(s.cpuUsagePercent);
        ram.set(s.usedMemoryPercent);
        if (typeof s.batteryPercent === "number") bat.set(s.batteryPercent, `${s.batteryPercent}%${s.isCharging ? "⚡" : ""}`);
        else bat.set(0, "—");
        // <bdi> يمنع انقلاب «930.5 GB» داخل النص العربي
        const gb = (v) => { const b = el("bdi", null, `${v} GB`); return b; };
        foot.textContent = "القرص C: ";
        foot.append(gb(s.diskFreeGb), " متاحة من ", gb(s.diskTotalGb));
      } catch {
        foot.textContent = "تعذّرت قراءة حالة الجهاز";
      }
    }
    return { node: w, refresh };
  }

  /* ---------- App grid ---------- */
  function appGrid() {
    const grid = el("nav", "home-apps");
    grid.setAttribute("aria-label", "تطبيقات سند");
    for (const app of APPS) {
      if (!document.getElementById(app.id)) continue;
      const b = el("button", "home-app");
      b.type = "button";
      const icon = el("span", `app-icon app-${app.color}`);
      icon.innerHTML = svg(app.icon);
      b.append(icon, el("span", "app-label", app.label));
      b.addEventListener("click", () => document.getElementById(app.id)?.click());
      grid.append(b);
    }
    return grid;
  }

  /* ---------- Suggestions widget (like Siri Suggestions) ---------- */
  function suggestionsWidget(onSuggest) {
    const w = el("section", "widget widget-suggest");
    w.setAttribute("aria-label", "اقتراحات سند");
    const head = el("div", "widget-head");
    head.innerHTML = svg("sparkles");
    head.append(el("span", null, "اقتراحات سند"));
    const list = el("div", "suggest-list");
    for (const s of SUGGESTIONS) {
      const b = el("button", "suggest-item");
      b.type = "button";
      b.title = s.prompt;
      const ic = el("span", "suggest-ico");
      ic.innerHTML = svg(s.icon);
      b.append(ic, el("span", "suggest-text", s.text));
      b.addEventListener("click", () => onSuggest?.(s.prompt));
      list.append(b);
    }
    w.append(head, list);
    return w;
  }

  window.sanadHomeScreen = function sanadHomeScreen({ onSuggest } = {}) {
    const home = el("div", "home");
    const clock = clockWidget();
    const sys = systemWidget();
    const widgets = el("div", "home-widgets");
    widgets.append(clock.node, sys.node);
    home.append(widgets, appGrid(), suggestionsWidget(onSuggest));

    // تحديث حيّ يتوقف تلقائياً عند مغادرة الشاشة الرئيسية
    sys.refresh();
    const timer = setInterval(() => {
      if (!home.isConnected) return clearInterval(timer);
      if (document.hidden) return;
      clock.tick();
    }, 15000);
    const statsTimer = setInterval(() => {
      if (!home.isConnected) return clearInterval(statsTimer);
      if (!document.hidden) sys.refresh();
    }, 5000);
    return home;
  };
})();
