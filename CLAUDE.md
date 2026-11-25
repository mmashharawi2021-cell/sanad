# CLAUDE.md — دليل مشروع «سند (SANAD)» لـ Claude Code

مرحباً بك في مشروع **«سند (SANAD)»**، المساعد الشخصي الذكي والأصيل لنظام Windows 11، المصمم ليعمل كـ Copilot محلي فائق الإنتاجية للمبرمجين والمستخدمين اليوميين.

---

## ⚡ الأوامر الأساسية (Core Commands)

> ⚠️ **تنبيه حاسم لنظام Windows:**
> دائماً استخدم `npm.cmd` بدلاً من `npm` لأن تشغيل سكربتات PowerShell مقيد على النظام بدون `.cmd`.

```powershell
# تشغيل خادم التطوير مع التحديث التلقائي (Dev Server on http://localhost:3000)
npm.cmd run dev

# فحص الأنواع: الخادم (tsconfig.json) والواجهة (tsconfig.ui.json) معاً — يجب 0 أخطاء
npm.cmd run typecheck

# تشغيل الخادم في وضع الإنتاج
npm.cmd run start

# إرسال طلب محادثة مباشر من الطرفية
npm.cmd run chat -- "أمرك هنا"

# تشغيل طلب مباشر مع بث حي (Streaming)
npm.cmd run chat -- --stream "أمرك هنا"

# تحديث قائمة الموديلات المجانية من OpenRouter
npm.cmd run models:refresh

# تجهيز العمل دون إنترنت (مرة واحدة وأنت متصل): نماذج Ollama للمحادثة والرؤية
npm.cmd run offline:setup

# تقرير جاهزية العمل دون إنترنت (لا يحتاج اتصالاً)
npm.cmd run offline:check

# شبكة الأمان (شغّلها قبل وبعد أي تغيير كبير):
npm.cmd test              # فحص الأنواع + 210 اختبار مسارات وحماية + 37 أمر فوري + 191 اختبار سجل الأوامر + 31 اختبار أدوات النموذج (~25 ث)
npm.cmd run test:ui       # الواجهة في Edge دون نافذة: لا أخطاء، لا طلبات للإنترنت، النوافذ تُفتح، مقارنة اللقطات
npm.cmd run test:ui -- --update   # تحديث اللقطات المرجعية بعد تغيير مقصود في الشكل
npm.cmd run test:e2e      # سند دون إنترنت (محاكاة): محادثة، وضع «دون اتصال»، أوامر (يحتاج Ollama)
npm.cmd run test:commands # اختبارات الأوامر الفورية وسجل الأوامر فقط
```

---

## 🏗️ البنية المعمارية للمشروع (Architecture Overview)

المشروع مبني على **Node.js (v20+)** مع **TypeScript (v5.9)** و **ES Modules (`"type": "module"`)**:

### 1. الخادم الخلفي (`src/`):
- `src/server.ts`: نقطة التشغيل فقط (~80 سطراً): طبقة الحماية ← جدول المسارات ← ملفات الواجهة.
- `src/http/`: أدوات HTTP المشتركة — `core.ts` (قراءة JSON/الجسم الخام، `sendJson`، إطارات SSE)، `security.ts` (الحماية ورمز الجلسة)، `static.ts` (ملفات public/)، `router.ts` (جدول الطريقة+المسار).
- `src/routes/`: ملف لكل مجال (`chat`، `memoryTasks`، `extensions`، `project`، `web`، `vision`، `system`، `network`، `desktop`)، كل مسار بالصيغة `{ method: "…", path: "/api/…", handler }`. **المسار الجديد يُضاف هنا ويُصنَّف في `tests/routes.manifest.mjs`.**
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
- `src/modelTools.ts`: يقرأ تعريفات الأدوات من `public/model-tools.js` (المصدر الوحيد) ويرسلها للنموذج في «استدعاء الأدوات» الرسمي. `SANAD_TOOL_MODE=auto|native|text`: `auto` = رسمي للنماذج السحابية التي تعلن دعم الأدوات، ووسوم نصية للنموذج المحلي (أسرع بنفس الدقة). الخادم لا ينفّذ الأدوات: يمرّر حدث `tool_call` للواجهة.
- `src/offlineBrain.ts`: العقل المحلي — فحص الاتصال، تشغيل Ollama تلقائياً، التحويل للنموذج المحلي عند انقطاع النت، و`SANAD_MODE=auto|offline|cloud` (الافتراضي عند الإقلاع)، و`setSanadMode` لتبديل الوضع أثناء التشغيل من ورقة «وضع العمل».
- **وضع العمل:** عند فتح سند تظهر ورقة `public/mode-picker.js` (`window.sanadModePicker`) بخيارين: «العمل باتصال» (`auto`، كل النماذج) و«العمل دون اتصال» (`offline`، النماذج المحلية فقط) ← `POST /api/brain/mode` ثم `window.reloadModels()`. تُفتح لاحقاً من شارة `#brainBadge`.
- **لا يوجد حوار صوتي:** أُزيل النطق والسماع وكلمة التنبيه ومكوّنات `vendor/` بالكامل بقرار المستخدم؛ لا تُعِد إضافتها دون طلب صريح.
- `public/instant-commands.js` (`window.sanadIntents`): أوامر الشبكة والمنافذ الفورية دون العقل («حرر بورت 3000»، «افحص النت»)، مع توحيد النص (النداء والأرقام كلمات «ثلاثة آلاف» ← 3000). يُستدعى أول `tryHandleSystemIntent`. الاختبارات: `npm.cmd run test:commands`.

