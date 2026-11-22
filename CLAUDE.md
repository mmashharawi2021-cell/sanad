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

### 2. الواجهة الأمامية (`public/index.html`):
- واجهة ويب كاملة ذات كفاءة عالية مبنية بـ HTML5/CSS3/Vanilla JS بطراز **Neumorphic Glassmorphic Cyber**:
  - **Cyber Dynamic Island (`#cyberIsland`)**: الكبسولة العائمة الذكية مع أمواج صوتية ومفاتيح سريعة وتحكم في النظام.
  - **Full-Duplex Voice & Wake Word**: الاستماع الدائم لكلمة التنبيه ("يا سند") مع ميزة المقاطعة الحية (Barge-in).
  - **Live Web Preview Modal (`#previewModalBackdrop`)**: إطار تفاعلي للمعاينة الحية للمشاريع مع التبديل بين شاشة حاسوب وهاتف.
  - **Disk & Performance HUD (`#sysStatsModalBackdrop`)**: مراقب نبض النظام، بطاقات الأقراص، ومحرر الرام وفاحص أكبر الملفات.
  - **Universal Terminal Modal (`#terminalModalBackdrop`)**: طرفية تفاعلية متعددة البيئات.
  - **Desktop Automation Modal (`#desktopModalBackdrop`)**: منظم سطح المكتب والتنزيلات.

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
