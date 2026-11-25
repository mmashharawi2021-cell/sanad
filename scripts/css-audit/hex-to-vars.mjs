// ينقل الألوان الحرفية (#hex) من التصريحات إلى متغيرات في لوحة ألوان واحدة أعلى الملف.
// القيم نفسها تماماً (الناتج مطابق، ويتحقق منه audit.mjs)، لكن كل لون صار له اسم ومكان واحد.
//   node scripts/css-audit/hex-to-vars.mjs in.css out.css
import { readFileSync, writeFileSync } from "node:fs";
import { parseCss } from "./parse-css.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.log("الاستخدام: hex-to-vars.mjs in.css out.css"); process.exit(2); }
const text = readFileSync(input, "utf8");

// ألوان نظام iOS المعروفة وأساسيات — أسماء واضحة؛ الباقي اسم من قيمته
const NAMED = {
  "#ffffff": "white", "#000000": "black",
  "#30d158": "ios-green", "#34c759": "ios-green-light", "#4cd964": "ios-green-legacy",
  "#ff453a": "ios-red", "#ff3b30": "ios-red-light", "#0a84ff": "ios-blue", "#007aff": "ios-blue-light",
  "#ff9f0a": "ios-orange", "#ff9500": "ios-orange-light", "#ffd60a": "ios-yellow", "#ffcc00": "ios-yellow-light",
  "#bf5af2": "ios-purple", "#af52de": "ios-purple-light", "#5ac8fa": "ios-teal", "#64d2ff": "ios-cyan", "#ff375f": "ios-pink",
  "#8e8e93": "ios-gray", "#1c1c1e": "ios-gray-6-dark", "#2c2c2e": "ios-gray-5-dark", "#3a3a3c": "ios-gray-4-dark",
  "#f2f2f7": "ios-gray-6-light",
};
const full = (h) => {
  h = h.toLowerCase();
  if (h.length === 4) return "#" + [...h.slice(1)].map((c) => c + c).join("");
  if (h.length === 5) return "#" + [...h.slice(1)].map((c) => c + c).join("");
  return h;
};
const nameOf = (h) => `--color-${NAMED[full(h)] || full(h).slice(1)}`;

const rules = parseCss(text);
const edits = []; // [start, end, replacement]
const used = new Map(); // اسم المتغير ← القيمة الأصلية
for (const r of rules) {
  for (const d of r.decls) {
    if (d.prop.startsWith("--")) continue; // تعريفات المتغيرات الحالية تبقى كما هي
    const raw = text.slice(d.start, d.end);
    if (/url\(/i.test(raw)) continue;
    const colon = raw.indexOf(":");
    for (const m of raw.slice(colon).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const name = nameOf(m[0]);
      const prev = used.get(name);
      if (prev && full(prev) !== full(m[0])) throw new Error(`تعارض اسم ${name}`);
      used.set(name, m[0]);
      const s = d.start + colon + m.index;
      edits.push([s, s + m[0].length, `var(${name})`]);
    }
  }
}
edits.sort((a, b) => b[0] - a[0]);
let out = text;
for (const [s, e, rep] of edits) out = out.slice(0, s) + rep + out.slice(e);

const palette = [...used].sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => `  ${n}: ${full(v)};`).join("\n");
const block = `/* =====================================================================
   لوحة الألوان الحرفية — كل لون مكتوب في التصريحات صار متغيراً هنا (المرحلة 5).
   القيم كما كانت تماماً. لتغيير لون في كل مكان: عدّله هنا. ألوان الوضعين في الرموز أدناه (--surface-* …).
   ===================================================================== */
:root {
${palette}
}

`;
// بعد التعليق الافتتاحي الأول إن وُجد
const firstRule = out.search(/\n(?=[^\s/][^{]*\{)/);
out = firstRule > 0 ? out.slice(0, firstRule + 1) + "\n" + block + out.slice(firstRule + 1) : block + out;
writeFileSync(output, out);
console.log(`استُبدل ${edits.length} لوناً حرفياً بـ ${used.size} متغيراً.`);
