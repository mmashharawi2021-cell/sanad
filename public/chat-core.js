/* سند — قلب المحادثة: الحالة، الرسم، Markdown، الإرسال والبث، الأحداث.
   نُقل حرفياً من السكربت المضمّن في index.html (إكمال المرحلة 4). سكربت عادي (لا module) يُحمَّل في الموضع نفسه:
   متغيراته ودواله العامة مشتركة مع وحدات النوافذ التي تُحمَّل بعده. */
      /* ======================= state ======================= */

      const STORE_KEY = "opencode.chat.v1";
      const USAGE_KEY = "opencode.usage.v1";
      const THEME_KEY = "opencode.theme";
      const HISTORY_LIMIT = 20;

      const app = document.getElementById("app");
      const sidebar = document.getElementById("sidebar");
      const backdrop = document.getElementById("backdrop");
      const openNavButton = /** @type {HTMLButtonElement} */ (document.getElementById("openNav"));
      const convList = document.getElementById("convList");
      const thread = document.getElementById("thread");
      const statsEl = document.getElementById("stats");
      const themeBtn = /** @type {HTMLButtonElement} */ (document.getElementById("theme"));
      const convTitle = document.getElementById("convTitle");
      const convMeta = document.getElementById("convMeta");
      const modelPicker = document.getElementById("modelPicker");
      const modelBtn = /** @type {HTMLButtonElement} */ (document.getElementById("modelBtn"));
      const modelBtnName = document.getElementById("modelBtnName");
      const modelBtnMeta = document.getElementById("modelBtnMeta");
      const modelPanel = document.getElementById("modelPanel");
      const modelSearch = /** @type {HTMLInputElement} */ (document.getElementById("modelSearch"));
      const modelList = document.getElementById("modelList");
      const modelFoot = document.getElementById("modelFoot");
      const form = /** @type {HTMLFormElement} */ (document.getElementById("form"));
      const promptEl = /** @type {HTMLTextAreaElement} */ (document.getElementById("prompt"));
      const sendBtn = /** @type {HTMLButtonElement} */ (document.getElementById("send"));
      const stopBtn = /** @type {HTMLButtonElement} */ (document.getElementById("stop"));
      const attachBtn = /** @type {HTMLButtonElement} */ (document.getElementById("attachBtn"));
      const fileInput = /** @type {HTMLInputElement} */ (document.getElementById("fileInput"));
      const attachmentBar = document.getElementById("attachmentBar");
      const dropOverlay = document.getElementById("dropOverlay");
      const announcer = document.getElementById("announcer");

      const memoryBtn = /** @type {HTMLButtonElement} */ (document.getElementById("memoryBtn"));
      const memoryCount = document.getElementById("memoryCount");
      const memoryModalBackdrop = document.getElementById("memoryModalBackdrop");
      const memoryCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("memoryCloseBtn"));
      const newMemoryInput = /** @type {HTMLInputElement} */ (document.getElementById("newMemoryInput"));
      const newMemoryCategory = /** @type {HTMLSelectElement} */ (document.getElementById("newMemoryCategory"));
      const addMemoryBtn = /** @type {HTMLButtonElement} */ (document.getElementById("addMemoryBtn"));
      const memoryList = document.getElementById("memoryList");

      const terminalBtn = /** @type {HTMLButtonElement} */ (document.getElementById("terminalBtn"));
      const terminalModalBackdrop = document.getElementById("terminalModalBackdrop");
      const terminalCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("terminalCloseBtn"));
      const terminalBody = document.getElementById("terminalBody");
      const terminalLogs = document.getElementById("terminalLogs");
      const terminalInput = /** @type {HTMLInputElement} */ (document.getElementById("terminalInput"));
      const terminalRunBtn = /** @type {HTMLButtonElement} */ (document.getElementById("terminalRunBtn"));

      const tasksBtn = /** @type {HTMLButtonElement} */ (document.getElementById("tasksBtn"));
      const tasksCount = document.getElementById("tasksCount");
      const tasksModalBackdrop = document.getElementById("tasksModalBackdrop");
      const tasksCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("tasksCloseBtn"));
      const newTaskTitle = /** @type {HTMLInputElement} */ (document.getElementById("newTaskTitle"));
      const newTaskInterval = /** @type {HTMLSelectElement} */ (document.getElementById("newTaskInterval"));
      const newTaskAction = /** @type {HTMLInputElement} */ (document.getElementById("newTaskAction"));
      const addTaskBtn = /** @type {HTMLButtonElement} */ (document.getElementById("addTaskBtn"));
      const tasksList = document.getElementById("tasksList");

      const workflowsBtn = /** @type {HTMLButtonElement} */ (document.getElementById("workflowsBtn"));
      const workflowsCount = document.getElementById("workflowsCount");
      const workflowsModalBackdrop = document.getElementById("workflowsModalBackdrop");
      const workflowsCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("workflowsCloseBtn"));
      const workflowsList = document.getElementById("workflowsList");

      const topScreenVisionBtn = /** @type {HTMLButtonElement} */ (document.getElementById("topScreenVisionBtn"));
      const screenVisionBtn = /** @type {HTMLButtonElement} */ (document.getElementById("screenVisionBtn"));
      const liveStreamBtn = /** @type {HTMLButtonElement} */ (document.getElementById("liveStreamBtn"));
      const liveStreamLabel = document.getElementById("liveStreamLabel");
      const liveStreamHud = document.getElementById("liveStreamHud");
      const liveStreamVideo = /** @type {HTMLVideoElement} */ (document.getElementById("liveStreamVideo"));
      const liveCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("liveCloseBtn"));
      const liveAskBtn = /** @type {HTMLButtonElement} */ (document.getElementById("liveAskBtn"));
      const liveClickBtn = /** @type {HTMLButtonElement} */ (document.getElementById("liveClickBtn"));
      const liveDoubleClickBtn = /** @type {HTMLButtonElement} */ (document.getElementById("liveDoubleClickBtn"));
      const liveRightClickBtn = /** @type {HTMLButtonElement} */ (document.getElementById("liveRightClickBtn"));
      let liveMediaStream = null;

      const cyberIsland = document.getElementById("cyberIsland");
      const islandInput = /** @type {HTMLInputElement} */ (document.getElementById("islandInput"));
      const islandForm = /** @type {HTMLFormElement} */ (document.getElementById("islandForm"));
      const islandVisionBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandVisionBtn"));
      const islandExpandBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandExpandBtn"));
      const islandLatestMsg = document.getElementById("islandLatestMsg");
      const islandStatusText = document.getElementById("islandStatusText");
      const islandWaves = document.getElementById("islandWaves");
      const toggleIslandBtn = /** @type {HTMLButtonElement} */ (document.getElementById("toggleIslandBtn"));
      const islandToggleModeBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandToggleModeBtn"));
      const islandDragHandle = document.getElementById("islandDragHandle");

      const islandQuickClickBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandQuickClickBtn"));
      const islandQuickEnterBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandQuickEnterBtn"));
      const islandQuickSaveBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandQuickSaveBtn"));
      const islandQuickNewBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandQuickNewBtn"));
      const islandQuickEscBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandQuickEscBtn"));
      const islandOrganizeDesktopBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandOrganizeDesktopBtn"));
      const islandRoutineMorningBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandRoutineMorningBtn"));
      const islandRoutineFocusBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandRoutineFocusBtn"));
      const islandRoutineWrapupBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandRoutineWrapupBtn"));
      const terminalShellSelect = /** @type {HTMLSelectElement} */ (document.getElementById("terminalShellSelect"));

      const desktopManagerBtn = /** @type {HTMLButtonElement} */ (document.getElementById("desktopManagerBtn"));
      const desktopModalBackdrop = document.getElementById("desktopModalBackdrop");
      const desktopCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("desktopCloseBtn"));
      const desktopFilesSummary = document.getElementById("desktopFilesSummary");
      const downloadsFilesSummary = document.getElementById("downloadsFilesSummary");
      const runOrganizeDesktopBtn = /** @type {HTMLButtonElement} */ (document.getElementById("runOrganizeDesktopBtn"));
      const runOrganizeDownloadsBtn = /** @type {HTMLButtonElement} */ (document.getElementById("runOrganizeDownloadsBtn"));
      const desktopStatusAlert = document.getElementById("desktopStatusAlert");
      const presetGisBtn = /** @type {HTMLButtonElement} */ (document.getElementById("presetGisBtn"));
      const presetCodingBtn = /** @type {HTMLButtonElement} */ (document.getElementById("presetCodingBtn"));
      const presetCleanBtn = /** @type {HTMLButtonElement} */ (document.getElementById("presetCleanBtn"));

      const sysStatsBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sysStatsBtn"));
      const sysStatsModalBackdrop = document.getElementById("sysStatsModalBackdrop");
      const sysStatsCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sysStatsCloseBtn"));
      const sysDeviceMeta = document.getElementById("sysDeviceMeta");
      const sysCleanTempBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sysCleanTempBtn"));
      const sysRefreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sysRefreshBtn"));
      const sysCleanAlert = document.getElementById("sysCleanAlert");
      const sysGrid = document.getElementById("sysGrid");
      const sysOptimizeRamBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sysOptimizeRamBtn"));
      const sysDrivesContainer = document.getElementById("sysDrivesContainer");
      const sysScanLargeFilesBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sysScanLargeFilesBtn"));
      const sysLargeFilesList = document.getElementById("sysLargeFilesList");
      const islandRamBoostBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandRamBoostBtn"));
      const islandDiskCleanBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandDiskCleanBtn"));

      const previewModalBackdrop = document.getElementById("previewModalBackdrop");
      const previewProjectName = document.getElementById("previewProjectName");
      const previewProjectSelect = /** @type {HTMLSelectElement} */ (document.getElementById("previewProjectSelect"));
      const previewDesktopBtn = /** @type {HTMLButtonElement} */ (document.getElementById("previewDesktopBtn"));
      const previewMobileBtn = /** @type {HTMLButtonElement} */ (document.getElementById("previewMobileBtn"));
      const previewRefreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById("previewRefreshBtn"));
      const previewOpenTabBtn = /** @type {HTMLButtonElement} */ (document.getElementById("previewOpenTabBtn"));
      const previewOpenCodeBtn = /** @type {HTMLButtonElement} */ (document.getElementById("previewOpenCodeBtn"));
      const previewCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("previewCloseBtn"));
      const projectPreviewIframe = /** @type {HTMLIFrameElement} */ (document.getElementById("projectPreviewIframe"));
      const projectPreviewBtn = /** @type {HTMLButtonElement} */ (document.getElementById("projectPreviewBtn"));
      const islandProjectsBtn = /** @type {HTMLButtonElement} */ (document.getElementById("islandProjectsBtn"));

      let currentAttachments = [];

      let state = loadState();
      let models = [];
      let defaultModel = "";
      let modelsSource = "";
      let modelsGeneratedAt = "";
      let modelsReady = false;
      let pickerOpen = false;
      let activeIndex = 0;
      let pickerItems = [];
      let busy = false;
      let controller = null;
      let activeEls = null;

      function loadState() {
        try {
          const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
          const conversations = Array.isArray(raw.conversations) ? raw.conversations : [];

          for (const conv of conversations) {
            if (!Array.isArray(conv.messages)) conv.messages = [];
            // A reply interrupted by a reload should not stay "pending" forever.
            conv.messages = conv.messages.filter(
              (message) => !(message.role === "assistant" && message.pending && !message.content),
            );
            for (const message of conv.messages) message.pending = false;
          }

          return {
            conversations,
            activeId: typeof raw.activeId === "string" ? raw.activeId : null,
            model: typeof raw.model === "string" ? raw.model : "",
          };
        } catch {
          return { conversations: [], activeId: null, model: "" };
        }
      }

      function saveState() {
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch {}
      }

      function activeConv() {
        return state.conversations.find((conv) => conv.id === state.activeId) || null;
      }

      function uid() {
        return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
      }

      /* ======================= theme ======================= */

      function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        themeBtn.innerHTML = theme === "dark" ? '<svg class="ico" aria-hidden="true"><use href="#i-moon"/></svg><span>الوضع الداكن</span>' : '<svg class="ico" aria-hidden="true"><use href="#i-sun"/></svg><span>الوضع الفاتح</span>';
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch {}
      }

      applyTheme(localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");

      themeBtn.addEventListener("click", () => {
        applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      });

      /* ======================= usage ======================= */

      function readUsage() {
        const today = new Date().toISOString().slice(0, 10);
        let usage = { date: today, count: 0, totalMs: 0, samples: 0 };
        try {
          const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || "null");
          if (raw && raw.date === today) usage = raw;
        } catch {}
        return usage;
      }

      function writeUsage(usage) {
        try {
          localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
        } catch {}
      }

      function bumpUsage(latencyMs) {
        const usage = readUsage();
        usage.count += 1;
        if (Number.isFinite(latencyMs) && latencyMs > 0) {
          usage.totalMs += latencyMs;
          usage.samples += 1;
        }
        writeUsage(usage);
        renderStats();
      }

      function renderStats() {
        const usage = readUsage();
        const avg = usage.samples ? Math.round(usage.totalMs / usage.samples / 100) / 10 : 0;
        statsEl.innerHTML =
          `طلبات اليوم: <b>${usage.count} / 50</b>` +
          (avg ? `<br>متوسط الرد: <b>${avg} ث</b>` : "") +
          `<br><span style="opacity:.75">حد الموديلات المجانية في OpenRouter</span>`;
      }

      /* ======================= rendering ======================= */

      function renderAll() {
        renderSidebar();
        renderThread();
        renderMeta();
        renderModelButton();
        renderStats();
      }

      function renderSidebar() {
        convList.innerHTML = "";

        const sorted = [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
        if (!sorted.length) {
          const empty = document.createElement("div");
          empty.className = "side-empty";
          empty.textContent = "لا توجد محادثات بعد. ابدأ بسؤال.";
          convList.appendChild(empty);
          return;
        }

        for (const conv of sorted) {
          const item = document.createElement("div");
          item.className = "conv" + (conv.id === state.activeId ? " active" : "");
          item.tabIndex = 0;
          item.setAttribute("role", "button");

          // صف بأسلوب قائمة الرسائل في iOS: دائرة بالحرف الأول، العنوان، آخر رسالة، والوقت
          const name = conv.title || "محادثة جديدة";
          const avatar = document.createElement("span");
          avatar.className = "conv-avatar";
          avatar.dataset.hue = String([...name].reduce((h, ch) => (h + ch.codePointAt(0)) % 6, 0));
          avatar.textContent = [...name.replace(/^[^\p{L}\p{N}]+/u, "")][0] || "س";

          const main = document.createElement("span");
          main.className = "conv-main";
          const top = document.createElement("span");
          top.className = "conv-top";
          const title = document.createElement("span");
          title.className = "conv-title";
          title.textContent = name;
          const time = document.createElement("span");
          time.className = "conv-time";
          time.textContent = convTimeLabel(conv.updatedAt);
          top.append(title, time);
          const preview = document.createElement("span");
          preview.className = "conv-preview";
          const last = [...conv.messages].reverse().find((m) => m.content || m.displayContent);
          const lastText = last ? String(last.displayContent || last.content).replace(/[`*#>|_-]+/g, " ").replace(/\s+/g, " ").trim() : "";
          preview.textContent = last ? `${last.role === "user" ? "أنت: " : ""}${lastText.slice(0, 90)}` : "لا رسائل بعد";
          main.append(top, preview);

          const del = document.createElement("button");
          del.className = "conv-del";
          del.type = "button";
          del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-x"/></svg>';
          del.title = "حذف المحادثة";
          del.setAttribute("aria-label", `حذف المحادثة: ${name}`);
          del.addEventListener("click", async (event) => {
            event.stopPropagation();
            const ok = await sanadConfirm({
              title: "حذف المحادثة؟",
              message: `ستُحذف «${name}» نهائياً من هذا الجهاز.`,
              confirmText: "حذف",
              destructive: true,
            });
            if (ok) deleteConversation(conv.id);
          });

          const open = () => selectConversation(conv.id);
          item.addEventListener("click", open);
          item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              open();
            }
          });

          item.append(avatar, main, del);
          convList.appendChild(item);
        }
      }

      // وقت المحادثة كما في iOS: الساعة اليوم، «أمس»، اسم اليوم خلال أسبوع، وإلا التاريخ
      function convTimeLabel(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        const now = new Date();
        const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const days = Math.round((startOf(now) - startOf(d)) / 86400000);
        if (days <= 0) return d.toLocaleTimeString("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" });
        if (days === 1) return "أمس";
        if (days < 7) return d.toLocaleDateString("ar-u-nu-latn", { weekday: "long" });
        return d.toLocaleDateString("ar-u-nu-latn", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
      }

      function renderMeta() {
        const conv = activeConv();
        const used = state.model || conv?.model || "";
        const model = used ? findModel(used) : null;
        const label = model ? model.name : used || "الافتراضي";

        convTitle.textContent = conv?.title || "محادثة جديدة";
        convMeta.textContent = `${label} · مجاني عبر OpenRouter`;
      }

      function renderThread() {
        thread.innerHTML = "";
        const inner = document.createElement("div");
        inner.className = "thread-inner";

        const conv = activeConv();
        if (!conv || !conv.messages.length) {
          inner.appendChild(emptyState());
        } else {
          conv.messages.forEach((message, index) => {
            inner.appendChild(messageEl(conv, message, index));
          });
          const lastMsg = conv.messages[conv.messages.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            updateIslandLatest(lastMsg.content);
          }
        }

        thread.appendChild(inner);
        scrollToBottom(true);
      }

      function emptyState() {
        // الشاشة الرئيسية بأسلوب iPhone (public/home.js)
        return window.sanadHomeScreen({
          onSuggest(text) {
            promptEl.value = text;
            promptEl.focus();
            autoGrow();
          },
        });
      }

      // لقطات الشاشة المرافقة لرسائل الوكيل البصري: في الذاكرة فقط (لا تُحفظ مع المحادثات — خصوصية وحجم)
      const transientScreenshots = new WeakMap();

      function screenshotFigure(dataUrl) {
        const fig = document.createElement("figure");
        fig.className = "msg-screenshot";
        const cap = document.createElement("figcaption");
        cap.textContent = "لقطة الشاشة التي حلّلها الوكيل";
        const img = document.createElement("img");
        img.alt = "لقطة الشاشة";
        img.loading = "lazy";
        img.src = dataUrl;
        fig.append(cap, img);
        return fig;
      }

      function messageEl(conv, message, index) {
        const wrap = document.createElement("article");
        wrap.className = `msg ${message.role}`;
        wrap.dataset.index = String(index);

        const bubble = document.createElement("div");
        bubble.className = "bubble";

        const body = document.createElement("div");
        body.className = "bubble-body";

        if (message.role === "user") {
          if (Array.isArray(message.attachments) && message.attachments.length) {
            const attBox = document.createElement("div");
            attBox.className = "msg-attachments";
            for (const att of message.attachments) {
              const badge = document.createElement("span");
              badge.className = "msg-attachment-badge";
              badge.textContent = `📄 ${att.filename}`;
              attBox.appendChild(badge);
            }
            body.appendChild(attBox);
          }
          const textDiv = document.createElement("div");
          textDiv.textContent = message.displayContent || message.content;
          body.appendChild(textDiv);
        } else if (message.pending && !message.content) {
          body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        } else {
          body.innerHTML = renderMarkdown(message.content || "");
          if (message.pending) body.classList.add("streaming");
          const shot = transientScreenshots.get(message);
          if (shot) body.prepend(screenshotFigure(shot));
        }

        if (message.notice) {
          const notice = document.createElement("div");
          notice.className = "note brain-notice";
          notice.textContent = message.notice;
          bubble.appendChild(notice);
        }

        bubble.appendChild(body);

        if (message.error) {
          bubble.appendChild(errorCard(message.error));
        }

        if (message.stopped && message.content) {
          const note = document.createElement("div");
          note.className = "note";
          note.textContent = "تم إيقاف التوليد — النص أعلاه غير مكتمل.";
          bubble.appendChild(note);
        }

        wrap.appendChild(bubble);

        // iOS: الإجراءات وسطر الموديل تحت الفقاعة لا داخلها
        if (message.role === "assistant" && !message.pending && message.content) {
          const foot = document.createElement("div");
          foot.className = "msg-foot";
          foot.appendChild(assistantTools(conv, index));
          foot.appendChild(assistantMeta(message));
          wrap.appendChild(foot);
        }
        return wrap;
      }

      function assistantMeta(message) {
        const meta = document.createElement("div");
        meta.className = "msg-meta";

        if (message.model) meta.appendChild(pill(`الموديل: <b dir="ltr">${escapeHtml(shortModel(message.model))}</b>`));
        if (message.latencyMs) meta.appendChild(pill(`الزمن: <b>${(message.latencyMs / 1000).toFixed(1)} ث</b>`));
        if (message.usage) meta.appendChild(pill(`التوكنز: <b>${message.usage.totalTokens}</b>`));

        return meta;
      }

      function pill(html) {
        const span = document.createElement("span");
        span.innerHTML = html;
        return span;
      }

      // يضع أيقونة ووصفاً لزر أدوات الرسالة (نسخ/استماع/إعادة التوليد) حسب حالته
      function setToolIcon(btn, icon, label) {
        btn.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${icon}"/></svg>`;
        btn.title = label;
        btn.setAttribute("aria-label", label);
      }

      function assistantTools(conv, index) {
        const tools = document.createElement("div");
        tools.className = "msg-tools";

        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "tool";
        copy.dataset.action = "copy-message";
        copy.dataset.index = String(index);
        setToolIcon(copy, "copy", "نسخ");

        tools.appendChild(copy);

        const isLast = index === conv.messages.length - 1;
        if (isLast) {
          const regen = document.createElement("button");
          regen.type = "button";
          regen.className = "tool";
          regen.dataset.action = "regenerate";
          setToolIcon(regen, "rotate", "إعادة التوليد");
          tools.appendChild(regen);
        }

        return tools;
      }

      function errorCard(error) {
        const card = document.createElement("div");
        card.className = "error-card";

        const strong = document.createElement("strong");
        strong.textContent = `✖ ${error.message}`;

        card.appendChild(strong);

        if (error.hint) {
          const hint = document.createElement("span");
          hint.className = "hint";
          hint.textContent = error.hint;
          card.appendChild(hint);
        }

        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "tool retry";
        retry.dataset.action = "retry";
        retry.textContent = "إعادة المحاولة";
        card.appendChild(retry);

        return card;
      }

      function shortModel(slug) {
        if (!slug) return "";
        if (slug.startsWith("ollama:")) return slug.replace("ollama:", "💻 Ollama: ");
        return slug.replace(/:free$/, " · free");
      }

      /* ======================= markdown ======================= */

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function renderMarkdown(source) {
        const blocks = [];

        const text = escapeHtml(source).replace(/```([\w+#.-]*)\n?([\s\S]*?)(```|$)/g, (_match, lang, code) => {
          const index = blocks.push({ lang: String(lang).trim(), code: code.replace(/\n$/, "") }) - 1;
          return `\n\u0000B${index}\u0000\n`;
        });

        const out = [];
        let list = null;
        let paragraph = [];

        const flushParagraph = () => {
          if (paragraph.length) {
            out.push(`<p>${inline(paragraph.join(" "))}</p>`);
            paragraph = [];
          }
        };

        const closeList = () => {
          if (list) {
            out.push(`</${list}>`);
            list = null;
          }
        };

        // Tables (| a | b |) and blockquotes (> …). Source is already HTML-escaped,
        // so ">" arrives as "&gt;" and cell text goes through inline() only.
        let tableRows = [];
        let quote = [];
        const splitRow = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
        const flushTable = () => {
          if (!tableRows.length) return;
          const rows = tableRows;
          tableRows = [];
          const isSep = (row) => /^\|?[\s:|-]+\|?$/.test(row) && row.includes("-");
          if (rows.length >= 2 && isSep(rows[1])) {
            const head = splitRow(rows[0]);
            const body = rows.slice(2).map(splitRow);
            out.push(
              `<div class="md-table-wrap"><table class="md-table"><thead><tr>` +
                head.map((c) => `<th>${inline(c)}</th>`).join("") +
                `</tr></thead><tbody>` +
                body.map((r) => `<tr>${head.map((_, i) => `<td>${inline(r[i] ?? "")}</td>`).join("")}</tr>`).join("") +
                `</tbody></table></div>`,
            );
          } else {
            paragraph.push(...rows);
          }
        };
        const flushQuote = () => {
          if (!quote.length) return;
          out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
          quote = [];
        };

        for (const rawLine of text.split("\n")) {
          const line = rawLine.trimEnd();
          const placeholder = /^\u0000B(\d+)\u0000$/.exec(line.trim());

          if (/^\s*\|.*\|\s*$/.test(line)) {
            flushParagraph();
            closeList();
            flushQuote();
            tableRows.push(line.trim());
            continue;
          }
          flushTable();

          const quoteLine = /^\s*&gt;\s?(.*)$/.exec(line);
          if (quoteLine) {
            flushParagraph();
            closeList();
            quote.push(quoteLine[1]);
            continue;
          }
          flushQuote();

          if (placeholder) {
            flushParagraph();
            closeList();
            const block = blocks[Number(placeholder[1])] || { lang: "", code: "" };
            // «احفظ وشغّل» لكود بايثون وجافاسكريبت فقط — يُنفَّذ بضغطة المستخدم بعد تأكيد (public/code-run.js)
            const runnable = /^(?:python|py|javascript|js|node|mjs)$/i.test(block.lang || "");
            out.push(
              `<div class="code"><div class="code-head"><span>${escapeHtml(block.lang || "code")}</span>` +
                (runnable ? `<button type="button" class="code-run" data-lang="${escapeHtml(block.lang)}">احفظ وشغّل</button>` : "") +
                `<button type="button" class="code-copy">نسخ</button></div>` +
                `<pre><code>${block.code}</code></pre></div>`,
            );
            continue;
          }

          if (!line.trim()) {
            flushParagraph();
            closeList();
            continue;
          }

          if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            flushParagraph();
            closeList();
            out.push("<hr>");
            continue;
          }

          const heading = /^(#{1,3})\s+(.*)$/.exec(line);
          if (heading) {
            flushParagraph();
            closeList();
            const level = heading[1].length + 2;
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
          }

          const bullet = /^[-*•]\s+(.*)$/.exec(line);
          if (bullet) {
            flushParagraph();
            if (list !== "ul") {
              closeList();
              out.push("<ul>");
              list = "ul";
            }
            out.push(`<li>${inline(bullet[1])}</li>`);
            continue;
          }

          const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
          if (numbered) {
            flushParagraph();
            if (list !== "ol") {
              closeList();
              out.push("<ol>");
              list = "ol";
            }
            out.push(`<li>${inline(numbered[1])}</li>`);
            continue;
          }

          if (list) closeList();
          paragraph.push(line.trim());
        }

        flushTable();
        flushQuote();
        flushParagraph();
        closeList();

        return out.join("");
      }

      function inline(text) {
        return text
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
          .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
      }

      /* ======================= scrolling ======================= */

      function nearBottom() {
        return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
      }

      function scrollToBottom(force = false) {
        if (force || nearBottom()) {
          thread.scrollTop = thread.scrollHeight;
        }
      }

      /* ======================= actions ======================= */

      function newConversation() {
        const conv = {
          id: uid(),
          title: "",
          model: state.model || "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        };

        state.conversations.unshift(conv);
        state.activeId = conv.id;
        saveState();
        renderAll();
        promptEl.focus();
        closeNav(false);
      }

      function selectConversation(id) {
        state.activeId = id;
        const conv = activeConv();
        if (conv && conv.model !== undefined) {
          state.model = conv.model;
        }
        saveState();
        renderAll();
        closeNav();
      }

      function deleteConversation(id) {
        state.conversations = state.conversations.filter((conv) => conv.id !== id);
        if (state.activeId === id) {
          state.activeId = state.conversations[0]?.id || null;
        }
        saveState();
        renderAll();
      }

      function ensureConversation() {
        let conv = activeConv();
        if (!conv) {
          conv = {
            id: uid(),
            title: "",
            model: state.model || "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
          };
          state.conversations.unshift(conv);
          state.activeId = conv.id;
        }
        return conv;
      }

      /**
       * الأوامر المحلية (دون العقل) في سجل موحّد: public/command-registry.js (window.sanadCommands).
       * هنا فقط ما يحتاجه كل أمر من الواجهة؛ المطابقة والتنفيذ وأمثلة الاختبار في السجل.
       */
      async function tryHandleSystemIntent(text, conv, assistant) {
        if (!window.sanadCommands) return false;
        // كما كان: رسالة الخادم تُعرض حتى مع حالة خطأ (لا تُرمى)
        const json = (res) => res.json();
        return window.sanadCommands.handle(text, conv, assistant, {
          model: state.model || conv.model || "",
          save: saveState,
          renderAll,
          sound: playSciFiSound,
          get: (path) => fetch(path).then(json),
          post: (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json),
          // رد نهائي: النص + اسم المحرك + الزمن، ثم حفظ ورسم المحادثة والقائمة
          reply(content, model, latencyMs) {
            assistant.content = content;
            assistant.pending = false;
            assistant.model = model;
            if (latencyMs != null) assistant.latencyMs = latencyMs;
            saveState();
            renderThread();
            renderSidebar();
          },
          // نص مؤقت أثناء العمل، ثم finish للنتيجة
          progress(content) {
            assistant.content = content;
            renderAll();
          },
          finish(content, model, latencyMs) {
            assistant.content = content;
            assistant.pending = false;
            if (model) assistant.model = model;
            if (latencyMs != null) assistant.latencyMs = latencyMs;
            saveState();
            renderAll();
          },
          app: { triggerMouseAction, startLiveStream, stopLiveStream, runVisualAgentLoop, captureAndAnalyzeScreen, loadAndRenderMemories },
        });
      }

      async function sendMessage(text) {
        const conv = ensureConversation();
        const trimmed = text.trim();
        const hasAttachments = currentAttachments.length > 0;
        if (!trimmed && !hasAttachments) return;

        let fullPrompt = trimmed;
        let attachmentsForMsg = [];

        if (hasAttachments) {
          attachmentsForMsg = [...currentAttachments];
          const filesHeader = attachmentsForMsg
            .map(
              (a) =>
                `--- [محتوى الملف المرفق: ${a.filename}${a.pages ? ` (${a.pages} صفحات)` : ""}] ---\n${a.text}`,
            )
            .join("\n\n");

          fullPrompt = `${filesHeader}\n\n--- [سؤال أو طلب المستخدم] ---\n${trimmed || "يرجى قراءة وتحليل هذا الملف والإجابة عن أي استفسار حوله."}`;

          currentAttachments = [];
          renderAttachments();
        }

        const userMsg = {
          role: "user",
          content: fullPrompt,
          displayContent: trimmed || (attachmentsForMsg.length ? `[تم إرفاق ${attachmentsForMsg.map((a) => a.filename).join(", ")}]` : ""),
          attachments: attachmentsForMsg,
        };

        conv.messages.push(userMsg);
        if (!conv.title) conv.title = (trimmed || attachmentsForMsg[0]?.filename || "محادثة").slice(0, 70);
        conv.model = state.model || conv.model || "";
        conv.updatedAt = Date.now();

        const assistant = { role: "assistant", content: "", pending: true };
        conv.messages.push(assistant);

        saveState();
        renderAll();

        const handledLocally = await tryHandleSystemIntent(trimmed, conv, assistant);
        if (handledLocally) return;

        await runStream(conv, assistant);
      }

      async function runStream(conv, assistant) {
        busy = true;
        setBusy(true);

        assistant.pending = true;
        assistant.error = null;
        assistant.stopped = false;
        assistant.content = "";
        assistant.model = "";
        assistant.latencyMs = 0;
        assistant.usage = null;

        renderThread();
        activeEls = {
          body: thread.querySelector(`.msg.assistant[data-index="${conv.messages.length - 1}"] .bubble-body`),
        };

        controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);

        try {
          const history = conv.messages
            .filter((message) => message !== assistant && !message.pending && typeof message.content === "string")
            .slice(-HISTORY_LIMIT)
            .map((message) => ({ role: message.role, content: message.content }));

          const response = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history, model: conv.model || state.model || "" }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            const data = await response.json().catch(() => ({}));
            throw new AppError(data.error || `فشل الطلب (HTTP ${response.status})`, data.hint);
          }

          await consume(response.body, assistant);
          assistant.pending = false;

          await checkAndExecuteModelTools(assistant);

          if (!assistant.content && !assistant.error) {
            throw new AppError("لم يصل أي نص من الموديل", "أعد المحاولة، أو اختر موديلاً آخر.");
          }

          bumpUsage(assistant.latencyMs);
        } catch (error) {
          assistant.pending = false;

          if (error.name === "AbortError" || error.name === "TimeoutError") {
            assistant.stopped = Boolean(assistant.content);
            if (!assistant.content) {
              assistant.error = { message: "تم إلغاء الطلب", hint: "لم يصل نص خلال المهلة. جرّب موديلاً أسرع." };
            }
          } else if (error instanceof AppError) {
            assistant.error = { message: error.message, hint: error.hint };
          } else {
            assistant.error = {
              message: "تعذر الاتصال بالخادم",
              hint: "تأكد أن خادم التطوير يعمل: npm run dev",
            };
          }
        } finally {
          clearTimeout(timer);
          controller = null;
          busy = false;
          setBusy(false);

          conv.updatedAt = Date.now();
          saveState();
          renderSidebar();
          renderThread();
          renderMeta();

          announcer.textContent = assistant.error
            ? `خطأ: ${assistant.error.message}`
            : assistant.stopped
              ? "تم إيقاف الرد"
              : "اكتمل الرد";

          if (!assistant.error && !assistant.stopped) {
            playSciFiSound("done");
          }
        }
      }

      /**
       * أدوات النموذج: وسوم <tool_use> في رد النموذج تُقرأ وتُتحقق وتُنفَّذ في public/model-tools.js
       * (window.sanadModelTools) — قائمة مسموحة، JSON حقيقي، أول أداة صالحة فقط، لا شيء من داخل كتل الكود.
       * الطلبات الحساسة تمر بنافذة التأكيد في api-guard.js (انظر الغلاف «أمان» أدناه).
       */
      async function checkAndExecuteModelTools(assistant) {
        // أمان: ما دام العدّاد > 0 يطلب api-guard.js موافقة المستخدم على كل طلب حساس
        window.__sanadModelActing = (window.__sanadModelActing || 0) + 1;
        try {
          return await runModelTools(assistant);
        } finally {
          window.__sanadModelActing = Math.max(0, window.__sanadModelActing - 1);
        }
      }

      async function runModelTools(assistant) {
        if (!assistant || !window.sanadModelTools) return;
        // طلبات منظّمة (function calling) تُقدَّم على الوسوم النصية؛ ولا تُحفظ مع المحادثة
        const calls = assistant.toolCalls;
        delete assistant.toolCalls;
        if (!calls?.length && !assistant.content) return;
        const json = (res) => res.json();
        const ctx = {
          get: (path) => fetch(path).then(json),
          post: (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json),
          sound: playSciFiSound,
          openProjectPreview: (name) => setTimeout(() => window.openProjectPreview?.(name, "index.html"), 800),
        };
        const out = calls?.length
          ? await window.sanadModelTools.executeCalls(assistant.content, calls, ctx)
          : await window.sanadModelTools.execute(assistant.content, ctx);
        if (!out) return;
        assistant.content = out.content;
        renderThread();
        saveState();
      }

      class AppError extends Error {
        constructor(message, hint) {
          super(message);
          this.hint = hint;
        }
      }

      async function consume(body, assistant) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        const paint = () => {
          if (!activeEls?.body) return;
          activeEls.body.classList.remove("streaming");
          activeEls.body.innerHTML = renderMarkdown(assistant.content);
          activeEls.body.classList.add("streaming");
        };

        while (!done) {
          const chunk = await reader.read();
          if (chunk.done) break;

          buffer += decoder.decode(chunk.value, { stream: true });

          let split = buffer.indexOf("\n\n");
          while (split !== -1) {
            const raw = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            done = handleFrame(raw, assistant, paint) || done;
            split = buffer.indexOf("\n\n");
          }
        }

        if (activeEls?.body) activeEls.body.classList.remove("streaming");
      }

      function handleFrame(raw, assistant, paint) {
        let eventName = "message";
        let dataLine = "";

        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
        }

        if (!dataLine) return false;

        let data;
        try {
          data = JSON.parse(dataLine);
        } catch {
          return false;
        }

        if (eventName === "delta") {
          assistant.content += data.text ?? "";
          paint();
          scrollToBottom();
          return false;
        }

        // «استدعاء الأدوات» الرسمي: يُجمع ثم يُنفَّذ بعد اكتمال البث (checkAndExecuteModelTools ← model-tools.js)
        if (eventName === "tool_call") {
          if (typeof data.name === "string") (assistant.toolCalls ||= []).push({ name: data.name, arguments: data.arguments ?? "{}" });
          return false;
        }

        if (eventName === "notice") {
          assistant.notice = data.message || "";
          if (typeof updateIslandLatest === "function") updateIslandLatest(escapeHtml(assistant.notice));
          if (typeof refreshBrainStatus === "function") refreshBrainStatus();
          paint();
          return false;
        }

        if (eventName === "done") {
          assistant.model = data.model || "";
          assistant.latencyMs = data.latencyMs || 0;
          assistant.usage = data.usage || null;
          return true;
        }

        if (eventName === "error") {
          assistant.error = { message: data.error || "خطأ غير معروف", hint: data.hint };
          return true;
        }

        return false;
      }

      function retryLast() {
        const conv = activeConv();
        if (!conv || busy) return;

        const assistant = conv.messages[conv.messages.length - 1];
        if (!assistant || assistant.role !== "assistant") return;

        runStream(conv, assistant);
      }

      function regenerate() {
        const conv = activeConv();
        if (!conv || busy) return;

        const last = conv.messages[conv.messages.length - 1];
        if (!last || last.role !== "assistant") return;

        conv.messages.pop();
        const assistant = { role: "assistant", content: "", pending: true };
        conv.messages.push(assistant);
        runStream(conv, assistant);
      }

      /* ======================= ui state ======================= */

      function setBusy(value) {
        sendBtn.disabled = value;
        stopBtn.classList.toggle("hidden", !value);
        sendBtn.classList.toggle("hidden", value);
      }

      function autoGrow() {
        promptEl.style.height = "auto";
        promptEl.style.height = `${Math.min(promptEl.scrollHeight, 190)}px`;
      }

      function openNav() {
        sidebar.dataset.navView = openNavButton.dataset.navView || "history";
        delete openNavButton.dataset.navView;
        app.classList.add("nav-open");
        backdrop.classList.remove("hidden");
        openNavButton.setAttribute("aria-expanded", "true");
        if (window.matchMedia("(max-width: 600px)").matches) {
          sidebar.inert = false;
          /** @type {HTMLElement} */ (app.querySelector(".chat")).inert = true;
          document.querySelector(".ios-tabs")?.setAttribute("inert", "");
          sidebar.setAttribute("role", "dialog");
          sidebar.setAttribute("aria-modal", "true");
          sidebar.setAttribute("aria-labelledby", "mobileNavTitle");
        }
      }

      function closeNav(restoreFocus = true) {
        if (!app.classList.contains("nav-open")) return;
        /** @type {HTMLElement} */ (app.querySelector(".chat")).inert = false;
        document.querySelector(".ios-tabs")?.removeAttribute("inert");
        app.classList.remove("nav-open");
        backdrop.classList.add("hidden");
        openNavButton.setAttribute("aria-expanded", "false");
        sidebar.removeAttribute("role");
        sidebar.removeAttribute("aria-modal");
        sidebar.removeAttribute("aria-labelledby");
        if (restoreFocus && window.matchMedia("(max-width: 600px)").matches) {
          /** @type {HTMLElement | null} */ (document.querySelector(`.ios-tab[data-tab="${sidebar.dataset.navView}"]`))?.focus();
        }
      }

      /* ======================= events ======================= */

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (busy) return;
        const text = promptEl.value;
        promptEl.value = "";
        autoGrow();
        sendMessage(text);
      });

      promptEl.addEventListener("input", autoGrow);

      promptEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          if (!busy) form.requestSubmit();
        }
      });

      stopBtn.addEventListener("click", () => {
        controller?.abort();
      });

      document.getElementById("newChat").addEventListener("click", () => {
        newConversation();
      });
      document.getElementById("openNav").addEventListener("click", openNav);
      document.getElementById("closeNav").addEventListener("click", () => closeNav());
      backdrop.addEventListener("click", () => closeNav());

      thread.addEventListener("click", async (event) => {
        const codeCopy = /** @type {Element} */ (event.target).closest(".code-copy");
        if (codeCopy) {
          const code = codeCopy.closest(".code")?.querySelector("code");
          if (code) {
            try {
              await navigator.clipboard.writeText(code.textContent);
              codeCopy.textContent = "تم النسخ ✓";
              setTimeout(() => (codeCopy.textContent = "نسخ"), 1400);
            } catch {
              codeCopy.textContent = "تعذر النسخ";
            }
          }
          return;
        }

        const tool = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-action]"));
        if (!tool) return;

        const conv = activeConv();
        if (!conv) return;

        if (tool.dataset.action === "retry") retryLast();

        if (tool.dataset.action === "regenerate") regenerate();

        if (tool.dataset.action === "copy-message") {
          const index = Number(tool.dataset.index);
          const message = conv.messages[index];
          if (message) {
            try {
              await navigator.clipboard.writeText(message.content);
              setToolIcon(tool, "check", "تم النسخ");
              tool.classList.add("done");
              setTimeout(() => { setToolIcon(tool, "copy", "نسخ"); tool.classList.remove("done"); }, 1400);
            } catch {
              setToolIcon(tool, "alert", "تعذر النسخ");
            }
          }
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeNav();
          closeModelPicker();
        }
      });

      /* ======================= أمان: أدوات النموذج تحت التأكيد =======================
         أثناء تنفيذ الأدوات المستخرجة من رد النموذج، يطلب public/api-guard.js موافقة المستخدم
         قبل أي طلب حساس (أوامر، إنهاء عمليات، ملفات، مهام، ذاكرة...).
         العدّاد window.__sanadModelActing يُرفع داخل checkAndExecuteModelTools نفسها — انظر تعريفها. */
