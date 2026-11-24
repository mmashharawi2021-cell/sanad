import { extractTextFromBuffer, extractTextFromLocalPath } from "../fileReader";
import { getSanadMode, isOnline } from "../offlineBrain";
import { assertReadable } from "../safePaths";
import { fetchPageContent, searchWeb } from "../webSearch";
import { readJsonBody, sendJson } from "../http/core";
import type { Route } from "../http/router";

/** البحث في الويب وقراءة الصفحات، واستخراج نصوص الملفات. */

const WEB_OFFLINE_MESSAGE =
  "البحث في الويب يحتاج اتصالاً بالإنترنت، والجهاز غير متصل الآن. يمكنني الإجابة من معرفتي المحلية بدلاً من ذلك.";

export const webRoutes: Route[] = [
  {
    method: "POST", path: "/api/web/search", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const query = String(body.query || "").trim();
      const limit = typeof body.limit === "number" ? body.limit : 5;
      if (!query) {
        sendJson(res, 400, { error: "يرجى تحديد عبارة البحث." });
        return;
      }
      // دون إنترنت (أو في وضع offline): سبب واضح بدل «لا توجد نتائج»
      if (getSanadMode() === "offline" || !(await isOnline())) {
        sendJson(res, 200, { success: false, offline: true, query, count: 0, results: [], message: WEB_OFFLINE_MESSAGE });
        return;
      }
      const results = await searchWeb(query, limit);
      sendJson(res, 200, { success: true, query, count: results.length, results });
    },
  },
  {
    method: "POST", path: "/api/web/read", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const targetUrl = String(body.url || "").trim();
      const maxChars = typeof body.maxChars === "number" ? body.maxChars : 6000;
      if (!targetUrl) {
        sendJson(res, 400, { error: "يرجى تزويد رابط الصفحة." });
        return;
      }
      if (getSanadMode() === "offline" || !(await isOnline())) {
        sendJson(res, 200, { success: false, offline: true, page: { title: targetUrl, content: WEB_OFFLINE_MESSAGE } });
        return;
      }
      const page = await fetchPageContent(targetUrl, maxChars);
      sendJson(res, 200, { success: true, page });
    },
  },
  {
    method: "POST", path: "/api/files/extract", handler: async ({ req, res }) => {
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
    },
  },
];
