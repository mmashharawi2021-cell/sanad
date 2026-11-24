/* سند — مؤثرات الواجهة الصوتية الخفيفة (playSciFiSound عبر Web Audio)
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Sci-Fi Audio FX (Web Audio API) ======================= */

      let audioCtx = null;

      function getAudioContext() {
        if (!audioCtx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
          }
        }
        if (audioCtx && audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }
        return audioCtx;
      }

      function playSciFiSound(type = "confirm") {
        try {
          const ctx = getAudioContext();
          if (!ctx) return;
          const now = ctx.currentTime;

          if (type === "wake") {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = "sine";
            osc2.type = "triangle";

            osc1.frequency.setValueAtTime(440, now);
            osc1.frequency.exponentialRampToValueAtTime(880, now + 0.18);

            osc2.frequency.setValueAtTime(880, now);
            osc2.frequency.exponentialRampToValueAtTime(1320, now + 0.22);

            gain.gain.setValueAtTime(0.01, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.33);
            osc2.stop(now + 0.33);
          } else if (type === "confirm") {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(784, now);
            osc.frequency.exponentialRampToValueAtTime(1046, now + 0.12);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.2);
          } else if (type === "vision") {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.25);

            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.3);
          } else if (type === "done") {
            const freqs = [523.25, 659.25, 783.99, 1046.5];
            freqs.forEach((f, idx) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.value = f;

              const startTime = now + idx * 0.05;
              gain.gain.setValueAtTime(0.001, startTime);
              gain.gain.linearRampToValueAtTime(0.08, startTime + 0.03);
              gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

              osc.connect(gain);
              gain.connect(ctx.destination);

              osc.start(startTime);
              osc.stop(startTime + 0.36);
            });
          }
        } catch (e) {
          console.warn("[audio fx error]", e);
        }
      }
