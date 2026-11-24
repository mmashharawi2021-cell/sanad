import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/* ======================= الحماية (Security gate) =======================
   1) الخادم يستمع على 127.0.0.1 فقط (لا وصول من أجهزة الشبكة).
   2) رأس Host يجب أن يكون localhost/127.0.0.1 على نفس المنفذ (يمنع DNS rebinding).
   3) كل طلب يغيّر الحالة (غير GET/HEAD) يجب أن:
      - يأتي من أصل سند نفسه إن أرسل المتصفح Origin (يمنع المواقع الأخرى / CSRF)،
      - ويحمل كوكي الجلسة الصحيح: رمز عشوائي يُولَّد عند كل إقلاع ويُرسل مع الصفحة الرئيسية
        في كوكي HttpOnly + SameSite=Strict — لا يقرؤه أي سكربت في الصفحة (ولا XSS)، ولا يُرسل من مواقع أخرى،
      - ويحمل الرأس X-Sanad-Request: 1 (رأس مخصّص يفرض preflight على أي أصل آخر، ونحن لا نجيبه)،
      - ويرسل Content-Type: application/json لطلبات JSON. */

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = "127.0.0.1";
const SESSION_TOKEN = randomBytes(32).toString("hex");
const SESSION_COOKIE = "sanad_session";
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

/** قيمة رأس Set-Cookie التي تُرسل مع الصفحة الرئيسية فقط. */
export function sessionCookieHeader(): string {
  return `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict`;
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

function tokenMatches(given: string | string[] | undefined): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(SESSION_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** يعيد سبب الرفض، أو null إن كان الطلب مسموحاً. */
export function securityRejection(req: IncomingMessage, pathname: string): string | null {
  const host = String(req.headers.host || "").toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return "Host غير مسموح.";
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return "مصدر الطلب غير مسموح.";
  if (pathname.startsWith("/api/")) {
    if (req.headers["x-sanad-request"] !== "1") return "طلب غير صادر من واجهة سند.";
    if (!tokenMatches(readCookie(req, SESSION_COOKIE))) return "جلسة سند منتهية أو غير صحيحة. أعد تحميل الصفحة.";
  }
  return null;
}
