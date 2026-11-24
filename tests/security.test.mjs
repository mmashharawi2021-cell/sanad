// طبقة الحماية: كل طلب يغيّر الحالة يُرفض قبل الوصول لأي مسار إن نقصه رأس سند أو كوكي الجلسة،
// أو جاء من أصل غريب، أو بـ Host غير محلي. هذه الطلبات لا تصل لأي كود تنفيذ، فهي آمنة لكل المسارات.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ROUTES } from "./routes.manifest.mjs";
import { startSanad } from "./helpers/sanad-server.mjs";

let s;
before(async () => { s = await startSanad(); });
after(async () => { await s?.stop(); });

const mutating = ROUTES.filter((r) => r.method !== "GET");
const probe = { probe: "security-test" };

test("الصفحة الرئيسية تضع كوكي الجلسة HttpOnly وSameSite=Strict", () => {
  assert.match(s.setCookie, /^sanad_session=[0-9a-f]{64}/);
  assert.match(s.setCookie, /HttpOnly/i);
  assert.match(s.setCookie, /SameSite=Strict/i);
});

for (const r of mutating) {
  test(`${r.method} ${r.path} — دون رأس X-Sanad-Request ← 403`, async () => {
    const res = await s.request(r.path, { method: r.method, body: probe, auth: false, headers: { cookie: s.cookie } });
    assert.equal(res.status, 403, res.text);
  });

  test(`${r.method} ${r.path} — دون كوكي الجلسة ← 403`, async () => {
    const res = await s.request(r.path, { method: r.method, body: probe, auth: false, headers: { "x-sanad-request": "1" } });
    assert.equal(res.status, 403, res.text);
  });

  test(`${r.method} ${r.path} — كوكي مزيّف ← 403`, async () => {
    const res = await s.request(r.path, { method: r.method, body: probe, auth: false, headers: { "x-sanad-request": "1", cookie: `sanad_session=${"0".repeat(64)}` } });
    assert.equal(res.status, 403, res.text);
  });

  test(`${r.method} ${r.path} — من أصل غريب ← 403`, async () => {
    const res = await s.request(r.path, { method: r.method, body: probe, headers: { origin: "https://evil.example" } });
    assert.equal(res.status, 403, res.text);
  });
}

test("Host غير محلي ← 403 (حماية من DNS rebinding)", async () => {
  // fetch يتجاهل رأس Host (رأس محظور في المعيار)، لذا نستخدم http.request مباشرة
  const { request } = await import("node:http");
  const status = await new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: s.port, path: "/api/memory", headers: { host: "evil.example" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});

test("محاولة الخروج من مجلد public ← ممنوعة", async () => {
  for (const p of ["/..%2f..%2fsrc%2fserver.ts", "/..%5c..%5c.env", "/%2e%2e/%2e%2e/.env"]) {
    const res = await fetch(`${s.base}${p}`);
    assert.ok([403, 404].includes(res.status), `${p} → ${res.status}`);
    const text = await res.text();
    assert.doesNotMatch(text, /OPENROUTER_API_KEY|import \{ createServer/, `${p} سرّب محتوى`);
  }
});
