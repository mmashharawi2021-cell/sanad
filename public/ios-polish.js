/* سند — تنظيف نصوص واجهة النظام لتطابق iOS
   - يزيل الإيموجي من أزرار وعناوين وشارات النوافذ (iOS يستخدم أيقونات خطية لا إيموجي).
   - يزيل الشروح الإنجليزية بين قوسين من العناوين والأزرار: «تحرير الرام (RAM Boost)» → «تحرير الرام».
   - يعمل باستمرار (MutationObserver) لأن الشيفرة تعيد كتابة نصوص الأزرار أثناء العمل.
   لا يلمس محتوى المستخدم: المحادثة، الذاكرة، أسماء الملفات والمهام، الأوامر، الحقول. */
(() => {
  // النطاقات التي تُنظَّف (واجهة النظام فقط)
  const SCOPES = ".ios-sheet, #modelPanel, .cyber-island, .live-stream-hud";
  // داخلها: ما لا يُلمس أبداً (بيانات المستخدم أو الخادم)
  const KEEP = [
    "input", "textarea", "select", "code", "pre",
    ".terminal-body", ".terminal-logs",
    ".memory-card-content", ".task-card-title > span:last-child", ".task-log-output",
    ".model-item-name", ".net-table td.mono", ".net-label",
    "#sysLargeFilesList [title]", "#projectPreviewIframe",
  ].join(", ");
  // حيث تُحذف الشروح الإنجليزية بين قوسين
  const LABELS = "button, h2, h3, .sys-metric-head, .net-card h3, .memory-header h2";

  const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu;
  const EN_PAREN = /\s*\((?=[^)]*[A-Za-z])[A-Za-z0-9 &/+.,'\-]+\)/g;

  function cleanNode(node) {
    const parent = node.parentElement;
    if (!parent || !parent.closest(SCOPES) || parent.closest(KEEP)) return;
    let t = node.nodeValue;
    if (!t) return;
    let next = t.replace(EMOJI, "");
    if (parent.closest(LABELS)) next = next.replace(EN_PAREN, "");
    // عناوين الأقسام لا تنتهي بنقطتين في iOS
    if (parent.closest("h3")) next = next.replace(/\s*:\s*$/, "");
    next = next.replace(/\s{2,}/g, " ");
    if (/^\s+$/.test(next) && !/^\s+$/.test(t)) next = "";
    if (next !== t) node.nodeValue = next;
    // عنصر كان يحتوي إيموجي فقط (أيقونة نصية) → نخفيه بدل ترك فراغ
    if (!next.trim() && parent.childNodes.length === 1 && parent.tagName === "SPAN" && !parent.closest("button")) {
      parent.classList.add("emoji-removed");
    }
  }

  function cleanTree(root) {
    if (!root) return;
    if (root.nodeType === 3) return cleanNode(root);
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) cleanNode(n);
  }

  // أزرار الكبسولة كانت إيموجي فقط → أيقونات خطية (مع إبقاء شارة زمن الاستجابة في زر الشبكة)
  const ISLAND_ICONS = { islandDuplexBtn: "radio", islandMicBtn: "mic", islandVisionBtn: "eye", islandNetBtn: "globe" };
  for (const [id, icon] of Object.entries(ISLAND_ICONS)) {
    const b = document.getElementById(id);
    if (b && !b.querySelector("svg")) {
      b.insertAdjacentHTML("afterbegin", `<svg class="ico" aria-hidden="true"><use href="#i-${icon}"/></svg>`);
      if (!b.getAttribute("aria-label")) b.setAttribute("aria-label", b.title || icon);
    }
  }

  document.querySelectorAll(SCOPES).forEach(cleanTree);

  const thread = document.getElementById("thread");
  new MutationObserver((muts) => {
    for (const m of muts) {
      // المحادثة (والبث المباشر) خارج النطاق تماماً — نتجاهلها مبكراً
      const host = m.target.nodeType === 3 ? m.target.parentElement : m.target;
      if (thread && host && thread.contains(host)) continue;
      if (m.type === "characterData") cleanNode(m.target);
      else m.addedNodes.forEach(cleanTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
})();
