// سلوك المسارات بصلاحية الجلسة: القراءة تعيد الشكل الصحيح، والمدخلات الخاطئة تُرفض قبل أي إجراء.
// المسارات الخطرة (guardOnly) لا يُرسل لها أي طلب هنا إطلاقاً.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ROUTES } from "./routes.manifest.mjs";
import { startSanad } from "./helpers/sanad-server.mjs";

let s;
before(async () => { s = await startSanad(); });
after(async () => { await s?.stop(); });

for (const r of ROUTES.filter((x) => x.kind !== "guardOnly")) {
  test(`${r.kind === "read" ? "قراءة" : "رفض"}: ${r.method} ${r.path}${r.query || ""}`, { timeout: 60_000 }, async () => {
    const res = await s.request(`${r.path}${r.query || ""}`, { method: r.method, body: r.body, raw: r.raw, contentType: r.contentType });
    const allowed = Array.isArray(r.expect) ? r.expect : [r.expect];
    assert.ok(allowed.includes(res.status), `الحالة ${res.status} (المتوقع ${allowed.join("/")}): ${res.text.slice(0, 200)}`);
    if (r.check && res.status === allowed[0]) {
      assert.ok(res.json, "الرد ليس JSON");
      r.check(res.json);
    }
  });
}

test("قيم إعدادات الصوت غير المسموحة لا تغيّر شيئاً", async () => {
  const before = (await s.request("/api/voice/settings")).json.settings;
  const res = await s.request("/api/voice/settings", { body: { gender: "robot", stt: "evil", maleVoice: "x; rm", femaleVoice: 42 } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.settings, before);
});

test("جسم ليس JSON ← 415 قبل تنفيذ المسار", async () => {
  const res = await s.request("/api/memory", { raw: "content=hack", contentType: "text/plain" });
  assert.equal(res.status, 415);
});

test("ملفات الخط تُخدَم محلياً مع CORS محصور في مجلد الخطوط", async () => {
  const font = await fetch(`${s.base}/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2`);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("content-type"), "font/woff2");
  assert.equal(font.headers.get("access-control-allow-origin"), "*");
  const page = await fetch(`${s.base}/`);
  assert.equal(page.headers.get("access-control-allow-origin"), null, "CORS يجب ألا يُفتح للصفحة");
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
});
