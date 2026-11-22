/* سند — الشريط الجانبي كقائمة محادثات iOS
   - عنوان كبير «المحادثات» وزر إنشاء (نفس زر #newChat منقولاً، بمستمعاته).
   - شريط بحث iOS يصفّي المحادثات حسب العنوان وآخر رسالة.
   - الأدوات تنتقل أسفل المحادثات كقائمة مجمّعة قابلة للطي (مطويّة افتراضياً). */
(() => {
  const sidebar = document.getElementById("sidebar");
  const convList = document.getElementById("convList");
  const newChat = document.getElementById("newChat");
  const toolNav = document.getElementById("toolNav");
  if (!sidebar || !convList) return;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---------- رأس: عنوان كبير + زر إنشاء ---------- */
  const head = el("div", "side-head");
  const h = el("h2", "side-title", "المحادثات");
  head.append(h);
  if (newChat) {
    newChat.classList.add("compose-btn");
    newChat.title = "محادثة جديدة";
    newChat.setAttribute("aria-label", "محادثة جديدة");
    newChat.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
      '<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>';
    head.append(newChat); // نقل العنصر نفسه يحافظ على مستمعاته
  }

  /* ---------- شريط البحث ---------- */
  const search = el("label", "ios-search");
  search.innerHTML =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const input = el("input");
  input.type = "search";
  input.placeholder = "بحث";
  input.setAttribute("aria-label", "ابحث في المحادثات");
  input.autocomplete = "off";
  search.append(input);

  const norm = (s) => (s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  let emptyHint = null;
  function applyFilter() {
    const q = norm(input.value.trim());
    let shown = 0;
    convList.querySelectorAll(".conv").forEach((row) => {
      const match = !q || norm(row.textContent).includes(q);
      row.hidden = !match;
      if (match) shown++;
    });
    if (q && !shown) {
      if (!emptyHint) emptyHint = el("div", "side-empty", "لا نتائج");
      if (!emptyHint.isConnected) convList.append(emptyHint);
    } else emptyHint?.remove();
  }
  input.addEventListener("input", applyFilter);
  // تُعاد كتابة القائمة عند كل تحديث؛ نعيد تطبيق التصفية بعدها
  new MutationObserver((muts) => {
    if (muts.some((m) => [...m.addedNodes].some((n) => n !== emptyHint))) applyFilter();
  }).observe(convList, { childList: true });

  /* ---------- ترتيب الشريط ---------- */
  const brand = sidebar.querySelector(".brand");
  (brand || sidebar.firstChild)?.after?.(head);
  head.after(search);
  if (toolNav) {
    convList.after(toolNav);
    // الأدوات متاحة في الشاشة الرئيسية ومركز التحكم؛ نطويها افتراضياً
    let saved = null;
    try { saved = localStorage.getItem("sanad.toolNav"); } catch {}
    if (saved == null) toolNav.open = false;
    const summary = toolNav.querySelector(".tool-nav-head span");
    if (summary) summary.textContent = "كل الأدوات";
  }

  // ألوان أيقونات الأدوات كما في تطبيق الإعدادات
  const COLORS = {
    sysStatsBtn: "green", netMaestroBtn: "blue", desktopManagerBtn: "indigo", terminalBtn: "graphite",
    topScreenVisionBtn: "teal", liveStreamBtn: "red", toggleIslandBtn: "cyan",
    memoryBtn: "pink", tasksBtn: "orange", workflowsBtn: "yellow", projectPreviewBtn: "purple",
  };
  for (const [id, color] of Object.entries(COLORS)) {
    document.querySelector(`#${id} .tool-ico`)?.classList.add("settings-ico", `app-${color}`);
  }
})();
