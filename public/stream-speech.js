/* سند — النطق أثناء كتابة الرد (Streaming speech)
   في الوضع الصوتي: ما إن تكتمل أول جملة في الرد المتدفق حتى يبدأ سند بنطقها، ويُحضَّر صوت الجملة التالية
   أثناء تشغيل الحالية — بدل انتظار الرد كاملاً. يستخدم /api/voice/speak (ذاكرة مؤقتة ← صوت طبيعي ← محلي).
   يتجاهل ما بعد كتلة كود أو وسم أداة غير مكتمل، ويقف فوراً عند المقاطعة (stopSpeaking). */
(() => {
  const MAX_SPOKEN_CHARS = 450; // voice mode reads the first few sentences, like speakText
  const FIRST_CHUNK_MIN = 18;   // flush the first clause early (at «،») once it is this long
  const PREFETCH = 2;           // audio requests in flight ahead of playback

  let active = false;
  let token = 0;
  let spokenUpTo = 0;           // index in assistant.content already queued
  let queuedChars = 0;
  let queue = [];               // [{ text, url: Promise<string> }]
  let playing = false;
  let audio = null;
  let onDone = null;
  let finished = false;
  let anyQueued = false;

  function fetchAudio(text, myToken) {
    return fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(async (res) => {
      if (!res.ok || myToken !== token) throw new Error("tts");
      return URL.createObjectURL(await res.blob());
    });
  }

  /**
   * Text that is safe to speak so far. Finished code blocks become «كود برمجي.» and finished tool tags
   * are removed; an unfinished ``` block or <tool…> tag cuts the text. The result only ever grows
   * at its end as the reply streams in, so `spokenUpTo` stays valid.
   */
  function speakable(content) {
    let t = content.replace(/```[\s\S]*?```/g, " كود برمجي. ").replace(/<tool_use>[\s\S]*?<\/tool_use>/g, " ");
    const fence = t.indexOf("```");
    if (fence >= 0) t = t.slice(0, fence);
    const tool = t.indexOf("<tool");
    if (tool >= 0) t = t.slice(0, tool);
    return t;
  }

  function enqueue(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!/[\p{L}\p{N}]/u.test(clean) || queuedChars >= MAX_SPOKEN_CHARS) return;
    queuedChars += clean.length;
    const item = { text: clean, url: null };
    queue.push(item);
    anyQueued = true;
    pump();
    play();
  }

  /** Start audio requests for the next few queued sentences. */
  function pump() {
    const myToken = token;
    let inFlight = 0;
    for (const item of queue) {
      if (inFlight >= PREFETCH) break;
      if (!item.url) {
        item.url = fetchAudio(item.text, myToken);
        item.url.catch(() => {});
      }
      inFlight++;
    }
  }

  async function play() {
    if (playing) return;
    playing = true;
    const myToken = token;
    while (queue.length && myToken === token) {
      const item = queue[0];
      if (!item.url) pump();
      let url = null;
      try { url = await item.url; } catch { url = null; }
      if (myToken !== token) { if (url) URL.revokeObjectURL(url); break; }
      queue.shift();
      pump();
      if (!url) continue;
      if (typeof setIslandStatus === "function") setIslandStatus("سند يتحدث...", false);
      await new Promise((resolve) => {
        audio = new Audio(url);
        audio.onended = audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
      audio = null;
    }
    playing = false;
    if (myToken === token && finished && !queue.length) complete();
  }

  function complete() {
    active = false;
    const cb = onDone;
    onDone = null;
    if (cb) cb();
  }

  /** Called before streaming a reply. Only active in voice mode with Sanad's own voice. */
  function begin(enabled) {
    stop();
    active = !!enabled;
    spokenUpTo = 0;
    queuedChars = 0;
    finished = false;
    anyQueued = false;
  }

  /** Called after every streamed delta: queue each newly completed sentence. */
  function onDelta(assistant) {
    if (!active) return;
    const text = speakable(assistant.content || "");
    let pos = spokenUpTo;
    for (;;) {
      const rest = text.slice(pos);
      // sentence end: . ! ? ؟ ؛ or newline, followed by whitespace
      let m = rest.match(/^[\s\S]*?[.!?؟؛\n](?=\s)/);
      // first chunk: speak the opening clause early to cut time-to-first-audio
      if (!m && !anyQueued) {
        const c = rest.match(/^[\s\S]*?،(?=\s)/);
        if (c && c[0].trim().length >= FIRST_CHUNK_MIN) m = c;
      }
      if (!m) break;
      enqueue(m[0]);
      pos += m[0].length;
    }
    spokenUpTo = pos;
  }

  /**
   * Called when the reply is complete. Speaks what is left and calls onEnd when all audio finished.
   * Returns false when streaming speech was not used (caller should fall back to speakText).
   */
  function finish(assistant, onEnd) {
    if (!active || !anyQueued) { active = false; return false; }
    const text = speakable(assistant.content || "");
    if (text.length > spokenUpTo) enqueue(text.slice(spokenUpTo));
    spokenUpTo = text.length;
    finished = true;
    onDone = onEnd || null;
    if (!playing && !queue.length) complete();
    return true;
  }

  function stop() {
    token++;
    for (const item of queue) if (item.url) item.url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    queue = [];
    if (audio) { try { audio.pause(); } catch {} audio = null; }
    playing = false;
    active = false;
    onDone = null;
  }

  window.sanadStreamSpeech = { begin, onDelta, finish, stop, isPlaying: () => playing || queue.length > 0, _speakable: speakable };
})();
