/* سند — نافذة المسارات المحفوظة (Workflows)
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Learned Workflows Memory ======================= */

      async function loadAndRenderWorkflows() {
        if (!workflowsList) return;
        try {
          const res = await fetch("/api/vision/workflows");
          if (!res.ok) return;
          const data = await res.json();
          const wfs = data.workflows || [];
          if (workflowsCount) workflowsCount.textContent = wfs.length;

          if (wfs.length === 0) {
            workflowsList.innerHTML = `<div class="memory-empty">لا توجد مسارات محفوظة بعد. عند تكليف سند بمهمة بصرية، سيتذكر خطواتها وإحداثياتها تلقائياً هنا!</div>`;
            return;
          }

          workflowsList.innerHTML = wfs
            .map((wf) => {
              const stepsSummary = wf.steps
                .map((st, i) => {
                  const icon = st.type.includes("click") ? "🖱️" : st.type === "type" ? "⌨️" : st.type === "hotkey" ? "⚡" : "•";
                  return `<div style="margin: 2px 0;">${icon} <b>خطوة ${i + 1}:</b> ${escapeHtml(st.description || st.type)}</div>`;
                })
                .join("");

              return `
                <div class="memory-card" style="margin-bottom: 12px; padding: 12px 14px;">
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; color: var(--accent); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span>⚡</span> <span>${escapeHtml(wf.name)}</span>
                      </div>
                      <span style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(0,242,254,0.15); color: var(--accent);">نفذت ${Number(wf.successCount) || 0} مرات</span>
                    </div>
                    <div style="font-size: 12px; opacity: 0.85; margin: 6px 0;">🎯 <b>الهدف:</b> ${escapeHtml(wf.goal)}</div>
                    <div style="font-size: 11.5px; opacity: 0.8; line-height: 1.5; padding: 8px 10px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid var(--border-glass);">
                      ${stepsSummary}
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-end; justify-content: center; margin-inline-start: 12px;">
                    <button class="memory-add-btn run-workflow-btn v-primary v-sm" data-goal="${encodeURIComponent(wf.goal)}" type="button" title="تنفيذ هذا المسار فوراً في أجزاء من الثانية">⚡ تشغيل فوري</button>
                    <button class="memory-del-btn delete-workflow-btn" data-id="${escapeHtml(wf.id)}" type="button" title="حذف هذا المسار">🗑️ حذف</button>
                  </div>
                </div>
              `;
            })
            .join("");

          workflowsList.querySelectorAll(".run-workflow-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
              const goal = decodeURIComponent(btn.getAttribute("data-goal") || "");
              closeWorkflowsModal();
              runVisualAgentLoop(goal);
            });
          });

          workflowsList.querySelectorAll(".delete-workflow-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const id = btn.getAttribute("data-id");
              try {
                await fetch(`/api/vision/workflows?id=${encodeURIComponent(id)}`, { method: "DELETE" });
                await loadAndRenderWorkflows();
              } catch (e) {
                console.warn(e);
              }
            });
          });
        } catch (e) {
          console.warn("[workflows error]", e);
        }
      }

      function openWorkflowsModal() {
        if (workflowsModalBackdrop) {
          workflowsModalBackdrop.classList.add("open");
          loadAndRenderWorkflows();
        }
      }

      function closeWorkflowsModal() {
        if (workflowsModalBackdrop) {
          workflowsModalBackdrop.classList.remove("open");
        }
      }

      if (workflowsBtn) workflowsBtn.addEventListener("click", openWorkflowsModal);
      if (workflowsCloseBtn) workflowsCloseBtn.addEventListener("click", closeWorkflowsModal);
      if (workflowsModalBackdrop) {
        workflowsModalBackdrop.addEventListener("click", (e) => {
          if (e.target === workflowsModalBackdrop) closeWorkflowsModal();
        });
      }
