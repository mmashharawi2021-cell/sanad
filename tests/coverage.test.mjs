// كل مسار في src/server.ts مصنّف في routes.manifest.mjs، ولا مسار في السجل غير موجود في الخادم.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTES } from "./routes.manifest.mjs";
import { routesInServer } from "./helpers/sanad-server.mjs";

const key = (r) => `${r.method} ${r.path}`;

test("كل مسارات الخادم مصنّفة في سجل الاختبار", async () => {
  const server = (await routesInServer()).map(key);
  const manifest = new Set(ROUTES.map(key));
  const missing = server.filter((k) => !manifest.has(k));
  assert.deepEqual(missing, [], `مسارات جديدة تحتاج تصنيفاً في tests/routes.manifest.mjs:\n${missing.join("\n")}`);
});

test("لا يوجد في السجل مسار غير موجود في الخادم", async () => {
  const server = new Set((await routesInServer()).map(key));
  const stale = ROUTES.map(key).filter((k) => !server.has(k));
  assert.deepEqual(stale, [], `مسارات في السجل لم تعد في الخادم:\n${stale.join("\n")}`);
});

test("لا تكرار في السجل، وكل مسار خطِر موثّق بالسبب", () => {
  const keys = ROUTES.map(key);
  assert.equal(new Set(keys).size, keys.length, "مسار مكرر في السجل");
  for (const r of ROUTES.filter((x) => x.kind === "guardOnly")) assert.ok(r.reason, `${key(r)} بلا سبب`);
});
