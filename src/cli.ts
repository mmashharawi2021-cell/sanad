import { ask, askStream } from "./openrouter";
import { AppError, getConfig, KEY_SETUP_URL } from "./config";

const DEFAULT_PROMPT = "Explain in three short sentences what OpenRouter is and why a single API is useful.";

const rawArgs = process.argv.slice(2);
const streaming = rawArgs.includes("--stream");
const args = rawArgs.filter((arg) => arg !== "--" && arg !== "--stream");
const prompt = args.join(" ").trim() || DEFAULT_PROMPT;

try {
  const config = getConfig();
  console.log(`→ model: ${config.model}${streaming ? " (streaming)" : ""}`);
  console.log(`→ prompt: ${prompt}\n`);

  if (streaming) {
    let servedModel = config.model;
    let latencyMs = 0;
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

    for await (const event of askStream(prompt)) {
      if (event.type === "delta") {
        process.stdout.write(event.text);
      } else {
        servedModel = event.model;
        latencyMs = event.latencyMs;
        usage = event.usage;
      }
    }

    console.log("\n\n---");
    console.log(`model: ${servedModel}`);
    console.log(`latency: ${latencyMs} ms`);
    if (usage) console.log(`tokens: ${usage.promptTokens} in / ${usage.completionTokens} out / ${usage.totalTokens} total`);
  } else {
    const answer = await ask(prompt);

    console.log(answer.text);
    console.log("\n---");
    console.log(`model: ${answer.model}`);
    console.log(`latency: ${answer.latencyMs} ms`);
    if (answer.usage) {
      console.log(
        `tokens: ${answer.usage.promptTokens} in / ${answer.usage.completionTokens} out / ${answer.usage.totalTokens} total`,
      );
    }
  }
} catch (error) {
  report(error);
  process.exitCode = 1;
}

function report(error: unknown): void {
  if (error instanceof AppError) {
    console.error(`✖ ${error.message}`);
    if (error.hint) console.error(`  ${error.hint}`);
    if (error.message.includes("OPENROUTER_API_KEY")) {
      console.error(`\n  Quick fix (PowerShell):  $env:OPENROUTER_API_KEY = "sk-or-v1-..."`);
      console.error(`  Or put OPENROUTER_API_KEY=... in .env (see .env.example).`);
      console.error(`  Create a key: ${KEY_SETUP_URL}`);
    }
    return;
  }
  console.error("✖ Unexpected error:", error instanceof Error ? error.message : error);
}
