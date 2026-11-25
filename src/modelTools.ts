import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/**
 * تعريفات «استدعاء الأدوات» الرسمي (function calling) تُقرأ من public/model-tools.js —
 * المصدر الوحيد لقائمة الأدوات وحقولها، والذي تتحقق به الواجهة من كل طلب قبل تنفيذه.
 * الخادم لا ينفّذ الأدوات؛ يرسل تعريفاتها للنموذج ويعيد طلباته للواجهة كحدث tool_call.
 */
export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "model-tools.js");
let cached: ToolDefinition[] | undefined;

export function toolDefinitions(): ToolDefinition[] {
  if (cached) return cached;
  const sandbox: { module: { exports: { definitions?: () => ToolDefinition[] } } } = { module: { exports: {} } };
  vm.runInNewContext(readFileSync(FILE, "utf8"), sandbox, { filename: "model-tools.js" });
  const defs = sandbox.module.exports.definitions?.();
  if (!Array.isArray(defs) || !defs.length) throw new Error("public/model-tools.js لا يعرّف أي أداة.");
  // نسخة JSON خالصة (لا كائنات من سياق vm آخر)
  cached = JSON.parse(JSON.stringify(defs)) as ToolDefinition[];
  return cached;
}

/** طلب أداة منظّم يمرّ للواجهة كما هو؛ arguments نص JSON دائماً. */
export type ToolCall = { name: string; arguments: string };
