/* سند — زر «احفظ وشغّل» تحت كتل كود بايثون وجافاسكريبت في ردود سند (المرحلة 4)
   بدل الحفظ والتشغيل التلقائي السابق: لا شيء يُشغَّل إلا بضغطة المستخدم وبعد نافذة تأكيد.
   الكود يُحفظ في سطح المكتب باسم sanad-run-<الوقت>.<py|js> ثم يُشغَّل بـ python أو node،
   وتُضاف المخرجات أسفل الرد نفسه (تُحفظ مع المحادثة). */
(() => {
  const thread = document.getElementById("thread");
  if (!thread) return;

  const LANGS = {
    python: { ext: "py", run: "python" }, py: { ext: "py", run: "python" },
    javascript: { ext: "js", run: "node" }, js: { ext: "js", run: "node" }, node: { ext: "js", run: "node" }, mjs: { ext: "mjs", run: "node" },
  };
  const notify = (o) => window.sanadNotify?.(o);
  const fence = (s) => String(s ?? "").replace(/`/g, "ˋ");
  const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  async function post(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json().catch(() => ({}));
  }

  thread.addEventListener("click", async (event) => {
    const btn = event.target.closest(".code-run");
    if (!btn || btn.disabled) return;
    const lang = LANGS[String(btn.dataset.lang || "").toLowerCase()];
    const code = btn.closest(".code")?.querySelector("code")?.textContent || "";
    if (!lang || !code.trim()) return;

    const file = `sanad-run-${stamp()}.${lang.ext}`;
    const ok = await window.sanadConfirm?.({
      title: "حفظ الكود وتشغيله؟",
      message: `سيُحفظ الكود على سطح المكتب باسم ${file} ثم يُشغَّل بـ ${lang.run}.\nشغّل فقط كوداً قرأته وتثق به.`,
      confirmText: "احفظ وشغّل",
      cancelText: "إلغاء",
      destructive: true,
    });
    if (!ok) return;

    btn.disabled = true;
    btn.textContent = "جارٍ التشغيل…";
    try {
      const saved = await post("/api/system/action", { action: "create-file", path: `Desktop/${file}`, content: code, openAfterCreate: false });
      if (saved.success === false) throw new Error(saved.message || saved.error || "تعذر حفظ الملف");
      const run = await post("/api/terminal/exec", { command: `${lang.run} "${file}"`, cwd: "desktop" });
      const output = run.stdout || run.stderr || run.error || "(اكتمل بدون مخرجات)";
      const block = `---\n> ⚡ **[احفظ وشغّل]:** \`${fence(saved.fullPath || file)}\`\n\n\`\`\`text\n> ${fence(run.command || `${lang.run} ${file}`)}\n${fence(output)}\n\`\`\`\n*(رمز الخروج: ${run.exitCode ?? "—"} | زمن التشغيل: ${run.durationMs ?? "—"}ms)*`;

      // تُضاف المخرجات للرد نفسه في المحادثة (رقمه في data-index)
      const index = Number(btn.closest(".msg")?.dataset.index);
      const conv = typeof activeConv === "function" ? activeConv() : null;
      const message = conv && Number.isInteger(index) ? conv.messages[index] : null;
      if (message) {
        message.content = `${message.content}\n\n${block}`;
        saveState();
        renderThread();
      }
      notify({ type: run.exitCode === 0 ? "success" : "warning", title: run.exitCode === 0 ? "اكتمل التشغيل" : "انتهى التشغيل برمز خطأ", body: file });
    } catch (e) {
      notify({ type: "error", title: "تعذر الحفظ والتشغيل", body: String(e.message || e) });
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = "احفظ وشغّل"; }
    }
  });
})();
