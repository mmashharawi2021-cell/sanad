/* سند — سلوكيات واجهة iOS
   1) العنوان الكبير (Large Title) يصغر وينتقل إلى الشريط عند التمرير.
   2) تمييز الشريط العلوي بفاصل شعري فقط بعد أن يمر المحتوى تحته. */
(() => {
  const chat = /** @type {HTMLElement | null} */ (document.querySelector("main.chat"));
  const thread = document.getElementById("thread");
  if (!chat || !thread) return;

  const COLLAPSE_AT = 24;
  let ticking = false;

  function update() {
    ticking = false;
    const scrolled = thread.scrollTop > COLLAPSE_AT;
    chat.classList.toggle("scrolled", scrolled);
  }

  thread.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );

  // يُعاد رسم المحادثة عند تبديلها، فنعيد الحساب بعد كل تغيير في المحتوى
  // الشاشة الرئيسية تبدأ دائماً من الأعلى (المحادثات تُمرَّر لآخر رسالة)
  const homeToTop = () => {
    if (!thread.querySelector(".home")) return false;
    requestAnimationFrame(() => {
      thread.style.scrollBehavior = "auto";
      thread.scrollTop = 0;
      thread.style.scrollBehavior = "";
      update();
    });
    return true;
  };
  new MutationObserver(() => {
    if (!homeToTop()) requestAnimationFrame(update);
  }).observe(thread, { childList: true });
  homeToTop(); // الرسم الأول يحدث قبل تحميل هذا الملف
  update();

  /* 3) الشريط العلوي وصندوق الإدخال يطفوان فوق المحادثة (زجاج حقيقي):
        نقيس ارتفاعهما ونعطي المحادثة مساحة مكافئة حتى لا يختفي شيء تحتهما. */
  const head = /** @type {HTMLElement | null} */ (chat.querySelector(".chat-head"));
  const composer = /** @type {HTMLElement | null} */ (chat.querySelector(".composer"));
  if (head && composer && "ResizeObserver" in window) {
    const measure = () => {
      // نقيس الشريط في حالته الموسّعة فقط، فلا تقفز المحادثة عند طيّه
      if (!chat.classList.contains("scrolled")) chat.style.setProperty("--head-h", `${head.offsetHeight}px`);
      chat.style.setProperty("--composer-h", `${composer.offsetHeight}px`);
    };
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(head);
    ro.observe(composer);
    measure();
    chat.classList.add("ios-overlay");
  }
})();
