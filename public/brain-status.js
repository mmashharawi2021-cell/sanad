/* سند — شارة حالة العقل (باتصال / دون اتصال)
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Offline Brain status ======================= */

      const brainBadge = /** @type {HTMLButtonElement} */ (document.getElementById("brainBadge"));
      const brainBadgeDot = document.getElementById("brainBadgeDot");
      const brainBadgeText = document.getElementById("brainBadgeText");
      const islandBrainDot = document.getElementById("islandBrainDot");
      let lastBrainMode = null;
      let lastBrainSetting = null;
      let brainToastTimer = null;

      function showBrainToast(message, ms = 6000) {
        let toast = document.getElementById("brainToast");
        if (!toast) {
          toast = document.createElement("div");
          toast.id = "brainToast";
          toast.className = "brain-toast";
          toast.setAttribute("role", "status");
          document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(brainToastTimer);
        brainToastTimer = setTimeout(() => toast.classList.remove("show"), ms);
      }

      function shortLocalName(id) {
        return String(id || "").replace(/^ollama:/, "");
      }

      function applyBrainStatus(s) {
        let mode = s.mode;
        let text;
        let title;
        if (mode === "cloud") {
          text = "باتصال";
          title = s.localModel ? `متصل بالإنترنت. العقل المحلي الاحتياطي جاهز: ${shortLocalName(s.localModel)}` : "متصل بالإنترنت. لا يوجد عقل محلي احتياطي (ثبّت Ollama ونموذجاً).";
        } else if (mode === "local") {
          const forced = s.setting === "offline";
          text = forced ? "دون اتصال" : "باتصال — محلي مؤقتاً";
          title = `${forced ? "وضع «دون اتصال»: لا يُرسَل أي سؤال إلى الإنترنت." : "لا يوجد إنترنت الآن."} يعمل سند بالعقل المحلي: ${shortLocalName(s.localModel)}${s.warmed ? " (محمّل في الذاكرة)" : ""}`;
        } else {
          text = "لا يوجد عقل";
          title = "لا يوجد إنترنت ولا نموذج محلي. شغّل Ollama ونزّل نموذجاً وأنت متصل.";
        }
        [brainBadgeDot, islandBrainDot].forEach((el) => { if (el) el.setAttribute("data-brain", mode); });
        if (brainBadgeText) brainBadgeText.textContent = text;
        if (brainBadge) brainBadge.title = title + " — انقر لتغيير وضع العمل";
        if (islandBrainDot) islandBrainDot.title = title;

        // التبديل اليدوي من ورقة «وضع العمل» يعرض إشعاره بنفسه
        if (lastBrainMode && lastBrainMode !== mode && lastBrainSetting === s.setting) {
          if (mode === "local") showBrainToast(`🔌 انقطع الإنترنت — سند يعمل الآن بالعقل المحلي (${shortLocalName(s.localModel)}).`);
          else if (mode === "cloud") showBrainToast("🌐 عاد الاتصال بالإنترنت — العودة للنماذج السحابية.");
          else showBrainToast("⚠️ لا يوجد إنترنت ولا نموذج محلي متاح.");
        }
        lastBrainMode = mode;
        lastBrainSetting = s.setting;
      }

      async function refreshBrainStatus(force = false) {
        try {
          const res = await fetch(`/api/brain/status${force === true ? "?force=1" : ""}`);
          const data = await res.json();
          applyBrainStatus(data);
          return data;
        } catch {
          return null;
        }
      }
      window.refreshBrainStatus = refreshBrainStatus;

      // الشارة تفتح ورقة «وضع العمل» (public/mode-picker.js)؛ وإن لم تُحمَّل تعيد الفحص
      if (brainBadge) brainBadge.addEventListener("click", () => (window.sanadModePicker ? window.sanadModePicker.open() : refreshBrainStatus(true)));
      window.addEventListener("online", () => setTimeout(() => refreshBrainStatus(true), 1500));
      window.addEventListener("offline", () => refreshBrainStatus(true));
      refreshBrainStatus();
      setInterval(refreshBrainStatus, 30_000);
