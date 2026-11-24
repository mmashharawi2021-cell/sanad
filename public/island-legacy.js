/* سند — منطق الكبسولة القديمة (#cyberIsland) الذي تغذّي منه Dynamic Island
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Cyber Dynamic Island Logic ======================= */

      let islandExpanded = false;
      let islandOnlyMode = false;

      function setIslandStatus(text, isListening = false) {
        window.sanadIsland?.status(text, isListening); // Dynamic Island (public/ios-island.js)
        if (islandStatusText) islandStatusText.textContent = text;
        if (islandWaves) {
          if (isListening) islandWaves.classList.add("active");
          else islandWaves.classList.remove("active");
        }
      }

      // يحوّل HTML/Markdown من النموذج أو الخادم إلى نص خام بأمان.
      // DOMParser خامل: لا يحمّل صوراً ولا ينفّذ onerror (بخلاف innerHTML ولو على عنصر منفصل).
      function htmlToPlainText(value) {
        if (typeof value !== "string" || !value) return "";
        const doc = new DOMParser().parseFromString(value, "text/html");
        return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
      }
      window.htmlToPlainText = htmlToPlainText;

      function updateIslandLatest(htmlOrText) {
        const plain = htmlToPlainText(htmlOrText);
        window.sanadIsland?.latest(plain);
        if (islandLatestMsg) {
          islandLatestMsg.textContent = plain ? plain.slice(0, 350) : "جاهز للأمر";
        }
      }

      function toggleIslandExpansion(force = null) {
        if (!cyberIsland) return;
        islandExpanded = force !== null ? force : !islandExpanded;
        if (islandExpanded) {
          cyberIsland.classList.remove("floating-collapsed");
          if (islandExpandBtn) islandExpandBtn.textContent = "▴";
        } else {
          cyberIsland.classList.add("floating-collapsed");
          if (islandExpandBtn) islandExpandBtn.textContent = "▾";
        }
      }

      function toggleIslandOnlyMode(force = null) {
        islandOnlyMode = force !== null ? force : !islandOnlyMode;
        app.inert = islandOnlyMode;
        if (islandOnlyMode) app.setAttribute("aria-hidden", "true");
        else app.removeAttribute("aria-hidden");
        if (islandOnlyMode) {
          document.body.classList.add("island-only-mode");
          if (toggleIslandBtn) toggleIslandBtn.classList.add("active");
          setIslandStatus("العرض المصغّر نشط");
          window.sanadIsland?.expand();
          document.querySelector(".dyn-island")?.focus();
          playSciFiSound("wake");
        } else {
          document.body.classList.remove("island-only-mode");
          if (toggleIslandBtn) toggleIslandBtn.classList.remove("active");
          setIslandStatus("جاهز للأمر");
          window.sanadIsland?.collapse();
          promptEl.focus();
          playSciFiSound("confirm");
        }
      }

      if (toggleIslandBtn) toggleIslandBtn.addEventListener("click", () => toggleIslandOnlyMode());
      if (islandToggleModeBtn) islandToggleModeBtn.addEventListener("click", () => toggleIslandOnlyMode(false));
      if (islandExpandBtn) islandExpandBtn.addEventListener("click", () => toggleIslandExpansion());
      if (islandDragHandle) islandDragHandle.addEventListener("click", () => toggleIslandExpansion());

      if (islandForm && islandInput) {
        islandForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const val = islandInput.value.trim();
          if (!val) return;
          islandInput.value = "";
          setIslandStatus("ينفذ...");
          window.sanadIsland?.expand();
          sendMessage(val);
        });
      }


      if (islandVisionBtn) {
        islandVisionBtn.addEventListener("click", () => {
          captureAndAnalyzeScreen();
        });
      }

      if (islandQuickClickBtn) islandQuickClickBtn.addEventListener("click", () => triggerMouseAction("click"));
      if (islandQuickEnterBtn) islandQuickEnterBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "press", key: "enter" }));
      if (islandQuickSaveBtn) islandQuickSaveBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "hotkey", hotkey: "ctrl+s" }));
      if (islandQuickNewBtn) islandQuickNewBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "hotkey", hotkey: "ctrl+n" }));
      if (islandQuickEscBtn) islandQuickEscBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "press", key: "esc" }));
      window.sanadCompactMode = { toggle: toggleIslandOnlyMode };
