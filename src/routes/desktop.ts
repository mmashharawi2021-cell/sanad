import { getDirectoryStatus, inspectAndSummarizeFile, organizeDirectory, setupWorkspacePreset } from "../desktopAutomation";
import { readJsonBody, sendJson } from "../http/core";
import type { Route } from "../http/router";

/** أتمتة سطح المكتب والتنزيلات. */
export const desktopRoutes: Route[] = [
  {
    method: "POST", path: "/api/desktop/organize", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const target = typeof body.target === "string" ? body.target : "desktop";
      const result = await organizeDirectory(target);
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET", path: "/api/desktop/status", handler: async ({ res, url }) => {
      const target = url.searchParams.get("target") || "desktop";
      const result = await getDirectoryStatus(target);
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/desktop/preset", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const preset = typeof body.preset === "string" ? body.preset : "gis";
      const result = await setupWorkspacePreset(preset);
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/desktop/inspect", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const filePath = typeof body.filePath === "string" ? body.filePath : "";
      if (!filePath) {
        sendJson(res, 400, { success: false, error: "يرجى تحديد مسار الملف" });
        return;
      }
      const result = await inspectAndSummarizeFile(filePath);
      sendJson(res, 200, result);
    },
  },
];
