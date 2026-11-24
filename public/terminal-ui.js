/* سند — نافذة الطرفية
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= terminal console ======================= */

      function openTerminalModal() {
        if (terminalModalBackdrop) {
          terminalModalBackdrop.classList.add("open");
          terminalInput?.focus();
        }
      }

      function closeTerminalModal() {
        if (terminalModalBackdrop) {
          terminalModalBackdrop.classList.remove("open");
        }
      }

      if (terminalBtn) terminalBtn.addEventListener("click", openTerminalModal);
      if (terminalCloseBtn) terminalCloseBtn.addEventListener("click", closeTerminalModal);
      if (terminalModalBackdrop) {
        terminalModalBackdrop.addEventListener("click", (e) => {
          if (e.target === terminalModalBackdrop) closeTerminalModal();
        });
      }

      async function runConsoleCommand() {
        if (!terminalInput) return;
        const cmd = terminalInput.value.trim();
        if (!cmd) return;

        const shell = terminalShellSelect ? terminalShellSelect.value : "powershell";
        terminalInput.value = "";
        if (terminalRunBtn) terminalRunBtn.disabled = true;

        const entry = document.createElement("div");
        entry.className = "terminal-entry";
        const shellBadge = shell === "python" ? "🐍 Python" : shell === "node" ? "📦 Node" : shell === "git" ? "🐙 Git" : shell === "cmd" ? "💻 CMD" : "⚡ PS";
        entry.innerHTML = `<div class="terminal-cmd-line"><span style="color:var(--accent); font-size:11px; margin-left:6px; font-weight: bold;">[${shellBadge}]</span> &gt; ${escapeHtml(cmd)}</div><div class="terminal-output">جاري التنفيذ… ⏳</div>`;
        terminalLogs?.appendChild(entry);
        terminalBody?.scrollTo(0, terminalBody.scrollHeight);

        try {
          const res = await fetch("/api/terminal/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: cmd, shell, cwd: "desktop" }),
          });
          const data = await res.json();
          const outEl = entry.querySelector(".terminal-output");
          if (outEl) {
            let outText = data.stdout || data.stderr || "(اكتمل بدون مخرجات)";
            if (data.diagnosis) {
              outText += `\n\n💡 [تشخيص سند الذكي]: ${data.diagnosis}`;
              if (data.suggestedFix) outText += `\n🔧 [الحل المقترح]: ${data.suggestedFix}`;
            }
            outEl.textContent = outText;
            if (!data.success) {
              outEl.classList.add("error");
            }
          }
        } catch (err) {
          const outEl = entry.querySelector(".terminal-output");
          if (outEl) {
            outEl.textContent = "خطأ في الاتصال بالخادم: " + err.message;
            outEl.classList.add("error");
          }
        } finally {
          if (terminalRunBtn) terminalRunBtn.disabled = false;
          terminalBody?.scrollTo(0, terminalBody.scrollHeight);
          terminalInput?.focus();
        }
      }

      if (terminalRunBtn) terminalRunBtn.addEventListener("click", runConsoleCommand);
      if (terminalInput) {
        terminalInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runConsoleCommand();
          }
        });
      }
