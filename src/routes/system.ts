import { findLargeFiles, getDrivesInfo, getSystemHealthOverview, optimizeRam, revealFileInExplorer, safeDeepCleanDisk } from "../diskInspector";
import { organizeDirectory, setupWorkspacePreset } from "../desktopAutomation";
import { executeDailyRoutine, killProcess, launchAnyApp, listProcesses, setScreenBrightness } from "../processMaestro";
import {
  cleanTemporaryFiles,
  controlKeyboard,
  controlMouse,
  createOrWriteTextFile,
  getSystemStats,
  launchApp,
  lockWorkstation,
  openFileDirectly,
  openFolder,
  openMediaFile,
  setVolume,
} from "../systemTools";
import { readJsonBody, sendJson } from "../http/core";
import type { Route, RouteContext } from "../http/router";

/** النظام: الإحصاءات، والعمليات، والقرص والذاكرة، والإجراءات على الجهاز. */

async function handleSystemAction({ req, res }: RouteContext): Promise<void> {
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
}

export const systemRoutes: Route[] = [
  {
    method: "GET", path: "/api/system/stats", handler: async ({ res }) => {
      const stats = await getSystemStats();
      sendJson(res, 200, stats);
    },
  },
  { method: "POST", path: "/api/system/action", handler: handleSystemAction },
  {
    method: "GET", path: "/api/system/processes", handler: async ({ res, url }) => {
      const limit = Number(url.searchParams.get("limit") || 15);
      const result = await listProcesses(limit);
      sendJson(res, 200, { success: true, processes: result });
    },
  },
  {
    method: "POST", path: "/api/system/kill-process", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const proc = (body.process ?? body.pid ?? body.name ?? "") as string | number;
      const result = await killProcess(proc);
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/system/brightness", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const percent = Number(body.percent ?? 70);
      const result = await setScreenBrightness(percent);
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/system/routine", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const routine = String(body.routine || "morning");
      const result = await executeDailyRoutine(routine);
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET", path: "/api/system/disks", handler: async ({ res }) => {
      const drives = await getDrivesInfo();
      sendJson(res, 200, { success: true, drives });
    },
  },
  {
    method: "GET", path: "/api/system/health", handler: async ({ res }) => {
      const health = await getSystemHealthOverview();
      sendJson(res, 200, { success: true, health });
    },
  },
  {
    method: "POST", path: "/api/system/large-files", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const minSizeMb = typeof body.minSizeMb === "number" ? body.minSizeMb : 20;
      const limit = typeof body.limit === "number" ? body.limit : 15;
      const files = await findLargeFiles({ minSizeMb, limit });
      sendJson(res, 200, { success: true, files });
    },
  },
  {
    method: "POST", path: "/api/system/clean-disk", handler: async ({ res }) => {
      const result = await safeDeepCleanDisk();
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/system/optimize-ram", handler: async ({ res }) => {
      const result = await optimizeRam();
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/system/reveal-file", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const filePath = typeof body.filePath === "string" ? body.filePath : "";
      if (!filePath) {
        sendJson(res, 400, { success: false, message: "مسار الملف مطلوب." });
        return;
      }
      const result = await revealFileInExplorer(filePath);
      sendJson(res, 200, result);
    },
  },
];
