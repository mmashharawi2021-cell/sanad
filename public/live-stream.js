/* سند — البث المباشر للشاشة والتحكم بالفأرة
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Live Stream & Autonomous Mouse Controls ======================= */

      async function triggerMouseAction(actionType = "click") {
        playSciFiSound("confirm");
        try {
          const res = await fetch("/api/system/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "mouse", mouseAction: actionType }),
          });
          const data = await res.json();
          return data;
        } catch (e) {
          console.warn("Mouse action error:", e);
          return { success: false, error: e.message };
        }
      }

      async function startLiveStream() {
        if (liveMediaStream) return;
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            sanadNotify.error("المتصفح لا يدعم مشاركة الشاشة وبثها مباشرة.", "البث المباشر غير متاح");
            return;
          }
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: "always",
              displaySurface: "monitor",
              frameRate: { ideal: 30, max: 60 }
            },
            audio: false
          });
          liveMediaStream = stream;
          if (liveStreamVideo) {
            liveStreamVideo.srcObject = stream;
            await liveStreamVideo.play().catch(() => {});
          }
          if (liveStreamHud) liveStreamHud.classList.add("active");
          if (liveStreamBtn) liveStreamBtn.classList.add("active");
          if (liveStreamLabel) liveStreamLabel.textContent = "إيقاف البث";
          playSciFiSound("wake");

          const track = stream.getVideoTracks()[0];
          if (track) {
            track.onended = () => {
              stopLiveStream();
            };
          }
        } catch (err) {
          console.warn("Failed to start live stream:", err);
          stopLiveStream();
        }
      }

      function stopLiveStream() {
        if (liveMediaStream) {
          liveMediaStream.getTracks().forEach((track) => track.stop());
          liveMediaStream = null;
        }
        if (liveStreamVideo) liveStreamVideo.srcObject = null;
        if (liveStreamHud) liveStreamHud.classList.remove("active");
        if (liveStreamBtn) liveStreamBtn.classList.remove("active");
        if (liveStreamLabel) liveStreamLabel.textContent = "بث مباشر";
      }

      if (liveStreamBtn) {
        liveStreamBtn.addEventListener("click", () => {
          if (liveMediaStream) {
            stopLiveStream();
          } else {
            startLiveStream();
          }
        });
      }

      if (liveCloseBtn) {
        liveCloseBtn.addEventListener("click", stopLiveStream);
      }

      if (liveAskBtn) {
        liveAskBtn.addEventListener("click", () => {
          captureAndAnalyzeScreen("ماذا ترى في الشاشة الآن بالتفصيل؟ اشرح العناصر والمعلومات الظاهرة بدقة وسرعة.");
        });
      }

      if (liveClickBtn) {
        liveClickBtn.addEventListener("click", async () => {
          liveClickBtn.disabled = true;
          await triggerMouseAction("click");
          setTimeout(() => { liveClickBtn.disabled = false; }, 300);
        });
      }

      if (liveDoubleClickBtn) {
        liveDoubleClickBtn.addEventListener("click", async () => {
          liveDoubleClickBtn.disabled = true;
          await triggerMouseAction("double-click");
          setTimeout(() => { liveDoubleClickBtn.disabled = false; }, 400);
        });
      }

      if (liveRightClickBtn) {
        liveRightClickBtn.addEventListener("click", async () => {
          liveRightClickBtn.disabled = true;
          await triggerMouseAction("right-click");
          setTimeout(() => { liveRightClickBtn.disabled = false; }, 300);
        });
      }

      const liveKeyEnterBtn = document.getElementById("liveKeyEnterBtn");
      const liveKeySaveBtn = document.getElementById("liveKeySaveBtn");
      const liveKeyNewBtn = document.getElementById("liveKeyNewBtn");
      const liveKeyEscBtn = document.getElementById("liveKeyEscBtn");

      async function triggerKeyboardAction(options) {
        playSciFiSound("confirm");
        try {
          const res = await fetch("/api/system/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "keyboard", ...options }),
          });
          return await res.json();
        } catch (e) {
          console.warn("Keyboard action error:", e);
          return { success: false, error: e.message };
        }
      }

      if (liveKeyEnterBtn) liveKeyEnterBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "press", key: "enter" }));
      if (liveKeySaveBtn) liveKeySaveBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "hotkey", hotkey: "ctrl+s" }));
      if (liveKeyNewBtn) liveKeyNewBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "hotkey", hotkey: "ctrl+n" }));
      if (liveKeyEscBtn) liveKeyEscBtn.addEventListener("click", () => triggerKeyboardAction({ keyboardAction: "press", key: "esc" }));

      const liveAgentActBtn = document.getElementById("liveAgentActBtn");
      if (liveAgentActBtn) {
        liveAgentActBtn.addEventListener("click", () => {
          const promptVal = promptEl?.value?.trim() || "";
          let goal = promptVal;
          if (!goal) {
            goal = prompt(
              "🤖 ما هي المهمة البصرية التي تريد من سند تنفيذها على الشاشة ذاتياً؟\n(مثال: انقر على New Project، اكتب اسم المشروع 'مشروع_عمان'، واضغط Enter)",
              "انقر على New Project واكتب اسم المشروع واضغط Enter"
            );
          }
          if (goal && goal.trim()) {
            if (promptEl) {
              promptEl.value = "";
              autoGrow();
            }
            runVisualAgentLoop(goal.trim());
          }
        });
      }
