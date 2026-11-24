import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError } from "../config";

/** أدوات HTTP مشتركة لكل المسارات: قراءة الجسم، الرد بـ JSON، وإطارات البث (SSE). */

export const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

export async function readRawBody(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new AppError("Request body is too large.", {
        status: 413,
        hint: `Keep request size under ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`,
      });
    }
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function readJsonBody(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  // الطلبات «البسيطة» من مواقع أخرى (text/plain) لا تمر
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    // نقرأ الجسم كي لا يبقى الاتصال معلقاً، ثم نرفض
    await readRawBody(req, maxBytes).catch(() => undefined);
    throw new AppError("Content-Type must be application/json.", { status: 415 });
  }
  const raw = await readRawBody(req, maxBytes);
  if (raw.length === 0) return {};

  try {
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError("Request body must be a JSON object.", { status: 400 });
  }
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** إطار Server-Sent Events. */
export function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** يكتب في البث فقط إن كان الاتصال ما زال مفتوحاً. */
export function write(res: ServerResponse, chunk: string): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(chunk);
}
