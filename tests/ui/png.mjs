// قارئ PNG صغير (zlib مدمج في Node) ومقارنة بكسلات — لمقارنة لقطات الواجهة قبل وبعد إعادة البناء.
import { inflateSync } from "node:zlib";

/** يقرأ PNG بعمق 8 بت (RGB أو RGBA، دون تشابك) ← { width, height, rgba } */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("ليس ملف PNG");
  let pos = 8, width = 0, height = 0, colorType = 0, depth = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) throw new Error(`صيغة PNG غير مدعومة (depth ${depth}, type ${colorType})`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = (line[x] + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * bpp];
      out[(y * width + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba: out };
}

/** نسبة البكسلات المختلفة (فرق لوني أكبر من tolerance في أي قناة). */
export function diffRatio(a, b, tolerance = 24) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let diff = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n * 4; i += 4) {
    if (Math.abs(a.rgba[i] - b.rgba[i]) > tolerance || Math.abs(a.rgba[i + 1] - b.rgba[i + 1]) > tolerance || Math.abs(a.rgba[i + 2] - b.rgba[i + 2]) > tolerance) diff++;
  }
  return diff / n;
}
