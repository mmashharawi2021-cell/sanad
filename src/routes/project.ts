import { createFullProject, executeTerminalCommand, readProjectTree } from "../codeRunner";
import { buildProject, getProjectFileContent, listBuiltProjects, type ProjectTemplate } from "../projectBuilder";
import { runUniversalCommand, type ShellType } from "../universalTerminal";
import { readJsonBody, sendJson } from "../http/core";
import type { Route } from "../http/router";

/** الطرفية وبناء المشاريع ومعاينتها. */
export const projectRoutes: Route[] = [
  {
    method: "POST", path: "/api/terminal/exec", handler: async ({ req, res }) => {
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
    },
  },
  {
    method: "POST", path: "/api/terminal/run", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const command = String(body.command || "");
      const shell = (body.shell || "powershell") as ShellType;
      const cwd = body.cwd ? String(body.cwd) : undefined;
      const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : undefined;
      const result = await runUniversalCommand({ command, shell, cwd, timeoutMs });
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/project/create", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const projectName = String(body.projectName || "").trim();
      const files = Array.isArray(body.files) ? (body.files as any[]) : [];
      const baseFolder = (body.baseFolder || "desktop") as any;
      // ملفات هذا المسار يختارها النموذج: لا نفتح VS Code إلا بطلب صريح (ملفات .vscode قد تشغّل مهاماً عند الفتح)
      const openInVsCode = body.openInVsCode === true;

      if (!projectName || !files.length) {
        sendJson(res, 400, { error: "اسم المشروع والملفات مطلوبة." });
        return;
      }

      const result = await createFullProject({ projectName, files, baseFolder, openInVsCode });
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/project/build", handler: async ({ req, res }) => {
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
    },
  },
  {
    method: "GET", path: "/api/project/preview", handler: async ({ res, url }) => {
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
    },
  },
  {
    method: "GET", path: "/api/project/list", handler: async ({ res }) => {
      const projects = await listBuiltProjects();
      sendJson(res, 200, { success: true, projects });
    },
  },
  {
    method: "POST", path: "/api/project/tree", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const targetPath = String(body.path || ".");
      const tree = await readProjectTree(targetPath);
      sendJson(res, 200, { success: true, tree });
    },
  },
];
