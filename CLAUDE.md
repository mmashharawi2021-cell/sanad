# CLAUDE.md — دليل مشروع «سند (SANAD)» لـ Claude Code

مرحباً بك في مشروع **«سند (SANAD)»**، المساعد الشخصي الذكي والأصيل لنظام Windows 11، المصمم ليعمل كـ Copilot محلي فائق الإنتاجية للمبرمجين والمستخدمين اليوميين.

---

## ⚡ الأوامر الأساسية (Core Commands)

> ⚠️ **تنبيه حاسم لنظام Windows:**
> دائماً استخدم `npm.cmd` بدلاً من `npm` لأن تشغيل سكربتات PowerShell مقيد على النظام بدون `.cmd`.

```powershell
# تشغيل خادم التطوير مع التحديث التلقائي (Dev Server on http://localhost:3000)
npm.cmd run dev

# فحص الأنواع الصارم والتأكد من خلو المشروع من الأخطاء (Typecheck)
npm.cmd run typecheck

# تشغيل الخادم في وضع الإنتاج
npm.cmd run start

# إرسال طلب محادثة مباشر من الطرفية
npm.cmd run chat -- "أمرك هنا"

# تشغيل طلب مباشر مع بث حي (Streaming)
npm.cmd run chat -- --stream "أمرك هنا"

# تحديث قائمة الموديلات المجانية من OpenRouter
npm.cmd run models:refresh

# تجهيز العمل دون إنترنت (مرة واحدة وأنت متصل): نماذج Ollama + الصوت + العبارات المحفوظة
npm.cmd run offline:setup

# تقرير جاهزية العمل دون إنترنت (لا يحتاج اتصالاً)
npm.cmd run offline:check

# اختبارات الأوامر الصوتية والنطق أثناء الكتابة
npm.cmd run test:voice
```

---

## 🏗️ البنية المعمارية للمشروع (Architecture Overview)

المشروع مبني على **Node.js (v20+)** مع **TypeScript (v5.9)** و **ES Modules (`"type": "module"`)**:

