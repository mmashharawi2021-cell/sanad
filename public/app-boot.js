/* سند — تشغيل الواجهة بعد تحميل كل الوحدات
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= boot ======================= */

      if (state.activeId && !activeConv()) {
        state.activeId = state.conversations[0]?.id || null;
      }

      renderAll();
      loadModels();
      loadAndRenderMemories();
      loadAndRenderTasks();
      loadAndRenderWorkflows();
      autoGrow();
      promptEl.focus();
