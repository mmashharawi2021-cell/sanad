/* سند — ورقة «صوت سند» بأسلوب iOS
   - تختار رجل/فتاة، والصوت الطبيعي (عند الاتصال)، وتعاين كل صوت، ومحرك السماع.
   - تُحفظ في الخادم (/api/voice/settings → data/voice-settings.json).
   - تضيف نفسها إلى قائمة الأدوات (فتظهر تلقائياً في لوحة الأوامر Ctrl+K) دون تغيير أي معرّف قائم. */
(() => {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const ICON = {
    voice: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>',
    play: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>',
    stop: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    check: '<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>',
  };
  const SAMPLE = {
    male: "أهلاً بك، أنا سند. كيف أستطيع مساعدتك اليوم؟",
    female: "أهلاً بكِ، أنا سند. كيف أستطيع مساعدتك اليوم؟",
  };
  const notify = (opts) => (window.sanadNotify ? window.sanadNotify(opts) : console.warn(opts.title, opts.message));

  let data = null; // { settings, cloudVoices, localVoices }

  /* ---------- API ---------- */
  async function load() {
    const res = await fetch("/api/voice/settings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  }
  async function save(patch) {
    const res = await fetch("/api/voice/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.settings) throw new Error(out.error || `HTTP ${res.status}`);
    data.settings = out.settings;
  }

  /* ---------- Preview playback ---------- */
  let audio = null;
  let playingBtn = null;
  function stopPreview() {
    if (audio) { try { audio.pause(); } catch {} }
    audio = null;
    if (playingBtn) { playingBtn.innerHTML = ICON.play; playingBtn.classList.remove("on"); playingBtn.setAttribute("aria-label", playingBtn.dataset.label); }
    playingBtn = null;
  }
  async function preview(btn, body) {
    const same = playingBtn === btn;
    stopPreview();
    if (same) return;
    if (typeof window.stopSpeaking === "function") window.stopSpeaking();
    playingBtn = btn;
    btn.classList.add("on", "loading");
    btn.innerHTML = ICON.stop;
    btn.setAttribute("aria-label", "إيقاف المعاينة");
    try {
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      if (playingBtn !== btn) { URL.revokeObjectURL(url); return; }
      btn.classList.remove("loading");
      audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); if (playingBtn === btn) stopPreview(); };
      await audio.play();
    } catch (e) {
      btn.classList.remove("loading");
      stopPreview();
      notify({ type: "error", title: "تعذرت المعاينة", message: String(e.message || e) });
    }
  }
  function previewBtn(label, body) {
    const b = el("button", "voice-play");
    b.type = "button";
    b.dataset.label = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = ICON.play;
    b.addEventListener("click", (e) => { e.stopPropagation(); preview(b, body); });
    return b;
  }

  /* ---------- Sheet ---------- */
  const backdrop = el("div", "ios-voice-backdrop");
  backdrop.hidden = true;
  const sheet = el("div", "ios-sheet ios-voice-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "voiceSheetTitle");
  backdrop.append(sheet);

  const head = el("div", "voice-head");
  head.append(el("span", "sheet-grabber"));
  const title = el("h2", "sheet-title");
  title.id = "voiceSheetTitle";
  const appIcon = el("span", "sheet-app-icon voice-app-icon");
  appIcon.innerHTML = ICON.voice;
  title.append(appIcon, el("span", null, "صوت سند"));
  const done = el("button", "sheet-done", "تم");
  done.type = "button";
  done.addEventListener("click", close);
  head.append(title, done);
  const body = el("div", "voice-body");
  sheet.append(head, body);

  function section(label, footer) {
    const wrap = el("section", "voice-section");
    if (label) wrap.append(el("h3", "voice-section-label", label));
    const group = el("div", "voice-group");
    wrap.append(group);
    if (footer) wrap.append(el("p", "voice-footer", footer));
    body.append(wrap);
    return group;
  }

  function segmented(options, value, onChange, label) {
    const seg = el("div", "voice-seg");
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", label);
    for (const o of options) {
      const b = el("button", "voice-seg-btn", o.label);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(o.value === value));
      b.addEventListener("click", () => { if (o.value !== value) onChange(o.value); });
      seg.append(b);
    }
    return seg;
  }

  async function update(patch) {
    try {
      await save(patch);
      render();
    } catch (e) {
      notify({ type: "error", title: "تعذر حفظ الإعداد", message: String(e.message || e) });
    }
  }

  function render() {
    stopPreview();
    body.textContent = "";
    if (!data) return;
    const s = data.settings;
    const g = s.gender;

    // 1) رجل / فتاة
    const g1 = section(null, "يختار صوت سند في الرد الصوتي والوضع الصوتي المستمر.");
    const row = el("div", "voice-cell voice-cell-seg");
    row.append(segmented([{ value: "male", label: "رجل" }, { value: "female", label: "فتاة" }], g, (v) => update({ gender: v }), "جنس الصوت"));
    g1.append(row);

    // 2) الصوت الطبيعي
    const g2 = section("الصوت الطبيعي — عند الاتصال بالإنترنت", "كل جملة يقولها سند بالصوت الطبيعي تُحفظ على جهازك، فتُسمع بنفس الصوت حتى دون إنترنت.");
    const toggleCell = el("label", "voice-cell voice-toggle");
    toggleCell.append(el("span", "voice-cell-title", "استخدام الصوت الطبيعي"));
    const sw = el("input", "voice-switch");
    sw.type = "checkbox";
    sw.setAttribute("role", "switch");
    sw.checked = !!s.naturalOnline;
    sw.addEventListener("change", () => update({ naturalOnline: sw.checked }));
    toggleCell.append(sw);
    g2.append(toggleCell);

    const current = g === "female" ? s.femaleVoice : s.maleVoice;
    for (const v of data.cloudVoices.filter((x) => x.gender === g)) {
      const cell = el("div", "voice-cell voice-choice" + (s.naturalOnline ? "" : " is-disabled"));
      cell.tabIndex = 0;
      cell.setAttribute("role", "radio");
      cell.setAttribute("aria-checked", String(v.id === current));
      const pick = () => { if (v.id !== current) update(g === "female" ? { femaleVoice: v.id } : { maleVoice: v.id }); };
      cell.addEventListener("click", pick);
      cell.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      const mark = el("span", "voice-check");
      if (v.id === current) mark.innerHTML = ICON.check;
      cell.append(mark, el("span", "voice-cell-title", v.label), previewBtn(`معاينة ${v.label}`, { text: SAMPLE[g], voice: v.id }));
      g2.append(cell);
    }

    // 3) دون إنترنت
    const g3 = section("دون إنترنت", "يُستخدم للجمل الجديدة عند انقطاع الإنترنت. أسرع وأخف، لكنه أقل طبيعية.");
    const local = data.localVoices[g];
    const lc = el("div", "voice-cell");
    lc.append(el("span", "voice-cell-title", `${local.label} — صوت محلي`), previewBtn(`معاينة الصوت المحلي ${local.label}`, { text: SAMPLE[g], gender: g, engine: "local" }));
    g3.append(lc);

    // 4) السماع
    const g4 = section("التعرّف على كلامك", "FastConformer: يعمل على جهازك، أسرع بنحو 12 مرة وأدق في قياساتنا. Whisper: بديل احتياطي.");
    const sc = el("div", "voice-cell voice-cell-seg");
    sc.append(segmented([{ value: "fastconformer", label: "FastConformer" }, { value: "whisper", label: "Whisper" }], s.stt, (v) => update({ stt: v }), "محرك السماع"));
    g4.append(sc);
  }

  let lastFocus = null;
  async function open() {
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    document.body.append(backdrop);
    if (!data) {
      body.textContent = "";
      body.append(el("p", "voice-footer", "جارٍ التحميل…"));
      try { await load(); } catch (e) {
        body.textContent = "";
        body.append(el("p", "voice-footer", "تعذر تحميل إعدادات الصوت: " + (e.message || e)));
        return;
      }
    }
    render();
    done.focus();
  }
  function close() {
    stopPreview();
    backdrop.hidden = true;
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !backdrop.hidden) close(); });

  window.sanadVoiceSheet = { open, close };

  /* ---------- Entry point in the tools list (also feeds the Ctrl+K palette) ---------- */
  function addToolItem() {
    if (document.getElementById("voiceSettingsBtn")) return;
    const grid = document.querySelector("#toolNav .tool-grid");
    if (!grid) return;
    const b = el("button", "tool-item");
    b.id = "voiceSettingsBtn";
    b.type = "button";
    b.title = "صوت سند: رجل أو فتاة، الصوت الطبيعي، والتعرّف على الكلام";
    const ico = el("span", "tool-ico");
    ico.innerHTML = ICON.voice;
    b.append(ico, el("span", "tool-label", "صوت سند"));
    b.addEventListener("click", open);
    grid.append(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addToolItem);
  else addToolItem();
})();