### 1. الخادم الخلفي (`src/`):
- `src/server.ts`: الخادم المركزي (HTTP Native Server)، يدعم Server-Sent Events (SSE)، ويربط جميع الواجهات البرمجية (REST APIs).
- `src/diskInspector.ts`: المحلل الذكي للأقراص، تنظيف الملفات المؤقتة، محرر الرام الفوري عبر `psapi.dll`، وفاحص أكبر الملفات.
- `src/projectBuilder.ts`: المطور البرمجي الذاتي لبناء مشاريع الويب والتطبيقات الحية وخدمة المعاينة التفاعلية داخل المتصفح.
- `src/processMaestro.ts`: مدير العمليات والتطبيقات في ويندوز، إدارة سطوع الشاشة عبر WMI CIM، وتنفيذ الروتين اليومي.
- `src/universalTerminal.ts`: الطرفية الشاملة الداعمة لـ PowerShell و CMD و Python و Node و Git مع التشخيص الذاتي للأخطاء.
- `src/desktopAutomation.ts`: أتمتة سطح المكتب ومجلد التنزيلات، الفرز الآمن للملفات، وبيئات العمل السريعة.
- `src/screenVision.ts`: الرؤية الحاسوبية للشاشة، التقاط النوافذ، والتحليل البصري والتفاعل التلقائي.
- `src/actionMemory.ts`: ذاكرة الإجراءات وسير العمل التلقائي (Workflows).
- `src/taskScheduler.ts`: الجدولة الزمنية للمهام اليومية والتنبيهات الدورية.
- `src/systemTools.ts`: أدوات النظام الأصلية (التحكم بالماوس والكيبورد، الصوت، القفل، إنشاء وقراءة الملفات).
- `src/fileReader.ts`: استخراج وقراءة النصوص من ملفات PDF، Markdown، نصوص، CSV، إلخ.
- `src/memory.ts`: إدارة ذاكرة سند الدائمة (`data/memory.json`).
- `src/openrouter.ts`: عميل OpenRouter SDK مع البث المباشر ومعالجة الأخطاء.
- `src/ollama.ts`: عميل النماذج المحلية الذاتي عبر خادم Ollama (`http://127.0.0.1:11434`).
- `src/models.ts`: فهرس ونماذج الذكاء الاصطناعي المجانية والمحلية.
- `src/config.ts`: قراءة متغيرات البيئة (`.env`) والتحقق من صحتها.
- `src/networkMaestro.ts`: المنافذ المفتوحة وتحرير المنفذ (Kill Port مع حماية عمليات النظام وخادم سند)، Ping، ومعلومات الشبكة. الفحص السريع عبر `netstat` (~35ms) مع ذاكرة مؤقتة لأسماء البرامج (15 ث)؛ عند التحرير يُجلب اسم البرنامج من جديد دائماً لأن الحماية تعتمد عليه. PowerShell احتياطي فقط.
- **العمل دون إنترنت:** الخط IBM Plex Sans Arabic مستضاف في `public/fonts/` (ترخيص OFL)؛ لا تُضِف روابط خطوط أو مكتبات خارجية. البحث في الويب وقراءة الصفحات يعيدان `offline: true` مع رسالة واضحة عند انقطاع النت.
- `src/offlineBrain.ts`: العقل المحلي — فحص الاتصال، تشغيل Ollama تلقائياً، التحويل للنموذج المحلي عند انقطاع النت، و`SANAD_MODE=auto|offline|cloud`.
- **الصوت** (المكوّنات الثنائية في `vendor/` خارج git؛ جهّزها بـ `scripts/voice-setup.ps1`):
  - `src/localVoice.ts`: النطق بالترتيب: ذاكرة مؤقتة (`data/voice-cache`) ← صوت عصبي طبيعي عند الاتصال ← Piper محلي (كريم رجل / دي فتاة).
  - `src/localSpeech.ts`: التعرّف على الكلام — FastConformer العربي افتراضياً (~0.16 ث)، وwhisper.cpp احتياطياً.
  - `src/voiceSidecar.ts` + `scripts/sanad_voice.py`: عملية Python مساعدة دائمة (`vendor/py`) للأصوات الطبيعية وFastConformer، تُطفأ بعد الخمول.
  - `src/voiceSettings.ts`: إعدادات الصوت (`data/voice-settings.json`) بقوائم مسموحة فقط؛ واجهتها `public/ios-voice.js`.
  - `npm.cmd run voice:warm`: يحفظ العبارات الشائعة بالصوت الطبيعي لتعمل دون إنترنت.
  - `public/voice-intents.js` (`window.sanadIntents`): أوامر الشبكة والمنافذ الفورية دون العقل، وتصحيح نص السماع (كلمة التنبيه، والأرقام المنطوقة «ثلاثة آلاف» ← 3000). يُستدعى أول `tryHandleSystemIntent` وداخل `normalizeArabicSpeech`.
  - `public/stream-speech.js` (`window.sanadStreamSpeech`): في الوضع الصوتي ينطق كل جملة فور اكتمالها أثناء تدفق الرد.
  - الاختبارات: `npm.cmd run test:voice`.

### 2. الواجهة الأمامية (`public/`):
واجهة ويب عربية (RTL) مبنية بـ HTML5/CSS3/Vanilla JS، **بأسلوب iOS على آيفون برو ماكس حديث** (Liquid Glass، عناوين كبيرة، قوائم مجمّعة، أوراق Sheets، فقاعات iMessage، إشعارات Banners، Dynamic Island، مركز التحكم). يعمل في الوضعين الداكن والفاتح (`data-theme`).

