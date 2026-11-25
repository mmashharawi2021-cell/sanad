// تقليل !important بالقياس: يحذف كل ما يمكن التحقق منه، ويعيد فقط ما يثبت القياس أنه يغيّر شكل عنصر.
//   node scripts/css-audit/reduce-important.mjs --out path.css
// لا يُكتب styles.css: الناتج ملف مرشّح يُراجع ويُختبر ثم يُنسخ.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../tests/helpers/sanad-server.mjs";
import { parseCss, importantDecls, removeImportant } from "./parse-css.mjs";
import { runAudit } from "./audit.mjs";
import { readBundle } from "./css-bundle.mjs";

const out = process.argv[process.argv.indexOf("--out") + 1];
if (!process.argv.includes("--out") || !out) { console.log("الاستخدام: --out path.css"); process.exit(2); }

const text = readBundle();
const rules = parseCss(text);
const imp = importantDecls(rules);
// حالات تفاعلية وعناصر وهمية لا تظهر في لقطة ثابتة: تبقى كما هي
const UNVERIFIABLE = /:(hover|focus|active|focus-visible|focus-within)|::?(before|after|placeholder|selection|-webkit)/;
const keep = new Set(imp.filter((x) => UNVERIFIABLE.test(x.selector)).map((x) => x.key));
console.log(`المجموع ${imp.length} | لا يمكن التحقق منها بلقطة ثابتة (تبقى): ${keep.size}`);

let candidate = "";
for (let round = 1; round <= 8; round++) {
  candidate = removeImportant(text, rules, imp.filter((x) => !keep.has(x.key)).map((x) => x.key));
  console.log(`\n— الجولة ${round}: محاولة الإبقاء على ${keep.size} فقط`);
  const res = await runAudit(candidate, imp, { expectedRules: rules.length, log: () => {} });
  const diffs = res.states.flatMap((s) => s.diffs.map((d) => ({ ...d, state: s.name })));
  const fresh = [...res.needed].filter((k) => !keep.has(k));
  const orphan = diffs.filter((d) => !d.causes.length);
  console.log(`   فروق: ${diffs.length} | تصريحات لازمة جديدة: ${fresh.length} | فروق بلا سبب منسوب: ${orphan.length}`);
  for (const k of fresh) keep.add(k);
  if (!diffs.length) {
    writeFileSync(out, candidate);
    const kept = imp.filter((x) => keep.has(x.key));
    console.log(`\n✓ مطابق في كل الحالات. بقي ${kept.length} من ${imp.length}:`);
    for (const x of kept) console.log(`   ${UNVERIFIABLE.test(x.selector) ? "(تفاعلي) " : ""}${x.selector.slice(0, 70)} { ${x.prop} }${x.media.length ? `  @media ${x.media.join(" & ")}` : ""}`);
    process.exit(0);
  }
  if (!fresh.length) {
    console.log("✗ فروق لا يُعرف سببها — توقفت. أمثلة:");
    for (const d of orphan.slice(0, 12)) console.log(`   ${d.state}: ${d.el} ${d.prop}: ${d.before} → ${d.after}`);
    process.exit(1);
  }
}
console.log("✗ لم يستقر بعد 8 جولات");
process.exit(1);
