// مثل dead-inline-styles.mjs لكن لكل خاصية داخل النمط الداخلي: يحذف من الهيكل الخصائص التي لا أثر لها
// (غالباً لأن قاعدة !important في styles.css تغلبها دائماً) ويبقي الحيّة.
//   node scripts/css-audit/dead-inline-props.mjs [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../tests/helpers/sanad-server.mjs";
import { runInlineAudit } from "./audit.mjs";

const FILES = ["index.html", "markup-overlays.js", "markup-modals.js"].map((f) => join(ROOT, "public", f));
const decls = (style) => style.split(";").map((d) => d.trim()).filter(Boolean);
const propOf = (d) => d.slice(0, d.indexOf(":")).trim().toLowerCase();

const styles = [...new Set(FILES.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1])))];
const items = styles.flatMap((style) => decls(style).filter((d) => d.includes(":")).map((d) => ({ style, prop: propOf(d) })));
const key = (it) => `${it.style}\u0002${it.prop}`;
console.log(`خصائص داخلية: ${items.length} في ${styles.length} نمطاً`);

const keep = new Set();
for (let round = 1; round <= 8; round++) {
  console.log(`\n— الجولة ${round}: محاولة حذف ${items.length - keep.size}`);
  const res = await runInlineAudit(items, [...keep], { log: () => {}, perProp: true });
  const fresh = [...res.needed].filter((k) => !keep.has(k));
  console.log(`   فروق: ${res.total} | خصائص لها أثر (تبقى): ${fresh.length}`);
  for (const k of fresh) keep.add(k);
  if (!res.total) {
    const dead = items.filter((it) => !keep.has(key(it)));
    console.log(`\n✓ ميتة: ${dead.length} | حيّة تبقى: ${keep.size}`);
    if (process.argv.includes("--apply")) {
      let n = 0;
      for (const f of FILES) {
        let text = readFileSync(f, "utf8");
        text = text.replace(/\sstyle="([^"]*)"/g, (m, style) => {
          const deadProps = new Set(dead.filter((it) => it.style === style).map((it) => it.prop));
          if (!deadProps.size) return m;
          const rest = decls(style).filter((d) => !deadProps.has(propOf(d)));
          n += deadProps.size;
          return rest.length ? ` style="${rest.join("; ")};"` : "";
        });
        writeFileSync(f, text);
      }
      console.log(`حُذفت ${n} خاصية ميتة من الهيكل.`);
    }
    process.exit(0);
  }
  if (!fresh.length) { console.log("✗ فروق دون خاصية مسؤولة — توقفت"); process.exit(1); }
}
console.log("✗ لم يستقر");
process.exit(1);