### 2. الواجهة الأمامية (`public/`):
واجهة ويب عربية (RTL) مبنية بـ HTML5/CSS3/Vanilla JS، **بأسلوب iOS على آيفون برو ماكس حديث** (Liquid Glass، عناوين كبيرة، قوائم مجمّعة، أوراق Sheets، فقاعات iMessage، إشعارات Banners، Dynamic Island، مركز التحكم). يعمل في الوضعين الداكن والفاتح (`data-theme`).

| الملف | المسؤولية |
|---|---|
| `public/index.html` | هيكل الصفحة فقط (~270 سطراً): الرأس، sprite أيقونات SVG، `#app`، ووسوم السكربتات بترتيبها |
| `public/chat-core.js` | **قلب المحادثة**: الحالة، الرسم، Markdown، الإرسال والبث، الأحداث، وتنفيذ أدوات النموذج |
| `public/markup-overlays.js` و `public/markup-modals.js` | هيكل HTML للكبسولة القديمة والبث ولوحة الأوامر، ولنوافذ الأدوات؛ يُدرَج في موضع وسمه نفسه (المعرّفات كما هي) |
| `public/globals.d.ts` + `tsconfig.ui.json` | فحص TypeScript للواجهة دون بناء: أنواع الأسماء المشتركة على `window` |
| وحدات النوافذ (سكربتات عادية تُحمَّل بعد السكربت المضمّن بالترتيب) | `models-ui.js`، `audio-fx.js`، `attachments.js`، `memory-ui.js`، `terminal-ui.js`، `tasks-ui.js`، `workflows-ui.js`، `vision-ui.js`، `visual-agent.js`، `live-stream.js`، `island-legacy.js`، `sys-stats.js`، `brain-status.js`، `network-ui.js`، `desktop-ui.js`، `preview-ui.js`، ثم `app-boot.js` أخيراً |
| `public/css/*.css` | التنسيق في 28 ملفاً مرقّماً بترتيب تحميلها في `index.html` (الترتيب = ترتيب التتالي): `01-tokens-palette.css` (المتغيرات ولوحة الألوان) … `28-misc.css`. الأقسام الأحدث في الملفات الأعلى رقماً |
| `public/ios.js` | الشريط العلوي والعنوان الكبير الذي يُطوى عند التمرير، وطفو الشريط وصندوق الإدخال فوق المحادثة |
| `public/ios-notify.js` | `sanadNotify()` (إشعارات Banners) و `sanadConfirm()` (نافذة تأكيد iOS) |
| `public/home.js` | الشاشة الرئيسية: ودجت الساعة، حلقات حالة الجهاز، أيقونات التطبيقات، اقتراحات سند |
| `public/ios-island.js` | شريط الحالة و Dynamic Island (`window.sanadIsland`، تُغذّى من `setIslandStatus`/`updateIslandLatest`) |
| `public/ios-control.js` | مركز التحكم (زر في الشريط، `Ctrl+Shift+C`، أو ضغط مطوّل على الجزيرة) |
| `public/ios-tabs.js` | تنقل الهاتف: الرئيسية، المحادثات، الأدوات، والاتصال (وضع العمل) |
| `public/mode-picker.js` | ورقة «وضع العمل» عند الفتح: باتصال (كل النماذج) / دون اتصال (المحلية فقط) |
| `public/instant-commands.js` | الأوامر الفورية للشبكة والمنافذ (`window.sanadIntents`) |
| `public/model-tools.js` | **تنفيذ أدوات النموذج** (`window.sanadModelTools`): وسم `<tool_use>` بصيغة واحدة، قائمة أدوات مسموحة بحقول محددة، JSON حقيقي، أول أداة صالحة فقط، لا شيء من داخل كتل الكود |
| `public/code-run.js` | زر «احفظ وشغّل» تحت كتل كود بايثون/جافاسكريبت (بضغطة المستخدم وبعد تأكيد؛ لا تشغيل تلقائي) |
| `public/command-registry.js` | **سجل الأوامر المحلية الموحّد** (`window.sanadCommands`): كل أمر ينفَّذ دون العقل سجل مستقل بأمثلته |
| `public/ios-apps.js` | نوافذ الأدوات كأوراق iOS (زر «تم»، أيقونة تطبيق، أدوات مقسّمة) |
| `public/ios-list.js` | قائمة المحادثات بأسلوب iOS مع البحث وتأكيد الحذف |
| `public/ios-polish.js` | إزالة الإيموجي والشروح الإنجليزية من نصوص واجهة النظام (لا يلمس محتوى المستخدم) |
| `public/palette.js` | لوحة الأوامر `Ctrl+K` |

