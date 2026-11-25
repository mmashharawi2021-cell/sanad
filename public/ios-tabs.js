/* تنقل الهاتف: اختصارات ثابتة للأقسام الأكثر استخداماً. */
(() => {
  const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const nav = document.createElement("nav");
  nav.className = "ios-tabs";
  nav.setAttribute("aria-label", "تنقل سند");

  const buttons = new Map();
  const app = document.getElementById("app");
  const sidebar = document.getElementById("sidebar");
  const convList = document.getElementById("convList");
  const toolNav = /** @type {HTMLDetailsElement} */ (document.getElementById("toolNav"));
  const openNav = /** @type {HTMLButtonElement} */ (document.getElementById("openNav"));
  const closeNav = /** @type {HTMLButtonElement} */ (document.getElementById("closeNav"));
  const tabs = [
    { id: "home", label: "الرئيسية", symbol: "bot" },
    { id: "history", label: "المحادثات", symbol: "clock" },
    { id: "tools", label: "الأدوات", symbol: "activity" },
    { id: "mode", label: "الاتصال", symbol: "globe" },
  ];
  const mobileHeader = document.createElement("div");
  mobileHeader.className = "mobile-nav-head";
  const mobileTitle = document.createElement("h2");
  mobileTitle.id = "mobileNavTitle";
  const mobileDone = document.createElement("button");
  mobileDone.type = "button";
  mobileDone.className = "mobile-nav-done";
  mobileDone.textContent = "تم";
  mobileDone.addEventListener("click", () => closeNav?.click());
  mobileHeader.append(mobileTitle, mobileDone);
  sidebar?.prepend(mobileHeader);

  let activeTab = null;
  function setActive(id) {
    activeTab = id;
    for (const [tabId, button] of buttons) {
      const active = tabId === id;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  }

  function openPanel(view, focusSelector) {
    if (!app || !sidebar) return;
    sidebar.dataset.navView = view;
    mobileTitle.textContent = view === "tools" ? "الأدوات" : "المحادثات";
    if (openNav) openNav.dataset.navView = view;
    if (!app.classList.contains("nav-open")) openNav?.click();
    requestAnimationFrame(() => sidebar.querySelector(focusSelector)?.focus());
  }

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ios-tab";
    button.dataset.tab = tab.id;
    button.setAttribute("aria-label", tab.label);
    button.innerHTML = `${icon(tab.symbol)}<span>${tab.label}</span>`;
    button.addEventListener("click", () => {
      setActive(tab.id);
      if (tab.id === "history") {
        openPanel("history", "#convList .conv, #newChat");
      } else if (tab.id === "tools") {
        if (toolNav) toolNav.open = true;
        openPanel("tools", "#toolNav .tool-item");
      } else if (tab.id === "home") {
        if (!document.querySelector("#thread .home")) document.getElementById("newChat")?.click();
        else document.getElementById("prompt")?.focus();
      } else if (tab.id === "mode") {
        window.sanadModePicker?.open();
      }
    });
    buttons.set(tab.id, button);
    nav.append(button);
  }

  document.body.append(nav);
  const thread = document.getElementById("thread");
  function syncHome() {
    if (app?.classList.contains("nav-open") || (activeTab === "mode" && window.sanadModePicker?.isOpen())) return;
    const homeVisible = !!thread?.querySelector(".home");
    if (homeVisible) setActive("home");
    else if (activeTab === "home") setActive(null);
  }
  if (thread) {
    new MutationObserver(syncHome).observe(thread, { childList: true, subtree: true });
    syncHome();
  }

  if (app) {
    const syncPanel = () => {
      if (!app.classList.contains("nav-open")) {
        if (activeTab === "history" || activeTab === "tools") syncHome();
        return;
      }
      const view = sidebar?.dataset.navView;
      if (view === "history" || view === "tools") setActive(view);
    };
    new MutationObserver(syncPanel).observe(app, { attributes: true, attributeFilter: ["class"] });
    openNav?.addEventListener("click", () => {
      if (!sidebar.dataset.navView) sidebar.dataset.navView = "history";
      mobileTitle.textContent = sidebar.dataset.navView === "tools" ? "الأدوات" : "المحادثات";
    });
    closeNav?.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 600px)").matches) {
        const tab = buttons.get(sidebar.dataset.navView);
        requestAnimationFrame(() => tab?.focus());
      }
    });
    document.getElementById("backdrop")?.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 600px)").matches) {
        requestAnimationFrame(() => buttons.get(sidebar.dataset.navView)?.focus());
      }
    });
    sidebar?.addEventListener("click", (event) => {
      if (/** @type {Element} */ (event.target).closest(".tool-item") && window.matchMedia("(max-width: 600px)").matches) {
        closeNav?.click();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && app.classList.contains("nav-open")) closeNav?.click();
      if (event.key !== "Tab" || !app.classList.contains("nav-open") || !window.matchMedia("(max-width: 600px)").matches) return;
      const focusable = [...sidebar.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
      if (!focusable.length) return;
      const first = /** @type {HTMLElement} */ (focusable[0]);
      const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  // عند إغلاق ورقة «وضع العمل» يعود التبويب النشط لما يناسب الشاشة
  document.addEventListener("sanad:mode-picker-closed", () => {
    if (activeTab === "mode") { setActive(null); syncHome(); }
  });
})();
