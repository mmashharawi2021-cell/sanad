// فحص سهولة الاستخدام في الوضعين الفاتح والداكن (قياس فقط، لا يغيّر شيئاً):
//   تباين النص (WCAG AA: 4.5 للنص العادي، 3 للكبير)، عناصر تفاعلية بلا اسم لقارئ الشاشة، صور بلا alt،
//   وأهداف لمس أصغر من 44×44 على الهاتف.   node scripts/css-audit/a11y-audit.mjs [--json out.json]
import { writeFileSync } from "node:fs";
import { startSanad } from "../../tests/helpers/sanad-server.mjs";
import { launchBrowser } from "../../tests/ui/cdp.mjs";
import { STATES } from "./audit.mjs";

const PAGE = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  // الخلفية الفعلية: تراكب الخلفيات من العنصر إلى الجذر؛ إن وُجدت صورة/تدرّج أو زجاج (backdrop-filter) نتخطى العنصر (لا يمكن الحكم)
  function background(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    const root = parse(getComputedStyle(document.body).backgroundColor);
    if (root && root.a >= 1) out = root;
    for (const l of layers.reverse()) out = blend(l, out);
    return out;
  }
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05 && r.bottom > 0 && r.top < innerHeight; };
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  const contrast = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("svg")) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!text || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color), bg = background(el);
    if (!fg || !bg) continue;
    const c = blend(fg, bg);
    const L1 = lum(c), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need) contrast.push({ el: desc(el), text: text.slice(0, 30), ratio: Math.round(ratio * 100) / 100, need, color: cs.color });
  }
  const nameless = [];
  for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex='-1'])")) {
    if (!visible(el)) continue;
    const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || (el.labels && el.labels.length) || el.textContent.trim();
    if (!labelled) nameless.push(desc(el));
  }
  const noAlt = [...document.querySelectorAll("img")].filter((i) => visible(i) && !i.hasAttribute("alt")).map(desc);
  const small = [];
  if (innerWidth <= 600) for (const el of document.querySelectorAll("button, a[href], [role=button], input[type=checkbox]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) small.push(desc(el) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return { contrast, nameless, noAlt, small };
})()`;

const s = await startSanad();
const browser = await launchBrowser();
const page = await browser.newPage();
await page.send("Runtime.enable");
await page.send("Page.enable");
const all = { contrast: new Map(), nameless: new Map(), noAlt: new Map(), small: new Map() };
const add = (kind, key, state) => { const m = all[kind]; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(state); };
try {
  let vp = "";
  for (const st of STATES) {
    const v = `${st.vw}x${st.vh}${st.mobile}`;
    if (v !== vp) { await page.viewport(st.vw, st.vh, st.mobile); vp = v; }
    await page.navigate(`${s.base}/`);
    await page.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(st.theme)})`);
    await new Promise((r) => setTimeout(r, 2200));
    await page.evaluate("window.sanadModePicker?.close(); try { localStorage.clear() } catch {}");
    if (st.setup) await page.evaluate(st.setup);
    await new Promise((r) => setTimeout(r, st.wait || 600));
    const r = await page.evaluate(PAGE);
    for (const c of r.contrast) add("contrast", `${c.el} «${c.text}» ${c.ratio}<${c.need} [${st.theme}]`, st.name);
    for (const x of r.nameless) add("nameless", x, st.name);
    for (const x of r.noAlt) add("noAlt", x, st.name);
    for (const x of r.small) add("small", x, st.name);
  }
} finally {
  page.close();
  await browser.close();
  await s.stop();
}
const titles = { contrast: "تباين نص غير كافٍ", nameless: "عناصر تفاعلية بلا اسم لقارئ الشاشة", noAlt: "صور بلا وصف بديل", small: "أهداف لمس أصغر من 44×44 (الهاتف)" };
const report = {};
for (const [k, m] of Object.entries(all)) {
  report[k] = [...m].map(([key, states]) => ({ key, states: [...states] }));
  console.log(`\n${titles[k]}: ${m.size}`);
  for (const [key, states] of [...m].slice(0, 40)) console.log(`  ${key}  (${states.size} حالة)`);
}
const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(report, null, 2));
