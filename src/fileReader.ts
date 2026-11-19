import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { AppError } from "./config";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB limit
export const MAX_TEXT_CHARS = 100_000; // Limit extracted text to ~100k chars to fit context

export type ExtractedFile = {
  filename: string;
  sizeBytes: number;
  text: string;
  pages?: number;
  truncated: boolean;
};

export async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<ExtractedFile> {
  const ext = path.extname(filename).toLowerCase();
  const sizeBytes = buffer.length;

  if (sizeBytes > MAX_FILE_BYTES) {
    throw new AppError(`حجم الملف كبير جداً (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). الحد الأقصى هو 10 MB.`, {
      status: 413,
      hint: "اختر ملفاً أصغر حجماً.",
    });
  }

  let text = "";
  let pages: number | undefined;

  if (ext === ".pdf") {
    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      text = result.text || "";
      pages = result.total;
    } catch (err: any) {
      throw new AppError(`تعذر قراءة ملف الـ PDF: ${err.message}`, {
        status: 400,
        hint: "تأكد أن ملف الـ PDF ليس تالفاً أو محمياً بكلمة مرور.",
      });
    } finally {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
    }
  } else {
    // Treat as utf-8 text / code / markdown / json / csv
    text = buffer.toString("utf-8");
  }

  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) {
    text = text.slice(0, MAX_TEXT_CHARS) + "\n\n... [تم اختصار محتوى الملف لتجاوز الحد الأقصى المسموح]";
  }

  return {
    filename,
    sizeBytes,
    text: text.trim(),
    pages,
    truncated,
  };
}

export async function extractTextFromLocalPath(filePath: string): Promise<ExtractedFile> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new AppError(`المسار المحدد ليس ملفاً: ${filePath}`, { status: 400 });
    }
    const buffer = await readFile(filePath);
    const filename = path.basename(filePath);
    return await extractTextFromBuffer(buffer, filename);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`تعذر العثور على الملف في المسار: ${filePath}`, {
      status: 404,
      hint: "تأكد من صحة مسار الملف على لابتوبك.",
    });
  }
}
