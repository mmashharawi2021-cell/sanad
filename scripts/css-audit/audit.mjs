// تدقيق CSS بالقياس: يقارن الأنماط المحسوبة لكل عنصر بين styles.css الحالي ونسخة مرشّحة،
// في حالات الواجهة المختلفة، وفي اللحظة نفسها (فلا تؤثر البيانات الحية). لا يغيّر أي ملف.
//
//   node scripts/css-audit/audit.mjs --candidate path.css            ← يقارن ويطبع الفروق
//   import { runAudit } from "./audit.mjs"                           ← للاستخدام من سكربتات أخرى
//
// لكل فرق (حالة، عنصر، خاصية) ينسب السبب إلى تصريحات !important الأصلية التي تطابق العنصر والخاصية.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startSanad, ROOT } from "../../tests/helpers/sanad-server.mjs";
import { launchBrowser } from "../../tests/ui/cdp.mjs";

export const PROPS = [
  "color", "background-color", "background-image", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-bottom-style",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius", "box-shadow",
  "display", "position", "top", "right", "bottom", "left", "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "white-space",
  "opacity", "visibility", "transform", "z-index", "overflow-x", "overflow-y", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink",
  "flex-basis", "align-items", "justify-content", "row-gap", "column-gap", "grid-template-columns", "backdrop-filter", "filter",
  "outline-style", "outline-color", "outline-width", "text-decoration-line", "cursor", "pointer-events", "fill", "stroke", "object-fit",
  // خصائص خط موروثة تغيّر عرض النص دون أن يتغير حجمه
  "font-style", "font-variant-numeric", "font-feature-settings", "font-stretch", "word-spacing", "text-rendering", "direction",
];

