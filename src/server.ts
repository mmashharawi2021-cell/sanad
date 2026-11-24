import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getConfig } from "./config";
import { toAppError } from "./openrouter";
import { initOfflineBrain } from "./offlineBrain";
import { initTaskScheduler } from "./taskScheduler";
import { sendJson } from "./http/core";
import { createRouter } from "./http/router";
import { HOST, PORT, securityRejection } from "./http/security";
import { serveStatic } from "./http/static";
import { chatRoutes } from "./routes/chat";
import { desktopRoutes } from "./routes/desktop";
import { extensionRoutes } from "./routes/extensions";
import { memoryTaskRoutes } from "./routes/memoryTasks";
import { networkRoutes } from "./routes/network";
import { projectRoutes } from "./routes/project";
import { systemRoutes } from "./routes/system";
import { visionRoutes } from "./routes/vision";
import { webRoutes } from "./routes/web";

/**
 * نقطة تشغيل خادم سند: طبقة الحماية ← المسارات (src/routes/*) ← ملفات الواجهة.
 * أضف المسارات الجديدة في ملف المجال المناسب داخل src/routes/ وصنّفها في tests/routes.manifest.mjs.
 */

const dispatch = createRouter([
  chatRoutes,
  memoryTaskRoutes,
  extensionRoutes,
  projectRoutes,
  webRoutes,
  visionRoutes,
  systemRoutes,
  networkRoutes,
  desktopRoutes,
]);

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  const rejection = securityRejection(req, url.pathname);
  if (rejection) {
    sendJson(res, 403, { success: false, error: rejection, message: rejection });
    return;
  }

  if (await dispatch({ req, res, url })) return;

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

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