- واجهة `#cyberIsland` القديمة مخفية؛ وضع العرض المصغّر والإجراءات السريعة يستخدمان Dynamic Island في `ios-island.js`.
- النوافذ: المعاينة الحية `#previewModalBackdrop`، نبض النظام `#sysStatsModalBackdrop`، الطرفية `#terminalModalBackdrop`، سطح المكتب `#desktopModalBackdrop`، الشبكة `#networkModalBackdrop`، الذاكرة والمهام والمسارات.

**قواعد الواجهة:**
- **تعديلات التنسيق تُقاس:** `node scripts/css-audit/audit.mjs --candidate نسخة.css` يقارن الأنماط المحسوبة لكل عنصر في 38 حالة من الواجهة. لا `!important` جديد إلا بسبب مثبت، ولا ألوان حرفية: أضف اللون إلى لوحة `01-tokens-palette.css`.
- **فحص الأنواع للواجهة إلزامي:** `npm.cmd run typecheck` (يشمل `tsconfig.ui.json`) يجب أن يعطي 0 أخطاء. أي `window.X` جديد يُعرَّف في `public/globals.d.ts`، وعناصر `getElementById` تُكتب بنوعها (`/** @type {HTMLInputElement} */ (…)`).
- **أداة نموذج جديدة** تُضاف في `TOOLS` داخل `public/model-tools.js` بحقولها، وتُذكر بالصيغة نفسها في تعليمات `src/config.ts` (اختبار يتحقق أن كل أداة في التعليمات معرّفة).
- **وحدات النوافذ سكربتات عادية لا `module`:** تتشارك الأسماء العامة مع السكربت المضمّن. ترتيب الوسوم بعد `</script>` هو ترتيب التنفيذ: كود يعمل عند التحميل لا يستدعي دالة من ملف يأتي بعده. `app-boot.js` يبقى الأخير.
- **أي أمر محلي جديد** (يُنفَّذ دون العقل) يُضاف سجلاً في `public/command-registry.js` لا شرطاً في `index.html`: `id`، `risk` (`safe`/`action`/`danger`)، `examples` و`nonExamples` (تُختبر آلياً)، `match` و`run`. أوامر `action`/`danger` لا تطابق الأسئلة ولا الجمل الطويلة إلا بصيغة صريحة (`explicit`).
- **لا تغيّر معرّفات العناصر** في `index.html`؛ المنطق ووحدات iOS تعتمد عليها. أي سلوك جديد يوضع في وحدة `public/*.js` مستقلة.
- لا خطوط SF ولا SF Symbols ولا شعار Apple؛ استخدم أيقونات Lucide في الـ sprite وخط IBM Plex Sans Arabic.
- لا `alert()`/`confirm()`؛ استخدم `sanadNotify` و `sanadConfirm`. النصوص القادمة من الخادم أو النموذج تُدرج عبر `textContent`.
- الألوان من المتغيرات فقط، مع قيم للوضع الفاتح في `:root[data-theme="light"]`، وكل حركة تحترم `prefers-reduced-motion`.
- المهارات `ios-hig` و `frontend-design` و `i18n-accessibility` في `.claude/skills/` هي المرجع للتصميم.

### 3. السكربتات المساعدة (`scripts/`):
- `scripts/globalHotkey.py`: خادم بايثون خفيف يلتقط الاختصارات العالمية (`Ctrl + Alt + S` لفتح سند).
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
| `POST /api/brain/mode` | POST | وضع العمل `{mode: "auto"|"offline"|"cloud"}` (غير ذلك ← 400) |
| `GET /api/network/ports` · `POST /api/network/kill-port` · `POST /api/network/ping` · `GET /api/network/info` | — | الشبكة والمنافذ |

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
   - **أي مسار API جديد يُصنَّف في `tests/routes.manifest.mjs`** (`read` أو `validate` أو `guardOnly` مع السبب)، وإلا يفشل `npm.cmd test`. المسار الذي ينفّذ إجراءً حقيقياً دون مدخلات يُصنَّف `guardOnly`: لا يُرسل له طلب بصلاحية في الاختبارات أبداً.
   - لقطات `tests/ui/baseline/` تحوي بيانات شخصية والمستودع عام: تبقى خارج git.
4. **تجنب تكرار الكود:**
   - استفد من الأدوات الموجودة في `src/systemTools.ts` و `src/diskInspector.ts` و `src/processMaestro.ts` بدلاً من إعادة كتابة وظائف التفاعل مع الويندوز.
