import { ask } from "./openrouter";
import { AppError, getConfig, KEY_SETUP_URL } from "./config";

const DEFAULT_PROMPT = "Explain in three short sentences what OpenRouter is and why a single API is useful.";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const prompt = args.join(" ").trim() || DEFAULT_PROMPT;

try {
  const config = getConfig();
  console.log(`→ model: ${config.model}`);
  console.log(`→ prompt: ${prompt}\n`);

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
} catch (error) {
  report(error);
  process.exitCode = 1;
}

function report(error: unknown): void {
  if (error instanceof AppError) {
    console.error(`✖ ${error.message}`);
    if (error.hint) console.error(`  ${error.hint}`);
    if (error.status === 500 && error.message.includes("OPENROUTER_API_KEY")) {
      console.error(`\n  Quick fix (PowerShell):  $env:OPENROUTER_API_KEY = "sk-or-v1-..."`);
      console.error(`  Or put OPENROUTER_API_KEY=... in .env (see .env.example).`);
      console.error(`  Create a key: ${KEY_SETUP_URL}`);
    }
    return;
  }
  console.error("✖ Unexpected error:", error instanceof Error ? error.message : error);
}
