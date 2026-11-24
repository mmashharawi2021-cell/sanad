/* سند — نافذة الذاكرة الدائمة
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= local memory ======================= */

      async function loadAndRenderMemories() {
        try {
          const res = await fetch("/api/memory");
          const data = await res.json();
          const list = data.memories || [];
          if (memoryCount) memoryCount.textContent = list.length;

          if (!memoryList) return;
          if (!list.length) {
            memoryList.innerHTML = `<div class="memory-empty">لا توجد معلومات محفوظة حتى الآن.<br>أضف معلومة أعلاه أو اطلب من سند «تذكر أن...» في المحادثة.</div>`;
            return;
          }

          const categoryIcons = {
            user: "👤 مستخدم",
            project: "💻 مشروع",
            preference: "⚙️ تفضيل",
            system: "🖥️ نظام",
            general: "📝 عام"
          };

          memoryList.innerHTML = list.map((m) => `
            <div class="memory-card" data-id="${m.id}">
              <div class="memory-card-content">
                <div>${escapeHtml(m.content)}</div>
                <div class="memory-card-meta">
                  <span class="memory-tag">${categoryIcons[m.category] || "📝 عام"}</span>
                  <span>أُضيفت: ${new Date(m.createdAt).toLocaleDateString("ar-SA")}</span>
                </div>
              </div>
              <button class="memory-del-btn" title="حذف المعلومة" data-del-id="${m.id}">🗑️</button>
            </div>
          `).join("");

          memoryList.querySelectorAll(".memory-del-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const id = btn.getAttribute("data-del-id");
              if (!id) return;
              try {
                await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
                loadAndRenderMemories();
              } catch (e) {
                console.warn(e);
              }
            });
          });
        } catch (e) {
          console.warn("[memory load failed]", e);
        }
      }

      function openMemoryModal() {
        if (memoryModalBackdrop) {
          memoryModalBackdrop.classList.add("open");
          loadAndRenderMemories();
          newMemoryInput?.focus();
        }
      }

      function closeMemoryModal() {
        if (memoryModalBackdrop) {
          memoryModalBackdrop.classList.remove("open");
        }
      }

      if (memoryBtn) memoryBtn.addEventListener("click", openMemoryModal);
      if (memoryCloseBtn) memoryCloseBtn.addEventListener("click", closeMemoryModal);
      if (memoryModalBackdrop) {
        memoryModalBackdrop.addEventListener("click", (e) => {
          if (e.target === memoryModalBackdrop) closeMemoryModal();
        });
      }

      if (addMemoryBtn && newMemoryInput) {
        const doAddMemory = async () => {
          const content = newMemoryInput.value.trim();
          if (!content) return;
          const category = newMemoryCategory ? newMemoryCategory.value : "general";
          addMemoryBtn.disabled = true;
          try {
            await fetch("/api/memory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content, category }),
            });
            newMemoryInput.value = "";
            await loadAndRenderMemories();
          } catch (e) {
            console.warn(e);
          } finally {
            addMemoryBtn.disabled = false;
          }
        };

        addMemoryBtn.addEventListener("click", doAddMemory);
        newMemoryInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            doAddMemory();
          }
        });
      }