| الملف | المسؤولية |
|---|---|
| `public/index.html` | الهيكل والمنطق الرئيسي (سكربت مضمّن) + sprite أيقونات SVG في أعلى `<body>` (`<use href="#i-…">`) |
| `public/styles.css` | المتغيرات (`--surface-*`، `--text-*`، `--brand`، `--glass-*`، `--sheet-bg`، `--cell-bg`) وأقسام مرتبة بالمراحل؛ الأقسام الأحدث في آخر الملف |
| `public/ios.js` | الشريط العلوي والعنوان الكبير الذي يُطوى عند التمرير، وطفو الشريط وصندوق الإدخال فوق المحادثة |
| `public/ios-notify.js` | `sanadNotify()` (إشعارات Banners) و `sanadConfirm()` (نافذة تأكيد iOS) |
| `public/home.js` | الشاشة الرئيسية: ودجت الساعة، حلقات حالة الجهاز، أيقونات التطبيقات، اقتراحات سند |
| `public/ios-island.js` | شريط الحالة و Dynamic Island (`window.sanadIsland`، تُغذّى من `setIslandStatus`/`updateIslandLatest`) |
| `public/ios-control.js` | مركز التحكم (زر في الشريط، `Ctrl+Shift+C`، أو ضغط مطوّل على الجزيرة) |
| `public/ios-tabs.js` | تنقل الهاتف: الرئيسية، المحادثات، الأدوات، وإعدادات الصوت |
| `public/ios-apps.js` | نوافذ الأدوات كأوراق iOS (زر «تم»، أيقونة تطبيق، أدوات مقسّمة) |
| `public/ios-list.js` | قائمة المحادثات بأسلوب iOS مع البحث وتأكيد الحذف |
| `public/ios-polish.js` | إزالة الإيموجي والشروح الإنجليزية من نصوص واجهة النظام (لا يلمس محتوى المستخدم) |
| `public/palette.js` | لوحة الأوامر `Ctrl+K` |

- واجهة `#cyberIsland` القديمة مخفية؛ وضع العرض المصغّر والإجراءات السريعة يستخدمان Dynamic Island في `ios-island.js`.
- الحوار الصوتي الكامل وكلمة التنبيه («يا سند») مع المقاطعة الحية (Barge-in) في منطق `index.html`.
- النوافذ: المعاينة الحية `#previewModalBackdrop`، نبض النظام `#sysStatsModalBackdrop`، الطرفية `#terminalModalBackdrop`، سطح المكتب `#desktopModalBackdrop`، الشبكة `#networkModalBackdrop`، الذاكرة والمهام والمسارات.

**قواعد الواجهة:**
- **لا تغيّر معرّفات العناصر** في `index.html`؛ المنطق ووحدات iOS تعتمد عليها. أي سلوك جديد يوضع في وحدة `public/*.js` مستقلة.
- لا خطوط SF ولا SF Symbols ولا شعار Apple؛ استخدم أيقونات Lucide في الـ sprite وخط IBM Plex Sans Arabic.
- لا `alert()`/`confirm()`؛ استخدم `sanadNotify` و `sanadConfirm`. النصوص القادمة من الخادم أو النموذج تُدرج عبر `textContent`.
- الألوان من المتغيرات فقط، مع قيم للوضع الفاتح في `:root[data-theme="light"]`، وكل حركة تحترم `prefers-reduced-motion`.
- المهارات `ios-hig` و `frontend-design` و `i18n-accessibility` في `.claude/skills/` هي المرجع للتصميم.

### 3. السكربتات المساعدة (`scripts/`):
- `scripts/globalHotkey.py`: خادم بايثون خفيف يلتقط الاختصارات العالمية (`Ctrl + Alt + S` لفتح سند، `Ctrl + Shift + V` للصوت).
- `scripts/mouseController.py` & `scripts/keyboardController.py`: محركات تحكم منخفضة المستوى بمؤشر الفأرة ولوحة المفاتيح.

---

## 📡 خريطة الـ APIs الرئيسية (REST Endpoints)

