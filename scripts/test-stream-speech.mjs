// Tests for public/stream-speech.js — run: node scripts/test-stream-speech.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

function load() {
  const requested = [];
  const window = {};
  const sandbox = {
    window,
    requested,
    setIslandStatus: () => {},
    URL: { createObjectURL: (b) => `blob:${b.text}`, revokeObjectURL: () => {} },
    fetch: async (_u, o) => { const text = JSON.parse(o.body).text; requested.push(text); return { ok: true, blob: async () => ({ text }) }; },
    Audio: class { constructor(u) { this.u = u; } play() { setTimeout(() => this.onended && this.onended(), 5); return Promise.resolve(); } pause() {} },
  };
  vm.runInNewContext(readFileSync(new URL("../public/stream-speech.js", import.meta.url), "utf8"), sandbox);
  return { s: window.sanadStreamSpeech, requested };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;

// 1) sentences are spoken as soon as they complete, code and tool tags are skipped
{
  const { s, requested } = load();
  const a = { content: "" };
  s.begin(true);
  for (const piece of ["مرحباً! ", "أنا سند", "، مساعدك على هذا الجهاز. ", "إليك المثال:\n```python\nprint(1)", "\n```\n", "هذا كل شيء. <tool_use><tool_name>run"]) {
    a.content += piece;
    s.onDelta(a);
  }
  // before the reply finished, the first sentences were already requested
  assert.deepEqual(requested.slice(0, 2), ["مرحباً!", "أنا سند، مساعدك على هذا الجهاز."]);
  let ended = false;
  assert.equal(s.finish(a, () => { ended = true; }), true);
  await wait(120);
  assert.ok(!requested.some((t) => t.includes("print(1)")), "code inside ``` must not be spoken");
  assert.ok(!requested.some((t) => t.includes("tool_use")), "tool tags must not be spoken");
  assert.ok(requested.some((t) => t.includes("هذا كل شيء")));
  assert.equal(ended, true, "onEnd called after the last sentence");
  pass++;
}

// 2) first clause flushes early at «،» when long enough
{
  const { s, requested } = load();
  const a = { content: "" };
  s.begin(true);
  a.content = "تم فحص المنافذ المفتوحة على جهازك، ";
  s.onDelta(a);
  assert.deepEqual(requested, ["تم فحص المنافذ المفتوحة على جهازك،"]);
  pass++;
}

// 3) disabled (not voice mode) → nothing requested, finish() returns false so caller falls back
{
  const { s, requested } = load();
  const a = { content: "جملة أولى. جملة ثانية. " };
  s.begin(false);
  s.onDelta(a);
  assert.equal(requested.length, 0);
  assert.equal(s.finish(a, () => {}), false);
  pass++;
}

// 4) stop() (barge-in) cancels the queue and the onEnd callback
{
  const { s, requested } = load();
  const a = { content: "" };
  s.begin(true);
  let ended = false;
  a.content = "الجملة الأولى طويلة بما يكفي. الثانية. الثالثة. ";
  s.onDelta(a);
  s.finish(a, () => { ended = true; });
  s.stop();
  await wait(60);
  assert.equal(ended, false);
  assert.equal(s.isPlaying(), false);
  pass++;
}

console.log(`${pass} passed, 0 failed`);
