/* سند — بيئة تشغيل الإضافات (sanadExt)
   الإضافات يكتبها «مطوّر سند الذاتي» بطلب من المستخدم وبعد موافقته، وتُحفظ في /extensions/<id>.js.
   كل إضافة تستدعي sanadExt.register({ id, name, description, init(api) }).
   الأخطاء معزولة: إضافة معطوبة تُظهر إشعاراً ولا توقف سند. */
(() => {
  const registry = new Map(); // id → { meta, deviceCard: [], widgets: [] }
  const failed = new Set();

  /* ---------- أيقونات إضافية للإضافات ---------- */
  const EXTRA_ICONS = {
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
    puzzle: '<path d="M15.39 4.39a1 1 0 0 0 1.68-.47 2.5 2.5 0 1 1 3.01 3.01 1 1 0 0 0-.47 1.68l1.68 1.68a2.41 2.41 0 0 1 0 3.42l-1.68 1.68a1 1 0 0 1-1.68-.47 2.5 2.5 0 1 0-3.01 3.01 1 1 0 0 1 .47 1.68l-1.68 1.68a2.41 2.41 0 0 1-3.42 0l-1.68-1.68a1 1 0 0 0-1.68.47 2.5 2.5 0 1 1-3.01-3.01 1 1 0 0 0 .47-1.68l-1.68-1.68a2.41 2.41 0 0 1 0-3.42l1.68-1.68a1 1 0 0 1 1.68.47 2.5 2.5 0 1 0 3.01-3.01 1 1 0 0 1-.47-1.68l1.68-1.68a2.41 2.41 0 0 1 3.42 0z"/>',
  };
  function ensureIcons() {
    const sprite = document.querySelector('body > svg[style*="display:none"]');
    if (!sprite) return;
    for (const [id, body] of Object.entries(EXTRA_ICONS)) {
      if (document.getElementById(`i-${id}`)) continue;
      sprite.insertAdjacentHTML(
        "beforeend",
        `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`,
      );
    }
  }
  const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${String(name).replace(/[^a-z0-9-]/gi, "")}"/></svg>`;

  function reportError(ext, err, where) {
    const key = `${ext?.id || "?"}:${where}`;
    console.error(`[sanadExt] ${ext?.name || ext?.id} (${where})`, err);
    if (failed.has(key)) return;
    failed.add(key);
    window.sanadNotify?.error(String(err?.message || err).slice(0, 200), `تعطلت الإضافة «${ext?.name || ext?.id}»`);
  }

  /* ---------- تطبيق الإضافات على الشاشة الرئيسية ---------- */
  function decorateHome(home, onlyId) {
    if (!home) return;
    for (const [id, ext] of registry) {
      if (onlyId && id !== onlyId) continue;
      const card = home.querySelector(".widget-system");
      for (const render of ext.deviceCard) {
        if (!card) break;
        const slot = document.createElement("div");
        slot.className = "ext-slot";
        slot.dataset.ext = id;
        // البطاقة كلها تفتح «نبض النظام» عند النقر؛ أزرار الإضافة لا يجب أن تفعل ذلك
        slot.addEventListener("click", (e) => e.stopPropagation());
        card.append(slot);
        try { render(slot); } catch (e) { reportError(ext.meta, e, "render"); }
      }
      const widgets = home.querySelector(".home-widgets");
      for (const w of ext.widgets) {
        if (!widgets) break;
        const section = document.createElement("section");
        section.className = "widget ext-widget";
        section.dataset.ext = id;
        const head = document.createElement("div");
        head.className = "widget-head";
        head.innerHTML = icon(w.icon || "puzzle");
        const t = document.createElement("span");
        t.textContent = String(w.title || ext.meta.name);
        head.append(t);
        const body = document.createElement("div");
        section.append(head, body);
        widgets.append(section);
        try { w.render(body); } catch (e) { reportError(ext.meta, e, "widget"); }
      }
    }
  }

  function makeApi(meta, ext) {
    const ns = `sanad.ext.${meta.id}.`;
    return {
      id: meta.id,
      name: meta.name,
      icon,
      notify: {
        success: (b, t) => window.sanadNotify?.success(b, t || meta.name),
        error: (b, t) => window.sanadNotify?.error(b, t || meta.name),
        info: (b, t) => window.sanadNotify?.info(b, t || meta.name),
      },
      css(text) {
        const s = document.createElement("style");
        s.dataset.ext = meta.id;
        s.textContent = String(text);
        document.head.append(s);
      },
      storage: {
        get(key, fallback) {
          try { const v = localStorage.getItem(ns + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
        },
        set(key, value) {
          try { localStorage.setItem(ns + key, JSON.stringify(value)); } catch {}
        },
      },
      async stats() {
        const res = await fetch("/api/system/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(`تعذرت قراءة حالة الجهاز (${res.status})`);
        return res.json();
      },
      network: {
        // سرعة الإرسال والاستقبال الآن (بايت/ثانية) + آخر 60 ثانية، مثل مدير المهام
        async throughput() {
          const res = await fetch("/api/network/throughput", { cache: "no-store" });
          if (!res.ok) throw new Error(`تعذرت قراءة سرعة الشبكة (${res.status})`);
          return res.json();
        },
      },
      home: {
        addToDeviceCard(render) {
          if (typeof render === "function") ext.deviceCard.push(render);
        },
        addWidget(spec) {
          if (spec && typeof spec.render === "function") ext.widgets.push(spec);
        },
      },
    };
  }

  window.sanadExt = {
    register(def) {
      try {
        if (!def || typeof def.init !== "function") throw new Error("register يحتاج init(api).");
        const meta = {
          id: String(def.id || "ext").replace(/[^a-z0-9-]/gi, "").slice(0, 48) || "ext",
          name: String(def.name || def.id || "إضافة"),
          description: String(def.description || ""),
        };
        if (registry.has(meta.id)) return;
        const ext = { meta, deviceCard: [], widgets: [] };
        registry.set(meta.id, ext);
        ensureIcons();
        def.init(makeApi(meta, ext));
        decorateHome(document.querySelector(".home"), meta.id); // إن كانت الشاشة الرئيسية معروضة الآن
      } catch (e) {
        reportError({ id: def?.id, name: def?.name }, e, "init");
      }
    },
    _decorateHome: (home) => decorateHome(home),
    list: () => [...registry.values()].map((e) => e.meta),
  };

  // أخطاء غير ملتقطة داخل ملفات الإضافات
  window.addEventListener("error", (ev) => {
    const m = /\/extensions\/([a-z0-9-]+)\.js/i.exec(ev.filename || "");
    if (m) reportError({ id: m[1], name: m[1] }, ev.error || ev.message, "runtime");
  });

  /* ---------- تحميل الإضافات المفعّلة ---------- */
  async function loadEnabled() {
    try {
      const res = await fetch("/api/extensions", { cache: "no-store" });
      const data = await res.json();
      for (const e of data.extensions || []) {
        if (!e.enabled || !/^[a-z0-9-]{3,48}$/.test(e.id)) continue;
        const s = document.createElement("script");
        s.src = `/extensions/${e.id}.js?v=${encodeURIComponent(e.createdAt || "")}`;
        s.async = true;
        s.onerror = () => reportError(e, new Error("تعذر تحميل ملف الإضافة."), "load");
        document.body.append(s);
      }
    } catch (e) {
      console.warn("[sanadExt] تعذر تحميل قائمة الإضافات", e);
    }
  }
  window.sanadExt.reload = loadEnabled;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadEnabled);
  else loadEnabled();
})();
