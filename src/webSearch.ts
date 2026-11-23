/**
 * Web Search and Web Page Content Extractor for SANAD
 * Uses DuckDuckGo HTML scraping for free, fast, zero-key web search.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(v) === 4) {
    const [a = 0, b = 0] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("رابط غير صالح.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("يُسمح بروابط http و https فقط.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error("لا يُسمح بقراءة عناوين الجهاز أو الشبكة الداخلية.");
  return u;
}

export async function fetchPageContent(targetUrl: string, maxChars: number = 6000): Promise<{ title: string; content: string }> {
  try {
    // نتبع التحويلات يدوياً ونفحص كل عنوان (تحويل قد يقود إلى عنوان داخلي)
    let current = await assertPublicUrl(targetUrl);
    let res: Response | undefined;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(current, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;
      current = await assertPublicUrl(new URL(location, current).toString());
    }
    if (!res) throw new Error("تعذر جلب الصفحة.");

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();

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
