// يجد الأنماط الداخلية (style="…") الميتة في هيكل الصفحة — التي لا تغيّر إزالتها أي شيء في أي حالة — ويحذفها.
//   node scripts/css-audit/dead-inline-styles.mjs           ← تقرير فقط
//   node scripts/css-audit/dead-inline-styles.mjs --apply   ← حذف الميتة من الملفات
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../tests/helpers/sanad-server.mjs";
import { runInlineAudit } from "./audit.mjs";

const FILES = ["index.html", "markup-overlays.js", "markup-modals.js"].map((f) => join(ROOT, "public", f));
const styles = [...new Set(FILES.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1])))];
console.log(`أنماط داخلية مختلفة في الهيكل: ${styles.length}`);

const keep = new Set();
for (let round = 1; round <= 6; round++) {
  console.log(`\n— الجولة ${round}: محاولة إزالة ${styles.length - keep.size}`);
  const res = await runInlineAudit(styles, [...keep], { log: () => {} });
  const fresh = [...res.needed].filter((s) => !keep.has(s));
  console.log(`   فروق: ${res.total} | أنماط لها أثر (تبقى): ${fresh.length}`);
  for (const s of fresh) keep.add(s);
  if (!res.total) {
    const dead = styles.filter((s) => !keep.has(s));
    console.log(`\n✓ ميتة (لا أثر لإزالتها): ${dead.length} | لها أثر وتبقى: ${keep.size}`);
    if (process.argv.includes("--apply")) {
      let n = 0;
      for (const f of FILES) {
        let text = readFileSync(f, "utf8");
        text = text.replace(/\sstyle="([^"]*)"/g, (m, s) => (dead.includes(s) ? (n++, "") : m));
        writeFileSync(f, text);
      }
      console.log(`حُذف ${n} نمطاً داخلياً من الهيكل.`);
    }
    process.exit(0);
  }
  if (!fresh.length) { console.log("✗ فروق دون نمط مسؤول — توقفت"); process.exit(1); }
}
console.log("✗ لم يستقر");
process.exit(1);
