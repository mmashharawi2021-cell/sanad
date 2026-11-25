/* سند — قائمة النماذج وزر اختيار الموديل (loadModels، window.reloadModels)
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= models ======================= */

      function humanContext(tokens) {
        if (!tokens) return "";
        if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M سياق`;
        if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K سياق`;
        return `${tokens} سياق`;
      }

      // رقم آخر طلب: رد قديم بطيء (قائمة السحابة) لا يغطي قائمة أحدث بعد تبديل وضع العمل
      let modelsRequest = 0;
      async function loadModels() {
        const requestId = ++modelsRequest;
        try {
          const response = await fetch("/api/models");
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          if (requestId !== modelsRequest) return;
          models = Array.isArray(data.models) ? data.models : [];
          defaultModel = typeof data.default === "string" ? data.default : "";
          modelsSource = data.source === "catalog" ? "catalog" : "live";
          modelsGeneratedAt = typeof data.generatedAt === "string" ? data.generatedAt : "";

          // A model can disappear from the free list; fall back to the default chain.
          if (models.length && state.model && !models.some((model) => model.id === state.model)) {
            state.model = "";
            const conv = activeConv();
            if (conv) conv.model = "";
            saveState();
          }
        } catch {
          if (requestId !== modelsRequest) return;
          modelsSource = "error";
        }

        modelsReady = true;
        renderModelButton();
        if (pickerOpen) renderModelPanel();
      }

      // ورقة «وضع العمل» تعيد تحميل القائمة بعد التبديل (دون اتصال ← المحلية فقط)
      window.reloadModels = loadModels;

      function findModel(id) {
        return models.find((model) => model.id === id) || null;
      }

      function modelButtonLabel() {
        if (!modelsReady) {
          return { name: "الافتراضي", meta: modelsSource === "error" ? "تعذّر تحميل القائمة" : "جاري تحميل الموديلات…" };
        }

        const selected = state.model ? findModel(state.model) : null;
        if (selected) {
          return {
            name: selected.name,
            meta: [selected.provider, humanContext(selected.contextLength)].filter(Boolean).join(" · "),
          };
        }
        if (state.model) return { name: state.model, meta: "موديل مخصص" };

        return {
          name: "الافتراضي",
          meta: "تلقائي — يجرّب الموديلات بالترتيب",
        };
      }

      function renderModelButton() {
        const label = modelButtonLabel();
        modelBtnName.textContent = label.name;
        modelBtnMeta.textContent = label.meta;
        modelBtn.title = state.model || defaultModel || "الافتراضي";
      }

      function matchesSearch(model) {
        const term = modelSearch.value.trim().toLowerCase();
        if (!term) return true;
        return `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(term);
      }

      function modelMeta(model) {
        const parts = [model.provider, humanContext(model.contextLength)].filter(Boolean);
        parts.push((model.inputModalities || []).includes("image") ? "نص + صور" : "نص");
        return parts.join(" · ");
      }

      function renderModelPanel() {
        modelList.innerHTML = "";
        pickerItems = [];

        const addItem = (id, name, meta, tag) => {
          const selected = (state.model || "") === id;

          const item = document.createElement("button");
          item.type = "button";
          item.className = "model-item" + (selected ? " selected" : "");
          item.id = `model-option-${pickerItems.length}`;
          item.dataset.model = id;
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", selected ? "true" : "false");

          const text = document.createElement("span");
          text.className = "model-item-text";

          const title = document.createElement("span");
          title.className = "model-item-name";
          title.textContent = name;

          const sub = document.createElement("span");
          sub.className = "model-item-meta";
          sub.textContent = meta;

          text.append(title, sub);
          item.appendChild(text);

          if (tag) {
            const badge = document.createElement("span");
            badge.className = "model-tag";
            badge.textContent = tag;
            item.appendChild(badge);
          }

          const check = document.createElement("span");
          check.className = "model-item-check";
          check.textContent = "✓";
          item.appendChild(check);

          modelList.appendChild(item);
          pickerItems.push({ id, element: item });
        };

        addItem("", "الافتراضي", "تلقائي — يجرّب الموديلات بالترتيب", "موصى به");

        const visible = models.filter(matchesSearch);
        if (!visible.length) {
          const empty = document.createElement("div");
          empty.className = "model-empty";
          empty.textContent = models.length
            ? "لا يوجد موديل بهذا الاسم. جرّب كلمة أخرى."
            : modelsReady
              ? "لا توجد موديلات متاحة. تحقق من اتصال الخادم."
              : "جاري تحميل الموديلات…";
          modelList.appendChild(empty);
        }

        for (const model of visible) {
          const isOllama = model.id.startsWith("ollama:");
          const tag = isOllama ? "💻 أوفلاين" : model.id === "openrouter/free" ? "راوتر" : "مجاني";
          addItem(model.id, model.name, modelMeta(model), tag);
        }

        const hasOllama = models.some((m) => m.id.startsWith("ollama:"));
        const ollamaNote = hasOllama
          ? `<div style="margin-top:6px; color:var(--ok)">💻 تم اكتشاف نماذج Ollama المحلية وتعمل بدون إنترنت</div>`
          : `<div style="margin-top:6px; font-size:10.5px; opacity:.85">💡 للعمل أوفلاين: شغّل Ollama على جهازك وسيتعرف عليها سند تلقائياً</div>`;

        if (modelsSource === "catalog") {
          const date = modelsGeneratedAt ? new Date(modelsGeneratedAt) : null;
          const when = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("ar") : "";
          modelFoot.innerHTML =
            `قائمة محفوظة محلياً (${models.length} موديلاً)${when ? ` · ${escapeHtml(when)}` : ""}${ollamaNote}<br>` +
            `<a href="https://openrouter.ai/models?variant=free" target="_blank" rel="noreferrer">المصدر على OpenRouter</a>`;
        } else if (modelsSource === "error") {
          modelFoot.innerHTML = `تعذّر تحميل قائمة الموديلات.${ollamaNote}`;
        } else {
          modelFoot.innerHTML =
            `كل الموديلات المجانية للمحادثة النصية (${models.length})${ollamaNote}<br>` +
            `<a href="https://openrouter.ai/models?variant=free" target="_blank" rel="noreferrer">عرض القائمة على OpenRouter</a>`;
        }

        const selectedIndex = pickerItems.findIndex((item) => item.id === (state.model || ""));
        activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
        highlightActiveItem();
      }

      function highlightActiveItem() {
        pickerItems.forEach((item, index) => {
          item.element.classList.toggle("active", index === activeIndex);
        });

        const active = pickerItems[activeIndex]?.element;
        if (active) {
          active.scrollIntoView({ block: "nearest" });
          modelSearch.setAttribute("aria-activedescendant", active.id);
        }
      }

      function openModelPicker() {
        if (pickerOpen) return;

        pickerOpen = true;
        modelPanel.classList.remove("hidden");
        modelBtn.setAttribute("aria-expanded", "true");
        modelSearch.value = "";
        renderModelPanel();
        modelSearch.focus();
      }

      function closeModelPicker(focusButton = false) {
        if (!pickerOpen) return;

        pickerOpen = false;
        modelPanel.classList.add("hidden");
        modelBtn.setAttribute("aria-expanded", "false");
        modelSearch.value = "";
        if (focusButton) modelBtn.focus();
      }

      function chooseModel(id) {
        state.model = id;
        const conv = activeConv();
        if (conv) conv.model = id;
        saveState();
        renderModelButton();
        renderMeta();
        closeModelPicker(true);
      }

      modelBtn.addEventListener("click", () => {
        if (pickerOpen) closeModelPicker();
        else openModelPicker();
      });

      modelSearch.addEventListener("input", () => {
        renderModelPanel();
        activeIndex = 0;
        highlightActiveItem();
      });

      modelList.addEventListener("click", (event) => {
        const item = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest(".model-item"));
        if (item) chooseModel(item.dataset.model || "");
      });

      modelPanel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closeModelPicker(true);
          return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!pickerItems.length) return;
          const step = event.key === "ArrowDown" ? 1 : -1;
          activeIndex = (activeIndex + step + pickerItems.length) % pickerItems.length;
          highlightActiveItem();
          return;
        }

        if (event.key === "Enter" && !/** @type {Element} */ (event.target).closest(".model-item")) {
          const item = pickerItems[activeIndex];
          if (item) {
            event.preventDefault();
            chooseModel(item.id);
          }
        }
      });

      document.addEventListener("pointerdown", (event) => {
        if (pickerOpen && !modelPicker.contains(/** @type {Node} */ (event.target))) closeModelPicker();
      });
