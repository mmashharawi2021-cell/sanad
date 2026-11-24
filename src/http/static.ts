import type { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sendJson } from "./core";
import { sessionCookieHeader } from "./security";

/** خدمة ملفات الواجهة من public/ (مع منع الخروج من المجلد). */

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = normalize(join(PUBLIC_DIR, relative));

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    const file = await readFile(filePath);
    const headers: Record<string, string> = {
      "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    };
    if (relative.startsWith("fonts/")) {
      // الخطوط المحلية (لتعمل الواجهة دون إنترنت): ملفات عامة ثابتة. إطارات الإضافات المعزولة (أصل معتم)
      // تحتاج CORS لتحميل الخطوط، فنسمح بها لهذا المجلد فقط.
      headers["Access-Control-Allow-Origin"] = "*";
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    if (relative === "index.html") {
      // رمز الجلسة في كوكي HttpOnly: المتصفح يرسله تلقائياً، ولا يستطيع أي سكربت في الصفحة قراءته
      headers["Set-Cookie"] = sessionCookieHeader();
    }
    res.writeHead(200, headers);
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}
