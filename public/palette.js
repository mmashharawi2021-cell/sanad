/* سند — لوحة الأوامر (Ctrl+K) وأدوات الشريط الجانبي
   تُنفّذ الأوامر بالنقر على الأزرار الموجودة نفسها، فلا تكرار لمنطق أي أداة. */
(() => {
  const backdrop = document.getElementById("paletteBackdrop");
  const input = document.getElementById("paletteInput");
  const list = document.getElementById("paletteList");
  const trigger = document.getElementById("paletteBtn");
  const toolNav = document.getElementById("toolNav");
  if (!backdrop || !input || !list) return;

  /* ---------- Sidebar tools: collapse state + close drawer on mobile ---------- */
  if (toolNav) {
    try {
      if (localStorage.getItem("sanad.toolNav") === "closed") toolNav.open = false;
    } catch {}
    toolNav.addEventListener("toggle", () => {
      try { localStorage.setItem("sanad.toolNav", toolNav.open ? "open" : "closed"); } catch {}
    });
    toolNav.addEventListener("click", (e) => {
      if (e.target.closest(".tool-item")) document.getElementById("closeNav")?.click();
    });
  }

  /* ---------- Commands ---------- */
  const svg = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const fixed = [
    { group: "عام", icon: svg("plus"), label: "محادثة جديدة", target: "newChat" },
    { group: "عام", icon: svg("globe"), label: "وضع العمل: باتصال أو دون اتصال", target: "brainBadge" },
    { group: "عام", icon: svg("bot"), label: "اختيار الموديل", target: "modelBtn" },
    { group: "عام", icon: svg("moon"), label: "تبديل المظهر", target: "theme" },
  ];

  function commands() {
    const out = [...fixed];
    if (toolNav) {
      let group = "الأدوات";
      for (const el of toolNav.querySelectorAll(".tool-group-label, .tool-item")) {
        if (el.classList.contains("tool-group-label")) { group = el.textContent.trim(); continue; }
        const label = el.querySelector(".tool-label")?.textContent.trim() || el.id;
        // .tool-ico holds static markup from index.html (an <svg><use>), safe to reuse
        const icon = el.querySelector(".tool-ico")?.innerHTML.trim() || svg("zap");
        out.push({ group, icon, label, target: el.id, hint: el.title });
      }
    }
    // الإجراءات السريعة من درج الكبسولة (تبقى متاحة حتى والكبسولة مخفية)
    // أيقونات ثابتة لكل إجراء (الإيموجي تُزال من نصوص الكبسولة بواسطة ios-polish.js)
    const QUICK_ICONS = {
      islandQuickClickBtn: "eye", islandQuickEnterBtn: "arrow-up", islandQuickSaveBtn: "check",
      islandQuickNewBtn: "plus", islandQuickEscBtn: "x", islandOrganizeDesktopBtn: "monitor",
      islandRoutineMorningBtn: "sun", islandRoutineFocusBtn: "clock", islandRoutineWrapupBtn: "moon",
      islandProjectsBtn: "code", islandRamBoostBtn: "zap", islandDiskCleanBtn: "sparkles",
      islandPortsBtn: "globe", islandPingBtn: "activity",
    };
    const EMOJI = /[\p{Extended_Pictographic}️‍]/gu;
    for (const el of document.querySelectorAll("#islandDrawer .island-pill-btn")) {
      if (!el.id || el.id === "islandToggleModeBtn") continue;
      out.push({
        group: "إجراءات سريعة",
        icon: svg(QUICK_ICONS[el.id] || "zap"),
        label: el.textContent.replace(EMOJI, "").trim(),
        target: el.id,
        hint: el.title,
      });
    }
    return out.filter((c) => document.getElementById(c.target));
  }

  const norm = (s) => (s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

  let items = [];
  let selected = 0;
  let lastFocus = null;

  function render() {
    const q = norm(input.value.trim());
    items = commands().filter((c) => !q || norm(c.label).includes(q) || norm(c.hint).includes(q));
    selected = Math.min(selected, Math.max(0, items.length - 1));
    list.textContent = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "palette-empty";
      empty.textContent = "لا توجد نتائج";
      list.append(empty);
      return;
    }
    let group = null;
    items.forEach((c, i) => {
      if (c.group !== group) {
        group = c.group;
        const g = document.createElement("div");
        g.className = "palette-group";
        g.textContent = group;
        list.append(g);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "palette-item" + (i === selected ? " selected" : "");
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(i === selected));
      const ico = document.createElement("span");
      ico.className = "tool-ico";
      if (c.icon) ico.innerHTML = c.icon;
      else ico.textContent = c.ico;
      const label = document.createElement("span");
      label.textContent = c.label;
      b.append(ico, label);
      b.addEventListener("mousemove", () => { if (selected !== i) { selected = i; highlight(); } });
      b.addEventListener("click", () => run(i));
      list.append(b);
    });
  }

  function highlight() {
    list.querySelectorAll(".palette-item").forEach((el, i) => {
      el.classList.toggle("selected", i === selected);
      el.setAttribute("aria-selected", String(i === selected));
      if (i === selected) el.scrollIntoView({ block: "nearest" });
    });
  }

  function open() {
    lastFocus = document.activeElement;
    input.value = "";
    selected = 0;
    render();
    backdrop.classList.remove("hidden");
    input.focus();
  }

  function close() {
    backdrop.classList.add("hidden");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function run(i) {
    const c = items[i];
    if (!c) return;
    close();
    document.getElementById(c.target)?.click();
  }

  trigger?.addEventListener("click", open);
  input.addEventListener("input", () => { selected = 0; render(); });
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); selected = (selected + 1) % Math.max(1, items.length); highlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selected = (selected - 1 + items.length) % Math.max(1, items.length); highlight(); }
    else if (e.key === "Enter") { e.preventDefault(); run(selected); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      backdrop.classList.contains("hidden") ? open() : close();
    }
  });
})();
