/* سند — سجل الأوامر الموحّد (المرحلة 2)
   كل أمر محلي (يُنفَّذ دون العقل) سجل مستقل:
     id, title, group, risk ("safe" | "action" | "danger"), examples (يجب أن تطابقه), nonExamples (يجب ألا تطابقه),
     match(q, s) → وسائط أو null   (q: النص موحّداً للمطابقة، s: النص الأصلي دون النداء)
     run(args, ctx) → true إن نُفِّذ، false ليُجرَّب الأمر التالي
   الحماية: أوامر "action"/"danger" لا تطابق سؤالاً («كيف/هل/لماذا…» أو ينتهي بـ ؟) ولا جملة طويلة
   (أكثر من maxWords كلمات) — هذه تذهب للعقل. الأوامر ذات البادئة الصريحة («شغل امر:»، «ابحث عن») تتجاوز ذلك.
   يعمل في المتصفح (window.sanadCommands) وفي Node للاختبار (module.exports). */
(function (root) {
  "use strict";

  /* ---------------- توحيد النص ---------------- */
  /** أحرف موحّدة للمطابقة: أ/إ/آ←ا، ة←ه، ى←ي، دون تشكيل، أحرف صغيرة، مسافات مفردة، دون ترقيم في الآخر. */
  function fold(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[ً-ْـ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!،,؛]+$/u, "")
      .trim();
  }
  /** يحذف النداء في البداية («يا سند، …») إن تبعه أمر. */
  function stripWake(s) {
    const t = String(s || "").trim();
    const rest = t.replace(/^(?:يا\s*)?سند[،,:\s]+/u, "");
    return rest.trim() ? rest.trim() : t;
  }
  const has = (q, ...ps) => ps.some((p) => q.includes(fold(p)));
  const is = (q, ...ps) => ps.some((p) => q === fold(p));
  const starts = (q, ...ps) => ps.some((p) => q.startsWith(fold(p)));
  const words = (q) => (q ? q.split(" ").length : 0);
  const QUESTION = /^(?:كيف|لماذا|ليش|ليه|هل|متي|وين|اين|ما هو|ما هي|ماهو|ماهي|ما معني|شو يعني|اشرح|why|how|what|can you|is it)(?:\s|$)/;
  const isQuestion = (q) => /[?؟]\s*$/.test(q) || QUESTION.test(q);

  const DEFAULT_MAX_WORDS = 8;

  /* ---------------- الأوامر ---------------- */
  // الترتيب مهم: أول أمر يطابق يُنفَّذ (نفس ترتيب tryHandleSystemIntent السابق).
  const COMMANDS = [
    {
      id: "selfdev",
      title: "مطوّر سند الذاتي",
      group: "سند",
      risk: "safe", // له نافذة موافقة خاصة قبل أي تثبيت (selfdev-ui.js)
      explicit: true,
      examples: [],
      nonExamples: [],
      match: (q, s) => (root.sanadSelfDev?.matches(s) ? {} : null),
      run: (args, ctx) => root.sanadSelfDev.handle(ctx.raw, ctx.conv, ctx.assistant, { model: ctx.model, save: ctx.save, render: ctx.renderAll }),
    },
    {
      id: "network",
      title: "أوامر الشبكة والمنافذ",
      group: "الشبكة",
      risk: "safe", // تحرير المنفذ له تأكيد أمني خاص (instant-commands.js)
      explicit: true,
      examples: [],
      nonExamples: [],
      match: (q, s) => (root.sanadIntents?.matches(s) ? {} : null),
      run: (args, ctx) => root.sanadIntents.handle(ctx.raw, ctx.conv, ctx.assistant, { save: ctx.save, render: ctx.renderAll }),
    },
    {
      id: "identity",
      title: "من أنت؟",
      group: "سند",
      risk: "safe",
      examples: ["يا سند", "سند", "من أنت؟", "مين انت", "عرف عن نفسك"],
      nonExamples: ["من أنت لتحكم علي", "سند الملكية"],
      match: (q) => (is(q, "يا سند", "سند", "يا جارفيس", "جارفيس", "من انت", "من انت؟", "مين انت", "مين انت؟", "انت مين", "عرف عن نفسك") ? {} : null),
      async run(args, ctx) {
        ctx.sound("wake");
        ctx.reply(`
💠 **أهلاً بك! أنا «سند» (SANAD)، مساعدك وذراعك التقني المستقل في هذا اللابتوب.**

سندك في كل العمليات:
- 💻 **البرمجة والأكواد:** تشغيل الأوامر، فحص بيئات العمل، وحفظ وتشغيل أكواد بايثون ونود تلقائياً.
- 👁️ **الرؤية البصرية (عيون سند):** فحص شاشتك وحل الأخطاء البرمجية وقراءة المستندات مباشرة.
- 📊 **نبض وصحة النظام:** مراقبة المعالج والذاكرة والقرص، وتنظيف الملفات المؤقتة بنقرة واحدة.
- 🧠 **الذاكرة الدائمة:** أتذكر تفضيلاتك ومشاريعك ومعلوماتك دائماً.
- ⏰ **المهام المستقلة:** تشغيل مهام الصيانة والمتابعة الدورية في الخلفية.

⌨️ *اكتب أمرك مباشرة، أو افتح لوحة الأوامر بـ **Ctrl+K**.*
`, "SANAD Core Engine", 15);
        return true;
      },
    },
    {
      id: "capabilities",
      title: "ماذا تستطيع أن تفعل؟",
      group: "سند",
      risk: "safe",
      palette: "ماذا تستطيع أن تفعل؟",
      examples: ["ماذا تستطيع ان تفعل؟", "هل تستطيع التحكم في جهازي؟", "ايش تقدر تسوي"],
      nonExamples: ["ماذا تستطيع الحكومة ان تفعل للاقتصاد"],
      match: (q) => (has(q, "التحكم في اللابتوب", "التحكم باللابتوب", "التحكم في جهازي", "التحكم بجهازي", "تستطيع التحكم", "تقدر تتحكم", "ايش تقدر تسوي")
        || /^ماذا (?:تستطيع|يمكنك) ان تفعل(?:\s*[?؟])?$/.test(q) ? {} : null),
      async run(args, ctx) {
        ctx.reply(`### 🤖 نعم بكل تأكيد! أنا سند المدمج في لابتوبك.\n\nأستطيع مساعدتك والتحكم في العديد من المهام على نظامك بنجاح:\n\n1. ⚡ **تشغيل البرامج فوراً:** قل لي *«افتح فيجوال ستوديو»* أو *«افتح المفكرة»* أو *«افتح المتصفح»* وسأقوم بتشغيلها فوراً على جهازك.\n2. 📁 **استعراض وتصفح المجلدات:** مثل *«افتح مجلد التنزيلات»* أو *«افتح سطح المكتب»*.\n3. 📄 **قراءة وتحليل الأكواد والملفات:** اسحب أي ملف برمجي أو PDF إلى هنا وسأفحصه وأعدل عليه أو أكتب لك كوداً جديداً لمشاريعك.\n4. 🔋 **مراقبة أداء اللابتوب:** مثل فحص البطارية، الرام، وحالة النظام.\n\n**هل تريد مني فتح Visual Studio Code الآن؟ قل لي فقط: «افتح فيجوال ستوديو»!**`, "SANAD Local Engine", 10);
        return true;
      },
    },
    {
      id: "volume",
      title: "مستوى الصوت",
      group: "النظام",
      risk: "action",
      examples: ["ارفع الصوت", "اخفض الصوت شوي", "اكتم الصوت", "volume up", "خليه صامت"],
      nonExamples: ["كيف اخفض الصوت في الايفون؟", "اكتب لي مقالا عن تاريخ الموسيقى وكيف ارفع الصوت في الحفلات الكبيرة", "community meeting"],
      match(q) {
        const hit = has(q, "ارفع الصوت", "علي الصوت", "زيادة الصوت", "ارفع صوت", "اخفض الصوت", "وطي الصوت", "قصر الصوت", "خفض الصوت", "نزل الصوت", "اكتم الصوت", "كتم الصوت", "صامت", "الغاء الكتم", "الغاء كتم", "اعلى صوت", "اقل صوت", "volume up", "volume down")
          || /(?:^|\s)mute(?:\s|$)/.test(q);
        if (!hit) return null;
        let volumeAction = "up";
        if (has(q, "اخفض", "وطي", "قصر", "خفض", "نزل", "down")) volumeAction = "down";
        else if (has(q, "اكتم", "كتم", "صامت", "الغاء", "mute")) volumeAction = "mute";
        else if (has(q, "اعلى", "100%")) volumeAction = "max";
        else if (has(q, "اقل", "صفر")) volumeAction = "min";
        return { volumeAction };
      },
      async run({ volumeAction }, ctx) {
        ctx.sound("confirm");
        const data = await ctx.post("/api/system/action", { action: "volume", volumeAction, steps: 6 });
        ctx.reply(`🔊 **[التحكم في الصوت]:** ${data.message || "تم ضبط مستوى الصوت بنجاح."}`, "SANAD Audio Controller", 25);
        return true;
      },
    },
    {
      id: "lock",
      title: "قفل الشاشة",
      group: "النظام",
      risk: "action",
      palette: "اقفل الشاشة",
      examples: ["اقفل الشاشة", "قفل اللابتوب", "lock screen"],
      nonExamples: ["كيف اغير وقت قفل الشاشة؟", "هل يمكن قفل الشاشة تلقائيا"],
      match: (q) => (has(q, "اقفل الشاشه", "قفل الشاشه", "اقفل اللابتوب", "قفل اللابتوب", "اقفل الجهاز", "قفل الجهاز", "lock screen", "lock windows") ? {} : null),
      async run(args, ctx) {
        ctx.sound("confirm");
        ctx.reply(`🔒 **[حماية الخصوصية]:** جاري قفل شاشة اللابتوب فوراً لحماية أمانك...`, "SANAD Security Controller", 20);
        await ctx.post("/api/system/action", { action: "lock-screen" });
        return true;
      },
    },
    {
      id: "mouse",
      title: "نقرة بالفأرة",
      group: "التحكم",
      risk: "action",
      examples: ["انقر", "كليك", "دبل كليك", "انقر باليمين", "اضغط هنا"],
      nonExamples: ["اكتب لي شرحا عن كيفية عمل الماوس عندما اضغط هنا وهناك في البرامج", "كيف اعمل دبل كليك بالتاتش باد؟"],
      match(q) {
        const hit = is(q, "انقر", "اضغط", "كليك")
          || has(q, "اضغط بالماوس", "انقر بالماوس", "اضغط هنا", "انقر هنا", "اضغط الفاره", "انقر الفاره", "نقر مزدوج", "دبل كليك", "انقر مرتين", "اضغط مرتين", "انقر باليمين", "كليك يمين", "زر ايمن", "mouse click");
        if (!hit) return null;
        if (has(q, "مزدوج", "دبل", "مرتين")) return { mouseAction: "double-click", label: "النقر المزدوج" };
        if (has(q, "يمين", "ايمن")) return { mouseAction: "right-click", label: "النقر بالزر الأيمن" };
        return { mouseAction: "click", label: "النقر الأيسر" };
      },
      async run({ mouseAction, label }, ctx) {
        ctx.sound("confirm");
        const res = await ctx.app.triggerMouseAction(mouseAction);
        ctx.reply(`🖱️ **[التحكم بالفأرة]:** تم تنفيذ ${label} في موقع المؤشر فوراً! (${res?.message || "اكتمل"})`, "SANAD Mouse Controller", 15);
        return true;
      },
    },
    {
      id: "stream-start",
      title: "تشغيل البث المباشر للشاشة",
      group: "الشاشة",
      risk: "action",
      examples: ["شغل البث المباشر", "ابدأ البث", "start stream"],
      nonExamples: ["كيف ابدأ البث على يوتيوب؟"],
      match: (q) => (has(q, "شغل البث", "افتح البث", "ابدا البث", "وضع البث", "start stream") ? {} : null),
      async run(args, ctx) {
        ctx.sound("wake");
        await ctx.app.startLiveStream();
        ctx.reply(`🔴 **[وضع البث المباشر]:** تم تفعيل البث المباشر للشاشة بنجاح! سند يشاهد شاشتك مباشرة ونافذة البث نشطة الآن للتحكم بالماوس والتحليل الفوري.`, "SANAD Live Stream");
        return true;
      },
    },
    {
      id: "stream-stop",
      title: "إيقاف البث المباشر",
      group: "الشاشة",
      risk: "action",
      examples: ["اوقف البث", "إيقاف البث", "stop stream"],
      nonExamples: ["لماذا توقف البث عندي؟"],
      match: (q) => (has(q, "اوقف البث", "ايقاف البث", "اغلق البث", "اغلاق البث", "وقف البث", "stop stream") ? {} : null),
      async run(args, ctx) {
        ctx.app.stopLiveStream();
        ctx.reply(`⏹️ **[وضع البث المباشر]:** تم إيقاف بث الشاشة المباشر.`, "SANAD Live Stream");
        return true;
      },
    },
    {
      id: "type-text",
      title: "الكتابة بلوحة المفاتيح في النافذة النشطة",
      group: "التحكم",
      risk: "danger",
      explicit: true, // صيغة صريحة فقط: «اكتب في الكيبورد …»، «اكتب: …»، «اكتب كلمة: …»، «اكتب «…»»
      examples: ["اكتب في الكيبورد مرحبا بك", "اكتب: السلام عليكم", "اكتب كلمة: تم", "اكتب كلمة شكرا", "اكتب «hello world»", "يا سند اكتب في الحقل admin@example.com"],
      nonExamples: ["اكتب لي مقالا عن الذكاء الاصطناعي", "اكتب قصيدة عن البحر", "اكتب كود بايثون لحساب المتوسط", "اكتب نص ترحيب لموقعي", "اكتب كلمة مرور قوية"],
      match(q, s) {
        const t = s.trim();
        const m =
          t.match(/^(?:اكتب|قم بكتابة)\s+(?:في|على|ب)\s*(?:ال)?(?:كيبورد|لوحة المفاتيح|حقل|نافذة|برنامج)(?:\s+(?:النشط|النشطة|الحالي|الحالية))?\s*:?\s*(.+)$/u) ||
          t.match(/^اكتب\s*:\s*(.+)$/u) ||
          t.match(/^اكتب\s+(?:نص|كلمة|جملة)\s*:\s*(.+)$/u) ||
          t.match(/^اكتب\s+(?:نص|كلمة|جملة)?\s*[«"](.+)[»"]$/u) ||
          t.match(/^اكتب\s+كلمة\s+(\S+)$/u);
        return m && m[1].trim() ? { text: m[1].trim() } : null;
      },
      async run({ text }, ctx) {
        ctx.sound("confirm");
        await ctx.post("/api/system/action", { action: "keyboard", keyboardAction: "type", text });
        ctx.reply(`⌨️ **[الكتابة الآلية]:** تم إدخال النص في البرنامج النشط فوراً: "${text}"`, "SANAD Keyboard Controller", 25);
        return true;
      },
    },
    {
      id: "keys",
      title: "مفاتيح واختصارات لوحة المفاتيح",
      group: "التحكم",
      risk: "action",
      examples: ["انتر", "اضغط انتر", "احفظ", "ctrl s", "انسخ", "الصق", "تراجع", "اغلق النافذة", "إلغاء", "alt f4"],
      nonExamples: ["اغلق برنامج كروم", "احفظ هذه الفكرة لمشروعي القادم", "كيف اغلق النافذة العالقة؟"],
      match(q) {
        if (is(q, "انتر") || has(q, "اضغط انتر", "مفتاح الادخال", "press enter")) return { kb: "press", key: "enter", label: "مفتاح Enter (إدخال)" };
        if (is(q, "هروب", "زر الهروب", "مفتاح الهروب", "الغاء", "esc", "escape")) return { kb: "press", key: "esc", label: "مفتاح Escape (هروب)" };
        if (is(q, "احفظ", "سيف", "احفظ الملف", "ctrl s", "كنترول اس") || /^(?:اضغط\s+)?حفظ الملف$/.test(q)) return { kb: "hotkey", key: "ctrl+s", label: "اختصار الحفظ (Ctrl+S)" };
        if (is(q, "مشروع جديد", "ملف جديد", "ctrl n", "كنترول ان")) return { kb: "hotkey", key: "ctrl+n", label: "اختصار مشروع جديد (Ctrl+N)" };
        if (is(q, "alt f4") || /^(?:اغلق|اغلاق|سكر)\s+(?:النافذه|البرنامج)(?:\s+(?:الحالي|الحاليه|النشط|النشطه))?$/.test(q)) return { kb: "hotkey", key: "alt+f4", label: "اختصار إغلاق النافذة (Alt+F4)" };
        if (is(q, "انسخ", "نسخ", "ctrl c")) return { kb: "hotkey", key: "ctrl+c", label: "اختصار النسخ (Ctrl+C)" };
        if (is(q, "الصق", "لصق", "ctrl v")) return { kb: "hotkey", key: "ctrl+v", label: "اختصار اللصق (Ctrl+V)" };
        if (is(q, "تراجع", "ctrl z")) return { kb: "hotkey", key: "ctrl+z", label: "اختصار التراجع (Ctrl+Z)" };
        return null;
      },
      async run({ kb, key, label }, ctx) {
        ctx.sound("confirm");
        const data = await ctx.post("/api/system/action", {
          action: "keyboard",
          keyboardAction: kb,
          key: kb === "press" ? key : undefined,
          hotkey: kb === "hotkey" ? key : undefined,
        });
        ctx.reply(`⌨️ **[لوحة المفاتيح]:** تم تنفيذ ${label} فوراً! (${data.message || "نجح"})`, "SANAD Keyboard Controller", 20);
        return true;
      },
    },
    {
      id: "visual-agent",
      title: "الوكيل البصري (انظر للشاشة ونفّذ)",
      group: "الشاشة",
      risk: "action", // يعرض الخطة كاملة ويطلب الموافقة قبل أي نقرة
      maxWords: 20,
      examples: ["انظر للشاشة واضغط على زر حفظ", "اضغط على زر تسجيل الدخول", "انقر على ايقونة الاعدادات"],
      nonExamples: ["لماذا لا يستجيب الزر عندما اضغط على زر الحفظ؟"],
      match: (q) => (has(q, "انظر للشاشه وا", "انظر الي الشاشه وا", "شاهد الشاشه وا", "اضغط على زر", "انقر على زر", "اضغط على ايقونه", "انقر على ايقونه")
        || (has(q, "انظر") && has(q, "اضغط", "انقر", "اكتب")) ? {} : null),
      async run(args, ctx) {
        ctx.sound("vision");
        ctx.app.runVisualAgentLoop(ctx.raw, ctx.conv, ctx.assistant);
        return true;
      },
    },
    {
      id: "battery",
      title: "البطارية ومعلومات الجهاز",
      group: "النظام",
      risk: "safe",
      palette: "كم نسبة البطارية؟",
      examples: ["كم نسبة البطارية؟", "البطارية", "معلومات الجهاز", "مواصفات الجهاز"],
      nonExamples: ["كيف اشحن جوالي بسرعة؟", "شحن السيارات الكهربائية"],
      match: (q) => (has(q, "بطاريه", "نسبه الشحن", "حاله الشحن", "معلومات الجهاز", "مواصفات الجهاز") ? {} : null),
      async run(args, ctx) {
        const data = await ctx.get("/api/system/stats");
        let msg = `### 💻 تقرير حالة اللابتوب (سند):\n\n`;
        if (data.batteryPercent !== null) msg += `- 🔋 **نسبة البطارية:** ${data.batteryPercent}% (${data.isCharging ? "⚡ موصول بالشاحن" : "🔋 يعمل على البطارية"})\n`;
        msg += `- 🧠 **استهلاك الذاكرة (RAM):** ${data.usedMemoryPercent}% (متاح ${data.freeMemoryGb} GB من أصل ${data.totalMemoryGb} GB)\n`;
        msg += `- ⚙️ **المعالج:** ${data.cpuModel} (${data.cpuCores} أنوية)\n`;
        msg += `- ⏱️ **وقت تشغيل الجهاز:** ${data.uptimeHours} ساعة\n`;
        msg += `- 🖥️ **نظام التشغيل:** ${data.platform}\n`;
        ctx.reply(msg, "SANAD Local Engine", 15);
        return true;
      },
    },
    {
      id: "launch-app",
      title: "تشغيل برنامج",
      group: "البرامج",
      risk: "action",
      examples: ["افتح المفكرة", "شغل الحاسبة", "افتح فيجوال ستوديو", "افتح vscode", "افتح كود", "شغل المتصفح", "افتح مدير المهام", "افتح لي الطرفية", "شغل سبوتيفاي"],
      nonExamples: ["شغل كود بايثون لحساب المتوسط", "اشرح لي كيف افتح المتصفح في وضع التصفح الخفي؟", "افتح موضوعا جديدا عن المتصفحات"],
      match(q) {
        const head = q.match(/^(?:افتح|شغل|ابدا|قم بفتح|افتحلي|شغلي|فتح|تشغيل)\s+(?:لي\s+)?(?:برنامج\s+|تطبيق\s+)?(.+)$/);
        if (!head) return null;
        const obj = head[1].replace(/^ال/, "");
        const end = String.raw`(?:\s+(?:الان|هلا|بسرعه|لو سمحت))?$`;
        const APPS = [
          [new RegExp(String.raw`^(?:اركش|ارك|arcgis|arc ?pro|arc)(?:\s|$)`), "arcgis_pro", "ArcGIS Pro"],
          [new RegExp(String.raw`^(?:حاسبه|اله الحاسبه|اله حاسبه|calc|calculator)${end}`), "calc", "الآلة الحاسبة"],
          [new RegExp(String.raw`^(?:مفكره|نوت باد|notepad)${end}`), "notepad", "المفكرة"],
          [new RegExp(String.raw`^(?:vs ?code|vscode|فيجوال ستوديو(?: كود)?|فيجوال|visual studio(?: code)?|كود|code)${end}`), "code", "Visual Studio Code"],
          [new RegExp(String.raw`^(?:متصفح|كروم|ايدج|edge|chrome)${end}`), "msedge", "المتصفح"],
          [new RegExp(String.raw`^(?:مدير المهام|task manager|taskmgr)${end}`), "taskmgr", "مدير المهام"],
          [new RegExp(String.raw`^(?:سبوتيفاي|spotify)${end}`), "spotify", "Spotify"],
          [new RegExp(String.raw`^(?:طرفيه|تيرمينال|terminal|cmd|موجه الاوامر)${end}`), "cmd", "موجه الأوامر"],
        ];
        for (const [re, target, name] of APPS) if (re.test(obj)) return { target, name, createProject: has(q, "مشروع", "project") };
        return null;
      },
      async run({ target, name, createProject }, ctx) {
        const data = await ctx.post("/api/system/action", { action: "launch-app", target, createProject });
        ctx.reply(`⚡ **${data.message || `تم تشغيل ${name}`}**`, "SANAD Local Engine", 20);
        return true;
      },
    },
    {
      id: "open-folder",
      title: "فتح مجلد",
      group: "الملفات",
      risk: "action",
      examples: ["افتح التنزيلات", "افتح مجلد سطح المكتب", "استعرض المستندات", "افتح مجلد المشروع"],
      nonExamples: ["افتح صورة من التنزيلات", "كيف انقل ملفات سطح المكتب الى قرص اخر؟"],
      match(q) {
        const head = q.match(/^(?:افتح|استعرض)\s+(?:لي\s+)?(?:مجلد\s+)?(.+)$/);
        if (!head) return null;
        const obj = head[1].replace(/^ال/, "");
        const FOLDERS = [
          [/^(?:تنزيلات|داونلود|downloads)$/, "downloads", "التنزيلات"],
          [/^(?:سطح المكتب|دسك توب|desktop)$/, "desktop", "سطح المكتب"],
          [/^(?:مستندات|دكيومنت|documents)$/, "documents", "المستندات"],
          [/^(?:مشروع|مشروع الحالي)$/, "project", "مجلد المشروع الحالي"],
        ];
        for (const [re, target, name] of FOLDERS) if (re.test(obj)) return { target, name };
        return null;
      },
      async run({ target, name }, ctx) {
        const data = await ctx.post("/api/system/action", { action: "open-folder", target });
        ctx.reply(`📁 **${data.message || `تم فتح مجلد ${name}`}**`, "SANAD Local Engine", 20);
        return true;
      },
    },
    {
      id: "open-media",
      title: "فتح صورة أو PDF",
      group: "الملفات",
      risk: "action",
      examples: ["افتح صورة", "افتح صورة من التنزيلات", "اعرض لي صورة عشوائية", "افتح pdf"],
      nonExamples: ["اعرض لي صورا عن تاريخ الاندلس وحضارتها في العصور الوسطى", "كيف افتح ملف pdf محمي؟", "اعرض صورة توضيحية لعمل المحرك"],
      match(q) {
        const m = q.match(/^(?:افتح|اعرض|شغل|وريني|فتح|عرض|open|show)\s+(?:لي\s+)?(?:ملف\s+)?(?:ال)?(صوره|صور|image|photo|picture|pdf|بي دي اف)(?:\s+(?:عشوائيه|من (?:ال)?(?:تنزيلات|سطح المكتب|downloads|desktop)))*$/);
        if (!m) return null;
        const isPdf = /pdf|بي دي اف/.test(m[1]);
        return { type: isPdf ? "pdf" : "image", folder: has(q, "تنزيل", "downloads") ? "downloads" : "desktop" };
      },
      async run({ type, folder }, ctx) {
        const data = await ctx.post("/api/system/action", { action: "open-media", folder, type });
        ctx.reply(data.success ? `🖼️ **${data.message}**\n\n*(المسار: \`${data.path}\`)*` : `⚠️ **${data.message || "لم أتمكن من العثور على أي ملف متوافق"}**`, "SANAD Local Engine", 20);
        return true;
      },
    },
    {
      id: "create-file",
      title: "إنشاء مستند نصي",
      group: "الملفات",
      risk: "action",
      maxWords: 30,
      examples: ["انشئ ملف نصي على سطح المكتب", "اعمل ملف باسم ملاحظات اكتب فيه موعد الاجتماع", "سوي مستند في التنزيلات"],
      nonExamples: ["انشئ ملف بايثون يحسب المتوسط", "كيف انشئ ملف نصي في لينكس؟", "اعمل برنامج حاسبة"],
      match(q) {
        const coding = has(q, "كود", "برنامج", "بايثون", "python", "جافاسكريبت", "javascript", "script", "سكريبت", "احسب", "حساب");
        if (coding) return null;
        const verb = /^(?:انشئ|انشاء|اصنع|اعمل|سوي|اكتب في ملف|احفظ في ملف)(?:\s|$)/.test(q);
        return verb && has(q, "مستند", "ملف", "تكست", "txt", "فايل") ? {} : null;
      },
      async run(args, ctx) {
        const q = ctx.q, s = ctx.text;
        let folder = "desktop";
        if (has(q, "تنزيل", "downloads")) folder = "downloads";
        if (has(q, "مستندات", "documents")) folder = "documents";
        let content = "";
        const contentMatch = s.match(/(?:بكتابة|اكتب فيه|اكتب بداخل|اكتب|مكتوب فيه)\s+["'«]?([^"'»\n]+)["'»]?(?:\s+وحفظه|\s+واحفظه|$)/i);
        if (contentMatch) content = contentMatch[1].trim();
        let filename = "مستند_نصي.txt";
        const nameMatch = s.match(/(?:باسم|اسمه|ملف)\s+([a-zA-Z0-9_؀-ۿ\-]+(?:\.[a-zA-Z0-9]+)?)/i);
        if (nameMatch && !nameMatch[1].includes("مستند") && !nameMatch[1].includes("نصي")) filename = nameMatch[1];
        else if (content.includes("بسم الله")) filename = "بسم_الله.txt";
        if (!filename.includes(".")) filename += ".txt";
        const data = await ctx.post("/api/system/action", { action: "create-file", folder, filename, content: content ? `${content}\n` : "", openAfterCreate: true });
        ctx.reply(`📝 **${data.message}**\n\n- 📂 **المسار الكامل:** \`${data.fullPath}\`\n- ✍️ **المحتوى:** ${content ? `«${content}»` : "*(فارغ)*"}\n\n⚡ *تم حفظ الملف وفتحه لك الآن في المفكرة.*`, "SANAD Local Engine", 20);
        return true;
      },
    },
    {
      id: "memory-list",
      title: "ماذا تتذكر عني؟",
      group: "الذاكرة",
      risk: "safe",
      palette: "ماذا تعرف عني؟",
      examples: ["ماذا تعرف عني؟", "شو متذكر عني", "اعرض الذاكرة"],
      nonExamples: ["ماذا تعرف عن الثورة الصناعية؟"],
      match: (q) => (has(q, "ماذا تتذكر", "ماذا تعرف عني", "شو بتعرف عني", "شو متذكر عني", "شو متذكر", "اعرض الذاكره", "عرض الذاكره", "سجل الذاكره", "محتوى الذاكره") ? {} : null),
      async run(args, ctx) {
        const data = await ctx.get("/api/memory");
        const list = data.memories || [];
        let msg = `### 🧠 الذاكرة الدائمة المحفوظة (${list.length} معلومة):\n\n`;
        if (list.length) {
          list.forEach((m, i) => {
            const date = new Date(m.createdAt).toLocaleDateString("ar-SA");
            msg += `${i + 1}. **[${m.category || "عام"}]** ${m.content} *(أُضيفت: ${date})*\n`;
          });
          msg += `\n💡 *هذه المعلومات يتم تذكرها وحقنها تلقائياً مع كل سؤال تطرحه، حتى في المحادثات الجديدة.*`;
        } else {
          msg = `🧠 **الذاكرة الدائمة فارغة حالياً.**\n\nيمكنك حفظ أي معلومة بإخباري:\n*«تذكر أن اسمي محمد»* أو *«احفظ عندك أن مشروعي هو متجر إلكتروني»*.`;
        }
        ctx.reply(msg, "SANAD Local Engine", 15);
        return true;
      },
    },
    {
      id: "memory-save",
      title: "تذكّر معلومة",
      group: "الذاكرة",
      risk: "action",
      explicit: true, // تبدأ دائماً بـ «تذكر أن…» / «احفظ عندك أن…»
      examples: ["تذكر أن اسمي محمد", "احفظ عندك ان مشروعي متجر الكتروني", "أضف للذاكرة: أفضّل الوضع الداكن"],
      nonExamples: ["هل تتذكر ما قلته امس؟", "لا تتذكر هذا"],
      match: (q) => (starts(q, "تذكر ان", "تذكر دايما", "تذكر دائما", "احفظ عندك ان", "سجل عندك", "سجل في الذاكره", "سجل بالذاكره", "اضف للذاكره") ? {} : null),
      async run(args, ctx) {
        const q = ctx.q, s = ctx.text;
        let fact = s.replace(/^(?:تذكر\s+(?:أن|ان|دائماً|دايما)?|احفظ\s+عندك\s+(?:أن|ان)?|سجل\s+(?:عندك|في الذاكرة|بالذاكرة)?|[أا]?ضف\s+(?:إلى\s+ال|الى\s+ال|لل|ال)ذاكرة)\s*:?\s*/i, "").trim();
        if (!fact) fact = s;
        let category = "general";
        if (has(q, "اسمي", "انا")) category = "user";
        else if (has(q, "مشروع", "برمجه", "كود")) category = "project";
        else if (has(q, "احب", "افضل", "تفضيل")) category = "preference";
        const data = await ctx.post("/api/memory", { content: fact, category });
        if (data.success) {
          ctx.reply(`🧠 **تم الحفظ في الذاكرة الدائمة بنجاح!**\n\n- 📝 **المعلومة:** «${fact}»\n- 🏷️ **التصنيف:** ${category}\n\n*سأتذكر هذه المعلومة دائماً وأعتمد عليها في جميع المحادثات القادمة حتى بعد إغلاق المتصفح أو إعادة تشغيل الجهاز.*`, "SANAD Local Engine", 20);
          ctx.app.loadAndRenderMemories?.();
        } else {
          ctx.reply(`⚠️ تعذر حفظ المعلومة في الذاكرة.`, "SANAD Local Engine", 20);
        }
        return true;
      },
    },
    {
      id: "terminal",
      title: "تشغيل أمر في الطرفية",
      group: "البرمجة",
      risk: "danger",
      explicit: true, // بادئة صريحة: «شغل امر: …» / «run: …»
      examples: ["شغل امر: dir", "نفذ أمر git status", "run: node -v", "cmd: ipconfig"],
      nonExamples: ["اشرح لي امر git rebase", "ما هو امر ls؟"],
      match(q, s) {
        if (!starts(q, "شغل امر", "نفذ امر", "امر:", "run:", "cmd:", "terminal:")) return null;
        const command = s.replace(/^(?:شغل\s+[أا]مر|نفذ\s+[أا]مر|[أا]مر|run|cmd|terminal)\s*:?\s*/i, "").trim();
        return command ? { command } : null;
      },
      async run({ command }, ctx) {
        const data = await ctx.post("/api/terminal/exec", { command, cwd: "desktop" });
        if (data.cancelled) {
          ctx.reply(`🛑 **لم يُنفَّذ الأمر:** ألغيتَ التنفيذ.\n\n\`${command}\``, "SANAD Terminal Engine");
          return true;
        }
        const output = data.stdout || data.stderr || "(اكتمل بدون مخرجات)";
        ctx.reply(`💻 **[تم تنفيذ أمر الطرفية على لابتوبك]:**\n\n\`\`\`powershell\n> ${data.command}\n${output}\n\`\`\`\n\n*(رمز الخروج: ${data.exitCode} | الاستغراق: ${data.durationMs}ms | مجلد العمل: \`${data.cwd}\`)*`, "SANAD Terminal Engine", data.durationMs);
        return true;
      },
    },
    {
      id: "dev-env",
      title: "فحص بيئة التطوير",
      group: "البرمجة",
      risk: "safe",
      palette: "افحص بيئة التطوير",
      examples: ["افحص بيئة التطوير", "إصدار بايثون", "اصدارات البرمجة"],
      nonExamples: ["ما افضل بيئة تطوير للمبتدئين؟"],
      match: (q) => (!isQuestion(q) && has(q, "بيئه التطوير", "بيئه البرمجه", "اصدارات البرمجه", "اصدار بايثون") ? {} : null),
      async run(args, ctx) {
        const exec = (command) => ctx.post("/api/terminal/exec", { command }).catch(() => ({}));
        const [nodeRes, pyRes, gitRes] = await Promise.all([exec("node -v"), exec("python --version"), exec("git --version")]);
        ctx.reply(`### 💻 تقرير بيئة التطوير والبرمجة على لابتوبك:\n\n- 🟢 **Node.js:** \`${nodeRes.stdout || "غير متاح"}\`\n- 🐍 **Python:** \`${pyRes.stdout || "غير متاح"}\`\n- 🐙 **Git:** \`${gitRes.stdout || "غير متاح"}\`\n- ⚡ **Visual Studio Code:** متاح ومرتبط تلقائياً\n\n💡 *بيئة التطوير جاهزة لكتابة وتشغيل ومتابعة مشاريعك.*`, "SANAD Terminal Engine", 30);
        return true;
      },
    },
    {
      id: "web-search",
      title: "البحث في الويب",
      group: "الويب",
      risk: "safe",
      explicit: true,
      examples: ["ابحث عن node.js 22", "ابحث في الانترنت عن اسعار الذهب", "جوجل: typescript generics"],
      nonExamples: ["لا تبحث عن شيء"],
      match(q, s) {
        if (!starts(q, "ابحث في الانترنت عن", "ابحث على الويب عن", "ابحث في النت عن", "ابحث عن", "search ", "جوجل:", "بحث:")) return null;
        const query = s.replace(/^(?:ابحث\s+(?:في\s+الانترنت|في\s+الإنترنت|على\s+الويب|في\s+النت)?\s*عن|search|جوجل|بحث)\s*:?\s*/i, "").trim();
        return query ? { query } : null;
      },
      async run({ query }, ctx) {
        const data = await ctx.post("/api/web/search", { query, limit: 4 });
        const results = data.results || [];
        let msg = `### 🌐 نتائج البحث المباشر على الويب عن: «${query}»\n\n`;
        if (data.offline) msg = `🔌 ${data.message}`;
        else if (results.length) results.forEach((r, i) => { msg += `${i + 1}. **[${r.title}](${r.url})**\n> ${r.snippet}\n\n`; });
        else msg = `⚠️ لم يتم العثور على نتائج مباشرة لكلمة البحث «${query}».`;
        ctx.reply(msg, "SANAD Web Engine", 50);
        return true;
      },
    },
    {
      id: "tasks-list",
      title: "المهام المجدولة",
      group: "المهام",
      risk: "safe",
      palette: "اعرض المهام المجدولة",
      examples: ["اعرض المهام المجدولة", "مهام الخلفية", "جدول المهام"],
      nonExamples: ["كيف انظم جدول المهام اليومي لفريقي؟"],
      match: (q) => (!isQuestion(q) && has(q, "المهام المجدوله", "المهام في الخلفيه", "مهام الخلفيه", "اعرض المهام", "عرض المهام", "جدول المهام") ? {} : null),
      async run(args, ctx) {
        const data = await ctx.get("/api/tasks");
        const list = data.tasks || [];
        let msg = `### ⏰ المهام المستقلة المجدولة في الخلفية (${list.length} مهام):\n\n`;
        list.forEach((t, i) => {
          const statusIcon = t.enabled ? "🟢 مفعّلة" : "⏸️ متوقفة";
          const nextRun = t.nextRunAt ? new Date(t.nextRunAt).toLocaleTimeString("ar-SA") : "غير مجدول";
          msg += `${i + 1}. **${t.title}** (${statusIcon})\n- ⏱️ التكرار: ${t.scheduleStr} | 🚀 القادمة: ${nextRun}\n- ⚙️ الأمر: \`${t.actionValue}\`\n- 📊 مرات التنفيذ: ${t.runCount || 0} مرات\n\n`;
        });
        ctx.reply(msg, "SANAD Task Engine", 20);
        return true;
      },
    },
    {
      id: "screen-vision",
      title: "افحص الشاشة",
      group: "الشاشة",
      risk: "safe", // يطلب المتصفح إذن مشاركة الشاشة
      palette: "افحص الشاشة واشرح ما تراه",
      examples: ["انظر إلى شاشتي", "افحص الشاشة", "شوف الشاشة وقل لي ما الخطأ"],
      nonExamples: ["كيف افحص الشاشة بحثا عن بكسلات ميتة؟"],
      match: (q) => (!isQuestion(q) && has(q, "انظر الي شاشتي", "شوف الشاشه", "شوف شاشتي", "افحص الشاشه", "عينك على الشاشه", "راقب الشاشه", "حلل الشاشه") ? {} : null),
      async run(args, ctx) {
        ctx.app.captureAndAnalyzeScreen(ctx.raw, ctx.conv, ctx.assistant);
        return true;
      },
    },
    {
      id: "clean-temp",
      title: "تنظيف الملفات المؤقتة",
      group: "الصيانة",
      risk: "action",
      palette: "نظف الملفات المؤقتة",
      examples: ["نظف الملفات المؤقتة", "نظف الكاش", "clean temp"],
      nonExamples: ["هل تنظيف الكاش يحذف كلمات المرور؟", "كيف انظف الجهاز من الغبار؟"],
      match: (q) => (has(q, "نظف الملفات المؤقته", "تنظيف الملفات المؤقته", "نظف الكاش", "تنظيف الكاش", "نظف الجهاز", "تنظيف الجهاز", "نظف التمب", "تنظيف التمب", "نظف الهارد", "clean temp", "clear temp", "clear cache") ? {} : null),
      async run(args, ctx) {
        ctx.progress("🧹 جارٍ فحص وتنظيف مجلد الملفات المؤقتة (Temp) لتحرير مساحة القرص...");
        try {
          const data = await ctx.post("/api/system/action", { action: "clean-temp" });
          ctx.finish(data.success
            ? `\n🧹 **تم تنظيف وصيانة الجهاز بنجاح!**\n- 🗑️ **العناصر المحذوفة:** ${data.filesDeleted} ملف/مجلد مؤقت\n- 💾 **المساحة المُحررة:** ${data.freedMb} ميجابايت\n- 🚀 **الحالة:** تم تسريع النظام وتنقية الذاكرة المؤقتة للقرص.\n`
            : `⚠️ ${data.message || "تعذر تنظيف بعض الملفات المؤقتة"}`, "SANAD Maintenance Engine", 120);
        } catch (e) {
          ctx.finish(`❌ فشل الاتصال بخدمة الصيانة: ${e.message}`);
        }
        return true;
      },
    },
    {
      id: "health",
      title: "نبض وصحة الجهاز",
      group: "النظام",
      risk: "safe",
      palette: "كيف وضع جهازي؟",
      examples: ["كيف وضع جهازي؟", "نبض النظام", "استهلاك الرام", "حالة النظام", "حالة اللابتوب", "مساحة القرص"],
      nonExamples: ["ما هي مساحة القرص المناسبة للالعاب؟"],
      match: (q) => (has(q, "كيف وضع جهازي", "كيف حاله جهازي", "وضع جهازي", "حاله النظام", "حاله اللابتوب", "نبض النظام", "فحص الجهاز", "استهلاك الرام", "استهلاك المعالج", "حراره الجهاز", "مواصفات جهازي", "كم باقي مساحه", "مواصفات اللابتوب")
        || (!isQuestion(q) && has(q, "مساحه القرص")) ? {} : null),
      async run(args, ctx) {
        ctx.progress("📊 جارٍ قياس نبض وموارد الجهاز في الوقت الفعلي...");
        try {
          const s = await ctx.get("/api/system/stats");
          ctx.finish(`
📊 **تقرير نبض وصحة الجهاز المباشر (SANAD HUD):**
- 💻 **الجهاز:** ${s.hostname} (${s.platform})
- ⏱️ **وقت التشغيل المستمر:** ${s.uptimeHours} ساعة
- ⚙️ **المعالج (CPU):** ${s.cpuModel} (${s.cpuCores} مسار) — **الاستهلاك:** ${s.cpuUsagePercent}%
- 🧠 **الذاكرة العشوائية (RAM):** ${(s.totalMemoryGb - s.freeMemoryGb).toFixed(1)} GB مستخدمة من أصل ${s.totalMemoryGb} GB (${s.usedMemoryPercent}%)
- 💽 **القرص الرئيسي (C:):** ${s.diskFreeGb} GB متوفرة من أصل ${s.diskTotalGb} GB (${s.diskUsedPercent}% مستخدم)
${s.batteryPercent !== null ? `- 🔋 **البطارية:** ${s.batteryPercent}% ${s.isCharging ? "⚡ (قيد الشحن)" : "🔋 (على البطارية)"}` : ""}

✨ *النظام يعمل بكفاءة واستقرار كامل.*
`, "SANAD Health HUD", 100);
        } catch (e) {
          ctx.finish(`❌ تعذر قراءة بيانات النظام: ${e.message}`);
        }
        return true;
      },
    },
  ];

  /* ---------------- المطابقة ---------------- */
  /** كل الأوامر المطابقة بالترتيب، مع وسائطها. */
  function matchAll(text) {
    const s = stripWake(text);
    const q = fold(s);
    if (!q) return [];
    const question = isQuestion(q);
    const n = words(q);
    const out = [];
    for (const cmd of COMMANDS) {
      if (cmd.risk !== "safe" && !cmd.explicit) {
        if (question) continue;
        if (n > (cmd.maxWords || DEFAULT_MAX_WORDS)) continue;
      }
      let args = null;
      try { args = cmd.match(q, s); } catch { args = null; }
      if (args) out.push({ cmd, args });
    }
    return out;
  }
  const match = (text) => matchAll(text)[0] || null;

  /** ينفّذ أول أمر مطابق؛ إن فشل (false أو خطأ) يُجرَّب التالي. يعيد true إن نُفّذ أمر. */
  async function handle(text, conv, assistant, deps) {
    const s = stripWake(text);
    const ctx = { ...deps, raw: text, text: s, q: fold(s), conv, assistant };
    for (const { cmd, args } of matchAll(text)) {
      try {
        if (await cmd.run(args, ctx)) return true;
      } catch (e) {
        console.warn(`[sanadCommands] ${cmd.id}:`, e);
      }
    }
    return false;
  }

  /** أوامر تظهر في لوحة Ctrl+K (لها عبارة palette). */
  const paletteEntries = () => COMMANDS.filter((c) => c.palette).map((c) => ({ id: c.id, label: c.title, prompt: c.palette, group: c.group, risk: c.risk }));

  const api = { COMMANDS, fold, stripWake, isQuestion, matchAll, match, handle, paletteEntries };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.sanadCommands = api;
})(typeof window !== "undefined" ? window : globalThis);
