/* سند — نافذة نبض النظام وفاحص القرص
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= System Stats & Disk Inspector HUD ======================= */

      async function loadAndRenderSysStats() {
        if (!sysGrid) return;
        try {
          const [statsRes, disksRes, healthRes] = await Promise.all([
            fetch("/api/system/stats"),
            fetch("/api/system/disks").catch(() => null),
            fetch("/api/system/health").catch(() => null),
          ]);
          if (!statsRes.ok) return;
          const s = await statsRes.json();
          const disksData = disksRes && disksRes.ok ? await disksRes.json() : null;
          const healthData = healthRes && healthRes.ok ? await healthRes.json() : null;

          const healthScore = (healthData && healthData.health && healthData.health.healthScore) || 100;
          const healthRating = (healthData && healthData.health && healthData.health.healthRating) || "ممتاز";

          if (sysDeviceMeta) {
            sysDeviceMeta.innerHTML = `💻 <strong>${escapeHtml(s.hostname)}</strong> • ${escapeHtml(s.platform)} • ⏱️ يعمل منذ ${escapeHtml(s.uptimeHours)} ساعة • <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; background: rgba(35, 134, 54, 0.2); color: #3fb950; font-size: 11.5px; font-weight: 700;">درجة الصحة: ${healthScore}% (${healthRating})</span>`;
          }

          const cpuClass = s.cpuUsagePercent > 85 ? "danger" : s.cpuUsagePercent > 60 ? "warning" : "";
          const ramClass = s.usedMemoryPercent > 88 ? "danger" : s.usedMemoryPercent > 70 ? "warning" : "";
          const batClass = (s.batteryPercent || 100) < 15 ? "danger" : (s.batteryPercent || 100) < 30 ? "warning" : "";

          sysGrid.innerHTML = `
            <div class="sys-metric-card">
              <div class="sys-metric-head">
                <span>⚙️ المعالج (CPU)</span>
                <span style="font-size: 11px; opacity: 0.7;">${s.cpuCores} مسار</span>
              </div>
              <div class="sys-metric-val">${s.cpuUsagePercent}%</div>
              <div class="sys-bar-track">
                <div class="sys-bar-fill ${cpuClass}" style="width: ${Math.min(100, s.cpuUsagePercent)}%;"></div>
              </div>
              <div class="sys-metric-sub" title="${escapeHtml(s.cpuModel)}">${escapeHtml(String(s.cpuModel).slice(0, 32))}…</div>
            </div>

            <div class="sys-metric-card">
              <div class="sys-metric-head">
                <span>🧠 الذاكرة (RAM)</span>
                <span style="font-size: 11px; opacity: 0.7;">${s.totalMemoryGb} GB</span>
              </div>
              <div class="sys-metric-val">${s.usedMemoryPercent}%</div>
              <div class="sys-bar-track">
                <div class="sys-bar-fill ${ramClass}" style="width: ${Math.min(100, s.usedMemoryPercent)}%;"></div>
              </div>
              <div class="sys-metric-sub">${(s.totalMemoryGb - s.freeMemoryGb).toFixed(1)} GB مستخدمة • ${s.freeMemoryGb} GB حرة</div>
            </div>

            <div class="sys-metric-card">
              <div class="sys-metric-head">
                <span>💽 سعة الأقراص</span>
                <span style="font-size: 11px; opacity: 0.7;">${disksData && disksData.drives ? disksData.drives.length + " أقسام" : "C:"}</span>
              </div>
              <div class="sys-metric-val">${s.diskUsedPercent}%</div>
              <div class="sys-bar-track">
                <div class="sys-bar-fill" style="width: ${Math.min(100, s.diskUsedPercent)}%;"></div>
              </div>
              <div class="sys-metric-sub">${s.diskFreeGb} GB متوفرة على قرص النظام (C:)</div>
            </div>

            <div class="sys-metric-card">
              <div class="sys-metric-head">
                <span>🔋 الطاقة والبطارية</span>
                <span style="font-size: 11px; opacity: 0.7;">${s.isCharging ? "⚡ قيد الشحن" : "🔌 على الطاقة"}</span>
              </div>
              <div class="sys-metric-val">${s.batteryPercent !== null ? s.batteryPercent + "%" : "100%"}</div>
              <div class="sys-bar-track">
                <div class="sys-bar-fill ${batClass}" style="width: ${s.batteryPercent !== null ? s.batteryPercent : 100}%;"></div>
              </div>
              <div class="sys-metric-sub">${s.batteryPercent !== null ? (s.isCharging ? "الشاحن متصل ومستقر" : "تعمل على طاقة البطارية") : "مصدر كهربائي متصل"}</div>
            </div>
          `;

          // Render hard drives
          if (sysDrivesContainer && disksData && disksData.drives) {
            sysDrivesContainer.innerHTML = disksData.drives
              .map((d) => {
                const statusColor = d.status === "critical" ? "#f85149" : d.status === "warning" ? "#d29922" : "#3fb950";
                const statusBg = d.status === "critical" ? "rgba(248,81,73,0.15)" : d.status === "warning" ? "rgba(210,153,34,0.15)" : "rgba(63,185,80,0.15)";
                return `
                <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 700; font-size: 13.5px;">💽 القرص ${escapeHtml(d.drive)} ${d.label ? `(${escapeHtml(d.label)})` : ""}</span>
                    <span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: ${statusBg}; color: ${statusColor}; font-weight: 600;">${d.usedPercent}% مستخدم</span>
                  </div>
                  <div class="sys-bar-track" style="margin-bottom: 8px; height: 8px;">
                    <div class="sys-bar-fill ${d.status === 'critical' ? 'danger' : d.status === 'warning' ? 'warning' : ''}" style="width: ${d.usedPercent}%;"></div>
                  </div>
                  <div style="font-size: 11.5px; color: var(--muted); display: flex; justify-content: space-between;">
                    <span>المساحة الحرة: <strong style="color: var(--text);">${d.freeGb} GB</strong></span>
                    <span>الإجمالي: ${escapeHtml(d.totalGb)} GB (${escapeHtml(d.fileSystem)})</span>
                  </div>
                </div>
              `;
              })
              .join("");
          }
        } catch (e) {
          console.warn("[sysStats error]", e);
        }
      }

      async function triggerOptimizeRam() {
        if (typeof setIslandStatus === "function") setIslandStatus("يحرر الذاكرة...", true);
        if (sysOptimizeRamBtn) {
          sysOptimizeRamBtn.disabled = true;
          sysOptimizeRamBtn.textContent = "⏳ جارٍ تسريع الرام...";
        }
        try {
          const res = await fetch("/api/system/optimize-ram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          const data = await res.json();
          playSciFiSound("action");
          sanadNotify({ type: data.success === false ? "error" : "success", title: "تحرير الذاكرة", body: data.message });
          if (typeof updateIslandLatest === "function") updateIslandLatest(data.message);
          await loadAndRenderSysStats();
        } catch (e) {
          sanadNotify.error(e.message, "تعذّر تحرير الذاكرة");
        } finally {
          if (sysOptimizeRamBtn) {
            sysOptimizeRamBtn.disabled = false;
            sysOptimizeRamBtn.textContent = "⚡ تحرير الرام (RAM Boost)";
          }
          if (typeof setIslandStatus === "function") setIslandStatus("جاهز للأمر", false);
        }
      }
      window.triggerOptimizeRam = triggerOptimizeRam;

      async function triggerCleanDisk() {
        if (typeof setIslandStatus === "function") setIslandStatus("ينظف القرص...", true);
        if (sysCleanTempBtn) {
          sysCleanTempBtn.disabled = true;
          sysCleanTempBtn.textContent = "⏳ جارٍ التنظيف...";
        }
        try {
          const res = await fetch("/api/system/clean-disk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          const data = await res.json();
          playSciFiSound("action");
          sanadNotify({ type: data.success === false ? "error" : "success", title: "تنظيف القرص", body: data.message });
          if (typeof updateIslandLatest === "function") updateIslandLatest(data.message);
          await loadAndRenderSysStats();
        } catch (e) {
          sanadNotify.error(e.message, "تعذّر تنظيف القرص");
        } finally {
          if (sysCleanTempBtn) {
            sysCleanTempBtn.disabled = false;
            sysCleanTempBtn.textContent = "🧹 تنظيف القرص الآمن";
          }
          if (typeof setIslandStatus === "function") setIslandStatus("جاهز للأمر", false);
        }
      }
      window.triggerCleanDisk = triggerCleanDisk;

      async function scanLargeFiles() {
        if (!sysLargeFilesList) return;
        if (sysScanLargeFilesBtn) {
          sysScanLargeFilesBtn.disabled = true;
          sysScanLargeFilesBtn.textContent = "⏳ جارٍ فحص القرص...";
        }
        sysLargeFilesList.innerHTML = `<div style="font-size: 12px; color: var(--muted); text-align: center; padding: 16px;">🔍 جاري فحص ملفات سطح المكتب والتنزيلات والمستندات لاكتشاف أكبر العناصر...</div>`;
        try {
          const res = await fetch("/api/system/large-files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minSizeMb: 30, limit: 12 }),
          });
          const data = await res.json();
          playSciFiSound("confirm");

          if (!data.files || data.files.length === 0) {
            sysLargeFilesList.innerHTML = `<div style="font-size: 12px; color: var(--muted); text-align: center; padding: 12px;">✅ لم يتم العثور على ملفات ضخمة فوق 30 ميجابايت في المجلدات الرئيسية. القرص بحالة ممتازة!</div>`;
            return;
          }

          sysLargeFilesList.innerHTML = data.files
            .map((f) => {
              const icon = f.category === "video" ? "🎬" : f.category === "archive" ? "📦" : f.category === "installer" ? "🚀" : f.category === "audio" ? "🎵" : f.category === "data" ? "📊" : "📄";
              return `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;">
                  <span style="font-size: 16px;">${icon}</span>
                  <div style="overflow: hidden;">
                    <div style="font-size: 12.5px; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${escapeHtml(f.path)}">${escapeHtml(f.name)}</div>
                    <div style="font-size: 11px; color: var(--muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${escapeHtml(f.directory)}">${escapeHtml(f.directory)}</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 12px; font-weight: 700; color: #d29922; background: rgba(210,153,34,0.12); padding: 2px 8px; border-radius: 4px;">${escapeHtml(f.sizeFormatted)}</span>
                  <button type="button" class="reveal-file-btn" data-path="${escapeHtml(f.path)}" style="background: var(--surface); color: var(--accent); border: 1px solid var(--border); border-radius: 4px; padding: 3px 8px; font-size: 11.5px; cursor: pointer;" title="إظهار في مستكشف الملفات">📂 إظهار</button>
                </div>
              </div>
            `;
            })
            .join("");
          // بدل onclick المضمّن: اسم الملف قد يحتوي ' و ) فيحقن JavaScript
          /** @type {NodeListOf<HTMLElement>} */ (sysLargeFilesList.querySelectorAll(".reveal-file-btn")).forEach((btn) => {
            btn.addEventListener("click", () => revealFileInExplorer(btn.dataset.path || ""));
          });
        } catch (e) {
          sysLargeFilesList.innerHTML = `<div style="font-size: 12px; color: #f85149; text-align: center; padding: 12px;">حدث خطأ أثناء فحص الملفات: ${escapeHtml(e.message)}</div>`;
        } finally {
          if (sysScanLargeFilesBtn) {
            sysScanLargeFilesBtn.disabled = false;
            sysScanLargeFilesBtn.textContent = "🔍 فحص أكبر الملفات الآن";
          }
        }
      }
      window.scanLargeFiles = scanLargeFiles;

      async function revealFileInExplorer(filePath) {
        try {
          const res = await fetch("/api/system/reveal-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath }),
          });
          const data = await res.json();
          playSciFiSound("action");
        } catch (e) {
          console.warn("[revealFile error]", e);
        }
      }
      window.revealFileInExplorer = revealFileInExplorer;

      function openSysStatsModal() {
        if (sysStatsModalBackdrop) {
          sysStatsModalBackdrop.classList.add("open");
          loadAndRenderSysStats();
        }
      }

      function closeSysStatsModal() {
        if (sysStatsModalBackdrop) {
          sysStatsModalBackdrop.classList.remove("open");
          if (sysCleanAlert) sysCleanAlert.style.display = "none";
        }
      }

      if (sysStatsBtn) sysStatsBtn.addEventListener("click", openSysStatsModal);
      if (sysStatsCloseBtn) sysStatsCloseBtn.addEventListener("click", closeSysStatsModal);
      if (sysStatsModalBackdrop) {
        sysStatsModalBackdrop.addEventListener("click", (e) => {
          if (e.target === sysStatsModalBackdrop) closeSysStatsModal();
        });
      }

      if (sysRefreshBtn) sysRefreshBtn.addEventListener("click", () => loadAndRenderSysStats());
      if (sysCleanTempBtn) sysCleanTempBtn.addEventListener("click", triggerCleanDisk);
      if (sysOptimizeRamBtn) sysOptimizeRamBtn.addEventListener("click", triggerOptimizeRam);
      if (sysScanLargeFilesBtn) sysScanLargeFilesBtn.addEventListener("click", scanLargeFiles);

      if (islandRamBoostBtn) islandRamBoostBtn.addEventListener("click", triggerOptimizeRam);
      if (islandDiskCleanBtn) islandDiskCleanBtn.addEventListener("click", triggerCleanDisk);
