/* سند — أوامر فورية مكتوبة (دون انتظار العقل)
   - normalizeTranscript: يوحّد النص المكتوب: النداء («يا سندي/يا سناد» ← «يا سند»)،
     والأرقام المكتوبة كلمات («ثلاثة آلاف» ← 3000) والأرقام الهندية (٣٠٠٠ ← 3000).
   - parse: يتعرّف على أوامر الشبكة والمنافذ ويعيد نيّة منظّمة (بلا تنفيذ).
   - handle: ينفّذ النيّة بالدوال الموجودة في الواجهة (killNetPort/runNetPing/…) — التأكيد الأمني
     لتحرير المنفذ يبقى كما هو.
   يعمل في المتصفح (window.sanadIntents) وفي Node للاختبار (module.exports). */
(function (root) {
  "use strict";

  /* ---------------- Arabic numbers ---------------- */
  const UNITS = {
    "صفر": 0, "واحد": 1, "واحده": 1, "احد": 1, "اثنان": 2, "اثنين": 2, "اثنتان": 2, "اثنتين": 2, "ثنين": 2,
    "ثلاثه": 3, "ثلاث": 3, "تلاته": 3, "تلات": 3, "اربعه": 4, "اربع": 4, "خمسه": 5, "خمس": 5,
    "سته": 6, "ست": 6, "سبعه": 7, "سبع": 7, "ثمانيه": 8, "ثماني": 8, "ثمان": 8, "تمانيه": 8, "تمن": 8,
    "تسعه": 9, "تسع": 9, "عشره": 10, "عشر": 10,
    "احدعشر": 11, "اثناعشر": 12, "اثنيعشر": 12,
  };
  const TENS = {
    "عشرون": 20, "عشرين": 20, "ثلاثون": 30, "ثلاثين": 30, "تلاتين": 30, "اربعون": 40, "اربعين": 40,
    "خمسون": 50, "خمسين": 50, "ستون": 60, "ستين": 60, "سبعون": 70, "سبعين": 70,
    "ثمانون": 80, "ثمانين": 80, "تمانين": 80, "تسعون": 90, "تسعين": 90,
  };
  const HUNDREDS = {
    "مئه": 100, "ميه": 100, "مائه": 100, "مية": 100, "مئتان": 200, "مئتين": 200, "ميتين": 200, "مائتان": 200, "مائتين": 200,
  };
  const THOUSAND_WORDS = new Set(["الف", "الاف", "آلاف", "ألف", "الفين", "ألفين", "الفان", "ألفان"]);

  /** Normalize letter variants so the number tables match (أ/إ/آ→ا, ة→ه, ى→ي, drop tashkeel). */
  function fold(w) {
    return w.replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  }

  /** Value of a single word below 1000 (e.g. «ثلاثمئة», «خمسمائه», «عشرين»), or null. */
  function smallValue(word) {
    const w = fold(word);
    if (w in UNITS) return UNITS[w];
    if (w in TENS) return TENS[w];
    if (w in HUNDREDS) return HUNDREDS[w];
    // compound hundreds: ثلاثمئة / ثلاثمائه / خمسميه
    const m = w.match(/^(ثلاث|تلات|اربع|خمس|ست|سبع|ثمان|ثماني|تمن|تسع)(مئه|مائه|ميه)$/);
    if (m) return (UNITS[m[1]] ?? UNITS[m[1] + "ه"]) * 100;
    // teens: ثلاثة عشر written as one token is rare; handled in the sequence parser
    return null;
  }

  /**
   * Convert sequences of Arabic number words to digits, e.g.
   * «ثلاثة آلاف» → 3000, «خمسة آلاف ومئة وثلاثة وسبعون» → 5173, «ثمانية آلاف وثمانون» → 8080.
   */
  function wordsToNumbers(text) {
    const tokens = text.split(/(\s+)/); // keep whitespace
    const out = [];
    let i = 0;
    while (i < tokens.length) {
      if (/^\s*$/.test(tokens[i])) { out.push(tokens[i]); i++; continue; } // whitespace passes through
      const startI = i;
      let total = 0, current = 0, consumed = false, lastWordIdx = -1;
      while (i < tokens.length) {
        const tok = tokens[i];
        if (/^\s+$/.test(tok)) { i++; continue; }
        let word = tok.replace(/[،,.؟?!]+$/, "");
        let conj = false;
        if (consumed && /^و/.test(word) && word.length > 2) { word = word.slice(1); conj = true; }
        const fw = fold(word);
        const v = smallValue(word);
        if (v !== null) {
          // teens: «ثلاثة عشر»
          if (v === 10 && current > 0 && current < 10 && !conj) current += 10;
          else current += v;
          consumed = true; lastWordIdx = i; i++;
          continue;
        }
        if (THOUSAND_WORDS.has(word) || THOUSAND_WORDS.has(fw) || fw === "الف" || fw === "الاف") {
          if (fw === "الفين" || fw === "الفان") current = 2;
          total += (current || 1) * 1000; current = 0;
          consumed = true; lastWordIdx = i; i++;
          continue;
        }
        break;
      }
      if (consumed) {
        const trailing = tokens[lastWordIdx].match(/[،,.؟?!]+$/)?.[0] || "";
        out.push(String(total + current) + trailing);
        // keep whitespace that followed the last number word
        i = lastWordIdx + 1;
      } else {
        out.push(tokens[startI]);
        i = startI + 1;
      }
    }
    return out.join("");
  }

  const WAKE_VARIANTS = /(^|\s)(يا\s*)?(سندي|سناد|سنده|صند|صناد|ساند|سندو)(?=\s|$|[،,.؟?!])/g;

  function normalizeTranscript(text) {
    let s = String(text || "");
    s = s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    s = s.replace(/(\d)[.,٬](\d{3})(?!\d)/g, "$1$2"); // 3.000 → 3000
    s = s.replace(/^\s*ياسند/, "يا سند");
    s = s.replace(WAKE_VARIANTS, (m, sp, ya) => `${sp}${ya ? "يا " : ""}سند`);
    s = wordsToNumbers(s);
    return s.replace(/\s+/g, " ").trim();
  }

  /* ---------------- Intents ---------------- */
  const WAKE = /^(يا\s+)?سند[،,\s]*/;
  const PORT_WORD = "(?:البورت|بورت|المنفذ|منفذ|port)";
  const RX = {
    kill: new RegExp(`(?:حرر|حرّر|فرغ|فرّغ|اقتل|أقتل|اغلق|أغلق|سكر|سكّر|سكّر|اوقف|أوقف|kill|free)\\s+(?:لي\\s+)?${PORT_WORD}\\s*(?:رقم\\s*)?(\\d{1,5})`, "i"),
    killEn: /kill\s*-?\s*port\s+(\d{1,5})/i,
    check: new RegExp(`(?:مين|من|شو|ما|ايش|إيش)\\s+(?:ماسك|يمسك|حاجز|يحجز|يستخدم|محتجز|شاغل)\\s+${PORT_WORD}?\\s*(\\d{1,5})|(?:هل|شوف|افحص|تحقق من)\\s+${PORT_WORD}\\s*(\\d{1,5})|${PORT_WORD}\\s*(\\d{1,5})\\s+(?:فاضي|متاح|محجوز|شغال)`, "i"),
    list: /(?:اعرض|اظهر|أظهر|وريني|شو|ما)\s+(?:لي\s+)?(?:المنافذ|البورتات|البورتس)(?:\s+(?:المفتوحة|المفتوحه|الشغالة|الشغاله|المحجوزة|المحجوزه))?|list\s+ports/i,
    ping: /(?:افحص|اختبر|فحص)\s+(?:سرعة\s+)?(?:النت|الانترنت|الإنترنت|الاتصال)|(?:كم|شو)\s+(?:البينغ|البنق|البنج|الping)|^(?:بينغ|بنق|ping)(?:\s+([a-z0-9.-]+\.[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}))?$|سرعة\s+الاستجابة/i,
    info: /(?:ما|شو|ايش)\s+(?:هو\s+)?(?:الآي\s*بي|الاي\s*بي|الأي\s*بي|عنوان\s+ip|ip)|معلومات\s+الشبكة|(?:على|ع)\s+(?:اي|أي)\s+شبكة|انا\s+متصل/i,
  };

  /** Recognize a network/port command. Returns null when the text is not one. */
  function parse(text) {
    const t = normalizeTranscript(text).replace(WAKE, "").trim();
    if (!t || t.length > 80) return null; // long sentences are conversation, not commands
    let m = t.match(RX.kill) || t.match(RX.killEn);
    if (m) return validPort(m[1]) ? { type: "kill_port", port: Number(m[1]) } : { type: "bad_port", raw: m[1] };
    m = t.match(RX.check);
    if (m) {
      const p = m[1] || m[2] || m[3];
      return validPort(p) ? { type: "check_port", port: Number(p) } : { type: "bad_port", raw: p };
    }
    if (RX.list.test(t)) return { type: "list_ports" };
    m = t.match(RX.ping);
    if (m) return { type: "ping", host: m[1] || "8.8.8.8" };
    if (RX.info.test(t)) return { type: "net_info" };
    return null;
  }

  function validPort(p) {
    const n = Number(p);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  }

  /* ---------------- Execution (browser only) ---------------- */
  async function api(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /** ينفّذ النيّة ويملأ فقاعة الرد بالنتيجة. التأكيد الأمني لتحرير المنفذ يبقى كما هو. */
  async function handle(text, conv, assistant, ctx) {
    const intent = parse(text);
    const started = performance.now();
    let content = "";
    try {
      switch (intent && intent.type) {
        case "kill_port": {
          const r = await root.killNetPort(intent.port);
          content = r ? r.message : `لم يُحرَّر المنفذ ${intent.port}.`;
          break;
        }
        case "check_port": {
          const r = await api(`/api/network/port/check?port=${intent.port}`);
          content = r.message;
          break;
        }
        case "list_ports": {
          if (typeof root.openNetworkModal === "function") root.openNetworkModal();
          const r = await api("/api/network/ports?udp=0");
          const dev = (r.ports || []).filter((p) => p.isDevPort && !p.isProtected);
          content = dev.length
            ? `المنافذ المفتوحة للتطوير:\n${dev.map((p) => `- ${p.port} — ${p.processName}${p.label ? ` (${p.label})` : ""}`).join("\n")}`
            : "لا توجد منافذ تطوير مفتوحة الآن. فتحتُ لك نافذة الشبكة لعرض كل المنافذ.";
          break;
        }
        case "ping": {
          const r = await (typeof root.runNetPing === "function" ? root.runNetPing(intent.host) : api("/api/network/ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: intent.host }) }));
          content = r ? r.message : "تعذر فحص الاتصال.";
          break;
        }
        case "net_info": {
          const r = await api("/api/network/info");
          content = r.message;
          break;
        }
        case "bad_port":
          content = `رقم المنفذ «${intent.raw}» غير صالح، يجب أن يكون بين 1 و65535.`;
          break;
        default:
          return false;
      }
    } catch (e) {
      content = `تعذر تنفيذ الأمر: ${e.message || e}`;
    }
    assistant.content = content;
    assistant.pending = false;
    assistant.model = "SANAD Instant Commands";
    assistant.latencyMs = Math.round(performance.now() - started);
    ctx.save();
    ctx.render();
    return true;
  }

  const api_ = { normalizeTranscript, wordsToNumbers, parse, matches: (t) => parse(t) !== null, handle };
  if (typeof module === "object" && module.exports) module.exports = api_;
  else root.sanadIntents = api_;
})(typeof window !== "undefined" ? window : globalThis);
