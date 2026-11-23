import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, getConfig } from "./config";
import { readModelCatalog, toChatModels, type ChatModel, type OpenRouterModel } from "./models";
import { ask, askStream, toAppError, type Answer, type ChatTurn } from "./openrouter";
import { getSystemStats, launchApp, openFolder, openMediaFile, openFileDirectly, createOrWriteTextFile, cleanTemporaryFiles, setVolume, lockWorkstation, controlMouse, controlKeyboard } from "./systemTools";
import { askOllama, askOllamaStream, getOllamaChatModels, getOllamaStatus, isOllamaModel } from "./ollama";
import { extractTextFromBuffer, extractTextFromLocalPath } from "./fileReader";
import { getMemories, addMemory, deleteMemory, getSystemPromptWithMemory, getLocalSystemPromptWithMemory } from "./memory";
import { executeTerminalCommand, createFullProject, readProjectTree } from "./codeRunner";
import { searchWeb, fetchPageContent } from "./webSearch";
import { getTasks, createTask, toggleTask, deleteTask, runTaskNow, initTaskScheduler } from "./taskScheduler";
import { analyzeScreenImage, planAndExecuteVisualAction } from "./screenVision";
import { getWorkflows, deleteWorkflow } from "./actionMemory";
import { organizeDirectory, getDirectoryStatus, setupWorkspacePreset, inspectAndSummarizeFile } from "./desktopAutomation";
import { runUniversalCommand, type ShellType } from "./universalTerminal";
import { listProcesses, killProcess, launchAnyApp, setScreenBrightness, executeDailyRoutine } from "./processMaestro";
import { buildProject, getProjectFileContent, listBuiltProjects, type ProjectTemplate } from "./projectBuilder";
import { getDrivesInfo, findLargeFiles, safeDeepCleanDisk, optimizeRam, revealFileInExplorer, getSystemHealthOverview } from "./diskInspector";
import { listListeningPorts, checkPort, killPort, pingHost, getNetworkInfo } from "./networkMaestro";
import { ensureOllamaRunning, getBrainStatus, getSanadMode, initOfflineBrain, isNetworkError, isOnline, markOffline, requireLocalModel, resolveLocalModel } from "./offlineBrain";
import { cleanOllamaModelName } from "./ollama";
import { getSpeechStatus, transcribeWav } from "./localSpeech";
import { getVoiceStatus, synthesizeSpeech } from "./localVoice";
import { assertReadable } from "./safePaths";
import { deleteExtension, installDraft, listExtensions, proposeExtension, restorePreviousVersion, setExtensionEnabled, type Generate } from "./selfDev";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TURNS = 60;
const MAX_TURN_CHARS = 150_000; // Allow up to 150,000 characters per turn for large files and codebases
const REQUEST_TIMEOUT_MS = 90_000;
const STREAM_TIMEOUT_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const MODELS_TTL_MS = 10 * 60_000;

/* ======================= الحماية (Security gate) =======================
   1) الخادم يستمع على 127.0.0.1 فقط (لا وصول من أجهزة الشبكة).
   2) رأس Host يجب أن يكون localhost/127.0.0.1 على نفس المنفذ (يمنع DNS rebinding).
   3) كل طلب يغيّر الحالة (غير GET/HEAD) يجب أن:
      - يأتي من أصل سند نفسه إن أرسل المتصفح Origin (يمنع المواقع الأخرى / CSRF)،
      - ويحمل X-Sanad-Token الصحيح (رمز عشوائي يُولَّد عند كل إقلاع ويُحقن في الصفحة فقط)،
      - ويرسل Content-Type: application/json لطلبات JSON. */
const HOST = "127.0.0.1";
const SESSION_TOKEN = randomBytes(32).toString("hex");
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

