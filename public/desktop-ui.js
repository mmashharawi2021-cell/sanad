/* سند — نافذة سطح المكتب والتنزيلات
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Desktop & Files Automation ======================= */

      async function refreshDesktopStatus() {
        if (desktopFilesSummary) desktopFilesSummary.textContent = "جاري فحص الملفات المبعثرة...";
        if (downloadsFilesSummary) downloadsFilesSummary.textContent = "جاري فحص التنزيلات...";

        try {
          const [dRes, dlRes] = await Promise.all([
            fetch("/api/desktop/status?target=desktop"),
            fetch("/api/desktop/status?target=downloads"),
          ]);
          if (dRes.ok) {
            const data = await dRes.json();
            if (desktopFilesSummary) {
              desktopFilesSummary.textContent = `يوجد ${data.looseFilesCount || 0} ملف بحاجة لتنظيم • ${data.foldersCount || 0} مجلد • ${data.shortcutsCount || 0} اختصار`;
            }
          }
          if (dlRes.ok) {
            const data = await dlRes.json();
            if (downloadsFilesSummary) {
              downloadsFilesSummary.textContent = `يوجد ${data.looseFilesCount || 0} ملف في التنزيلات • ${data.foldersCount || 0} مجلد`;
            }
          }
        } catch (e) {
          console.warn("[desktop status error]", e);
        }
      }

      function openDesktopModal() {
        if (desktopModalBackdrop) {
          desktopModalBackdrop.classList.add("open");
          refreshDesktopStatus();
        }
      }

      function closeDesktopModal() {
        if (desktopModalBackdrop) {
          desktopModalBackdrop.classList.remove("open");
          if (desktopStatusAlert) desktopStatusAlert.style.display = "none";
        }
      }

      async function triggerDesktopOrganize(target = "desktop") {
        const btn = target === "desktop" ? runOrganizeDesktopBtn : runOrganizeDownloadsBtn;
        const origText = btn ? btn.textContent : "";
        if (btn) {
          btn.disabled = true;
          btn.textContent = "جارٍ الفرز والتنظيم بأمان...";
        }
        if (typeof setIslandStatus === "function") setIslandStatus("ينظم الملفات...", true);

        try {
          const res = await fetch("/api/desktop/organize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target }),
          });
          const data = await res.json();
          sanadNotify({ type: data.success === false ? "error" : "success", title: "تنظيم الملفات", body: data.message });
          playSciFiSound("confirm");
          if (typeof updateIslandLatest === "function") updateIslandLatest(data.message);
          refreshDesktopStatus();
        } catch (e) {
          sanadNotify.error(e.message, "تعذّر تنظيم الملفات");
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = origText;
          }
          if (typeof setIslandStatus === "function") setIslandStatus("جاهز للأمر", false);
        }
      }

      async function triggerWorkspacePreset(preset = "gis") {
        if (typeof setIslandStatus === "function") setIslandStatus("يجهز بيئة العمل...", true);
        try {
          const res = await fetch("/api/desktop/preset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preset }),
          });
          const data = await res.json();
          sanadNotify({ type: data.success === false ? "error" : "success", title: "بيئة العمل", body: data.message });
          playSciFiSound("action");
          if (typeof updateIslandLatest === "function") updateIslandLatest(data.message);
        } catch (e) {
          sanadNotify.error(e.message, "تعذّر تجهيز بيئة العمل");
        } finally {
          if (typeof setIslandStatus === "function") setIslandStatus("جاهز للأمر", false);
        }
      }

      if (desktopManagerBtn) desktopManagerBtn.addEventListener("click", openDesktopModal);
      if (desktopCloseBtn) desktopCloseBtn.addEventListener("click", closeDesktopModal);
      if (desktopModalBackdrop) {
        desktopModalBackdrop.addEventListener("click", (e) => {
          if (e.target === desktopModalBackdrop) closeDesktopModal();
        });
      }

      if (runOrganizeDesktopBtn) runOrganizeDesktopBtn.addEventListener("click", () => triggerDesktopOrganize("desktop"));
      if (runOrganizeDownloadsBtn) runOrganizeDownloadsBtn.addEventListener("click", () => triggerDesktopOrganize("downloads"));
      if (islandOrganizeDesktopBtn) islandOrganizeDesktopBtn.addEventListener("click", () => triggerDesktopOrganize("desktop"));

      if (presetGisBtn) presetGisBtn.addEventListener("click", () => triggerWorkspacePreset("gis"));
      if (presetCodingBtn) presetCodingBtn.addEventListener("click", () => triggerWorkspacePreset("coding"));
      if (presetCleanBtn) presetCleanBtn.addEventListener("click", () => triggerWorkspacePreset("clean"));

      async function triggerDailyRoutine(routine = "morning") {
        if (typeof setIslandStatus === "function") setIslandStatus("ينفذ الروتين...", true);
        try {
          const res = await fetch("/api/system/routine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routine }),
          });
          const data = await res.json();
          playSciFiSound("action");
          if (typeof updateIslandLatest === "function") updateIslandLatest(data.message);
        } catch (e) {
          sanadNotify.error(e.message, "تعذّر تشغيل الروتين");
        } finally {
          if (typeof setIslandStatus === "function") setIslandStatus("جاهز للأمر", false);
        }
      }

      if (islandRoutineMorningBtn) islandRoutineMorningBtn.addEventListener("click", () => triggerDailyRoutine("morning"));
      if (islandRoutineFocusBtn) islandRoutineFocusBtn.addEventListener("click", () => triggerDailyRoutine("focus"));
      if (islandRoutineWrapupBtn) islandRoutineWrapupBtn.addEventListener("click", () => triggerDailyRoutine("wrapup"));
