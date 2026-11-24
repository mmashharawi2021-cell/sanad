/* سند — نافذة المهام المجدولة
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= tasks scheduler ======================= */

      async function loadAndRenderTasks() {
        try {
          const res = await fetch("/api/tasks");
          const data = await res.json();
          const list = data.tasks || [];
          if (tasksCount) tasksCount.textContent = list.length;
          if (!tasksList) return;

          if (!list.length) {
            tasksList.innerHTML = `<div class="memory-empty">لا توجد مهام مجدولة حالياً.<br>أضف مهمة جديدة أعلاه لتعمل في الخلفية أثناء غيابك.</div>`;
            return;
          }

          tasksList.innerHTML = list
            .map((t) => {
              const statusClass = t.enabled ? "active" : "paused";
              const statusLabel = t.enabled ? "مفعّلة 🟢" : "متوقفة مؤقتاً ⏸️";
              const nextRun = t.nextRunAt ? new Date(t.nextRunAt).toLocaleTimeString("ar-SA") : "غير مجدول";
              const lastRun = t.lastRunAt ? new Date(t.lastRunAt).toLocaleTimeString("ar-SA") : "لم تُنفذ بعد";
              return `
              <div class="task-card" data-id="${t.id}">
                <div class="task-card-header">
                  <div class="task-card-title">
                    <span>⚙️</span>
                    <span>${escapeHtml(t.title)}</span>
                  </div>
                  <span class="task-status-badge ${statusClass}">${statusLabel}</span>
                </div>
                <div class="task-card-meta">
                  <span>⏱️ التكرار: <b>${escapeHtml(t.scheduleStr)}</b></span>
                  <span>🚀 التشغيل القادم: <b>${nextRun}</b></span>
                  <span>⏱️ آخر تشغيل: <b>${lastRun}</b></span>
                  <span>📊 عدد مرات العمل: <b>${t.runCount || 0}</b></span>
                </div>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
                  الأمر: <code>${escapeHtml(t.actionValue)}</code>
                </div>
                ${t.lastOutput ? `<div class="task-log-output">${escapeHtml(t.lastOutput)}</div>` : ""}
                <div class="task-actions-row">
                  <button class="task-btn task-run-now-btn" data-id="${t.id}">تشغيل الآن ⚡</button>
                  <button class="task-btn task-toggle-btn" data-id="${t.id}">${t.enabled ? "إيقاف مؤقت ⏸️" : "تفعيل ▶️"}</button>
                  <button class="task-btn task-delete-btn" style="color: #ff6b6b;" data-id="${t.id}">حذف 🗑️</button>
                </div>
              </div>
            `;
            })
            .join("");

          // Wire action buttons
          tasksList.querySelectorAll(".task-run-now-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              btn.textContent = "جاري التشغيل… ⏳";
              btn.disabled = true;
              try {
                await fetch("/api/tasks/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: btn.getAttribute("data-id") }),
                });
                await loadAndRenderTasks();
              } catch (e) {
                console.warn(e);
              }
            });
          });

          tasksList.querySelectorAll(".task-toggle-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              try {
                await fetch("/api/tasks/toggle", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: btn.getAttribute("data-id") }),
                });
                await loadAndRenderTasks();
              } catch (e) {
                console.warn(e);
              }
            });
          });

          tasksList.querySelectorAll(".task-delete-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              try {
                await fetch(`/api/tasks?id=${encodeURIComponent(btn.getAttribute("data-id"))}`, { method: "DELETE" });
                await loadAndRenderTasks();
              } catch (e) {
                console.warn(e);
              }
            });
          });
        } catch (e) {
          console.warn("[tasks load error]", e);
        }
      }

      function openTasksModal() {
        if (tasksModalBackdrop) {
          tasksModalBackdrop.classList.add("open");
          loadAndRenderTasks();
        }
      }

      function closeTasksModal() {
        if (tasksModalBackdrop) {
          tasksModalBackdrop.classList.remove("open");
        }
      }

      if (tasksBtn) tasksBtn.addEventListener("click", openTasksModal);
      if (tasksCloseBtn) tasksCloseBtn.addEventListener("click", closeTasksModal);
      if (tasksModalBackdrop) {
        tasksModalBackdrop.addEventListener("click", (e) => {
          if (e.target === tasksModalBackdrop) closeTasksModal();
        });
      }

      if (addTaskBtn && newTaskTitle && newTaskAction) {
        addTaskBtn.addEventListener("click", async () => {
          const title = newTaskTitle.value.trim();
          const actionValue = newTaskAction.value.trim();
          const intervalMinutes = Number(newTaskInterval?.value || 30);
          if (!title || !actionValue) return;

          addTaskBtn.disabled = true;
          try {
            await fetch("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, actionValue, intervalMinutes, actionType: "command" }),
            });
            newTaskTitle.value = "";
            newTaskAction.value = "";
            await loadAndRenderTasks();
          } catch (e) {
            console.warn(e);
          } finally {
            addTaskBtn.disabled = false;
          }
        });
      }
