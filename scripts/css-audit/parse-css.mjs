// محلل CSS صغير لأدوات تدقيق التصميم: يسرد قواعد الأنماط بالترتيب (مع @media المتداخلة)،
// ولكل تصريح موضعه في النص وهل هو !important. لا يغيّر شيئاً؛ يُستخدم لتوليد نسخ مرشّحة من styles.css.

/** يحذف التعليقات مع الحفاظ على المواضع (تُستبدل بمسافات بنفس الطول). */
export function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * @returns {Array<{ selector: string, media: string[], start: number, end: number,
 *   decls: Array<{ prop: string, start: number, end: number, important: boolean, impStart: number }> }>}
 *   start/end: مواضع جسم القاعدة بين { و }.  impStart: موضع "!important" في النص (أو -1).
 */
export function parseCss(text) {
  const src = blankComments(text);
  const rules = [];
  let i = 0;

  function skipWs() { while (i < src.length && /\s/.test(src[i])) i++; }
  function readUntil(chars) {
    const s = i;
    let depthParen = 0, quote = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) { if (c === "\\") { i += 2; continue; } if (c === quote) quote = null; i++; continue; }
      if (c === '"' || c === "'") { quote = c; i++; continue; }
      if (c === "(") depthParen++;
      else if (c === ")") depthParen--;
      else if (depthParen === 0 && chars.includes(c)) break;
      i++;
    }
    return src.slice(s, i);
  }
  function matchBrace(from) { // src[from] === "{"
    let d = 0, quote = null;
    for (let k = from; k < src.length; k++) {
      const c = src[k];
      if (quote) { if (c === "\\") { k++; continue; } if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === "{") d++;
      else if (c === "}") { d--; if (d === 0) return k; }
    }
    throw new Error(`قوس غير مغلق عند ${from}`);
  }
  function parseDecls(start, end) {
    const decls = [];
    let k = start;
    while (k < end) {
      // تصريح حتى ; على مستوى الأقواس الصفري
      let depth = 0, quote = null, s = k;
      for (; k < end; k++) {
        const c = src[k];
        if (quote) { if (c === "\\") { k++; continue; } if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === "(") depth++; else if (c === ")") depth--;
        else if (c === ";" && depth === 0) break;
      }
      const raw = src.slice(s, k);
      const colon = raw.indexOf(":");
      if (colon > 0) {
        const prop = raw.slice(0, colon).trim().toLowerCase();
        const im = /!\s*important\s*$/i.exec(raw);
        decls.push({ prop, start: s, end: k, important: !!im, impStart: im ? s + im.index : -1 });
      }
      k++;
    }
    return decls;
  }
  function parseBlock(end, media) {
    while (i < end) {
      skipWs();
      if (i >= end) break;
      if (src[i] === "}") { i++; continue; }
      if (src[i] === "@") {
        const prelude = readUntil("{;");
        if (src[i] === ";") { i++; continue; } // @import / @charset
        const open = i, close = matchBrace(open);
        const name = /^@([\w-]+)/.exec(prelude.trim())?.[1]?.toLowerCase();
        if (name === "media" || name === "supports" || name === "layer" || name === "container") {
          i = open + 1;
          parseBlock(close, name === "media" ? [...media, prelude.trim().replace(/^@media\s*/i, "")] : media);
        }
        i = close + 1; // @keyframes / @font-face / @page: ليست قواعد عناصر
        continue;
      }
      const selector = readUntil("{").trim();
      if (src[i] !== "{") break;
      const open = i, close = matchBrace(open);
      rules.push({ selector: selector.replace(/\s+/g, " "), media, start: open + 1, end: close, decls: parseDecls(open + 1, close) });
      i = close + 1;
    }
  }
  parseBlock(src.length, []);
  return rules;
}

/** يحذف !important من التصريحات المحددة (مفاتيح "ruleIndex:declIndex") ويعيد النص الجديد. */
export function removeImportant(text, rules, keys) {
  const cuts = [];
  for (const key of keys) {
    const [r, d] = key.split(":").map(Number);
    const decl = rules[r]?.decls[d];
    if (!decl || !decl.important) continue;
    const m = /\s*!\s*important/i.exec(text.slice(decl.impStart - 4, decl.end + 1));
    // نحذف المسافة قبل !important أيضاً
    let s = decl.impStart;
    while (s > 0 && /[ \t]/.test(text[s - 1])) s--;
    let e = decl.impStart + text.slice(decl.impStart).match(/^!\s*important/i)[0].length;
    cuts.push([s, e]);
    void m;
  }
  cuts.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e] of cuts) out = out.slice(0, s) + out.slice(e);
  return out;
}

/** كل التصريحات المهمة: [{ key, ruleIndex, declIndex, prop, selector, media }] */
export function importantDecls(rules) {
  const out = [];
  rules.forEach((r, ri) => r.decls.forEach((d, di) => {
    if (d.important) out.push({ key: `${ri}:${di}`, ruleIndex: ri, declIndex: di, prop: d.prop, selector: r.selector, media: r.media });
  }));
  return out;
}