/** في الصفحة: أدوات اللقطة والمقارنة والنسبة. */
const PAGE_LIB = `(() => {
  const PROPS = ${JSON.stringify(PROPS)};
  const FAMILY = {
    inset: ["top", "right", "bottom", "left"], font: ["font-family", "font-size", "font-weight", "line-height", "letter-spacing"],
    background: ["background-color", "background-image"], gap: ["row-gap", "column-gap"], flex: ["flex-grow", "flex-shrink", "flex-basis"],
    "flex-flow": ["flex-direction", "flex-wrap"], "place-items": ["align-items"], "place-content": ["justify-content"], overflow: ["overflow-x", "overflow-y"],
    "text-decoration": ["text-decoration-line"], "-webkit-backdrop-filter": ["backdrop-filter"], "grid-template": ["grid-template-columns"],
    "border-color": ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
    "border-width": ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"],
    "border-style": ["border-top-style", "border-bottom-style"],
    "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius"],
  };
  // الخصائص المنطقية (inline/block) ← الفعلية، بأي اتجاه (RTL/LTR)
  function physical(decl) {
    // الحركة قد تغيّر أي خاصية (مثل الشفافية في بدايتها): تُنسب إليها كل الفروق احتياطاً
    if (decl === "animation" || decl.startsWith("animation-")) return PROPS;
    if (FAMILY[decl]) return FAMILY[decl];
    const m = /^(margin|padding|inset|border)-(inline|block)(?:-(start|end))?(?:-(color|width|style))?$/.exec(decl);
    if (m) {
      const sides = m[2] === "inline" ? ["left", "right"] : ["top", "bottom"];
      if (m[1] === "inset") return sides;
      return sides.map((s) => m[4] ? m[1] + "-" + s + "-" + m[4] : m[1] + "-" + s);
    }
    if (decl === "border") return PROPS.filter((p) => p.startsWith("border-") && !p.includes("radius"));
    if (/^border-(top|right|bottom|left)$/.test(decl)) return PROPS.filter((p) => p.startsWith(decl + "-"));
    return PROPS.filter((p) => p === decl || p.startsWith(decl + "-"));
  }
  function flatRules(sheet) {
    const out = [];
    const walk = (list, media) => {
      for (const r of list) {
        if (r instanceof CSSStyleRule) out.push({ rule: r, media });
        else if (r instanceof CSSMediaRule) walk(r.cssRules, [...media, r.conditionText || r.media.mediaText]);
        else if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules, media);
      }
    };
    walk(sheet.cssRules, []);
    return out;
  }
  // ملفات التنسيق في public/css/ بترتيب تحميلها = ملف واحد منطقياً
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')].filter((l) => l.href.includes("/css/"));
  const allRules = () => links.flatMap((l) => flatRules(l.sheet));
  const setDisabled = (v) => links.forEach((l) => { l.sheet.disabled = v; });
  const els = () => [...document.querySelectorAll("body *")].filter((e) => !(e.closest("svg") && e.tagName.toLowerCase() !== "svg"));
  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3) : [];
    if (cls.length) s += "." + cls.join(".");
    return s;
  }
  function snap() {
    return els().map((el) => { const cs = getComputedStyle(el); return PROPS.map((p) => cs.getPropertyValue(p)).join("\\u0001"); });
  }
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__cssAudit = {
    freeze() {
      if (document.getElementById("audit-freeze")) return;
      const st = document.createElement("style");
      st.id = "audit-freeze";
      st.textContent = "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}";
      document.head.append(st);
    },
    flatCount() { return allRules().map((x) => x.rule.selectorText); },
    async compare(candidateCss, important) {
      this.freeze();
      await frames();
      const list = els();
      const a = snap();
      setDisabled(true);
      const cand = document.createElement("style");
      cand.id = "audit-candidate";
      cand.textContent = candidateCss;
      document.head.append(cand);
      await frames();
      const b = snap();
      cand.remove();
      setDisabled(false);
      await frames();
      // لقطة ثانية للأصل: ما تغيّر بين لقطتَي الأصل نفسه سببه بيانات حية لا التنسيق ← يُستبعد
      const a2 = snap();
      if (a2.length !== a.length || b.length !== a.length || els().length !== list.length) return { unstable: true };
      const rules = allRules();
      const diffs = [];
      const needed = new Set();
      let skipped = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        const va = a[i].split("\\u0001"), vb = b[i].split("\\u0001"), va2 = a2[i].split("\\u0001");
        for (let k = 0; k < PROPS.length; k++) {
          if (va[k] === vb[k]) continue;
          if (va[k] !== va2[k]) { skipped++; continue; }
          const el = list[i];
          const causes = [];
          for (const imp of important) {
            const fr = rules[imp.ruleIndex];
            if (!fr || !physical(imp.prop).includes(PROPS[k])) continue;
            if (!fr.media.every((m) => matchMedia(m).matches)) continue;
            let hit = false;
            try { hit = el.matches(fr.rule.selectorText); } catch { hit = false; }
            if (hit) { causes.push(imp.key); needed.add(imp.key); }
          }
          // لا سبب في العنصر نفسه ← خاصية موروثة من أب: كل تصريح مهم لخاصية موروثة يطابق أحد الآباء
          if (!causes.length) {
            const INHERITED = /^(font|color|line-height|letter-spacing|word-spacing|text-|direction|white-space|visibility|cursor|fill|stroke|-webkit-font)/;
            for (let p = el.parentElement; p; p = p.parentElement) {
              for (const imp of important) {
                const fr = rules[imp.ruleIndex];
                if (!fr || !INHERITED.test(imp.prop)) continue;
                if (!fr.media.every((m) => matchMedia(m).matches)) continue;
                let hit = false;
                try { hit = p.matches(fr.rule.selectorText); } catch { hit = false; }
                if (hit) { causes.push(imp.key); needed.add(imp.key); }
              }
              if (causes.length) break;
            }
          }
          diffs.push({ el: describe(el), prop: PROPS[k], before: va[k].slice(0, 80), after: vb[k].slice(0, 80), causes });
        }
      }
      return { elements: a.length, diffs, needed: [...needed], skipped };
    },
    /**
     * أنماط داخلية (style="…") من هيكل الصفحة: تُزال مؤقتاً من العناصر التي نصّها مطابق، ويُقارن الشكل.
     * يعيد لكل نمط هل غيّرت إزالته شيئاً (في العنصر نفسه أو داخله).
     */
    async compareInline(styles, keep) {
      this.freeze();
      await frames();
      const list = els();
      const targets = list.map((el, i) => ({ el, i, s: el.getAttribute("style") })).filter((t) => t.s !== null && styles.includes(t.s) && !keep.includes(t.s));
      const a = snap();
      for (const t of targets) t.el.removeAttribute("style");
      await frames();
      const b = snap();
      for (const t of targets) t.el.setAttribute("style", t.s);
      await frames();
      const a2 = snap();
      if (a2.length !== a.length || b.length !== a.length) return { unstable: true };
      const needed = new Set();
      let diffs = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        const va = a[i].split("\\u0001"), vb = b[i].split("\\u0001"), va2 = a2[i].split("\\u0001");
        if (!PROPS.some((_, k) => va[k] !== vb[k] && va[k] === va2[k])) continue;
        diffs++;
        // السبب: أقرب عنصر (العنصر نفسه أو أحد آبائه) أُزيل نمطه
        for (let p = list[i]; p; p = p.parentElement) {
          const t = targets.find((x) => x.el === p);
          if (t) { needed.add(t.s); break; }
        }
      }
      return { elements: a.length, removed: targets.length, diffs, needed: [...needed] };
    },
    /**
     * مثل compareInline لكن لكل خاصية على حدة: items = [{ style, prop }] — تُحذف الخاصية prop من كل عنصر
     * نمطه الأصلي style، وتُنسب الفروق إلى (style, prop) المسؤول. keep: مفاتيح "style\\u0002prop" تبقى.
     */
    async compareInlineProps(items, keep) {
      this.freeze();
      await frames();
      const list = els();
      const keyOf = (it) => it.style + "\\u0002" + it.prop;
      const active = items.filter((it) => !keep.includes(keyOf(it)));
      const targets = [];
      for (const el of list) {
        const s = el.getAttribute("style");
        if (s === null) continue;
        const props = active.filter((it) => it.style === s).map((it) => it.prop);
        if (props.length) targets.push({ el, s, props });
      }
      const a = snap();
      for (const t of targets) for (const p of t.props) t.el.style.removeProperty(p);
      await frames();
      const b = snap();
      for (const t of targets) t.el.setAttribute("style", t.s);
      await frames();
      const a2 = snap();
      if (a2.length !== a.length || b.length !== a.length) return { unstable: true };
      const needed = new Set();
      let diffs = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        const va = a[i].split("\\u0001"), vb = b[i].split("\\u0001"), va2 = a2[i].split("\\u0001");
        const changed = PROPS.filter((_, k) => va[k] !== vb[k] && va[k] === va2[k]);
        if (!changed.length) continue;
        diffs++;
        // العنصر نفسه: الخاصية المحذوفة التي تؤثر في ما تغيّر؛ وإلا أقرب أب له خصائص محذوفة (كلها احتياطاً)
        const own = targets.find((x) => x.el === list[i]);
        const hits = own ? own.props.filter((p) => changed.some((c) => physical(p).includes(c))) : [];
        if (hits.length) { for (const p of hits) needed.add(own.s + "\\u0002" + p); continue; }
        for (let p = own ? list[i] : list[i].parentElement; p; p = p.parentElement) {
          const t = targets.find((x) => x.el === p);
          if (t) { for (const pr of t.props) needed.add(t.s + "\\u0002" + pr); break; }
        }
      }
      return { elements: a.length, removed: targets.length, diffs, needed: [...needed] };
    },
  };
})()`;

