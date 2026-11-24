// اختبار تشغيل الواجهة في Edge دون نافذة (headless) + لقطات مرجعية للمقارنة أثناء إعادة البناء.
//   npm.cmd run test:ui            ← يفحص ويقارن مع اللقطات المرجعية
//   npm.cmd run test:ui -- --update ← يحدّث اللقطات المرجعية (بعد تغيير مقصود في الشكل)
// يتحقق: لا أخطاء JavaScript، لا طلبات للإنترنت، الوحدات الأساسية موجودة، وكل نافذة آمنة تُفتح.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startSanad } from "../helpers/sanad-server.mjs";
import { launchBrowser } from "./cdp.mjs";
import { decodePng, diffRatio } from "./png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "baseline");
const OUTPUT = join(HERE, "output");
const UPDATE = process.argv.includes("--update");
// الفرق الطبيعي بين تشغيلين (الساعة والأرقام الحية) قيس ≤ 0.65%؛ أكثر من 2% ← تغيّر حقيقي في الشكل.
const MAX_DIFF = 0.02;
// اللقطات المرجعية تحوي بيانات شخصية (ملفات سطح المكتب، الذاكرة، المشاريع) والمستودع عام:
// تبقى على الجهاز فقط (tests/ui/baseline و output مستثناة من git).

// نوافذ تعرض بيانات فقط. مستثناة: فحص الشاشة والبث (تطلب مشاركة الشاشة)، ووضع الكبسولة (يغيّر العرض).
const MODALS = [
  ["sysStatsBtn", "#sysStatsModalBackdrop"],
  ["netMaestroBtn", "#networkModalBackdrop"],
  ["desktopManagerBtn", "#desktopModalBackdrop"],
  ["terminalBtn", "#terminalModalBackdrop"],
  ["memoryBtn", "#memoryModalBackdrop"],
  ["tasksBtn", "#tasksModalBackdrop"],
  ["workflowsBtn", "#workflowsModalBackdrop"],
  ["projectPreviewBtn", "#previewModalBackdrop"],
  ["brainBadge", ".mode-backdrop"], // ورقة «وضع العمل»
  ["extensionsBtn", null], // يُكتشف بظهور حوار جديد
];
// مشكلات قائمة قبل إعادة البناء، موثّقة هنا حتى لا تُخفي أخطاء جديدة. كل بند يُصلَح في مرحلة لاحقة ثم يُحذف من هنا.
// (أُصلحت في المرحلة 3: معاينة مشروع بلا index.html كانت تعطي 404 — صارت تعرض رسالة واضحة.)
const KNOWN_ERRORS = [];
const GLOBALS = ["sendMessage", "sanadNotify", "sanadConfirm", "sanadIntents", "sanadCommands", "sanadModePicker", "reloadModels", "openNetworkModal", "refreshBrainStatus"];

const results = [];
const record = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`); };

const visibleDialogs = `[...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0}).length`;
const isVisible = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return !e.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0.01&&r.width>0&&r.height>0})()`;

const s = await startSanad();
const browser = await launchBrowser();
const page = await browser.newPage();
const errors = [];
const external = new Set();
await page.send("Runtime.enable");
await page.send("Page.enable");
await page.send("Log.enable");
await page.send("Network.enable");
page.on("Runtime.exceptionThrown", (p) => errors.push(`exception: ${p.exceptionDetails?.exception?.description?.split("\n")[0] || p.exceptionDetails?.text}`));
page.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 160)}`); });
page.on("Log.entryAdded", (p) => { if (p.entry.level === "error") errors.push(`log: ${p.entry.text.slice(0, 160)} ${p.entry.url || ""}`); });
page.on("Network.requestWillBeSent", (p) => { const u = p.request.url; if (!u.startsWith(s.base) && !/^(data|blob|about):/.test(u)) external.add(u); });
// تتبّع الطلبات الجارية: اللقطة تُلتقط بعد أن تهدأ الشبكة، لا بعد زمن ثابت (الجهاز المشغول يبطئ البيانات الحية)
const inflight = new Set();
page.on("Network.requestWillBeSent", (p) => inflight.add(p.requestId));
page.on("Network.loadingFinished", (p) => inflight.delete(p.requestId));
page.on("Network.loadingFailed", (p) => inflight.delete(p.requestId));
async function networkIdle(quietMs = 700, maxMs = 15_000) {
  const end = Date.now() + maxMs;
  let quietSince = inflight.size ? 0 : Date.now();
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 100));
    if (inflight.size) quietSince = 0;
    else if (!quietSince) quietSince = Date.now();
    else if (Date.now() - quietSince >= quietMs) return true;
  }
  return false;
}

mkdirSync(OUTPUT, { recursive: true });
mkdirSync(BASELINE, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name) {
  await networkIdle();
  await wait(300); // رسم النتائج بعد آخر رد
  const png = await page.screenshot();
  writeFileSync(join(OUTPUT, `${name}.png`), png);
  const base = join(BASELINE, `${name}.png`);
  if (UPDATE || !existsSync(base)) {
    writeFileSync(base, png);
    record(`لقطة مرجعية: ${name}`, true, UPDATE ? "حُدّثت" : "أُنشئت");
    return;
  }
  const ratio = diffRatio(decodePng(png), decodePng(readFileSync(base)));
  record(`مطابقة الشكل: ${name}`, ratio <= MAX_DIFF, `${(ratio * 100).toFixed(2)}% مختلف`);
}

// ورقة «وضع العمل» تظهر عند كل فتح؛ keepPicker يُبقيها لاختبارها، وإلا تُغلق (دون تغيير الوضع) قبل اللقطة.
async function freshPage(theme = "dark", keepPicker = false) {
  await page.navigate(`${s.base}/`);
  await page.evaluate(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)})`);
  await wait(2500);
  if (!keepPicker) await page.evaluate("window.sanadModePicker?.close()");
}

