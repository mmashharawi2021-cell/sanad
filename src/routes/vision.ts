import { deleteWorkflow, getWorkflows } from "../actionMemory";
import { analyzeScreenImage, executeApprovedVisualPlan, planAndExecuteVisualAction } from "../screenVision";
import { readJsonBody, sendJson } from "../http/core";
import type { Route } from "../http/router";

/** رؤية الشاشة والوكيل البصري ومسارات العمل المحفوظة. */
export const visionRoutes: Route[] = [
  {
    method: "POST", path: "/api/vision/analyze", handler: async ({ req, res }) => {
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
    },
  },
  {
    method: "POST", path: "/api/vision/act", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const imageBase64 = String(body.imageBase64 || "").trim();
      const goal = String(body.goal || "").trim();
      const screenWidth = typeof body.screenWidth === "number" ? body.screenWidth : 1920;
      const screenHeight = typeof body.screenHeight === "number" ? body.screenHeight : 1080;
      const model = typeof body.model === "string" ? body.model : undefined;

      if (!imageBase64 || !goal) {
        sendJson(res, 400, { error: "صورة الشاشة والهدف المطلوب كلاهما مطلوب للوكيل البصري." });
        return;
      }

      // تخطيط فقط — التنفيذ عبر /api/vision/execute بعد موافقة المستخدم على الخطوات
      const result = await planAndExecuteVisualAction({ imageBase64, goal, screenWidth, screenHeight, model });
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/vision/execute", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const result = await executeApprovedVisualPlan({
        goal: String(body.goal || "").trim().slice(0, 300),
        actions: body.actions,
        screenWidth: typeof body.screenWidth === "number" ? body.screenWidth : 1920,
        screenHeight: typeof body.screenHeight === "number" ? body.screenHeight : 1080,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET", path: "/api/vision/workflows", handler: async ({ res }) => {
      const workflows = await getWorkflows();
      sendJson(res, 200, { success: true, count: workflows.length, workflows });
    },
  },
  {
    method: "DELETE", path: "/api/vision/workflows", handler: async ({ req, res, url }) => {
      const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const id = url.searchParams.get("id") || String(body.id || "");
      if (!id) {
        sendJson(res, 400, { error: "معرف المسار مطلوب للحذف." });
        return;
      }
      const success = await deleteWorkflow(id);
      sendJson(res, 200, { success });
    },
  },
];