/** حالات الواجهة التي تُقارن فيها الأنماط. كل حالة: اسم + مقاس + مظهر + تجهيز في الصفحة. */
export const STATES = (() => {
  const RICH = `(() => { newConversation(); const c = activeConv();
    c.messages.push({ role: "user", content: "اختبار التنسيق" },
      { role: "assistant", content: "## عنوان\\n\\nفقرة فيها **غامق** و\`كود\` و[رابط](https://example.com).\\n\\n- بند أول\\n- بند ثاني\\n\\n1. مرقّم\\n\\n> اقتباس\\n\\n| أ | ب |\\n|---|---|\\n| 1 | 2 |\\n\\n\\x60\\x60\\x60python\\nprint(1)\\n\\x60\\x60\\x60", model: "test", latencyMs: 10 },
      { role: "assistant", content: "", error: { message: "خطأ تجريبي", hint: "تلميح" } });
    renderAll(); })()`;
  const click = (id) => `document.getElementById(${JSON.stringify(id)})?.click()`;
  const out = [];
  for (const [vw, vh, mobile, dev] of [[1280, 800, false, "desktop"], [430, 932, true, "phone"]]) {
    for (const theme of ["dark", "light"]) {
      out.push({ name: `${dev}-${theme}-home`, vw, vh, mobile, theme, setup: "" });
      out.push({ name: `${dev}-${theme}-chat`, vw, vh, mobile, theme, setup: RICH });
    }
  }
  const MODALS = ["sysStatsBtn", "netMaestroBtn", "desktopManagerBtn", "terminalBtn", "memoryBtn", "tasksBtn", "workflowsBtn", "projectPreviewBtn", "extensionsBtn"];
  for (const theme of ["dark", "light"]) {
    for (const id of MODALS) out.push({ name: `desktop-${theme}-${id}`, vw: 1280, vh: 800, mobile: false, theme, setup: click(id), wait: 1800 });
    out.push({ name: `desktop-${theme}-mode-picker`, vw: 1280, vh: 800, mobile: false, theme, setup: "window.sanadModePicker.open()" });
    out.push({ name: `desktop-${theme}-palette`, vw: 1280, vh: 800, mobile: false, theme, setup: click("paletteBtn") });
    // مركز التحكم يجلب الذاكرة والقرص عند فتحه: ننتظر وصولها حتى لا يتغير النص بين اللقطتين
    out.push({ name: `desktop-${theme}-control-center`, vw: 1280, vh: 800, mobile: false, theme, setup: "window.sanadControlCenter.open()", wait: 3000 });
    out.push({ name: `desktop-${theme}-island`, vw: 1280, vh: 800, mobile: false, theme, setup: 'document.querySelector(".dyn-island")?.classList.add("expanded")' });
  }
  for (const theme of ["dark", "light"]) {
    out.push({ name: `phone-${theme}-nav-history`, vw: 430, vh: 932, mobile: true, theme, setup: click("openNav") });
    out.push({ name: `phone-${theme}-nav-tools`, vw: 430, vh: 932, mobile: true, theme, setup: 'document.querySelector(\'.ios-tab[data-tab="tools"]\')?.click()' });
    out.push({ name: `phone-${theme}-sysStats`, vw: 430, vh: 932, mobile: true, theme, setup: click("sysStatsBtn"), wait: 1800 });
    out.push({ name: `phone-${theme}-mode-picker`, vw: 430, vh: 932, mobile: true, theme, setup: "window.sanadModePicker.open()" });
  }
  return out;
})();