try {
  // 0) عند الفتح: ورقة «وضع العمل» بخيارين (باتصال / دون اتصال)
  await page.viewport(1280, 800, false);
  await freshPage("dark", true);
  const picker = await page.evaluate(`(()=>{const v=${isVisible(".mode-backdrop")};const n=document.querySelectorAll(".mode-backdrop .mode-cell").length;return {v,n}})()`);
  record("ورقة «وضع العمل» تظهر عند الفتح بخيارين", picker.v && picker.n === 2, `ظاهرة: ${picker.v}، الخيارات: ${picker.n}`);
  if (picker.v) await shot("startup-mode-picker");

  // 1) الصفحة الرئيسية: حاسوب وهاتف، داكن وفاتح
  for (const [vw, vh, mobile, label] of [[1280, 800, false, "desktop"], [430, 932, true, "phone"]]) {
    await page.viewport(vw, vh, mobile);
    for (const theme of ["dark", "light"]) {
      await freshPage(theme);
      await shot(`home-${label}-${theme}`);
    }
  }

  // 2) الوحدات الأساسية موجودة
  await page.viewport(1280, 800, false);
  await freshPage();
  const missing = await page.evaluate(`${JSON.stringify(GLOBALS)}.filter(n => typeof window[n] === "undefined" && typeof globalThis[n] === "undefined" && (()=>{try{return typeof eval(n)==="undefined"}catch{return true}})())`);
  record("الدوال والوحدات الأساسية موجودة", missing.length === 0, missing.length ? `ناقص: ${missing.join("، ")}` : `${GLOBALS.length} وحدة`);
  const title = await page.evaluate("document.title");
  record("عنوان الصفحة", /سند/.test(title), title);

  // 2ب) سجل الأوامر: أمر قراءة فقط يُنفَّذ محلياً دون العقل، وجملة محادثة لا تطابق أمراً، والأوامر في لوحة Ctrl+K
  {
    const r = await page.evaluate(`(async () => {
      await sendMessage("كيف وضع جهازي؟");
      for (let i = 0; i < 50 && !/SANAD Health HUD/.test(JSON.stringify(activeConv()?.messages || [])); i++) await new Promise((r) => setTimeout(r, 200));
      const last = activeConv().messages.at(-1);
      return { model: last.model, ok: /نبض وصحة الجهاز/.test(last.content), chat: sanadCommands.match("اكتب لي مقالا عن البحر") === null };
    })()`);
    record("أمر محلي من السجل: «كيف وضع جهازي؟»", r.model === "SANAD Health HUD" && r.ok, r.model);
    record("جملة محادثة لا تُعامل كأمر", r.chat);
    const p = await page.evaluate(`(() => { document.getElementById("paletteBtn").click(); const n = [...document.querySelectorAll(".palette-item")].filter((b) => /كيف وضع جهازي/.test(b.textContent)).length; document.querySelector(".palette-backdrop, #paletteBackdrop")?.click(); return n; })()`);
    record("أوامر سند في لوحة Ctrl+K", p > 0, `${p}`);
    // محادثة الاختبار تُحفظ في المتصفح؛ تُمسح حتى لا تظهر في لقطات النوافذ التالية
    await page.evaluate("localStorage.clear()");
  }

  // 3) كل نافذة آمنة تُفتح
  for (const [btn, sel] of MODALS) {
    await freshPage();
    const before = await page.evaluate(visibleDialogs);
    const clicked = await page.evaluate(`(()=>{const b=document.getElementById(${JSON.stringify(btn)});if(!b)return false;b.click();return true})()`);
    await wait(1800);
    let opened = false;
    if (clicked) opened = sel ? await page.evaluate(isVisible(sel)) : (await page.evaluate(visibleDialogs)) > before;
    record(`فتح نافذة ${btn}`, clicked && opened, clicked ? (opened ? "" : "لم تظهر") : "الزر غير موجود");
    if (opened) await shot(`modal-${btn}`);
  }
} catch (e) {
  record("تشغيل الاختبار", false, e.message);
} finally {
  page.close();
  await browser.close();
  await s.stop();
}

const known = errors.filter((e) => KNOWN_ERRORS.some((k) => k.match.test(e)));
const unexpected = errors.filter((e) => !known.includes(e));
record("لا أخطاء JavaScript جديدة في الصفحة", unexpected.length === 0, unexpected.slice(0, 5).join(" | "));
for (const k of KNOWN_ERRORS) if (known.some((e) => k.match.test(e))) console.log(`  ⚠ مشكلة معروفة (تُصلَح لاحقاً): ${k.why}`);
record("لا طلبات للإنترنت من الواجهة", external.size === 0, [...external].slice(0, 5).join(" | "));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} نجح${failed ? ` — ${failed} فشل` : ""}. اللقطات الحالية في tests/ui/output/`);
process.exit(failed ? 1 : 0);
