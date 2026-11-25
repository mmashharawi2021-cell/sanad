// ملفات التنسيق مقسّمة في public/css/ (ترتيبها = ترتيب وسوم <link> في index.html).
// readBundle: تجمعها نصاً واحداً بالترتيب (لأدوات القياس). writeBundle: تقسم نصاً مجمّعاً عائداً على علامات
// «/* @file اسم.css */» في أول كل ملف. لا ملفات غير public/css/ تُكتب.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");
const MARK = /^\/\* @file ([\w.-]+\.css) \*\/\n/m;

/** أسماء ملفات التنسيق بترتيب تحميلها في index.html */
export function cssFiles() {
  const html = readFileSync(join(PUBLIC, "index.html"), "utf8");
  return [...html.matchAll(/<link rel="stylesheet" href="\/css\/([\w.-]+\.css)"/g)].map((m) => m[1]);
}

export function readBundle() {
  return cssFiles().map((f) => readFileSync(join(PUBLIC, "css", f), "utf8")).join("");
}

export function writeBundle(text) {
  const parts = text.split(/(?=^\/\* @file [\w.-]+\.css \*\/\n)/m);
  const expected = cssFiles();
  const names = parts.map((p) => MARK.exec(p)?.[1]);
  if (names.join() !== expected.join()) throw new Error(`علامات الملفات لا تطابق index.html:\n${names.join(", ")}`);
  parts.forEach((p, i) => writeFileSync(join(PUBLIC, "css", names[i]), p));
  return names.length;
}