/**
 * يشغّل المقارنة في كل الحالات. important: قائمة التصريحات الأصلية [{key, ruleIndex, prop}] لنسبة الفروق.
 * @returns {Promise<{ states: Array<{name, elements, diffs}>, needed: Set<string>, ruleCountOk: boolean }>}
 */
export async function runAudit(candidateCss, important, { expectedRules, log = console.log } = {}) {
  const s = await startSanad();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  const needed = new Set();
  const states = [];
  let ruleCountOk = true;
  try {
    let lastViewport = "";
    for (const st of STATES) {
      const vp = `${st.vw}x${st.vh}${st.mobile}`;
      if (vp !== lastViewport) { await page.viewport(st.vw, st.vh, st.mobile); lastViewport = vp; }
      await page.navigate(`${s.base}/`);
      await page.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(st.theme)})`);
      await new Promise((r) => setTimeout(r, 2200));
      await page.evaluate("window.sanadModePicker?.close(); try { localStorage.clear() } catch {}");
      if (st.setup) await page.evaluate(st.setup);
      await new Promise((r) => setTimeout(r, st.wait || 600));
      await page.evaluate(PAGE_LIB);
      if (expectedRules && !states.length) {
        const sel = await page.evaluate("window.__cssAudit.flatCount()");
        ruleCountOk = sel.length === expectedRules;
        if (!ruleCountOk) log(`⚠ عدد القواعد في المتصفح ${sel.length} ≠ المحلل ${expectedRules} — نسبة الفروق قد تخطئ`);
      }
      // الصفحة تغيّرت أثناء القياس (وصول بيانات) ← إعادة المقارنة حتى 4 مرات
      let r;
      for (let attempt = 0; attempt < 4; attempt++) {
        r = await page.evaluate(`window.__cssAudit.compare(${JSON.stringify(candidateCss)}, ${JSON.stringify(important)})`);
        if (!r.unstable) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
      if (r.unstable) throw new Error(`الحالة ${st.name} لم تستقر للقياس`);
      for (const k of r.needed) needed.add(k);
      states.push({ name: st.name, elements: r.elements, diffs: r.diffs });
      log(`${r.diffs.length ? "✗" : "✓"} ${st.name.padEnd(34)} ${String(r.elements).padStart(5)} عنصر  ${r.diffs.length} فرق`);
    }
  } finally {
    page.close();
    await browser.close();
    await s.stop();
  }
  return { states, needed, ruleCountOk };
}

/** يمر على الحالات ويقيس أثر إزالة الأنماط الداخلية (عدا keep). يعيد الأنماط التي لها أثر. */
export async function runInlineAudit(styles, keep, { log = console.log, perProp = false } = {}) {
  const s = await startSanad();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  const needed = new Set();
  let total = 0;
  try {
    let lastViewport = "";
    for (const st of STATES) {
      const vp = `${st.vw}x${st.vh}${st.mobile}`;
      if (vp !== lastViewport) { await page.viewport(st.vw, st.vh, st.mobile); lastViewport = vp; }
      await page.navigate(`${s.base}/`);
      await page.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(st.theme)})`);
      await new Promise((r) => setTimeout(r, 2200));
      await page.evaluate("window.sanadModePicker?.close(); try { localStorage.clear() } catch {}");
      if (st.setup) await page.evaluate(st.setup);
      await new Promise((r) => setTimeout(r, st.wait || 600));
      await page.evaluate(PAGE_LIB);
      let r;
      for (let attempt = 0; attempt < 4; attempt++) {
        r = await page.evaluate(perProp
          ? `window.__cssAudit.compareInlineProps(${JSON.stringify(styles)}, ${JSON.stringify(keep)})`
          : `window.__cssAudit.compareInline(${JSON.stringify(styles)}, ${JSON.stringify(keep)})`);
        if (!r.unstable) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
      if (r.unstable) throw new Error(`الحالة ${st.name} لم تستقر للقياس`);
      for (const k of r.needed) needed.add(k);
      total += r.diffs;
      log(`${r.diffs ? "✗" : "✓"} ${st.name.padEnd(34)} أُزيل ${r.removed} نمطاً  ${r.diffs} فرق`);
    }
  } finally {
    page.close();
    await browser.close();
    await s.stop();
  }
  return { needed, total };
}

// تشغيل مباشر: مقارنة ملف مرشّح بالحالي
// (اسم الملف بالضبط: a11y-audit.mjs ينتهي بـ audit.mjs أيضاً)
if (process.argv[1] && /[\\/]audit\.mjs$/.test(process.argv[1])) {
  const { parseCss, importantDecls } = await import("./parse-css.mjs");
  const i = process.argv.indexOf("--candidate");
  if (i < 0) { console.log("الاستخدام: node scripts/css-audit/audit.mjs --candidate path.css"); process.exit(2); }
  const { readBundle } = await import("./css-bundle.mjs");
  const current = readBundle();
  const rules = parseCss(current);
  const res = await runAudit(readFileSync(process.argv[i + 1], "utf8"), importantDecls(rules), { expectedRules: rules.length });
  const total = res.states.reduce((a, x) => a + x.diffs.length, 0);
  for (const st of res.states) for (const d of st.diffs.slice(0, 5)) console.log(`  ${st.name}: ${d.el} ${d.prop}: ${d.before} → ${d.after}`);
  console.log(total ? `\n✗ ${total} فرق` : "\n✓ مطابق تماماً في كل الحالات");
  process.exit(total ? 1 : 0);
}
