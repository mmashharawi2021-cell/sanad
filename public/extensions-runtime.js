/* سند — بيئة تشغيل الإضافات (sanadExt) — معزولة
   كل إضافة تعمل داخل iframe بـ sandbox="allow-scripts" (أصل معتم، بلا allow-same-origin):
   - لا ترى صفحة سند ولا رمز الجلسة ولا التخزين المحلي ولا تستطيع استدعاء واجهات الخادم.
   - تتواصل مع سند عبر postMessage فقط، وسند يجيب على طلبات محددة: حالة الجهاز، سرعة الشبكة،
     تخزين خاص بالإضافة، إشعار، ارتفاع الإطار، تقرير خطأ.
   واجهة api داخل الإضافة كما هي: home.addToDeviceCard / home.addWidget / stats / network.throughput /
   storage / notify / icon / css. */
(() => {
  // fetch الأصلي (قبل حارس الطلبات) — يُسلَّم مرة واحدة لهذا الملف فقط
  const nativeFetch = (typeof window.__sanadTakeNativeFetch === "function" && window.__sanadTakeNativeFetch()) || window.fetch.bind(window);

  const TOKENS = [
    "--surface-0", "--surface-1", "--surface-2", "--surface-3", "--text-1", "--text-2", "--text-3", "--brand", "--brand-strong",
    "--brand-soft", "--on-brand", "--fill", "--fill-strong", "--success", "--warning", "--danger-1", "--line", "--line-strong",
    "--font-sans", "--font-display", "--font-mono", "--radius-sm", "--radius",
  ];
  const ICONS = [
    "activity", "globe", "zap", "clock", "download", "upload", "gauge", "wifi", "check", "alert", "rotate", "sparkles", "monitor", "terminal", "puzzle",
  ];
  const EXTRA_ICONS = {
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
  };

  const extensions = new Map(); // id → { meta: {id,name,description}, deviceCard: n, widgets: [{title,icon}] }
  const frames = new Map(); // contentWindow → { extId, iframe }
  const failed = new Set();

  function report(ext, message, where) {
    const key = `${ext?.id}:${where}:${message}`;
    console.error(`[sanadExt] ${ext?.name || ext?.id} (${where})`, message);
    if (failed.has(key)) return;
    failed.add(key);
    window.sanadNotify?.error(String(message).slice(0, 200), `تعطلت الإضافة «${ext?.name || ext?.id}»`);
  }

  /* ---------- مواد الإطار: ألوان السمة، الأيقونات، غلاف api ---------- */
  function themeCss() {
    const cs = getComputedStyle(document.documentElement);
    const vars = TOKENS.map((t) => `${t}:${cs.getPropertyValue(t).trim()};`).join("");
    const dark = document.documentElement.dataset.theme !== "light";
    return `:root{${vars}color-scheme:${dark ? "dark" : "light"};}`;
  }

  function spriteMarkup() {
    const parts = ICONS.map((id) => {
      const sym = document.getElementById(`i-${id}`);
      const body = sym ? sym.innerHTML : EXTRA_ICONS[id];
      return body ? `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>` : "";
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${parts.join("")}</svg>`;
  }

  function storageSnapshot(extId) {
    const prefix = `sanad.ext.${extId}.`;
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k));
      }
    } catch {}
    return out;
  }

  // الغلاف داخل الإطار: يعرّف sanadExt.register ويحوّل api إلى رسائل
  const SHIM = `
(() => {
  const BOOT = JSON.parse(document.getElementById("sanad-boot").textContent);
  const send = (msg) => parent.postMessage(Object.assign({ __sanad: 1 }, msg), "*");
  let seq = 0; const pending = new Map();
  addEventListener("message", (e) => {
    if (e.source !== parent || !e.data || !e.data.__sanad) return;
    const d = e.data;
    if (d.type === "reply" && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error)) : p.resolve(d.value); }
    if (d.type === "theme") document.getElementById("sanad-theme").textContent = d.css;
  });
  const call = (op) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); send({ type: "call", id, op }); setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("انتهت مهلة الطلب")); } }, 20000); });
  const store = BOOT.storage || {};
  addEventListener("error", (e) => send({ type: "error", message: String(e.message || e.error) }));
  addEventListener("unhandledrejection", (e) => send({ type: "error", message: String((e.reason && e.reason.message) || e.reason) }));
  const root = document.getElementById("root");
  new ResizeObserver(() => send({ type: "height", value: Math.ceil(document.documentElement.scrollHeight) })).observe(document.body);
  let widgetIndex = 0; let deviceIndex = 0; const widgets = []; let deviceCount = 0;
  window.sanadExt = {
    register(def) {
      try {
        const api = {
          id: def.id, name: def.name,
          icon: (n) => '<svg class="ico" aria-hidden="true"><use href="#i-' + String(n).replace(/[^a-z0-9-]/gi, "") + '"/></svg>',
          css: (t) => { const s = document.createElement("style"); s.textContent = String(t); document.head.append(s); },
          notify: {
            success: (b, t) => send({ type: "notify", kind: "success", body: String(b), title: t == null ? null : String(t) }),
            error: (b, t) => send({ type: "notify", kind: "error", body: String(b), title: t == null ? null : String(t) }),
            info: (b, t) => send({ type: "notify", kind: "info", body: String(b), title: t == null ? null : String(t) }),
          },
          storage: {
            get: (k, f) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : f),
            set: (k, v) => { store[k] = v; send({ type: "storage", key: String(k), value: v }); },
          },
          stats: () => call("stats"),
          network: { throughput: () => call("throughput") },
          home: {
            addToDeviceCard: (render) => {
              deviceCount++;
              if (BOOT.placement === "device" && deviceIndex++ === BOOT.index) render(root);
            },
            addWidget: (spec) => {
              widgets.push({ title: String(spec && spec.title || ""), icon: String(spec && spec.icon || "puzzle") });
              if (BOOT.placement === "widget" && widgetIndex++ === BOOT.index) spec.render(root);
            },
          },
        };
        def.init(api);
        send({ type: "register", meta: { id: String(def.id || ""), name: String(def.name || ""), description: String(def.description || "") }, deviceCount, widgets });
      } catch (err) {
        send({ type: "error", message: String(err && err.message || err) });
      }
    },
  };
})();`;

  function buildSrcdoc(extId, placement, index) {
    const boot = JSON.stringify({ extId, placement, index, storage: storageSnapshot(extId) }).replace(/</g, "\\u003c");
    const scriptUrl = `${location.origin}/extensions/${extId}.js?v=${encodeURIComponent(extensions.get(extId)?.version || "")}`;
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="${location.origin}/fonts/fonts.css">
<style id="sanad-theme">${themeCss()}</style>
<style>html,body{margin:0;padding:0;background:transparent;color:var(--text-1);font-family:var(--font-sans);font-size:15px;overflow:hidden}
.ico{width:18px;height:18px;display:inline-block;vertical-align:middle}
button{font:inherit;cursor:pointer}</style>
<script type="application/json" id="sanad-boot">${boot}</script>
</head><body>${spriteMarkup()}<div id="root"></div>
<script>${SHIM}</script>
<script src="${scriptUrl}"></script>
</body></html>`;
  }

  function createFrame(extId, placement, index, { hidden = false } = {}) {
    const iframe = document.createElement("iframe");
    iframe.className = "ext-frame";
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", extensions.get(extId)?.meta.name || "إضافة");
    iframe.setAttribute("loading", "eager");
    iframe.style.cssText = hidden ? "position:absolute;width:0;height:0;border:0;visibility:hidden" : "width:100%;border:0;display:block;height:0;background:transparent";
    iframe.srcdoc = buildSrcdoc(extId, placement, index);
    // نسجّل الإطار عند تحميله (contentWindow متاح قبل ذلك أيضاً)
    queueMicrotask(() => iframe.contentWindow && frames.set(iframe.contentWindow, { extId, iframe, placement }));
    iframe.addEventListener("load", () => {
      if (!iframe.contentWindow) return;
      frames.set(iframe.contentWindow, { extId, iframe, placement });
      // المظهر ربما تغيّر بين بناء الإطار واكتمال تحميله (رسالة التغيير ضاعت) ← نرسل الحالي الآن
      iframe.contentWindow.postMessage({ __sanad: 1, type: "theme", css: themeCss() }, "*");
    });
    return iframe;
  }

  /* ---------- قناة الرسائل: كل ما تستطيع الإضافة طلبه ---------- */
  const READS = { stats: "/api/system/stats", throughput: "/api/network/throughput" };
  window.addEventListener("message", async (e) => {
    const d = e.data;
    if (!d || !d.__sanad) return;
    const frame = frames.get(e.source);
    if (!frame) return; // رسالة من مصدر غير معروف
    const ext = extensions.get(frame.extId) || { meta: { id: frame.extId, name: frame.extId } };
    const reply = (value, error) => /** @type {Window} */ (e.source).postMessage({ __sanad: 1, type: "reply", id: d.id, value, error }, "*");

    if (d.type === "call") {
      const path = READS[d.op];
      if (!path) return reply(undefined, "عملية غير مسموحة للإضافات.");
      try {
        const res = await nativeFetch(path, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        reply(await res.json());
      } catch (err) {
        reply(undefined, String(err.message || err));
      }
    } else if (d.type === "storage") {
      try { localStorage.setItem(`sanad.ext.${frame.extId}.${String(d.key).slice(0, 64)}`, JSON.stringify(d.value)); } catch {}
    } else if (d.type === "notify" && frame.placement !== "probe") {
      const fn = window.sanadNotify?.[d.kind] || window.sanadNotify?.info;
      fn?.(String(d.body || "").slice(0, 300), d.title ? String(d.title).slice(0, 80) : ext.meta.name);
    } else if (d.type === "height" && frame.placement !== "probe") {
      frame.iframe.style.height = `${Math.min(2000, Math.max(0, Number(d.value) || 0))}px`;
    } else if (d.type === "error") {
      report(ext.meta, d.message, frame.placement);
    } else if (d.type === "register" && frame.placement === "probe") {
      const info = extensions.get(frame.extId);
      if (info) {
        info.meta = { ...info.meta, ...d.meta, id: frame.extId };
        info.deviceCount = Math.min(5, Number(d.deviceCount) || 0);
        info.widgets = Array.isArray(d.widgets) ? d.widgets.slice(0, 5) : [];
        info.ready = true;
      }
      frames.delete(e.source);
      frame.iframe.remove();
      decorateHome(document.querySelector(".home"), frame.extId);
    }
  });

  // تغيّر السمة (داكن/فاتح) → نرسل الألوان الجديدة لكل إطار حي
  new MutationObserver(() => {
    const css = themeCss();
    for (const [win, f] of frames) {
      if (!f.iframe.isConnected) { frames.delete(win); continue; }
      win.postMessage({ __sanad: 1, type: "theme", css }, "*");
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- وضع الإضافات في الشاشة الرئيسية ---------- */
  function decorateHome(home, onlyId) {
    if (!home) return;
    for (const [id, ext] of extensions) {
      if (!ext.ready || (onlyId && id !== onlyId)) continue;
      const card = home.querySelector(".widget-system");
      for (let i = 0; card && i < ext.deviceCount; i++) {
        const slot = document.createElement("div");
        slot.className = "ext-slot";
        slot.dataset.ext = id;
        slot.addEventListener("click", (ev) => ev.stopPropagation());
        slot.append(createFrame(id, "device", i));
        card.append(slot);
      }
      const area = home.querySelector(".home-widgets");
      (ext.widgets || []).forEach((w, i) => {
        if (!area) return;
        const section = document.createElement("section");
        section.className = "widget ext-widget";
        section.dataset.ext = id;
        const head = document.createElement("div");
        head.className = "widget-head";
        head.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${String(w.icon).replace(/[^a-z0-9-]/gi, "") || "puzzle"}"/></svg>`;
        const t = document.createElement("span");
        t.textContent = w.title || ext.meta.name;
        head.append(t);
        section.append(head, createFrame(id, "widget", i));
        area.append(section);
      });
    }
  }

  /* ---------- تحميل الإضافات المفعّلة: إطار «استكشاف» مخفي يخبرنا أين تريد الإضافة أن تظهر ---------- */
  async function loadEnabled() {
    let list = [];
    try {
      list = ((await (await nativeFetch("/api/extensions", { cache: "no-store" })).json()).extensions || []);
    } catch (e) {
      console.warn("[sanadExt] تعذر تحميل قائمة الإضافات", e);
      return;
    }
    for (const e of list) {
      if (!e.enabled || !/^[a-z0-9-]{3,48}$/.test(e.id)) continue;
      const version = e.updatedAt || e.createdAt || "";
      const known = extensions.get(e.id);
      if (known && known.version === version) continue;
      extensions.set(e.id, { meta: { id: e.id, name: e.name, description: e.description }, version, deviceCount: 0, widgets: [], ready: false });
      document.body.append(createFrame(e.id, "probe", 0, { hidden: true }));
    }
  }

  window.sanadExt = {
    _decorateHome: (home) => decorateHome(home),
    list: () => [...extensions.values()].filter((e) => e.ready).map((e) => e.meta),
    reload: loadEnabled,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadEnabled);
  else loadEnabled();
})();
