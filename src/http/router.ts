import type { IncomingMessage, ServerResponse } from "node:http";

/** سياق الطلب الذي يصل لكل مسار. */
export type RouteContext = { req: IncomingMessage; res: ServerResponse; url: URL };

export type HttpMethod = "GET" | "POST" | "DELETE";

/**
 * مسار API: الطريقة والمسار حرفياً، والدالة التي تعالجه.
 * يُكتب كل مسار في src/routes/* بالصيغة { method: "…", path: "/api/…", handler } — اختبار التغطية
 * (tests/helpers/sanad-server.mjs) يقرأ هذه الصيغة ليتأكد أن كل مسار مصنّف في سجل الاختبارات.
 */
export type Route = { method: HttpMethod; path: string; handler: (ctx: RouteContext) => Promise<void> };

/** يبني جدول بحث (الطريقة + المسار) ويمنع تكرار مسار في ملفين. */
export function createRouter(groups: Route[][]): (ctx: RouteContext) => Promise<boolean> {
  const table = new Map<string, Route["handler"]>();
  for (const route of groups.flat()) {
    const key = `${route.method} ${route.path}`;
    if (table.has(key)) throw new Error(`مسار مكرر: ${key}`);
    table.set(key, route.handler);
  }
  return async (ctx) => {
    const handler = table.get(`${ctx.req.method} ${ctx.url.pathname}`);
    if (!handler) return false;
    await handler(ctx);
    return true;
  };
}
