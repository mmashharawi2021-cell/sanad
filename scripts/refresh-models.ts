import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toChatModels, type OpenRouterModel } from "../src/models";

const SOURCE = "https://openrouter.ai/api/v1/models";
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "free-models.json");

const response = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) {
  console.error(`Model list request failed: HTTP ${response.status}`);
  process.exit(1);
}

const payload = (await response.json()) as { data?: OpenRouterModel[] };
const models = toChatModels(payload.data ?? []);

if (models.length <= 1) {
  console.error("No free chat models found — keeping the existing snapshot untouched.");
  process.exit(1);
}

const document = {
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  count: models.length,
  models,
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, "utf8");

console.log(`Saved ${models.length} free chat models to data/free-models.json`);
for (const model of models) {
  console.log(`- ${model.id} | ${model.provider} | ${model.contextLength} tokens`);
}
