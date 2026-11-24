/**
 * Web Search and Web Page Content Extractor for SANAD
 * Uses DuckDuckGo HTML scraping for free, fast, zero-key web search.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export async function searchWeb(query: string, limit: number = 5): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  try {
    const encoded = encodeURIComponent(cleanQuery);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.9",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo returned HTTP ${res.status}`);
    }

    const html = await res.text();
    const results: SearchResult[] = [];

    // Parse HTML search results using regex
    const resultBlocks = html.split(/class="result\s+results_links/gi);

    for (const block of resultBlocks.slice(1)) {
      if (results.length >= limit) break;

      // Extract title and URL
      const linkMatch = block.match(/<a\s+class="result__url"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                        block.match(/<a\s+class="result__snippet[^"]*"\s+href="([^"]+)"[^>]*>/i) ||
                        block.match(/<a\s+[^>]*href="([^"]+)"\s+class="result__a"[^>]*>([\s\S]*?)<\/a>/i);

      const snippetMatch = block.match(/<a\s+class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
                           block.match(/class="result__snippet[^"]*">([\s\S]*?)<\//i);

      let rawUrl = "";
      let title = "";

      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      if (titleMatch && titleMatch[1]) {
        title = stripHtml(titleMatch[1]);
      }

      if (linkMatch && linkMatch[1]) {
        rawUrl = linkMatch[1];
      }

      // Handle DuckDuckGo redirect URLs: /l/?kh=-1&uddg=https%3A%2F%2F...
      let actualUrl = rawUrl;
      if (rawUrl.includes("uddg=")) {
        const match = rawUrl.match(/uddg=([^&]+)/);
        if (match && match[1]) {
          try {
            actualUrl = decodeURIComponent(match[1]);
          } catch {
            actualUrl = match[1];
          }
        }
      }

      const snippet = snippetMatch && snippetMatch[1] ? stripHtml(snippetMatch[1]) : "";

      if (title && actualUrl && !actualUrl.startsWith("/")) {
        results.push({
          title,
          url: actualUrl,
          snippet,
        });
      }
    }

    return results;
  } catch (err: any) {
    console.warn("[webSearch error]:", err.message);
    return [];
  }
}

/* ---------- حماية من SSRF: لا جلب لعناوين الجهاز نفسه ولا للشبكة الداخلية ---------- */
function isPrivateV4(v: string): boolean {
  const [a = 0, b = 0, c = 0] = v.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0/24 و TEST-NET-1
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) || // 198.18/15 (اختبار الشبكات)
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** يوسّع IPv6 إلى 8 مجموعات رقمية (يدعم الصيغة المختصرة :: والذيل بصيغة IPv4). */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]!;
  const v4tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4tail) {
    const p = v4tail[1]!.split(".").map(Number);
    s = s.slice(0, -v4tail[1]!.length) + `${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const [head = "", tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  if (fill < 0) return null;
  const groups = [...h, ...Array(fill).fill("0"), ...t].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip);
  const g = expandV6(ip);
  if (!g) return true; // صيغة غير مفهومة = نرفض
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // IPv4 مضمّن: ::ffff:a.b.c.d (بكل صيغه، ومنها السداسية ::ffff:7f00:1)، و ::a.b.c.d، و NAT64، و 6to4
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return true; // :: و ::1
    return isPrivateV4(v4(g[6]!, g[7]!));
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateV4(v4(g[6]!, g[7]!));
  if (g[0] === 0x2002) return isPrivateV4(v4(g[1]!, g[2]!));
  const first = g[0]!;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 عناوين محلية فريدة
    (first & 0xffc0) === 0xfe80 || // fe80::/10 رابط محلي
    (first & 0xffc0) === 0xfec0 || // fec0::/10 موقع محلي (قديم)
    (first & 0xff00) === 0xff00 || // ff00::/8 بث متعدد
    (first === 0x2001 && g[1] === 0xdb8) // توثيق
  );
}

const PRIVATE_MSG = "لا يُسمح بقراءة عناوين الجهاز أو الشبكة الداخلية.";

function parsePublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("رابط غير صالح.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("يُسمح بروابط http و https فقط.");
  if (u.username || u.password) throw new Error("لا يُسمح بروابط تحمل اسم مستخدم أو كلمة مرور.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) throw new Error(PRIVATE_MSG);
  return u;
}

/** حلّ أسماء يُستدعى لحظة الاتصال نفسه: العنوان الذي يُفحص هو نفسه الذي يُتصل به (لا DNS rebinding). */
function pinnedLookup(hostname: string, options: any, callback: any): void {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "object" && options ? options : {};
  lookup(hostname, { all: true, family: opts.family || 0 })
    .then((addrs) => {
      if (!addrs.length) return cb(new Error("تعذر حل اسم الموقع."));
      if (addrs.some((a) => isPrivateAddress(a.address))) return cb(new Error(PRIVATE_MSG));
      if (opts.all) cb(null, addrs);
      else cb(null, addrs[0]!.address, addrs[0]!.family);
    })
    .catch((e) => cb(e));
}

const MAX_PAGE_BYTES = 3 * 1024 * 1024;

type RawResponse = { status: number; location: string | null; body: string };

function guardedGet(u: URL, headers: Record<string, string>, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      u,
      { method: "GET", headers: { ...headers, "Accept-Encoding": "gzip, deflate, br" }, lookup: pinnedLookup as any, timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = status >= 300 && status < 400 ? (res.headers.location ?? null) : null;
        if (location) {
          res.resume();
          return resolve({ status, location, body: "" });
        }
        const enc = String(res.headers["content-encoding"] || "").toLowerCase();
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) :
          enc === "deflate" ? res.pipe(zlib.createInflate()) :
          enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_PAGE_BYTES) {
            req.destroy();
            return resolve({ status, location: null, body: Buffer.concat(chunks).toString("utf8") });
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, location: null, body: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("انتهت مهلة جلب الصفحة.")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchPageContent(targetUrl: string, maxChars: number = 6000): Promise<{ title: string; content: string }> {
  try {
    // نتبع التحويلات يدوياً ونفحص كل عنوان (تحويل قد يقود إلى عنوان داخلي)
    let current = parsePublicUrl(targetUrl);
    let res: RawResponse | undefined;
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    for (let hop = 0; hop < 5; hop++) {
      res = await guardedGet(current, headers, 15_000);
      if (!res.location) break;
      if (hop === 4) throw new Error("تحويلات كثيرة.");
      current = parsePublicUrl(new URL(res.location, current).toString());
    }
    if (!res) throw new Error("تعذر جلب الصفحة.");

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = res.body;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch && titleMatch[1] ? stripHtml(titleMatch[1]) : targetUrl;

    // Remove script, style, svg, header, footer, nav
    let clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ");

    clean = stripHtml(clean);
    clean = clean.replace(/\s+/g, " ").trim();

    if (clean.length > maxChars) {
      clean = clean.slice(0, maxChars) + "...\n(تم تقليص النص لطوله الزائد)";
    }

    return { title, content: clean };
  } catch (err: any) {
    return { title: targetUrl, content: `تعذر جلب محتوى الصفحة: ${err.message}` };
  }
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