| المسار (Endpoint) | الطريقة | الوصف |
|---|---|---|
| `POST /api/chat` | POST | محادثة عادية وإرجاع الإجابة كاملة |
| `POST /api/chat/stream` | POST (SSE) | بث حي لحظي للردود النصية |
| `GET /api/models` | GET | قائمة الموديلات المتاحة (المحلية أوفلاين وسحابية) |
| `GET /api/system/stats` | GET | نبض النظام (CPU, RAM, Battery, Uptime) |
| `GET /api/system/disks` | GET | فحص أقراص التخزين ومساحات البارتشنز (C:, D:) |
| `GET /api/system/health` | GET | تقرير صحة النظام الشامل ودرجة الجودة |
| `POST /api/system/large-files` | POST | فحص واكتشاف أكبر الملفات المستهلكة للقرص |
| `POST /api/system/clean-disk` | POST | تنظيف عميق وآمن للملفات المؤقتة والكاش |
| `POST /api/system/optimize-ram` | POST | تحرير الذاكرة العشوائية الفوري (RAM Boost) |
| `POST /api/system/reveal-file` | POST | فتح وتحديد الملف في Windows File Explorer |
| `POST /api/project/build` | POST | توليد وبناء مشروع برمجي جديد من القوالب |
| `GET /api/project/preview` | GET | خدمة ملفات المشروع للمعاينة الحية داخل المتصفح |
| `GET /api/project/list` | GET | قائمة بالمشاريع المنشأة وحالة المعاينة |
| `POST /api/terminal/run` | POST | تنفيذ أمر في الطرفية المحددة (powershell, cmd, python, node, git) |
| `GET /api/system/processes` | GET | قائمة البرامج الأكثر استهلاكاً للموارد |
| `POST /api/system/kill-process` | POST | إغلاق أو إنهاء عملية أو برنامج |
| `POST /api/system/brightness` | POST | تعديل سطوع الشاشة عبر WMI |
| `POST /api/system/routine` | POST | تشغيل روتين يومي (morning, focus, wrapup) |
| `POST /api/desktop/organize` | POST | فرز وترتيب ملفات سطح المكتب أو التنزيلات |
| `GET /api/desktop/status` | GET | حالة الملفات المبعثرة في المجلد |
| `POST /api/desktop/preset` | POST | تجهيز بيئة عمل سريعة (gis, coding, clean) |
| `GET /api/brain/status` | GET | حالة العقل: سحابي/محلي، Ollama، النموذج المحلي، وضع التشغيل |
| `GET /api/network/ports` · `POST /api/network/kill-port` · `POST /api/network/ping` · `GET /api/network/info` | — | الشبكة والمنافذ |
| `POST /api/voice/speak` | POST | نطق نص `{text, gender?, voice?, engine?:"local"}` ← صوت (الرأس `X-Voice-Source`: cache/natural/local) |
| `POST /api/voice/transcribe` | POST | تعرّف على WAV بتردد 16kHz (FastConformer أو whisper) |
| `POST /api/voice/warm` | POST | تحميل محرك السماع مسبقاً قبل أول جملة |
| `GET`/`POST /api/voice/settings` | — | إعدادات الصوت (رجل/فتاة، الصوت الطبيعي، محرك السماع) |

---

## 🔒 قواعد ومبادئ التطوير لـ Claude Code (Coding Guidelines)

1. **التعامل مع بيئة Windows 11:**
   - عند تشغيل أوامر النظام أو البرامج من Node.js، استخدم `spawn` مع `{ detached: true, stdio: "ignore" }.unref()` لتجنب تعليق استجابة السيرفر.
   - مسارات الملفات: استخدم `path.normalize()` و `path.join()` للتعامل مع الـ Backslashes `\` و Forward-slashes `/`.
2. **شخصية وروح المساعد (Identity):**
   - الاسم: **سند (SANAD)**.
   - الشخصية: رفيق ذكي، أمين، عالي الكفاءة، يتحدث بالعربية الفصحى الرصينة ويفهم اللهجات، ويوفر إنتاجية فورية على حاسوب المستخدم.
3. **سلامة الكود (Code Safety & Typecheck):**
   - بعد أي تعديل على كود TypeScript في `src/`، يجب دائماً تشغيل `npm.cmd run typecheck` والتأكد من خلوه تماماً من أخطاء الـ Type Errors.
4. **تجنب تكرار الكود:**
   - استفد من الأدوات الموجودة في `src/systemTools.ts` و `src/diskInspector.ts` و `src/processMaestro.ts` بدلاً من إعادة كتابة وظائف التفاعل مع الويندوز.
