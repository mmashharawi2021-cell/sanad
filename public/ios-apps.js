/* سند — نوافذ الأدوات كتطبيقات iOS (Sheets)
   - عنوان قصير + أيقونة تطبيق ملوّنة، وزر «تم» بدل ✕، وعنوان كبير يصغر عند التمرير.
   - أداة مقسّمة (Segmented) لنوع الطرفية تبقى متزامنة مع <select> الأصلي.
   لا يغيّر أي معرّف ولا أي منطق: يعيد تنسيق العناصر الموجودة فقط. */
(() => {
  const use = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // modal id → [عنوان قصير، أيقونة، لون أيقونة التطبيق]
  const APPS = {
    memoryModal: ["الذاكرة", "memory", "pink"],
    tasksModal: ["المهام", "clock", "orange"],
    workflowsModal: ["المسارات", "zap", "yellow"],
    sysStatsModal: ["نبض النظام", "activity", "green"],
    networkModal: ["الشبكة والمنافذ", "globe", "blue"],
    desktopModal: ["سطح المكتب", "monitor", "indigo"],
    terminalModal: ["الطرفية", "terminal", "graphite"],
    previewModal: [null, "code", "purple"],
  };

  for (const [id, [title, icon, color]] of Object.entries(APPS)) {
    const modal = document.getElementById(id);
    if (!modal) continue;
    modal.classList.add("ios-sheet");
    const header = modal.querySelector(".memory-header, .terminal-header");
    const heading = header?.querySelector("h2, .terminal-title");
    const body = modal.querySelector(".memory-body, .terminal-body");

    // أيقونة التطبيق + عنوان قصير (الوصف الإنجليزي الطويل يبقى في title للتلميح)
    if (heading) {
      const appIcon = el("span", `sheet-app-icon app-${color}`);
      appIcon.innerHTML = use(icon);
      if (title) {
        heading.title = heading.textContent.trim();
        heading.textContent = title;
        heading.prepend(appIcon);
      } else {
        // المعاينة الحية: نستبدل الإيموجي الأول بالأيقونة ونُبقي اسم المشروع الحي
        const first = heading.querySelector("span");
        if (first && /\p{Extended_Pictographic}/u.test(first.textContent)) first.replaceWith(appIcon);
        else heading.prepend(appIcon);
      }
      heading.classList.add("sheet-title");
    }

    // زر «تم» بدل ✕ (نفس الزر ونفس معرّفه)
    const closeBtn = header?.querySelector(".memory-close-btn");
    if (closeBtn) {
      closeBtn.textContent = "تم";
      closeBtn.classList.add("sheet-done");
    }

    // مقبض السحب أعلى الورقة
    modal.prepend(el("div", "sheet-grabber"));

    // العنوان الكبير يصغر عند التمرير
    if (body) {
      body.addEventListener("scroll", () => modal.classList.toggle("scrolled", body.scrollTop > 8), { passive: true });
    }
  }

  // نقاط macOS الملوّنة في الطرفية لا مكان لها في iOS
  document.querySelectorAll("#terminalModal .terminal-dots .dot").forEach((d) => d.remove());

  /* ---------- Segmented control لنوع الطرفية ---------- */
  const shell = document.getElementById("terminalShellSelect");
  const bar = document.querySelector("#terminalModal .terminal-input-bar");
  if (shell && bar) {
    const seg = el("div", "ios-segmented terminal-seg");
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", "نوع الطرفية");
    const labels = { powershell: "PowerShell", cmd: "CMD", python: "Python", node: "Node", git: "Git" };
    const buttons = [...shell.options].map((opt) => {
      const b = el("button", "seg-btn", labels[opt.value] || opt.textContent.replace(/^\W+\s*/u, ""));
      b.type = "button";
      b.setAttribute("role", "radio");
      b.addEventListener("click", () => {
        shell.value = opt.value;
        shell.dispatchEvent(new Event("change", { bubbles: true }));
        sync();
      });
      seg.append(b);
      return [opt.value, b];
    });
    const sync = () => buttons.forEach(([v, b]) => {
      const on = shell.value === v;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
    shell.addEventListener("change", sync);
    sync();
    shell.classList.add("visually-hidden-select");
    bar.before(seg);
  }

  /* ---------- Segmented control لمعاينة حاسوب/جوال ---------- */
  const desk = document.getElementById("previewDesktopBtn");
  if (desk?.parentElement) desk.parentElement.classList.add("ios-segmented", "preview-seg");
})();
