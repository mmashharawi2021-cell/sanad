// Tests for public/instant-commands.js — run: node scripts/test-instant-commands.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const code = readFileSync(new URL("../public/instant-commands.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, performance };
vm.runInNewContext(code, sandbox);
const { normalizeTranscript, parse } = sandbox.module.exports;

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log(`✗ ${name}\n   ${e.message.split("\n").join("\n   ")}`); }
}
const intent = (t) => { const r = parse(t); return r && JSON.parse(JSON.stringify(r)); };

// --- numbers & wake word (real FastConformer outputs from the lab) ---
const norm = [
  ["حرر المنفذ ثلاثة الاف واغلق برنامج كروم", "حرر المنفذ 3000 واغلق برنامج كروم"],
  ["تم تحرير المنفذ ثلاثة آلاف بنجاح", "تم تحرير المنفذ 3000 بنجاح"],
  ["حرر بورت خمسة آلاف ومئة وثلاثة وسبعون", "حرر بورت 5173"],
  ["حرر بورت ثمانية آلاف وثمانون", "حرر بورت 8080"],
  ["افحص بورت خمسة آلاف واربعمئة واثنان وثلاثون", "افحص بورت 5432"],
  ["حرر المنفذ ٣٠٠٠", "حرر المنفذ 3000"],
  ["حرر المنفذ 3.000", "حرر المنفذ 3000"],
  ["يا سندي افتح الآلة الحاسبة", "يا سند افتح الآلة الحاسبة"],
  ["أهلا بك الآن سناد كيف أساعدك", "أهلا بك الآن سند كيف أساعدك"],
  ["ياسند كيف حالك", "يا سند كيف حالك"],
  ["الفين", "2000"],
  ["ثلاثة عشر", "13"],
  ["ستون في المائة", "60 في المائة"],
];
for (const [inp, want] of norm) check(`normalize: ${inp}`, () => assert.equal(normalizeTranscript(inp), want));

// --- intents ---
const cases = [
  ["حرر بورت 3000", { type: "kill_port", port: 3000 }],
  ["يا سند حرر المنفذ ثلاثة آلاف", { type: "kill_port", port: 3000 }],
  ["اقتل المنفذ 8080", { type: "kill_port", port: 8080 }],
  ["سكّر بورت خمسة آلاف ومئة وثلاثة وسبعون", { type: "kill_port", port: 5173 }],
  ["kill port 4200", { type: "kill_port", port: 4200 }],
  ["مين ماسك بورت 3000", { type: "check_port", port: 3000 }],
  ["من يستخدم المنفذ 5432؟", { type: "check_port", port: 5432 }],
  ["هل البورت 3000 فاضي", { type: "check_port", port: 3000 }],
  ["البورت 8080 فاضي؟", { type: "check_port", port: 8080 }],
  ["اعرض المنافذ المفتوحة", { type: "list_ports" }],
  ["شو البورتات الشغالة", { type: "list_ports" }],
  ["افحص النت", { type: "ping", host: "8.8.8.8" }],
  ["يا سند افحص سرعة الانترنت", { type: "ping", host: "8.8.8.8" }],
  ["كم البينغ", { type: "ping", host: "8.8.8.8" }],
  ["بينغ github.com", { type: "ping", host: "github.com" }],
  ["ما هو الآي بي", { type: "net_info" }],
  ["معلومات الشبكة", { type: "net_info" }],
  ["حرر بورت 70000", { type: "bad_port", raw: "70000" }],
];
for (const [t, want] of cases) check(`intent: ${t}`, () => assert.deepEqual(intent(t), want));

// --- must NOT be treated as commands (conversation goes to the brain) ---
const negatives = [
  "اشرح لي ما هو المنفذ في الشبكات",
  "كيف أحرر الذاكرة في بايثون",
  "اكتب لي سكربت يفحص البورتات المفتوحة ويحفظها في ملف ثم يرسل تقريراً",
  "افتح كروم",
  "يا سند كيف حالك اليوم؟",
  "ما الفرق بين TCP و UDP",
];
for (const t of negatives) check(`not a command: ${t}`, () => assert.equal(intent(t), null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
