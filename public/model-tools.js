/* سند — تنفيذ أدوات النموذج بأمان (المرحلة 4)
   النموذج يطلب إجراءً بصيغة واحدة فقط (كما في تعليمات config.ts):
     <tool_use><tool_name>اسم_الأداة</tool_name><arguments>{JSON}</arguments></tool_use>
   - تُقرأ الوسوم خارج كتل الكود فقط، والمعطيات بقارئ JSON حقيقي (لا تعابير تخمّن من أي مكان في الرد).
   - أداة خارج القائمة، أو حقل ناقص/زائد/من نوع خاطئ ← لا تنفيذ، ورسالة واضحة في الرد.
   - تُنفَّذ أول أداة صالحة فقط؛ وكل طلب حساس يمر بنافذة التأكيد في api-guard.js قبل وصوله للخادم.
   يعمل في المتصفح (window.sanadModelTools) وفي Node للاختبار (module.exports). */
(function (root) {
  "use strict";

  /* ---------------- مخطط الحقول ---------------- */
  // النوع ("string" | "number" | "string|number" | "files")، req: مطلوب، enum، min/max (للأرقام)، maxLen (لطول النص)
  const S = (o = {}) => ({ type: "string", maxLen: 500, ...o });
  const TEMPLATES = ["web-dashboard", "task-manager", "python-gui", "python-api"];

  const fence = (s) => String(s ?? "").replace(/`/g, "ˋ"); // لا يكسر كتلة الكود في نتيجة الأداة
  const quote = (s) => String(s ?? "").replace(/\s+/g, " ").slice(0, 300);

  const TOOLS = {
    run_command: {
      title: "تشغيل أمر في الطرفية",
      fields: { command: S({ req: true, maxLen: 2000 }), shell: S({ enum: ["powershell", "cmd", "python", "node", "git"] }), cwd: S({ maxLen: 260 }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/terminal/exec", { command: a.command, cwd: a.cwd || "desktop" });
        if (data.cancelled) return `> 🛑 **لم يُنفَّذ الأمر الذي طلبه النموذج:** ألغيتَ التنفيذ.\n\`\`\`powershell\n> ${fence(a.command)}\n\`\`\``;
        const output = data.stdout || data.stderr || data.error || "(اكتمل بدون مخرجات)";
        return `> 💻 **[تم تنفيذ أمر الطرفية على لابتوبك]:**\n\`\`\`powershell\n> ${fence(data.command || a.command)}\n${fence(output)}\n\`\`\`\n*(رمز الخروج: ${data.exitCode ?? "—"} | الاستغراق: ${data.durationMs ?? "—"}ms)*`;
      },
    },
    launch_app: {
      title: "فتح برنامج",
      fields: { appName: S({ req: true, maxLen: 100 }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/system/action", { action: "launch-any-app", target: a.appName });
        return `> 🚀 **[إدارة البرامج والنظام]:** ${quote(data.message || data.error)}`;
      },
    },
    kill_process: {
      title: "إنهاء عملية",
      fields: { process: { type: "string|number", req: true, maxLen: 100, min: 1 } },
      async run(a, ctx) {
        const data = await ctx.post("/api/system/kill-process", { process: a.process });
        return `> 🛑 **[مدير العمليات]:** ${quote(data.message || data.error)}`;
      },
    },
    set_brightness: {
      title: "سطوع الشاشة",
      fields: { percent: { type: "number", req: true, min: 0, max: 100 } },
      async run(a, ctx) {
        const data = await ctx.post("/api/system/brightness", { percent: a.percent });
        return `> ☀️ **[سطوع الشاشة]:** ${quote(data.message || data.error)}`;
      },
    },
    daily_routine: {
      title: "روتين يومي",
      fields: { routine: S({ req: true, enum: ["morning", "focus", "wrapup"] }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/system/routine", { routine: a.routine });
        return `> 🌅 **[الروتين الذكي للإنتاجية]:**\n${quote(data.message || data.error)}`;
      },
    },
    organize_desktop: {
      title: "ترتيب سطح المكتب أو التنزيلات",
      aliases: ["organize_directory"],
      fields: { target: S({ enum: ["desktop", "downloads"] }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/desktop/organize", { target: a.target || "desktop" });
        return `> 🧹 **[أتمتة سطح المكتب الذكية]:** ${quote(data.message || data.error)}`;
      },
    },
    workspace_preset: {
      title: "تجهيز بيئة عمل",
      fields: { preset: S({ req: true, enum: ["coding", "clean", "gis"] }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/desktop/preset", { preset: a.preset });
        return `> 🗂️ **[بيئة العمل]:** ${quote(data.message || data.error)}`;
      },
    },
    create_project: {
      title: "إنشاء مشروع",
      fields: {
        projectName: S({ req: true, maxLen: 60, pattern: /^[\p{L}\p{N}_.-]+$/u, patternHint: "حروف وأرقام و _ . - فقط" }),
        template: S({ enum: TEMPLATES }),
        files: { type: "files", maxItems: 60 },
      },
      async run(a, ctx) {
        const files = a.files || [];
        const data = files.length
          ? await ctx.post("/api/project/create", { projectName: a.projectName, files, openInVsCode: true })
          : await ctx.post("/api/project/build", { name: a.projectName, template: a.template || "web-dashboard" });
        if (data.cancelled) return `> 🛑 **لم يُنشأ المشروع:** ألغيتَ التنفيذ.`;
        const name = (data.project && data.project.name) || a.projectName;
        const where = data.projectPath || (data.project && data.project.path) || "";
        ctx.openProjectPreview?.(name);
        return `> 🚀 **[المطور البرمجي الذاتي]:**\n> 📂 **المشروع:** \`${fence(name)}\`${where ? `\n> 📁 **المسار:** \`${fence(where)}\`` : ""}\n> 🌐 فتحتُ لك المعاينة الحية (نافذة «المشاريع»).`;
      },
    },
    create_file: {
      title: "إنشاء ملف نصي",
      aliases: ["create_text_file", "write_file"],
      fields: { path: S({ req: true, maxLen: 260 }), content: S({ maxLen: 200_000 }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/system/action", { action: "create-file", path: a.path, content: a.content || "", openAfterCreate: true });
        if (data.cancelled) return `> 🛑 **لم يُنشأ الملف:** ألغيتَ التنفيذ.`;
        return `> ⚡ **[إنشاء ملف]:** ${quote(data.message || data.error)}${data.fullPath ? `\n> 📂 **المسار الكامل:** \`${fence(data.fullPath)}\`` : ""}`;
      },
    },
    web_search: {
      title: "بحث في الويب",
      fields: { query: S({ req: true, maxLen: 300 }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/web/search", { query: a.query, limit: 3 });
        if (data.offline) return `🔌 ${quote(data.message)}`;
        const results = data.results || [];
        if (!results.length) return `> ⚠️ لا نتائج للبحث عن «${quote(a.query)}».`;
        return `### 🌐 نتائج البحث على الويب عن: «${quote(a.query)}»\n\n` + results.map((r, i) => `${i + 1}. **[${quote(r.title)}](${r.url})**\n> ${quote(r.snippet)}`).join("\n\n");
      },
    },
    optimize_ram: {
      title: "تحرير الذاكرة",
      fields: {},
      async run(a, ctx) {
        const data = await ctx.post("/api/system/optimize-ram", {});
        return `> ⚡ **[تحرير الذاكرة (RAM Boost)]:**\n${quote(data.message || data.error)}`;
      },
    },
    clean_disk: {
      title: "تنظيف الملفات المؤقتة",
      fields: {},
      async run(a, ctx) {
        const data = await ctx.post("/api/system/clean-disk", {});
        return `> 🧹 **[تنظيف القرص الآمن]:**\n${quote(data.message || data.error)}`;
      },
    },
    inspect_disks: {
      title: "فحص الأقراص",
      fields: {},
      async run(a, ctx) {
        const data = await ctx.get("/api/system/disks");
        const list = (data.drives || []).map((d) => `* **القرص ${quote(d.drive)}** (${quote(d.label || "محلي")}): المتوفر **${d.freeGb} GB** من **${d.totalGb} GB** (${d.usedPercent}% مستخدم)`).join("\n");
        return `> 💽 **[مساعد القرص]:**\n${list || "لا توجد أقراص."}`;
      },
    },
    find_large_files: {
      title: "أكبر الملفات",
      fields: { minSizeMb: { type: "number", min: 1, max: 100_000 }, limit: { type: "number", min: 1, max: 50 } },
      async run(a, ctx) {
        const data = await ctx.post("/api/system/large-files", { minSizeMb: a.minSizeMb ?? 30, limit: a.limit ?? 10 });
        const list = (data.files || []).map((f) => `* **${quote(f.name)}** (${quote(f.sizeFormatted)}) — \`${fence(f.path)}\``).join("\n");
        return `> 📁 **[أكبر الملفات]:**\n${list || "لم يُعثر على ملفات ضخمة."}`;
      },
    },
    open_media: {
      title: "فتح صورة أو PDF",
      aliases: ["open_desktop_image", "open_image"],
      fields: { type: S({ enum: ["image", "pdf"] }), folder: S({ enum: ["desktop", "downloads"] }) },
      async run(a, ctx) {
        const data = await ctx.post("/api/system/action", { action: "open-media", folder: a.folder || "desktop", type: a.type || "image" });
        return `> 🖼️ **[فتح ملف]:** ${quote(data.message || data.error)}`;
      },
    },
  };

  const ALIASES = {};
  for (const [name, t] of Object.entries(TOOLS)) for (const al of t.aliases || []) ALIASES[al] = name;
  ALIASES.execute_command = "run_command";
  ALIASES.open_app = "launch_app";

  /* ---------------- القراءة ---------------- */
  const TAG = /<tool_use>\s*<tool_name>\s*([A-Za-z_][\w]*)\s*<\/tool_name>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/tool_use>/g;

  /** يحجب كتل الكود (``` و `) بمسافات بنفس الطول حتى لا يُقرأ وسم داخل مثال أو شرح. */
  function maskCode(text) {
    return text
      .replace(/```[\s\S]*?(?:```|$)/g, (m) => " ".repeat(m.length))
      .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  }

  function validate(tool, args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return "المعطيات يجب أن تكون كائن JSON.";
    for (const k of Object.keys(args)) if (!(k in tool.fields)) return `حقل غير مسموح: «${k}».`;
    for (const [k, f] of Object.entries(tool.fields)) {
      const v = args[k];
      if (v === undefined || v === null || v === "") {
        if (f.req) return `الحقل «${k}» مطلوب.`;
        continue;
      }
      if (f.type === "files") {
        if (!Array.isArray(v)) return `«${k}» يجب أن يكون قائمة ملفات.`;
        if (v.length > f.maxItems) return `عدد الملفات أكثر من ${f.maxItems}.`;
        for (const file of v) {
          if (!file || typeof file.relativePath !== "string" || typeof file.content !== "string") return "كل ملف يحتاج relativePath و content نصيين.";
          if (/(^|[\\/])\.\.([\\/]|$)/.test(file.relativePath) || /^([a-z]:|[\\/])/i.test(file.relativePath)) return `مسار ملف غير مسموح: «${file.relativePath}».`;
        }
        continue;
      }
      const types = f.type.split("|");
      if (!types.includes(typeof v)) return `«${k}» يجب أن يكون ${f.type === "number" ? "رقماً" : "نصاً"}.`;
      if (typeof v === "number") {
        if (!Number.isFinite(v) || (f.min != null && v < f.min) || (f.max != null && v > f.max)) return `«${k}» خارج المدى المسموح.`;
      } else {
        if (f.maxLen && v.length > f.maxLen) return `«${k}» أطول من المسموح (${f.maxLen} حرف).`;
        if (f.enum && !f.enum.includes(v)) return `قيمة «${k}» غير مسموحة: «${v}». المسموح: ${f.enum.join("، ")}.`;
        if (f.pattern && !f.pattern.test(v)) return `«${k}» غير صالح (${f.patternHint}).`;
      }
    }
    return null;
  }

  /**
   * يقرأ كل وسوم الأدوات خارج كتل الكود.
   * @returns {{ calls: Array<{ name: string, args?: object, error?: string, start: number, end: number }>, mentions: boolean }}
   */
  /** كتلة كود لا تحوي إلا وسم أداة (عادة النماذج الصغيرة) ← الوسم نفسه. أي وسم آخر داخل كود يبقى نصاً. */
  function unwrapFencedCalls(text) {
    return String(text || "").replace(/```[\w-]*[ \t]*\n?\s*(<tool_use>[\s\S]*?<\/tool_use>)\s*```/g, (m, tag) => (/```/.test(tag) ? m : tag));
  }

  function parse(text) {
    const src = unwrapFencedCalls(text);
    const masked = maskCode(src);
    const calls = [];
    for (const m of masked.matchAll(TAG)) {
      const start = m.index, end = m.index + m[0].length;
      const raw = src.slice(start, end).match(new RegExp(TAG.source))[2];
      const name = ALIASES[m[1]] || m[1];
      const tool = TOOLS[name];
      if (!tool) { calls.push({ name: m[1], error: `أداة غير معروفة: «${m[1]}».`, start, end }); continue; }
      let args;
      try { args = JSON.parse(raw.trim() || "{}"); } catch { calls.push({ name, error: "معطيات JSON غير صالحة.", start, end }); continue; }
      const error = validate(tool, args);
      calls.push(error ? { name, error, start, end } : { name, args, start, end });
    }
    // وسم أداة مكسور (لا يطابق الصيغة) خارج الكود: لا يُنفَّذ، لكن نذكر ذلك للمستخدم
    const mentions = calls.length === 0 && /<\/?tool_use>|<tool_name>/.test(masked);
    return { calls, mentions };
  }

  /** يزيل وسوم الأدوات المقروءة من نص الرد. */
  function stripCalls(text, calls) {
    let out = String(text || "");
    for (const c of [...calls].sort((a, b) => b.start - a.start)) out = out.slice(0, c.start) + out.slice(c.end);
    return out.replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * ينفّذ أول أداة صالحة. يعيد null إن لم يكن في الرد طلب أداة، وإلا { content } — نص الرد بعد الإجراء.
   * ctx: { get(path), post(path, body), sound?(name), openProjectPreview?(name) }
   */
  async function execute(text, ctx) {
    const { calls, mentions } = parse(text);
    if (!calls.length) {
      return mentions ? { content: `${String(text).trim()}\n\n> ⚠️ **لم يُنفَّذ أي إجراء:** طلب الأداة في الرد ليس بالصيغة المعتمدة.` } : null;
    }
    const base = stripCalls(unwrapFencedCalls(text), calls);
    const notes = [];
    const valid = calls.find((c) => !c.error);
    for (const c of calls) if (c.error) notes.push(`> ⚠️ **لم يُنفَّذ طلب الأداة \`${fence(c.name)}\`:** ${c.error}`);
    if (valid && calls.filter((c) => !c.error).length > 1) notes.push("> ℹ️ طلب النموذج أكثر من إجراء؛ نُفِّذ الأول فقط.");
    let result = "";
    if (valid) {
      try {
        result = await TOOLS[valid.name].run(valid.args, ctx);
        ctx.sound?.("action");
      } catch (e) {
        result = `> ❌ **تعذر تنفيذ «${TOOLS[valid.name].title}»:** ${quote(e && e.message ? e.message : e)}`;
      }
    }
    return { content: [base, result, ...notes].filter(Boolean).join("\n\n"), executed: valid ? valid.name : null };
  }

  const api = { TOOLS, ALIASES, parse, validate, stripCalls, execute, maskCode, unwrapFencedCalls };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.sanadModelTools = api;
})(typeof window !== "undefined" ? window : globalThis);
