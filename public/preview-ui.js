/* سند — بناء المشاريع والمعاينة الحية
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Autonomous Project Builder & Live Web Preview ======================= */

      // آخر قائمة من الخادم: { name, hasPreview } — hasPreview = في المشروع index.html
      let previewProjects = [];

      /** رسالة داخل إطار المعاينة بدل خطأ 404 لمشروع بلا صفحة ويب (مثل مشروع Python أو Node). */
      function showNoPreview(projectName) {
        if (!projectPreviewIframe) return;
        const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
        projectPreviewIframe.removeAttribute("src");
        projectPreviewIframe.srcdoc = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;font:15px system-ui,sans-serif;background:#1c1c1e;color:#ebebf5;text-align:center;padding:24px">
<div><p style="font-size:17px;font-weight:600;margin:0 0 8px">لا توجد معاينة ويب لهذا المشروع</p>
<p style="margin:0;color:#98989f">«${esc(projectName)}» لا يحتوي ملف index.html. افتحه في VS Code، أو اختر مشروعاً آخر من القائمة.</p></div></body></html>`;
      }

      async function refreshProjectListDropdown() {
        if (!previewProjectSelect) return;
        try {
          const res = await fetch("/api/project/list");
          const data = await res.json();
          if (data && data.projects) {
            previewProjects = data.projects;
            previewProjectSelect.innerHTML = "";
            if (data.projects.length === 0) {
              const opt = document.createElement("option");
              opt.value = "";
              opt.textContent = "لا توجد مشاريع منشأة بعد";
              previewProjectSelect.appendChild(opt);
              return;
            }
            data.projects.forEach((p) => {
              const opt = document.createElement("option");
              opt.value = p.name;
              opt.textContent = `${p.name} (${p.template || "custom"})`;
              previewProjectSelect.appendChild(opt);
            });
          }
        } catch (e) {
          console.warn("[refreshProjectListDropdown]", e);
        }
      }

      async function openProjectPreview(projectName, file = "index.html") {
        if (!previewModalBackdrop) return;
        await refreshProjectListDropdown();
        if (!projectName) {
          // الافتراضي: أول مشروع فيه صفحة ويب قابلة للمعاينة، لا أول مشروع في القائمة
          projectName = previewProjects.find((p) => p.hasPreview)?.name || (previewProjectSelect && previewProjectSelect.value) || "";
        }
        if (!projectName) {
          try {
            const buildRes = await fetch("/api/project/build", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ template: "web-dashboard", name: "sanad-live-dashboard" }),
            });
            const buildData = await buildRes.json();
            projectName = (buildData.project && buildData.project.name) || "sanad-live-dashboard";
            await refreshProjectListDropdown();
          } catch (_) {
            projectName = "sanad-live-dashboard";
          }
        }

        if (previewProjectName) previewProjectName.textContent = projectName;
        if (previewProjectSelect) previewProjectSelect.value = projectName;
        const info = previewProjects.find((p) => p.name === projectName);
        if (info && !info.hasPreview && file === "index.html") {
          showNoPreview(projectName);
        } else if (projectPreviewIframe) {
          projectPreviewIframe.removeAttribute("srcdoc");
          projectPreviewIframe.src = `/api/project/preview?project=${encodeURIComponent(projectName)}&file=${encodeURIComponent(file)}&t=${Date.now()}`;
        }
        previewModalBackdrop.dataset.activeProject = projectName;
        previewModalBackdrop.dataset.activeFile = file;
        previewModalBackdrop.classList.add("open");
        playSciFiSound("action");
      }
      window.openProjectPreview = openProjectPreview;

      function closeProjectPreview() {
        if (!previewModalBackdrop) return;
        previewModalBackdrop.classList.remove("open");
        if (projectPreviewIframe) {
          projectPreviewIframe.removeAttribute("srcdoc"); // srcdoc يتقدّم على src
          projectPreviewIframe.src = "about:blank";
        }
      }
      window.closeProjectPreview = closeProjectPreview;

      if (projectPreviewBtn) projectPreviewBtn.addEventListener("click", () => openProjectPreview());
      if (islandProjectsBtn) islandProjectsBtn.addEventListener("click", () => openProjectPreview());
      if (previewCloseBtn) previewCloseBtn.addEventListener("click", closeProjectPreview);
      if (previewModalBackdrop) {
        previewModalBackdrop.addEventListener("click", (e) => {
          if (e.target === previewModalBackdrop) closeProjectPreview();
        });
      }

      if (previewProjectSelect) {
        previewProjectSelect.addEventListener("change", () => {
          const sel = previewProjectSelect.value;
          if (sel) openProjectPreview(sel, "index.html");
        });
      }

      if (previewRefreshBtn) {
        previewRefreshBtn.addEventListener("click", () => {
          if (projectPreviewIframe && projectPreviewIframe.src && projectPreviewIframe.src !== "about:blank") {
            const cur = new URL(projectPreviewIframe.src);
            cur.searchParams.set("t", Date.now().toString());
            projectPreviewIframe.src = cur.toString();
            playSciFiSound("confirm");
          }
        });
      }

      if (previewOpenTabBtn) {
        previewOpenTabBtn.addEventListener("click", () => {
          if (projectPreviewIframe && projectPreviewIframe.src && projectPreviewIframe.src !== "about:blank") {
            window.open(projectPreviewIframe.src, "_blank");
          }
        });
      }

      if (previewOpenCodeBtn) {
        previewOpenCodeBtn.addEventListener("click", async () => {
          const actProj = previewModalBackdrop ? previewModalBackdrop.dataset.activeProject : "";
          if (actProj) {
            try {
              await fetch("/api/system/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "launch-any-app",
                  // مسار نسبي من مجلد المستخدم؛ الخادم يحلّه (لا اسم مستخدم مكتوب في الواجهة)
                  target: `code "Desktop\\${actProj}"`,
                }),
              });
              playSciFiSound("action");
            } catch (e) {
              console.warn("[openInVsCode error]", e);
            }
          }
        });
      }

      if (previewDesktopBtn && previewMobileBtn && projectPreviewIframe) {
        previewDesktopBtn.addEventListener("click", () => {
          projectPreviewIframe.style.width = "100%";
          projectPreviewIframe.style.maxWidth = "100%";
          previewDesktopBtn.style.background = "var(--brand)";
          previewDesktopBtn.style.color = "var(--on-brand)";
          previewMobileBtn.style.background = "transparent";
          previewMobileBtn.style.color = "var(--muted)";
        });

        previewMobileBtn.addEventListener("click", () => {
          projectPreviewIframe.style.width = "375px";
          projectPreviewIframe.style.maxWidth = "375px";
          previewMobileBtn.style.background = "var(--brand)";
          previewMobileBtn.style.color = "var(--on-brand)";
          previewDesktopBtn.style.background = "transparent";
          previewDesktopBtn.style.color = "var(--muted)";
        });
      }
