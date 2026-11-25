/* سند — الكبسولة القديمة (#cyberIsland)، واجهة البث المباشر (#liveStreamHud)، ولوحة الأوامر (#paletteBackdrop).
   هيكل HTML نُقل حرفياً من index.html (إكمال المرحلة 4) ليبقى index.html هيكلاً قصيراً.
   سكربت عادي متزامن: يُدرج العناصر في موضع وسمه نفسه قبل أن تُحمَّل السكربتات التي تستخدمها،
   فالمعرّفات والترتيب في الصفحة كما كانت تماماً. */
document.currentScript.insertAdjacentHTML("beforebegin", String.raw`
    <!-- Cyber Dynamic Island (الكبسولة العائمة الذكية) -->
    <div class="cyber-island floating-collapsed" id="cyberIsland" aria-label="كبسولة سند العائمة">
      <div class="island-bar" id="islandBar">
        <div class="island-left" id="islandDragHandle" title="انقر لتوسيع/تصغير الكبسولة">
          <div class="arc-reactor-hud mini" id="islandReactor">
            <div class="arc-outer-ring"></div>
            <div class="arc-middle-ring"></div>
            <div class="arc-inner-core"></div>
          </div>
          <div class="island-status-group">
            <span class="island-brand">سند</span>
            <span class="island-brain-dot" id="islandBrainDot" title="حالة العقل: جارٍ الفحص..."></span>
            <div class="island-waves" id="islandWaves">
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
            </div>
            <span class="island-status-text" id="islandStatusText">جاهز</span>
          </div>
        </div>

        <div class="island-center">
          <form class="island-form" id="islandForm">
            <input type="text" class="island-input" id="islandInput" placeholder="أمر سريع لسند..." autocomplete="off" />
          </form>
        </div>

        <div class="island-right">
          <button class="island-icon-btn" id="islandVisionBtn" type="button" title="فحص الشاشة">👁️</button>
          <button class="island-icon-btn" id="islandNetBtn" type="button" title="الشبكة والمنافذ — زمن الاستجابة">🌐<span class="island-latency-badge" id="islandLatencyBadge"></span></button>
          <button class="island-icon-btn" id="islandExpandBtn" type="button" title="توسيع / طي الكبسولة">▾</button>
        </div>
      </div>

      <!-- Expandable Drawer inside Island -->
      <div class="island-drawer" id="islandDrawer">
        <div class="island-latest-msg" id="islandLatestMsg">
          سند مستعد لتنفيذ أي أمر على شاشتك. تحدث أو اكتب أمرك، أو استخدم أزرار التحكم السريع أدناه.
        </div>
        <div class="island-quick-actions">
          <button class="island-pill-btn" id="islandQuickClickBtn" type="button">🖱️ نقر</button>
          <button class="island-pill-btn" id="islandQuickEnterBtn" type="button">↵ Enter</button>
          <button class="island-pill-btn" id="islandQuickSaveBtn" type="button">💾 حفظ</button>
          <button class="island-pill-btn" id="islandQuickNewBtn" type="button">📄 جديد</button>
          <button class="island-pill-btn" id="islandQuickEscBtn" type="button">⎋ Esc</button>
          <button class="island-pill-btn" id="islandOrganizeDesktopBtn" type="button" title="تنظيم وتصنيف سطح المكتب">🧹 رتّب سطح المكتب</button>
          <button class="island-pill-btn" id="islandRoutineMorningBtn" type="button" title="بدء روتين العمل اليومي">🌅 ابدأ العمل</button>
          <button class="island-pill-btn" id="islandRoutineFocusBtn" type="button" title="تفعيل وضع التركيز الصامت">🎯 تركيز</button>
          <button class="island-pill-btn" id="islandRoutineWrapupBtn" type="button" title="إنهاء العمل وتنظيف الجهاز">🌙 نهاية العمل</button>
          <button class="island-pill-btn" id="islandProjectsBtn" type="button" title="معاينة المشاريع وتطبيقات الويب الحية">🚀 المشاريع الحية</button>
          <button class="island-pill-btn" id="islandRamBoostBtn" type="button" title="تحرير الذاكرة وتسريع استجابة اللابتوب فوراً">⚡ تحرير الرام</button>
          <button class="island-pill-btn" id="islandDiskCleanBtn" type="button" title="تنظيف آمن لملفات الكاش والمؤقتة">🧹 تنظيف القرص</button>
          <button class="island-pill-btn" id="islandPortsBtn" type="button" title="عرض المنافذ المفتوحة وتحرير المحجوز منها">🔌 المنافذ</button>
          <button class="island-pill-btn" id="islandPingBtn" type="button" title="فحص زمن الاستجابة للإنترنت">📶 فحص النت</button>
          <button class="island-pill-btn primary" id="islandToggleModeBtn" type="button">🖥️ تبديل العرض الكامل</button>
        </div>
      </div>
    </div>

    <!-- Live Screen Stream HUD Widget -->
    <div class="live-stream-hud" id="liveStreamHud" aria-label="شاشة البث المباشر">
      <div class="live-hud-header">
        <div class="live-badge">
          <span class="live-badge-dot"></span>
          <span>بث سند المباشر (LIVE)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="liveFpsBadge" style="font-size: 10px;">60 FPS</span>
          <button id="liveCloseBtn" type="button" title="إغلاق البث" style="background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; padding: 2px 6px;">✕</button>
        </div>
      </div>
      <div class="live-hud-video-wrap">
        <video id="liveStreamVideo" autoplay playsinline muted class="live-hud-video"></video>
      </div>
      <div class="live-hud-actions">
        <button class="live-hud-btn live-hud-btn-primary" id="liveAskBtn" type="button" title="تحليل فوري للإطار الحالي بالذكاء الاصطناعي">
          <span>👁️</span>
          <span>ماذا ترى في الشاشة الآن؟</span>
        </button>
        <button class="live-hud-btn live-hud-btn-primary" id="liveAgentActBtn" type="button" title="تكليف سند بمهمة بصرية متسلسلة على الشاشة (النقر، الكتابة، والتنفيذ الذاتي)">
          <span>🤖</span>
          <span>تكليف سند بمهمة على الشاشة</span>
        </button>
        <div class="live-hud-btn-row">
          <button class="live-hud-btn" id="liveClickBtn" type="button" title="نقر بزر الفأرة الأيسر في موقع المؤشر">
            <span>🖱️</span>
            <span>نقر أيسر</span>
          </button>
          <button class="live-hud-btn" id="liveDoubleClickBtn" type="button" title="نقر مزدوج بالفأرة">
            <span>🖱️×2</span>
            <span>مزدوج</span>
          </button>
          <button class="live-hud-btn" id="liveRightClickBtn" type="button" title="نقر بالزر الأيمن للفأرة">
            <span>🔘</span>
            <span>زر أيمن</span>
          </button>
        </div>
        <div class="live-hud-btn-row" style="margin-top: 4px;">
          <button class="live-hud-btn" id="liveKeyEnterBtn" type="button" title="مفتاح Enter (إدخال)">
            <span>↵</span>
            <span>Enter</span>
          </button>
          <button class="live-hud-btn" id="liveKeySaveBtn" type="button" title="حفظ المستند (Ctrl+S)">
            <span>💾</span>
            <span>حفظ</span>
          </button>
          <button class="live-hud-btn" id="liveKeyNewBtn" type="button" title="مشروع أو ملف جديد (Ctrl+N)">
            <span>📄</span>
            <span>جديد</span>
          </button>
          <button class="live-hud-btn" id="liveKeyEscBtn" type="button" title="زر الهروب (Esc)">
            <span>⎋</span>
            <span>Esc</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Command Palette (لوحة الأوامر) -->
    <div class="palette-backdrop hidden" id="paletteBackdrop" role="dialog" aria-modal="true" aria-label="لوحة الأوامر">
      <div class="palette">
        <input class="palette-input" id="paletteInput" aria-label="ابحث عن أمر أو أداة" type="search" placeholder="ابحث عن أداة أو أمر…" autocomplete="off" aria-controls="paletteList" />
        <div class="palette-list" id="paletteList" role="listbox"></div>
        <div class="palette-foot"><span><kbd class="kbd">↑↓</kbd> تنقّل</span><span><kbd class="kbd">Enter</kbd> تنفيذ</span><span><kbd class="kbd">Esc</kbd> إغلاق</span></div>
      </div>
    </div>
`);
