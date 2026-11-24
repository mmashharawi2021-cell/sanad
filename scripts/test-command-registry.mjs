// اختبارات سجل الأوامر الموحّد public/command-registry.js — node scripts/test-command-registry.mjs
// 1) كل مثال (examples) يطابق أمره هو أولاً.  2) كل مثال سلبي (nonExamples) لا يطابق أمره.
// 3) جمل محادثة عادية لا تطابق أي أمر ينفّذ إجراءً (تذهب للعقل).  4) بنية السجل سليمة.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const code = readFileSync(new URL("../public/command-registry.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(code, sandbox);
const { COMMANDS, matchAll, match, fold, isQuestion } = sandbox.module.exports;

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log(`✗ ${name}\n   ${e.message.split("\n").join("\n   ")}`); }
}

// --- بنية السجل ---
const ids = COMMANDS.map((c) => c.id);
check("المعرّفات فريدة", () => assert.equal(new Set(ids).size, ids.length));
for (const c of COMMANDS) {
  check(`بنية ${c.id}`, () => {
    assert.ok(c.title && c.group, "title/group");
    assert.ok(["safe", "action", "danger"].includes(c.risk), `risk=${c.risk}`);
    assert.equal(typeof c.match, "function");
    assert.equal(typeof c.run, "function");
    if (!["selfdev", "network"].includes(c.id)) assert.ok(c.examples.length > 0, "لا أمثلة");
  });
}

// --- الأمثلة الإيجابية والسلبية لكل أمر ---
for (const c of COMMANDS) {
  for (const ex of c.examples) {
    check(`${c.id} ✓ «${ex}»`, () => assert.equal(match(ex)?.cmd.id, c.id, `طابق: ${match(ex)?.cmd.id ?? "لا شيء"}`));
  }
  for (const ex of c.nonExamples) {
    check(`${c.id} ✗ «${ex}»`, () => assert.ok(!matchAll(ex).some((m) => m.cmd.id === c.id), "طابق خطأً"));
  }
}

// --- محادثة عادية: لا تُنفّذ أي إجراء على الجهاز ---
const CONVERSATION = [
  "كيف اشحن جوالي بسرعة؟",
  "اكتب لي مقالا عن الذكاء الاصطناعي",
  "اكتب لي رسالة اعتذار لمديري",
  "اعرض لي صورا عن تاريخ الاندلس وحضارتها",
  "اشرح لي كيف اشغل كود بايثون من الطرفية",
  "ما الفرق بين let و const في جافاسكريبت؟",
  "لخص لي هذا النص",
  "هل يمكنك مساعدتي في كتابة سيرة ذاتية؟",
  "افتح موضوعا جديدا عن تاريخ المتصفحات",
  "كيف اغلق النافذة العالقة في ويندوز؟",
  "اضغط على نفسك قليلا وفكر في الحل",
  "احفظ هذه الفكرة لمشروعي القادم",
  "انسخ الفقرة التالية وعدلها لتكون رسمية اكثر",
  "اعمل لي خطة دراسة لمدة شهر",
];
for (const t of CONVERSATION) {
  check(`محادثة «${t}»`, () => {
    const risky = matchAll(t).filter((m) => m.cmd.risk !== "safe");
    assert.equal(risky.length, 0, `طابق: ${risky.map((m) => m.cmd.id).join("، ")}`);
  });
}

// --- أدوات التوحيد ---
check("fold: الهمزات والتاء المربوطة والتشكيل", () => assert.equal(fold("  أَضِفْ إلى الذاكرة.  "), "اضف الي الذاكره"));
check("isQuestion", () => {
  assert.ok(isQuestion("كيف وضع جهازي"));
  assert.ok(isQuestion("ارفع الصوت؟"));
  assert.ok(!isQuestion("ارفع الصوت"));
});
check("النداء لا يمنع المطابقة", () => assert.equal(match("يا سند، اقفل الشاشة")?.cmd.id, "lock"));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
