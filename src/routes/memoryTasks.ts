import { addMemory, deleteMemory, getMemories } from "../memory";
import { createTask, deleteTask, getTasks, runTaskNow, toggleTask } from "../taskScheduler";
import { readJsonBody, sendJson } from "../http/core";
import type { Route } from "../http/router";

/** الذاكرة الدائمة والمهام المجدولة. */
export const memoryTaskRoutes: Route[] = [
  {
    method: "GET", path: "/api/memory", handler: async ({ res }) => {
      const memories = await getMemories();
      sendJson(res, 200, { success: true, count: memories.length, memories });
    },
  },
  {
    method: "POST", path: "/api/memory", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const content = String(body.content || "").trim();
      const category = (body.category || "general") as any;
      if (!content) {
        sendJson(res, 400, { error: "محتوى المعلومة لا يمكن أن يكون فارغاً." });
        return;
      }
      const memory = await addMemory(content, category);
      sendJson(res, 200, { success: true, memory });
    },
  },
  {
    method: "DELETE", path: "/api/memory", handler: async ({ req, res, url }) => {
      const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const id = url.searchParams.get("id") || String(body.id || "");
      if (!id) {
        sendJson(res, 400, { error: "معرف المعلومة مطلوب للحذف." });
        return;
      }
      const success = await deleteMemory(id);
      sendJson(res, 200, { success });
    },
  },
  {
    method: "GET", path: "/api/tasks", handler: async ({ res }) => {
      const tasks = await getTasks();
      sendJson(res, 200, { success: true, count: tasks.length, tasks });
    },
  },
  {
    method: "POST", path: "/api/tasks", handler: async ({ req, res }) => {
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
    },
  },
  {
    method: "POST", path: "/api/tasks/toggle", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const id = String(body.id || "");
      const task = await toggleTask(id);
      if (!task) {
        sendJson(res, 404, { error: "المهمة غير موجودة." });
        return;
      }
      sendJson(res, 200, { success: true, task });
    },
  },
  {
    method: "POST", path: "/api/tasks/run", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const id = String(body.id || "");
      const result = await runTaskNow(id);
      sendJson(res, 200, result);
    },
  },
  {
    method: "DELETE", path: "/api/tasks", handler: async ({ req, res, url }) => {
      const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const id = url.searchParams.get("id") || String(body.id || "");
      const success = await deleteTask(id);
      sendJson(res, 200, { success });
    },
  },
];
