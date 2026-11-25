/* سند — نوافذ الأدوات: الذاكرة، الطرفية، المهام، المسارات، نبض النظام، الشبكة، سطح المكتب، المعاينة.
   هيكل HTML نُقل حرفياً من index.html (إكمال المرحلة 4) ليبقى index.html هيكلاً قصيراً.
   سكربت عادي متزامن: يُدرج العناصر في موضع وسمه نفسه قبل أن تُحمَّل السكربتات التي تستخدمها،
   فالمعرّفات والترتيب في الصفحة كما كانت تماماً. */
document.currentScript.insertAdjacentHTML("beforebegin", String.raw`
    <!-- Memory Modal -->
    <div class="memory-modal-backdrop" id="memoryModalBackdrop">
      <div class="memory-modal" id="memoryModal" role="dialog" aria-modal="true" aria-labelledby="memoryTitle">
        <div class="memory-header">
          <h2 id="memoryTitle">🧠 الذاكرة الدائمة المحلية (SANAD Memory)</h2>
          <button class="memory-close-btn" id="memoryCloseBtn" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="memory-body">
          <p class="memory-desc">
            المعلومات المحفوظة هنا تُخزَّن في ملف محلي <code>data/memory.json</code> وتُحقن تلقائياً في عقل الذكاء الاصطناعي مع كل سؤال ليسهل عليه تذكرها دائماً، حتى بعد إغلاق المتصفح أو إعادة تشغيل اللابتوب.
          </p>
          <div class="memory-input-row">
            <input type="text" class="memory-input" id="newMemoryInput" aria-label="معلومة جديدة للذاكرة" placeholder="اكتب معلومة جديدة ليتذكرها (مثلاً: اسمي محمد، مشروعي متجر أزياء...)" />
            <select class="memory-select" id="newMemoryCategory">
              <option value="user">👤 عن المستخدم</option>
              <option value="project">💻 عن المشروع</option>
              <option value="preference">⚙️ تفضيلات</option>
              <option value="system">🖥️ النظام</option>
              <option value="general" selected>📝 عام</option>
            </select>
            <button class="memory-add-btn" id="addMemoryBtn" type="button">➕ حفظ في الذاكرة</button>
          </div>
          <div class="memory-list" id="memoryList">
            <!-- Rendered by JS -->
          </div>
        </div>
      </div>
    </div>

    <!-- Terminal Modal -->
    <div class="terminal-modal-backdrop" id="terminalModalBackdrop">
      <div class="terminal-modal" id="terminalModal" role="dialog" aria-modal="true" aria-labelledby="terminalTitle">
        <div class="terminal-header">
          <div class="terminal-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
            <span id="terminalTitle" class="terminal-title">💻 الطرفية البرمجية (PowerShell & Node & Python)</span>
          </div>
          <button class="memory-close-btn" id="terminalCloseBtn" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="terminal-body" id="terminalBody">
          <div class="terminal-welcome">
            مرحباً بك في الطرفية البرمجية المباشرة لسند.<br />
            البيئة الحالية: <b>Node.js</b> · <b>Python 3.14</b> · <b>Git</b> · <b>PowerShell</b><br />
            المجلد الافتراضي: <code>سطح المكتب (Desktop)</code>. جرب كتابة <code>python --version</code> أو <code>git status</code> أو <code>dir</code>.
          </div>
          <div class="terminal-logs" id="terminalLogs"></div>
        </div>
        <div class="terminal-input-bar">
          <select id="terminalShellSelect" class="terminal-shell-select" aria-label="نوع الطرفية">
            <option value="powershell">⚡ PowerShell</option>
            <option value="cmd">💻 CMD</option>
            <option value="python">🐍 Python 3.14</option>
            <option value="node">📦 Node.js</option>
            <option value="git">🐙 Git</option>
          </select>
          <span class="terminal-prompt-symbol">&gt;</span>
          <input type="text" class="terminal-input" id="terminalInput" aria-label="أمر الطرفية" placeholder="اكتب أمراً هنا واضغط Enter (مثل: git status, dir, node script.js)..." autocomplete="off" />
          <button class="terminal-run-btn" id="terminalRunBtn" type="button">تشغيل ⚡</button>
        </div>
      </div>
    </div>

    <!-- Tasks Modal -->
    <div class="memory-modal-backdrop" id="tasksModalBackdrop">
      <div class="memory-modal" id="tasksModal" role="dialog" aria-modal="true" aria-labelledby="tasksTitle">
        <div class="memory-header">
          <h2 id="tasksTitle">⏰ المهام المستقلة والعمل أثناء الغياب (Autonomous Tasks)</h2>
          <button class="memory-close-btn" id="tasksCloseBtn" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="memory-body">
          <p class="memory-desc">
            يقوم سند بتشغيل هذه المهام تلقائياً في الخلفية أثناء غيابك أو عملك، سواء كانت أوامر صيانة، نسخ احتياطي، أو مراقبة ملفات.
          </p>
          <div class="memory-input-row">
            <input type="text" class="memory-input" id="newTaskTitle" aria-label="عنوان المهمة" placeholder="عنوان المهمة (مثلاً: نسخ احتياطي لمشاريعي)..." />
            <select class="memory-select" id="newTaskInterval">
              <option value="10">كل 10 دقائق</option>
              <option value="30" selected>كل 30 دقيقة</option>
              <option value="60">كل ساعة</option>
              <option value="360">كل 6 ساعات</option>
              <option value="1440">كل 24 ساعة (يومياً)</option>
            </select>
            <input type="text" class="memory-input" id="newTaskAction" aria-label="الأمر الذي تنفّذه المهمة" placeholder="أمر التشغيل (مثلاً: python backup.py أو أمر CMD)..." />
            <button class="memory-add-btn" id="addTaskBtn" type="button">➕ جدولة المهمة</button>
          </div>
          <div class="memory-list" id="tasksList">
            <!-- Rendered by JS -->
          </div>
        </div>
      </div>
    </div>

    <!-- Workflows Modal -->
    <div class="memory-modal-backdrop" id="workflowsModalBackdrop">
      <div class="memory-modal" id="workflowsModal" role="dialog" aria-modal="true" aria-labelledby="workflowsTitle">
        <div class="memory-header">
          <h2 id="workflowsTitle">⚡ المسارات والإجراءات الحركية المحفوظة (Learned Workflows)</h2>
          <button class="memory-close-btn" id="workflowsCloseBtn" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="memory-body">
          <p class="memory-desc">
            يتذكر سند تلقائياً إحداثيات ومسارات الأزرار والنوافذ التي نفذها سابقاً على شاشتك، ليقوم بتنفيذها في المرات القادمة فوراً (0 تأخير) دون استدعاء نماذج الذكاء الاصطناعي.
          </p>
          <div class="memory-list" id="workflowsList" style="margin-top: 14px;">
            <!-- Rendered by JS -->
          </div>
        </div>
      </div>
    </div>

    <!-- System Health & Disk Inspector HUD Modal -->
    <div class="memory-modal-backdrop" id="sysStatsModalBackdrop">
      <div class="memory-modal" id="sysStatsModal" role="dialog" aria-modal="true" aria-labelledby="sysStatsTitle" style="max-width: 840px; width: 94vw; max-height: 90vh;">
        <div class="memory-header" style="flex-shrink: 0;">
          <h2 id="sysStatsTitle">📊 نبض وموارد النظام ومساعد القرص الذكي (Disk & Performance HUD)</h2>
          <button class="memory-close-btn" id="sysStatsCloseBtn" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="memory-body" style="overflow-y: auto; max-height: calc(90vh - 75px); padding: 18px 22px;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
            <p class="memory-desc" style="margin: 0;" id="sysDeviceMeta">
              جاري فحص الموارد والمواصفات...
            </p>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="memory-add-btn v-primary" id="sysOptimizeRamBtn" type="button" title="تحرير الذاكرة العشوائية للبرامج الخاملة وتسريع اللابتوب">⚡ تحرير الرام (RAM Boost)</button>
              <button class="memory-add-btn v-secondary" id="sysCleanTempBtn" type="button" title="حذف الملفات المؤقتة غير المستخدمة لتوفير مساحة القرص">🧹 تنظيف القرص الآمن</button>
              <button class="memory-add-btn v-quiet" id="sysRefreshBtn" type="button">🔄 تحديث</button>
            </div>
          </div>
          <div id="sysCleanAlert" style="padding: 10px 14px; border-radius: 8px; background: rgba(35, 134, 54, 0.15); border: 1px solid rgba(35, 134, 54, 0.3); color: #3fb950; font-size: 13px; margin-bottom: 14px; line-height: 1.6;"></div>
          
          <div class="sys-grid" id="sysGrid" style="margin-bottom: 18px;">
            <!-- Rendered by JS -->
          </div>

          <!-- Hard Drives & Partitions Section -->
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 14px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
              <span>💽</span>
              <span>أقراص ومساحات التخزين (Drives & Partitions):</span>
            </h3>
            <div id="sysDrivesContainer" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
              <!-- Rendered by JS -->
            </div>
          </div>

          <!-- Large Files Inspector Section -->
          <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
              <h3 style="font-size: 14px; margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>📁</span>
                <span>فاحص أكبر الملفات المستهلكة للقرص (Large Files Inspector):</span>
              </h3>
              <button class="memory-add-btn v-primary v-sm" id="sysScanLargeFilesBtn" type="button">🔍 فحص أكبر الملفات الآن</button>
            </div>
            <p style="font-size: 12px; color: var(--muted); margin: 0 0 10px 0;">يكتشف ملفات الفيديو، المثبتات، الحزم المضغوطة، وقواعد البيانات الكبيرة في مجلداتك لتفريغ المساحة بسهولة.</p>
            <div id="sysLargeFilesList" style="display: flex; flex-direction: column;">
              <div style="font-size: 12px; color: var(--muted); text-align: center;">اضغط "فحص أكبر الملفات الآن" لعرض قائمة أضخم الملفات المخزنة.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Network & Ports Maestro Modal -->
    <div class="memory-modal-backdrop" id="networkModalBackdrop">
      <div class="memory-modal" id="networkModal" role="dialog" aria-modal="true" aria-labelledby="networkModalTitle" style="max-width: 900px; width: 94vw; max-height: 90vh;">
        <div class="memory-header" style="flex-shrink: 0;">
          <h2 id="networkModalTitle">🌐 مدير الشبكة والمنافذ (Network & Ports Maestro)</h2>
          <button class="memory-close-btn" id="netCloseBtn" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="memory-body" style="overflow-y: auto; max-height: calc(90vh - 75px); padding: 18px 22px;">
          <div class="net-alert" id="netAlert"></div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 14px;">
            <!-- Connection card -->
            <div class="net-card">
              <h3>
                <span>📡</span><span>الاتصال الحالي</span>
                <button class="net-chip" id="netInfoRefreshBtn" aria-label="تحديث معلومات الشبكة" type="button" style="margin-inline-start: auto;">🔄</button>
              </h3>
              <div id="netInfoSummary" style="font-size: 12px; color: var(--muted); margin-bottom: 8px;">جاري فحص بطاقة الشبكة...</div>
              <dl class="net-kv" id="netInfoKv"></dl>
            </div>

            <!-- Latency card -->
            <div class="net-card">
              <h3><span>📶</span><span>زمن الاستجابة (Ping)</span></h3>
              <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                <input class="net-input" id="netPingHost" type="text" value="8.8.8.8" spellcheck="false" aria-label="المضيف" />
                <button class="memory-add-btn v-primary v-sm" id="netPingBtn" type="button">فحص</button>
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
                <button class="net-chip" type="button" data-ping-host="8.8.8.8">Google DNS</button>
                <button class="net-chip" type="button" data-ping-host="1.1.1.1">Cloudflare</button>
                <button class="net-chip" type="button" data-ping-host="github.com">GitHub</button>
                <button class="net-chip" type="button" data-ping-host="registry.npmjs.org">npm</button>
              </div>
              <div class="net-ping-value" id="netPingValue">—</div>
              <div style="text-align: center; margin-bottom: 4px;"><span class="net-quality" id="netPingQuality"></span></div>
              <div id="netPingDetails" style="font-size: 12px; color: var(--muted); text-align: center;">اضغط «فحص» لقياس سرعة الاستجابة.</div>
            </div>
          </div>

          <!-- Free a port -->
          <div class="net-card" style="margin-bottom: 14px;">
            <h3><span>🔌</span><span>تحرير منفذ محجوز (حل مشكلة EADDRINUSE)</span></h3>
            <form id="netFreePortForm" style="display: flex; gap: 6px; flex-wrap: wrap;">
              <input class="net-input" id="netFreePortInput" type="number" min="1" max="65535" placeholder="مثال: 3000" style="max-width: 160px;" aria-label="رقم المنفذ" />
              <button class="memory-add-btn v-secondary v-sm" type="button" id="netCheckPortBtn">🔍 من يحجزه؟</button>
              <button class="memory-add-btn v-danger v-sm" type="submit">🛑 حرّر المنفذ</button>
            </form>
          </div>

          <!-- Listening ports table -->
          <div class="net-card">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
              <h3 style="margin: 0;"><span>📋</span><span>المنافذ المفتوحة (Listening Ports)</span> <span id="netPortsCount" style="color: var(--muted); font-weight: 400; font-size: 12px;"></span></h3>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <input class="net-input" id="netPortsSearch" aria-label="البحث في المنافذ المفتوحة" type="search" placeholder="بحث: منفذ / برنامج / PID" style="max-width: 200px; direction: rtl; font-family: inherit;" />
                <label style="font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                  <input type="checkbox" id="netDevOnly" /> منافذ التطوير فقط
                </label>
                <label style="font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                  <input type="checkbox" id="netShowUdp" /> UDP
                </label>
                <button class="net-chip" id="netPortsRefreshBtn" type="button">🔄 تحديث</button>
              </div>
            </div>
            <div class="net-table-wrap">
              <table class="net-table">
                <thead>
                  <tr><th>المنفذ</th><th>البروتوكول</th><th>البرنامج</th><th>PID</th><th>العنوان</th><th>الإجراء</th></tr>
                </thead>
                <tbody id="netPortsBody">
                  <tr><td colspan="6" style="text-align: center; padding: 16px;">جاري فحص المنافذ...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop & Files Automation Modal -->
    <div class="memory-modal-backdrop" id="desktopModalBackdrop">
      <div class="memory-modal" id="desktopModal" role="dialog" aria-modal="true" aria-labelledby="desktopModalTitle" style="max-width: 680px;">
        <div class="memory-header">
          <h2 id="desktopModalTitle">🧹 أتمتة سطح المكتب وإدارة الملفات الذكية</h2>
          <button class="memory-close-btn" id="desktopCloseBtn" type="button" aria-label="إغلاق">✕</button>
        </div>
        <div class="memory-body">
          <p class="memory-desc">
            يقوم «سند» بتنظيم وتصنيف ملفات سطح المكتب والتنزيلات بأمان تام دون حذف أي ملف، وتجهيز بيئات العمل كبرنامج ArcGIS Pro.
          </p>

          <div id="desktopStatusAlert" style="padding: 12px 14px; border-radius: 8px; background: rgba(35, 134, 54, 0.15); border: 1px solid rgba(35, 134, 54, 0.3); color: #3fb950; font-size: 13px; margin-bottom: 14px; line-height: 1.6; white-space: pre-line;"></div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 16px;">
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px;">
              <h3 style="font-size: 14px; margin-bottom: 6px;">🖥️ سطح المكتب (Desktop)</h3>
              <p style="font-size: 12px; color: var(--muted); margin-bottom: 10px;" id="desktopFilesSummary">جاري فحص الملفات...</p>
              <button class="memory-add-btn v-primary v-block" id="runOrganizeDesktopBtn" type="button">🧹 فرز وترتيب سطح المكتب الآن</button>
            </div>

            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px;">
              <h3 style="font-size: 14px; margin-bottom: 6px;">📥 مجلد التنزيلات (Downloads)</h3>
              <p style="font-size: 12px; color: var(--muted); margin-bottom: 10px;" id="downloadsFilesSummary">جاري فحص الملفات...</p>
              <button class="memory-add-btn v-primary v-block" id="runOrganizeDownloadsBtn" type="button">📥 فرز وترتيب مجلد التنزيلات</button>
            </div>
          </div>

          <h3>⚡ بيئات العمل السريعة (Workspace Presets):</h3>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="memory-add-btn v-secondary" id="presetGisBtn" type="button">🗺️ بيئة GIS (ArcGIS Pro + مجلد الخرائط)</button>
            <button class="memory-add-btn v-secondary" id="presetCodingBtn" type="button">💻 بيئة البرمجة والتطوير</button>
            <button class="memory-add-btn v-secondary" id="presetCleanBtn" type="button">✨ تنظيف الشاشة (إظهار الديسكتوب)</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Autonomous Project Builder & Live Web Preview Modal -->
    <div class="memory-modal-backdrop" id="previewModalBackdrop">
      <div class="memory-modal" id="previewModal" role="dialog" aria-modal="true" aria-labelledby="previewModalTitle" style="max-width: 95vw; width: 1100px; height: 88vh; max-height: 88vh; display: flex; flex-direction: column;">
        <div class="memory-header" style="flex-shrink: 0; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <h2 id="previewModalTitle" style="margin: 0; font-size: 14.5px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
              <span>🌐</span>
              <span>معاينة حية:</span>
              <span id="previewProjectName"></span>
            </h2>
            <select id="previewProjectSelect" style="background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 12px; outline: none; cursor: pointer;" title="اختر مشروعاً للمعاينة"></select>
            <div style="display: inline-flex;">
              <button id="previewDesktopBtn" type="button" style="background: var(--brand); font-weight: 600;" title="شاشة حاسوب">🖥️ حاسوب</button>
              <button id="previewMobileBtn" type="button" title="شاشة جوال">📱 جوال</button>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="memory-add-btn v-secondary v-sm" id="previewRefreshBtn" type="button" title="إعادة تحميل المعاينة">🔄 تحديث</button>
            <button class="memory-add-btn v-secondary v-sm" id="previewOpenTabBtn" type="button" title="فتح في تبويب مستقل">↗️ في المتصفح</button>
            <button class="memory-add-btn v-secondary v-sm" id="previewOpenCodeBtn" type="button" title="فتح المجلد في VS Code">💻 VS Code</button>
            <button class="memory-close-btn" id="previewCloseBtn" type="button" aria-label="إغلاق">✕</button>
          </div>
        </div>
        <div class="memory-body" style="flex: 1; overflow: hidden; justify-content: center; align-items: stretch;">
          <iframe id="projectPreviewIframe" style="width: 100%; height: 100%; border: none; background: #ffffff;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
        </div>
      </div>
    </div>
`);