function tokenMatches(given: string | string[] | undefined): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(SESSION_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** يعيد سبب الرفض، أو null إن كان الطلب مسموحاً. */
function securityRejection(req: IncomingMessage, pathname: string): string | null {
  const host = String(req.headers.host || "").toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return "Host غير مسموح.";
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return "مصدر الطلب غير مسموح.";
  if (pathname.startsWith("/api/") && !tokenMatches(req.headers["x-sanad-token"])) return "رمز الجلسة مفقود أو غير صحيح. أعد تحميل الصفحة.";
  return null;
}

type ModelsResult = {
  at: number;
  models: ChatModel[];
  source: "live" | "catalog";
  generatedAt?: string;
};

let modelsCache: ModelsResult | undefined;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const appError = toAppError(error);
    sendJson(res, appError.status, { error: appError.message, hint: appError.hint });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  const rejection = securityRejection(req, url.pathname);
  if (rejection) {
    sendJson(res, 403, { success: false, error: rejection, message: rejection });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat/stream") {
    await handleStream(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    await handleModels(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/system/stats") {
    const stats = await getSystemStats();
    sendJson(res, 200, stats);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/ollama/status") {
    const status = await getOllamaStatus();
    sendJson(res, 200, status);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/memory") {
    const memories = await getMemories();
    sendJson(res, 200, { success: true, count: memories.length, memories });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/memory") {
    const body = await readJsonBody(req);
    const content = String(body.content || "").trim();
    const category = (body.category || "general") as any;
    if (!content) {
      sendJson(res, 400, { error: "محتوى المعلومة لا يمكن أن يكون فارغاً." });
      return;
    }
    const memory = await addMemory(content, category);
    sendJson(res, 200, { success: true, memory });
    return;
  }

  /* ---------------- مطوّر سند الذاتي والإضافات ---------------- */
  if (req.method === "GET" && url.pathname === "/api/extensions") {
    sendJson(res, 200, { success: true, extensions: await listExtensions() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/selfdev/propose") {
    const body = await readJsonBody(req);
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    const reviseId = typeof body.reviseId === "string" && body.reviseId ? body.reviseId : undefined;
    const result = await proposeExtension(String(body.request || ""), selfDevGenerator(model), reviseId);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/extensions/restore") {
    const body = await readJsonBody(req);
    sendJson(res, 200, await restorePreviousVersion(String(body.id || "")));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/extensions/install") {
    const body = await readJsonBody(req);
    sendJson(res, 200, await installDraft(String(body.draftId || "")));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/extensions/toggle") {
    const body = await readJsonBody(req);
    sendJson(res, 200, await setExtensionEnabled(String(body.id || ""), body.enabled === true));
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/extensions") {
    const body = await readJsonBody(req);
    sendJson(res, 200, await deleteExtension(String(body.id || url.searchParams.get("id") || "")));
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/memory") {
    const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
    const id = url.searchParams.get("id") || String(body.id || "");
    if (!id) {
      sendJson(res, 400, { error: "معرف المعلومة مطلوب للحذف." });
      return;
    }
    const success = await deleteMemory(id);
    sendJson(res, 200, { success });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/terminal/exec") {
    const body = await readJsonBody(req);
    const command = String(body.command || "").trim();
    const cwd = typeof body.cwd === "string" ? body.cwd : undefined;
    const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : 45_000;

    if (!command) {
      sendJson(res, 400, { error: "الأمر المطلوب تنفيذه فارغ." });
      return;
    }

    const result = await executeTerminalCommand(command, cwd, timeoutMs);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/project/create") {
    const body = await readJsonBody(req);
    const projectName = String(body.projectName || "").trim();
    const files = Array.isArray(body.files) ? (body.files as any[]) : [];
    const baseFolder = (body.baseFolder || "desktop") as any;
    const openInVsCode = body.openInVsCode !== false;

    if (!projectName || !files.length) {
      sendJson(res, 400, { error: "اسم المشروع والملفات مطلوبة." });
      return;
    }

    const result = await createFullProject({ projectName, files, baseFolder, openInVsCode });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/project/build") {
    const body = await readJsonBody(req);
    const projectName = String(body.projectName || `project_${Date.now()}`).trim();
    const template = body.template as ProjectTemplate | undefined;
    const description = body.description ? String(body.description) : undefined;
    const files = Array.isArray(body.files) ? (body.files as any[]) : undefined;
    const baseFolder = body.baseFolder as any;
    const openInVsCode = body.openInVsCode !== false;
    const result = await buildProject({
      projectName,
      template,
      description,
      files,
      baseFolder,
      openInVsCode,
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/project/preview") {
    const projectName = url.searchParams.get("project") || "";
    const file = url.searchParams.get("file") || "index.html";
    if (!projectName) {
      sendJson(res, 400, { error: "يرجى تحديد اسم المشروع للمعاينه" });
      return;
    }
    const fileResult = await getProjectFileContent(projectName, file);
    if (!fileResult.found) {
      // نص عادي: اسم الملف قادم من الرابط ولا يجوز عرضه كـ HTML
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
      res.end(`الملف غير موجود: ${file}`);
      return;
    }
    res.writeHead(200, {
      "Content-Type": fileResult.contentType,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      // المشاريع المولّدة تعمل في أصل معزول (بلا allow-same-origin) فلا تقرأ رمز سند ولا تستدعي واجهته
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-modals",
    });
    res.end(fileResult.content);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/project/list") {
    const projects = await listBuiltProjects();
    sendJson(res, 200, { success: true, projects });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/project/tree") {
    const body = await readJsonBody(req);
    const targetPath = String(body.path || ".");
    const tree = await readProjectTree(targetPath);
    sendJson(res, 200, { success: true, tree });
    return;
  }

  // --- Web Search & Scraping Endpoints ---
  if (req.method === "POST" && url.pathname === "/api/web/search") {
    const body = await readJsonBody(req);
    const query = String(body.query || "").trim();
    const limit = typeof body.limit === "number" ? body.limit : 5;
    if (!query) {
      sendJson(res, 400, { error: "يرجى تحديد عبارة البحث." });
      return;
    }
    const results = await searchWeb(query, limit);
    sendJson(res, 200, { success: true, query, count: results.length, results });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/web/read") {
    const body = await readJsonBody(req);
    const targetUrl = String(body.url || "").trim();
    const maxChars = typeof body.maxChars === "number" ? body.maxChars : 6000;
    if (!targetUrl) {
      sendJson(res, 400, { error: "يرجى تزويد رابط الصفحة." });
      return;
    }
    const page = await fetchPageContent(targetUrl, maxChars);
    sendJson(res, 200, { success: true, page });
    return;
  }

  // --- Live Screen Vision Endpoint ---
  if (req.method === "POST" && url.pathname === "/api/vision/analyze") {
    const body = await readJsonBody(req, 15 * 1024 * 1024);
    const imageBase64 = String(body.imageBase64 || "").trim();
    const prompt = typeof body.prompt === "string" ? body.prompt : undefined;
    const model = typeof body.model === "string" ? body.model : undefined;
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : undefined;

    if (!imageBase64) {
      sendJson(res, 400, { error: "صورة الشاشة مطلوبة للتحليل." });
      return;
    }

    const result = await analyzeScreenImage({ imageBase64, prompt, model, mimeType });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/vision/act") {
    const body = await readJsonBody(req);
    const imageBase64 = String(body.imageBase64 || "").trim();
    const goal = String(body.goal || "").trim();
    const screenWidth = typeof body.screenWidth === "number" ? body.screenWidth : 1920;
    const screenHeight = typeof body.screenHeight === "number" ? body.screenHeight : 1080;
    const model = typeof body.model === "string" ? body.model : undefined;
    // التنفيذ التلقائي لخطة نموذج الرؤية يجب أن يُطلب صراحة (افتراضياً: تحليل فقط)
    const autoExecute = body.autoExecute === true;

    if (!imageBase64 || !goal) {
      sendJson(res, 400, { error: "صورة الشاشة والهدف المطلوب كلاهما مطلوب للوكيل البصري." });
      return;
    }

    const result = await planAndExecuteVisualAction({
      imageBase64,
      goal,
      screenWidth,
      screenHeight,
      model,
      autoExecute,
    });
    sendJson(res, 200, result);
    return;
  }

  // --- Visual Action Workflows Memory Endpoints ---
  if (req.method === "GET" && url.pathname === "/api/vision/workflows") {
    const workflows = await getWorkflows();
    sendJson(res, 200, { success: true, count: workflows.length, workflows });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/vision/workflows") {
    const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
    const id = url.searchParams.get("id") || String(body.id || "");
    if (!id) {
      sendJson(res, 400, { error: "معرف المسار مطلوب للحذف." });
      return;
    }
    const success = await deleteWorkflow(id);
    sendJson(res, 200, { success });
    return;
  }

  // --- Background Tasks & Scheduler Endpoints ---
  if (req.method === "GET" && url.pathname === "/api/tasks") {
    const tasks = await getTasks();
    sendJson(res, 200, { success: true, count: tasks.length, tasks });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(req);
    const title = String(body.title || "").trim();
    const actionValue = String(body.actionValue || "").trim();
    const intervalMinutes = Number(body.intervalMinutes) || 30;
    const actionType = (body.actionType || "command") as any;

    if (!title || !actionValue) {
      sendJson(res, 400, { error: "عنوان المهمة وأمر التنفيذ مطلوبان." });
      return;
    }

    const task = await createTask({ title, actionValue, intervalMinutes, actionType });
    sendJson(res, 200, { success: true, task });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks/toggle") {
    const body = await readJsonBody(req);
    const id = String(body.id || "");
    const task = await toggleTask(id);
    if (!task) {
      sendJson(res, 404, { error: "المهمة غير موجودة." });
      return;
    }
    sendJson(res, 200, { success: true, task });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks/run") {
    const body = await readJsonBody(req);
    const id = String(body.id || "");
    const result = await runTaskNow(id);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/tasks") {
    const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
    const id = url.searchParams.get("id") || String(body.id || "");
    const success = await deleteTask(id);
    sendJson(res, 200, { success });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/action") {
    const body = await readJsonBody(req);
    const action = String(body.action || "");
    const target = String(body.target || "");

    if (action === "launch-app") {
      const createProject = Boolean(body.createProject);
      const result = await launchApp(target, { createProject });
      sendJson(res, 200, result);
      return;
    }

    if (action === "open-folder") {
      const result = await openFolder(target);
      sendJson(res, 200, result);
      return;
    }

    if (action === "open-media") {
      const folder = String(body.folder || target || "desktop");
      const type = (body.type === "pdf" ? "pdf" : "image") as "image" | "pdf";
      const result = await openMediaFile(folder, type);
      sendJson(res, 200, result);
      return;
    }

    if (action === "open-file") {
      const result = await openFileDirectly(target);
      sendJson(res, 200, result);
      return;
    }

    if (action === "create-file" || action === "write-file" || action === "create_text_file") {
      const filePath = String(body.filePath || body.path || "");
      const folder = String(body.folder || "desktop");
      const filename = String(body.filename || "");
      const content = typeof body.content === "string" ? body.content : "";
      const openAfterCreate = body.openAfterCreate !== false;

      const result = await createOrWriteTextFile({
        filePath,
        folder,
        filename,
        content,
        openAfterCreate,
      });
      sendJson(res, 200, result);
      return;
    }

    if (action === "clean-temp" || action === "cleanup") {
      const result = await cleanTemporaryFiles();
      sendJson(res, 200, result);
      return;
    }

    if (action === "volume" || action === "set-volume") {
      const volAction = (body.volumeAction || target || "up") as "up" | "down" | "mute" | "max" | "min";
      const steps = typeof body.steps === "number" ? body.steps : 5;
      const result = await setVolume(volAction, steps);
      sendJson(res, 200, result);
      return;
    }

    if (action === "lock-screen" || action === "lock-workstation" || action === "lock") {
      const result = await lockWorkstation();
      sendJson(res, 200, result);
      return;
    }

    if (action === "mouse" || action === "click" || action === "mouse-click") {
      const mouseAction = (body.mouseAction || body.type || target || "click") as "click" | "left_click" | "right_click" | "double_click" | "move";
      const x = typeof body.x === "number" ? body.x : undefined;
      const y = typeof body.y === "number" ? body.y : undefined;
      const result = await controlMouse({ action: mouseAction, x, y });
      sendJson(res, 200, result);
      return;
    }

    if (action === "keyboard" || action === "type" || action === "press" || action === "hotkey") {
      const kbAction = (body.keyboardAction || (action !== "keyboard" ? action : "press")) as "type" | "press" | "hotkey";
      const text = body.text ? String(body.text) : undefined;
      const key = body.key ? String(body.key) : undefined;
      const hotkey = body.hotkey ? String(body.hotkey) : undefined;
      const pressEnter = Boolean(body.pressEnter);
      const result = await controlKeyboard({
        action: kbAction,
        text,
        key,
        hotkey,
        pressEnter,
      });
      sendJson(res, 200, result);
      return;
    }

    if (action === "organize-desktop" || action === "organize_desktop") {
      const result = await organizeDirectory("desktop");
      sendJson(res, 200, result);
      return;
    }

    if (action === "organize-downloads" || action === "organize_downloads") {
      const result = await organizeDirectory("downloads");
      sendJson(res, 200, result);
      return;
    }

    if (action === "preset" || action === "workspace-preset") {
      const preset = String(body.preset || target || "gis");
      const result = await setupWorkspacePreset(preset);
      sendJson(res, 200, result);
      return;
    }

    if (action === "launch-any-app" || action === "open-app" || action === "start-app") {
      const result = await launchAnyApp(target || String(body.appName || ""));
      sendJson(res, 200, result);
      return;
    }

    if (action === "kill-process" || action === "stop-process") {
      const proc = (target || body.process || body.pid || "") as string | number;
      const result = await killProcess(proc);
      sendJson(res, 200, result);
      return;
    }

    if (action === "brightness" || action === "set-brightness") {
      const percent = Number(body.percent ?? target ?? 70);
      const result = await setScreenBrightness(percent);
      sendJson(res, 200, result);
      return;
    }

    if (action === "routine" || action === "daily-routine") {
      const routine = String(body.routine || target || "morning");
      const result = await executeDailyRoutine(routine);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 400, { error: "Unknown system action." });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/terminal/run") {
    const body = await readJsonBody(req);
    const command = String(body.command || "");
    const shell = (body.shell || "powershell") as ShellType;
    const cwd = body.cwd ? String(body.cwd) : undefined;
    const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : undefined;
    const result = await runUniversalCommand({ command, shell, cwd, timeoutMs });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/system/processes") {
    const limit = Number(url.searchParams.get("limit") || 15);
    const result = await listProcesses(limit);
    sendJson(res, 200, { success: true, processes: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/kill-process") {
    const body = await readJsonBody(req);
    const proc = (body.process ?? body.pid ?? body.name ?? "") as string | number;
    const result = await killProcess(proc);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/brightness") {
    const body = await readJsonBody(req);
    const percent = Number(body.percent ?? 70);
    const result = await setScreenBrightness(percent);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/routine") {
    const body = await readJsonBody(req);
    const routine = String(body.routine || "morning");
    const result = await executeDailyRoutine(routine);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/voice/status") {
    const status = await getSpeechStatus();
    sendJson(res, 200, { success: true, ...status, tts: getVoiceStatus() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/voice/speak") {
    const body = await readJsonBody(req, 64 * 1024);
    const wav = await synthesizeSpeech(String(body.text ?? ""));
    res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Cache-Control": "no-store" });
    res.end(wav);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/voice/transcribe") {
    const wav = await readRawBody(req, 8 * 1024 * 1024); // ~4 min of 16 kHz mono PCM
    const lang = url.searchParams.get("lang") || "ar";
    const result = await transcribeWav(wav, lang);
    sendJson(res, 200, { success: true, ...result });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/brain/status") {
    const status = await getBrainStatus(url.searchParams.get("force") === "1");
    sendJson(res, 200, { success: true, ...status });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/network/ports") {
    const includeUdp = url.searchParams.get("udp") !== "0";
    const ports = await listListeningPorts({ includeUdp });
    sendJson(res, 200, { success: true, count: ports.length, ports });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/network/port/check") {
    const result = await checkPort(url.searchParams.get("port"));
    sendJson(res, 200, { success: true, ...result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/network/kill-port") {
    const body = await readJsonBody(req);
    const result = await killPort(body.port);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/network/ping") {
    const body = await readJsonBody(req);
    const host = typeof body.host === "string" && body.host.trim() ? body.host : undefined;
    const count = typeof body.count === "number" ? body.count : 4;
    const result = await pingHost(host, count);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/network/info") {
    const info = await getNetworkInfo();
    sendJson(res, 200, { success: true, ...info });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/system/disks") {
    const drives = await getDrivesInfo();
    sendJson(res, 200, { success: true, drives });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/system/health") {
    const health = await getSystemHealthOverview();
    sendJson(res, 200, { success: true, health });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/large-files") {
    const body = await readJsonBody(req);
    const minSizeMb = typeof body.minSizeMb === "number" ? body.minSizeMb : 20;
    const limit = typeof body.limit === "number" ? body.limit : 15;
    const files = await findLargeFiles({ minSizeMb, limit });
    sendJson(res, 200, { success: true, files });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/clean-disk") {
    const result = await safeDeepCleanDisk();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/optimize-ram") {
    const result = await optimizeRam();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/system/reveal-file") {
    const body = await readJsonBody(req);
    const filePath = typeof body.filePath === "string" ? body.filePath : "";
    if (!filePath) {
      sendJson(res, 400, { success: false, message: "مسار الملف مطلوب." });
      return;
    }
    const result = await revealFileInExplorer(filePath);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/desktop/organize") {
    const body = await readJsonBody(req);
    const target = typeof body.target === "string" ? body.target : "desktop";
    const result = await organizeDirectory(target);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/desktop/status") {
    const target = url.searchParams.get("target") || "desktop";
    const result = await getDirectoryStatus(target);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/desktop/preset") {
    const body = await readJsonBody(req);
    const preset = typeof body.preset === "string" ? body.preset : "gis";
    const result = await setupWorkspacePreset(preset);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/desktop/inspect") {
    const body = await readJsonBody(req);
    const filePath = typeof body.filePath === "string" ? body.filePath : "";
    if (!filePath) {
      sendJson(res, 400, { success: false, error: "يرجى تحديد مسار الملف" });
      return;
    }
    const result = await inspectAndSummarizeFile(filePath);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/files/extract") {
    const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
    const body = await readJsonBody(req, MAX_UPLOAD_BYTES);
    const filename = String(body.filename || "file.txt");
    const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
    const filePath = typeof body.filePath === "string" ? body.filePath : "";

    if (filePath) {
      let safePath: string;
      try {
        safePath = assertReadable(filePath);
      } catch (e) {
        sendJson(res, 403, { success: false, error: (e as Error).message, message: (e as Error).message });
        return;
      }
      const result = await extractTextFromLocalPath(safePath);
      sendJson(res, 200, { success: true, file: result });
      return;
    }

    if (contentBase64) {
      const buffer = Buffer.from(contentBase64, "base64");
      const result = await extractTextFromBuffer(buffer, filename);
      sendJson(res, 200, { success: true, file: result });
      return;
    }

    sendJson(res, 400, { error: "يرجى تزويد ملف للقراءة." });
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

function offlineNotice(localModel: string): string {
  return `🔌 لا يوجد اتصال بالإنترنت — تم التحويل تلقائياً إلى العقل المحلي (${cleanOllamaModelName(localModel)}).`;
}

type ChatRoute = { kind: "local"; model: string; notice?: string } | { kind: "cloud"; fallbackToLocal: boolean };

/**
 * Decide where a chat goes, honouring SANAD_MODE:
 * - offline: always the local brain (cloud is never contacted);
 * - cloud:   always OpenRouter (no local fallback);
 * - auto:    OpenRouter when online, local brain when offline or on a network failure.
 */
async function decideChatRoute(model: string | undefined): Promise<ChatRoute> {
  if (model && isOllamaModel(model)) return { kind: "local", model };
  const setting = getSanadMode();
  if (setting === "offline") {
    const localModel = await requireLocalModel();
    const notice = model ? `🔒 وضع أوفلاين مفعّل — تم استخدام العقل المحلي (${cleanOllamaModelName(localModel)}) بدل الموديل السحابي.` : undefined;
    return { kind: "local", model: localModel, notice };
  }
  if (setting === "cloud") return { kind: "cloud", fallbackToLocal: false };
  if (!(await isOnline())) {
    const localModel = await requireLocalModel();
    return { kind: "local", model: localModel, notice: offlineNotice(localModel) };
  }
  return { kind: "cloud", fallbackToLocal: true };
}

/** مولّد نص للمطوّر الذاتي يتبع نفس توجيه المحادثة (سحابي مع احتياط محلي، أو محلي). */
function selfDevGenerator(model: string | undefined): Generate {
  return async (system, prompt) => {
    const route = await decideChatRoute(model);
    const local = async (localModel: string) => {
      await ensureOllamaRunning();
      const a = await askOllama(prompt, { model: localModel, system, signal: AbortSignal.timeout(180_000) });
      return { text: a.text, model: a.model };
    };
    if (route.kind === "local") return local(route.model);
    try {
      const a = await ask(prompt, { model, system, signal: AbortSignal.timeout(150_000) });
      return { text: a.text, model: a.model };
    } catch (error) {
      if (!route.fallbackToLocal || !isNetworkError(error)) throw error;
      markOffline();
      return local(await requireLocalModel());
    }
  };
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { prompt, model, messages } = await readChatRequest(req);
  const askLocal = async (localModel: string, notice?: string): Promise<void> => {
    await ensureOllamaRunning();
    const answer: Answer = await askOllama(prompt, {
      model: localModel,
      messages,
      system: await getLocalSystemPromptWithMemory(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    sendJson(res, 200, notice ? { ...answer, notice } : answer);
  };

  const route = await decideChatRoute(model);
  if (route.kind === "local") {
    await askLocal(route.model, route.notice);
    return;
  }

  try {
    const answer: Answer = await ask(prompt, {
      model,
      messages,
      system: await getSystemPromptWithMemory(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    sendJson(res, 200, answer);
  } catch (error) {
    if (!route.fallbackToLocal || !isNetworkError(error)) throw error;
    markOffline();
    const localModel = await requireLocalModel();
    await askLocal(localModel, offlineNotice(localModel));
  }
}

/** All free text-chat models for the UI picker, cached for 10 minutes. */
async function handleModels(res: ServerResponse): Promise<void> {
  if (getSanadMode() === "offline") {
    // Offline mode: only local models, never contact OpenRouter.
    const local = await getOllamaChatModels();
    const localModel = await resolveLocalModel();
    sendJson(res, 200, { default: localModel ?? "", source: "catalog", count: local.length, models: local });
    return;
  }

  const result = await resolveModels();

  sendJson(res, 200, {
    default: getConfig().model,
    source: result.source,
    generatedAt: result.generatedAt,
    count: result.models.length,
    models: result.models,
  });
}

/**
 * Tries OpenRouter first, then falls back to the committed snapshot in
 * `data/free-models.json`. Set MODELS_SOURCE=catalog to skip the network entirely.
 */
async function resolveModels(): Promise<ModelsResult> {
  const ollamaModels = await getOllamaChatModels();

  if (modelsCache && Date.now() - modelsCache.at <= MODELS_TTL_MS) {
    if (ollamaModels.length) {
      const merged = [
        ...ollamaModels,
        ...modelsCache.models.filter((m) => !isOllamaModel(m.id)),
      ];
      return { ...modelsCache, models: merged };
    }
    return modelsCache;
  }

  if (process.env.MODELS_SOURCE !== "catalog") {
    try {
      const config = getConfig();
      const upstream = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });

      if (!upstream.ok) {
        throw new AppError("Could not load the model list from OpenRouter.", {
          status: 502,
          hint: `Upstream returned HTTP ${upstream.status}. Try again in a moment.`,
        });
      }

      const payload = (await upstream.json()) as { data?: OpenRouterModel[] };
      const baseModels = toChatModels(payload.data ?? []);

      if (!baseModels.length) {
        throw new AppError("OpenRouter returned no free chat models.", { status: 502 });
      }

      const models = [...ollamaModels, ...baseModels];
      modelsCache = { at: Date.now(), models, source: "live" };
      return modelsCache;
    } catch (error) {
      console.warn(`[models] live list failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const catalog = await readModelCatalog();
  if (catalog.models.length) {
    const models = [...ollamaModels, ...catalog.models];
    modelsCache = {
      at: Date.now(),
      models,
      source: "catalog",
      generatedAt: catalog.generatedAt,
    };
    return modelsCache;
  }

  if (ollamaModels.length) {
    modelsCache = {
      at: Date.now(),
      models: ollamaModels,
      source: "catalog",
    };
    return modelsCache;
  }

  throw new AppError("Could not load the list of free models.", {
    status: 502,
    hint: "Check your connection, or run `npm run models:refresh` while online to rebuild the offline list.",
  });
}

/** Server-sent events: delta… delta, then done (or a single error event). */
async function handleStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { prompt, model, messages } = await readChatRequest(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Stop calling provider as soon as the browser goes away.
  const clientGone = new AbortController();
  const onClose = () => clientGone.abort();
  req.on("close", onClose);

  const heartbeat = setInterval(() => write(res, ": keep-alive\n\n"), HEARTBEAT_MS);

  try {
    const signal = AbortSignal.any([clientGone.signal, AbortSignal.timeout(STREAM_TIMEOUT_MS)]);
    const streamLocal = async (localModel: string, notice?: string): Promise<void> => {
      if (notice) write(res, frame("notice", { message: notice, model: localModel }));
      await ensureOllamaRunning();
      const system = await getLocalSystemPromptWithMemory();
      for await (const event of askOllamaStream(prompt, { model: localModel, messages, system, signal })) {
        if (clientGone.signal.aborted) break;
        write(res, frame(event.type, event));
      }
    };

    const route = await decideChatRoute(model);
    if (route.kind === "local") {
      await streamLocal(route.model, route.notice);
    } else {
      let sentDeltas = 0;
      try {
        const system = await getSystemPromptWithMemory();
        for await (const event of askStream(prompt, { model, messages, system, signal })) {
          if (clientGone.signal.aborted) break;
          if (event.type === "delta") sentDeltas++;
          write(res, frame(event.type, event));
        }
      } catch (error) {
        // Only fall back when nothing was streamed yet and the failure is connectivity, not an API error.
        if (!route.fallbackToLocal || sentDeltas > 0 || clientGone.signal.aborted || !isNetworkError(error)) throw error;
        markOffline();
        const localModel = await requireLocalModel();
        await streamLocal(localModel, offlineNotice(localModel));
      }
    }
  } catch (error) {
    if (!clientGone.signal.aborted) {
      const appError = toAppError(error);
      write(res, frame("error", { error: appError.message, hint: appError.hint }));
    }
  } finally {
    clearInterval(heartbeat);
    req.off("close", onClose);
    if (!res.writableEnded) res.end();
  }
}

async function readChatRequest(req: IncomingMessage): Promise<{ prompt: string; model?: string; messages?: ChatTurn[] }> {
  const body = await readJsonBody(req);
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  const messages = parseMessages(body.messages);

  if (!messages?.length && !prompt.trim()) {
    throw new AppError("The prompt is empty.", { status: 400, hint: "Type a question first." });
  }

  return { prompt, model, messages };
}

function parseMessages(value: unknown): ChatTurn[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new AppError("messages must be an array.", { status: 400, hint: "Each item needs role and content." });
  }
  if (value.length === 0) return undefined;
  if (value.length > MAX_TURNS) {
    throw new AppError(`Too many messages (max ${MAX_TURNS}).`, { status: 413, hint: "Start a new conversation." });
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new AppError(`messages[${index}] is not an object.`, { status: 400 });
    }

    const { role, content } = item as { role?: unknown; content?: unknown };

    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw new AppError(`messages[${index}].role is invalid.`, {
        status: 400,
        hint: 'Use "system", "user" or "assistant".',
      });
    }
    if (typeof content !== "string") {
      throw new AppError(`messages[${index}].content must be text.`, { status: 400 });
    }
    if (content.length > MAX_TURN_CHARS) {
      throw new AppError(`messages[${index}].content is too long.`, {
        status: 413,
        hint: `Keep each message under ${MAX_TURN_CHARS} characters.`,
      });
    }

    return { role, content };
  });
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function write(res: ServerResponse, chunk: string): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(chunk);
}

async function readRawBody(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new AppError("Request body is too large.", {
        status: 413,
        hint: `Keep request size under ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`,
      });
    }
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  // الطلبات «البسيطة» من مواقع أخرى (text/plain) لا تمر
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    // نقرأ الجسم كي لا يبقى الاتصال معلقاً، ثم نرفض
    await readRawBody(req, maxBytes).catch(() => undefined);
    throw new AppError("Content-Type must be application/json.", { status: 415 });
  }
  const raw = await readRawBody(req, maxBytes);
  if (raw.length === 0) return {};

  try {
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError("Request body must be a JSON object.", { status: 400 });
  }
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = normalize(join(PUBLIC_DIR, relative));

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    let file: Buffer | string = await readFile(filePath);
    if (relative === "index.html") {
      // نحقن رمز الجلسة في الصفحة فقط؛ لا تستطيع المواقع الأخرى قراءته (سياسة نفس الأصل)
      file = file.toString("utf8").replace("</head>", `  <meta name="sanad-token" content="${SESSION_TOKEN}" />\n  </head>`);
    }
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

server.listen(PORT, HOST, () => {
  initOfflineBrain();
  try {
    const config = getConfig();
    console.log(`SANAD running at http://localhost:${PORT} (local only: ${HOST})`);
    console.log(`Default model: ${config.model}`);
    if (config.fallbackModels.length) console.log(`Fallbacks: ${config.fallbackModels.join(" → ")}`);
    initTaskScheduler().catch((e) => console.warn(`[scheduler error]:`, e));
  } catch (error) {
    const appError = toAppError(error);
    console.warn(`⚠ ${appError.message}`);
    if (appError.hint) console.warn(`  ${appError.hint}`);
    console.warn(`  The page loads, but requests will fail until a key is set.`);
  }
});
