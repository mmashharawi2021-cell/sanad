/* إضافة سند: سرعة الانترنت
   الطلب: أصلح إضافة سرعة الانترنت: خطوط الرسم البياني سوداء ولا تظهر على الخلفية الداكنة. خلّ خط الاستقبال أخضر والإرسال برتقالي مثل مدير المهام وتظهر في الوضعين الداكن والفاتح
   كتبها: particle-ai/particle-1:free — 2026-11-23T20:43:01.686Z
   أُنشئت بواسطة مطوّر سند الذاتي وثُبّتت بموافقة المستخدم. */
sanadExt.register({
  id: "internet-speed",
  name: "سرعة الانترنت",
  description: "مراقبة حية لسرعة الشبكة برسم بياني (استقبال أخضر وإرسال برتقالي) مع قياس سرعة شامل",
  init(api) {
    api.css(`
      .sanad-speed-card{direction:rtl;text-align:right;padding:12px;max-width:320px}
      .sanad-speed-card .sanad-speed-section{margin-bottom:12px}
      .sanad-speed-card .sanad-speed-section:last-child{margin-bottom:0}
      .sanad-speed-card .sanad-speed-title{font-size:13px;color:var(--text-2);margin-bottom:6px;display:flex;align-items:center;gap:6px}
      .sanad-speed-card .sanad-speed-live{display:flex;gap:12px;flex-wrap:wrap}
      .sanad-speed-card .sanad-speed-live-item{flex:1;min-width:100px}
      .sanad-speed-card .sanad-speed-label{font-size:11px;color:var(--text-3);display:block;margin-bottom:2px}
      .sanad-speed-card .sanad-speed-value{font-size:20px;font-variant-numeric:tabular-nums;color:var(--text-1);font-weight:bold}
      .sanad-speed-card .sanad-speed-graph{height:80px;width:100%;margin-top:8px;background:var(--fill);border-radius:8px;display:block}
      .sanad-speed-card .sanad-speed-legend{display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--text-2)}
      .sanad-speed-card .sanad-speed-legend-item{display:flex;align-items:center;gap:5px}
      .sanad-speed-card .sanad-speed-dot{width:10px;height:3px;border-radius:2px;display:inline-block}
      .sanad-speed-card .sanad-speed-dot-rx{background:var(--success)}
      .sanad-speed-card .sanad-speed-dot-tx{background:var(--warning)}
      .sanad-speed-card .sanad-speed-btn{width:100%;margin-top:8px;border:0;border-radius:999px;padding:6px 14px;background:var(--brand);color:var(--on-brand);font-size:14px}
      .sanad-speed-card .sanad-speed-btn:disabled{opacity:0.5;cursor:not-allowed}
      .sanad-speed-card .sanad-speed-meta{font-size:11px;color:var(--text-3);margin-top:4px;display:block}
      .sanad-speed-card .sanad-speed-progress{font-size:13px;color:var(--text-2);margin-top:6px;display:block;min-height:1.4em}
      .sanad-speed-card .sanad-speed-result{display:flex;gap:16px;justify-content:center;margin-top:8px;flex-wrap:wrap}
      .sanad-speed-card .sanad-speed-result-item{text-align:center}
    `);

    const MEASURE_DURATION_MS = 8000;
    const OVERALL_TIMEOUT_MS = 20000;
    const DOWNLOAD_CHUNK_BYTES = 25000000;
    const UPLOAD_START_CHUNK = 256 * 1024;
    const UPLOAD_MAX_CHUNK = 8 * 1024 * 1024;

    const measureDownload = async (onProgress) => {
      const abort = new AbortController();
      const overallTimeout = setTimeout(() => abort.abort(), OVERALL_TIMEOUT_MS);
      const start = performance.now();
      let bytesReceived = 0;
      try {
        while (performance.now() - start < MEASURE_DURATION_MS) {
          const res = await fetch("https://speed.cloudflare.com/__down?bytes=" + DOWNLOAD_CHUNK_BYTES, {
            signal: abort.signal,
            cache: "no-store"
          });
          if (!res.ok || !res.body) throw new Error("network");
          const reader = res.body.getReader();
          try {
            while (performance.now() - start < MEASURE_DURATION_MS) {
              const r = await reader.read();
              if (r.done) break;
              bytesReceived += r.value.length;
              const elapsed = (performance.now() - start) / 1000;
              if (elapsed > 0) onProgress?.((bytesReceived * 8) / elapsed / 1e6);
            }
          } finally {
            try { reader.cancel(); } catch (e) {}
          }
        }
      } catch (e) {
        if (e.name !== "AbortError" && e.name !== "CancellationError") throw e;
      } finally {
        clearTimeout(overallTimeout);
      }
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed <= 0 || bytesReceived === 0) throw new Error("dl");
      return (bytesReceived * 8) / elapsed / 1e6;
    };

    const measureUpload = async (onProgress) => {
      const abort = new AbortController();
      const overallTimeout = setTimeout(() => abort.abort(), OVERALL_TIMEOUT_MS);
      const start = performance.now();
      let totalBytesSent = 0;
      let chunkSize = UPLOAD_START_CHUNK;
      try {
        while (performance.now() - start < MEASURE_DURATION_MS) {
          const chunk = new Uint8Array(chunkSize);
          const chunkStart = performance.now();
          const res = await fetch("https://speed.cloudflare.com/__up", {
            method: "POST",
            body: chunk,
            signal: abort.signal,
            cache: "no-store"
          });
          if (!res.ok) throw new Error("network");
          await res.arrayBuffer();
          const chunkElapsed = (performance.now() - chunkStart) / 1000;
          totalBytesSent += chunkSize;
          const elapsed = (performance.now() - start) / 1000;
          if (elapsed > 0) onProgress?.((totalBytesSent * 8) / elapsed / 1e6);
          if (chunkElapsed < 1 && chunkSize < UPLOAD_MAX_CHUNK) {
            chunkSize = Math.min(chunkSize * 2, UPLOAD_MAX_CHUNK);
          } else if (chunkElapsed > 2 && chunkSize > UPLOAD_START_CHUNK) {
            chunkSize = Math.max(chunkSize / 2, UPLOAD_START_CHUNK);
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") throw e;
      } finally {
        clearTimeout(overallTimeout);
      }
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed <= 0 || totalBytesSent === 0) throw new Error("ul");
      return (totalBytesSent * 8) / elapsed / 1e6;
    };

    const formatSpeed = (bps) => {
      const mbps = bps / 1e6;
      if (mbps >= 1) return mbps.toFixed(2) + " Mbps";
      return (bps / 1e3).toFixed(1) + " Kbps";
    };

    // canvas لا يفهم متغيرات CSS: نقرأ الألوان الحقيقية في كل رسم (الوضع الداكن/الفاتح)
    const drawGraph = (canvas, history) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(canvas.clientWidth || 0, 1);
      const h = Math.max(canvas.clientHeight || 0, 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cs = getComputedStyle(document.documentElement);
      const col = (name, fb) => (cs.getPropertyValue(name) || "").trim() || fb;
      const rxColor = col("--success", "#34c759");
      const txColor = col("--warning", "#ff9f0a");
      const gridColor = col("--text-3", "#8e8e93");

      const padTop = 6;
      const padBottom = 6;
      const plotH = Math.max(h - padTop - padBottom, 1);

      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 2; i++) {
        const y = padTop + (plotH * i) / 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!history || history.length < 2) return;

      let maxVal = 1;
      for (let i = 0; i < history.length; i++) {
        const p = history[i];
        if (p.rxBps > maxVal) maxVal = p.rxBps;
        if (p.txBps > maxVal) maxVal = p.txBps;
      }

      const stepX = w / (history.length - 1);
      const yFor = (bps) => padTop + plotH * (1 - Math.min(Math.max(bps, 0) / maxVal, 1));

      const line = (key, color) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (let i = 0; i < history.length; i++) {
          const x = i * stepX;
          const y = yFor(history[i][key]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      line("rxBps", rxColor);
      line("txBps", txColor);
    };

    const render = (container) => {
      while (container.firstChild) container.removeChild(container.firstChild);
      container.classList.add("sanad-speed-card");

      const savedDl = api.storage.get("last-dl", 0);
      const savedUl = api.storage.get("last-ul", 0);
      const lastTime = api.storage.get("last-time", 0);

      // ——— المراقبة الحية ———
      const liveSection = document.createElement("div");
      liveSection.className = "sanad-speed-section";

      const liveTitle = document.createElement("div");
      liveTitle.className = "sanad-speed-title";
      liveTitle.innerHTML = api.icon("activity") + " المراقبة الحية";
      liveSection.appendChild(liveTitle);

      const liveGrid = document.createElement("div");
      liveGrid.className = "sanad-speed-live";

      const makeLive = (labelText) => {
        const item = document.createElement("div");
        item.className = "sanad-speed-live-item";
        const lab = document.createElement("span");
        lab.className = "sanad-speed-label";
        lab.textContent = labelText;
        const val = document.createElement("div");
        val.className = "sanad-speed-value";
        const bdi = document.createElement("bdi");
        bdi.textContent = "—";
        val.appendChild(bdi);
        item.appendChild(lab);
        item.appendChild(val);
        return { item, bdi };
      };

      const rxLive = makeLive("تنزيل الآن");
      const txLive = makeLive("إرسال الآن");
      liveGrid.appendChild(rxLive.item);
      liveGrid.appendChild(txLive.item);
      liveSection.appendChild(liveGrid);

      const canvas = document.createElement("canvas");
      canvas.className = "sanad-speed-graph";
      liveSection.appendChild(canvas);

      const legend = document.createElement("div");
      legend.className = "sanad-speed-legend";
      const mkLegend = (cls, txt) => {
        const s = document.createElement("span");
        s.className = "sanad-speed-legend-item";
        const d = document.createElement("i");
        d.className = "sanad-speed-dot " + cls;
        s.appendChild(d);
        s.appendChild(document.createTextNode(txt));
        return s;
      };
      legend.appendChild(mkLegend("sanad-speed-dot-rx", "استقبال"));
      legend.appendChild(mkLegend("sanad-speed-dot-tx", "إرسال"));
      liveSection.appendChild(legend);

      container.appendChild(liveSection);

      // ——— قياس السرعة ———
      const testSection = document.createElement("div");
      testSection.className = "sanad-speed-section";

      const testTitle = document.createElement("div");
      testTitle.className = "sanad-speed-title";
      testTitle.innerHTML = api.icon("gauge") + " قياس السرعة";
      testSection.appendChild(testTitle);

      const btn = document.createElement("button");
      btn.className = "sanad-speed-btn";
      btn.innerHTML = api.icon("zap") + " قياس السرعة";

      const progress = document.createElement("span");
      progress.className = "sanad-speed-progress";

      const setProgress = (label, value) => {
        while (progress.firstChild) progress.removeChild(progress.firstChild);
        progress.appendChild(document.createTextNode(label));
        if (value) {
          const b = document.createElement("bdi");
          b.textContent = value;
          progress.appendChild(b);
        }
      };

      const resultDiv = document.createElement("div");
      resultDiv.className = "sanad-speed-result";

      const mkResult = (labelText) => {
        const item = document.createElement("div");
        item.className = "sanad-speed-result-item";
        const lab = document.createElement("div");
        lab.className = "sanad-speed-label";
        lab.textContent = labelText;
        const val = document.createElement("div");
        val.className = "sanad-speed-value";
        const bdi = document.createElement("bdi");
        bdi.textContent = "—";
        val.appendChild(bdi);
        item.appendChild(lab);
        item.appendChild(val);
        return { item, bdi };
      };

      const resDl = mkResult("تنزيل");
      const resUl = mkResult("رفع");
      resultDiv.appendChild(resDl.item);
      resultDiv.appendChild(resUl.item);

      if (savedDl > 0) resDl.bdi.textContent = savedDl.toFixed(2) + " Mbps";
      if (savedUl > 0) resUl.bdi.textContent = savedUl.toFixed(2) + " Mbps";
      resultDiv.style.display = (savedDl > 0 || savedUl > 0) ? "flex" : "none";

      const meta = document.createElement("span");
      meta.className = "sanad-speed-meta";
      meta.textContent = lastTime
        ? "آخر قياس: " + new Date(lastTime).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
        : "لم يُجرَ قياس بعد";

      btn.onclick = async () => {
        btn.disabled = true;
        setProgress("جارٍ قياس التنزيل…", "");
        try {
          const dl = await measureDownload((mbps) => setProgress("جارٍ قياس التنزيل… ", mbps.toFixed(2) + " Mbps"));
          api.storage.set("last-dl", dl);
          resDl.bdi.textContent = dl.toFixed(2) + " Mbps";
          resultDiv.style.display = "flex";

          setProgress("جارٍ قياس الرفع…", "");
          const ul = await measureUpload((mbps) => setProgress("جارٍ قياس الرفع… ", mbps.toFixed(2) + " Mbps"));
          api.storage.set("last-ul", ul);
          resUl.bdi.textContent = ul.toFixed(2) + " Mbps";

          const now = Date.now();
          api.storage.set("last-time", now);
          meta.textContent = "آخر قياس: " + new Date(now).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
          setProgress("", "");
          api.notify.success("التنزيل " + dl.toFixed(2) + " Mbps — الرفع " + ul.toFixed(2) + " Mbps", "سرعة الانترنت");
        } catch (e) {
          setProgress("", "");
          api.notify.error("تعذّر إكمال القياس، تحقق من الاتصال وحاول مجدداً", "فشل القياس");
        } finally {
          btn.innerHTML = api.icon("zap") + " قياس السرعة";
          btn.disabled = false;
        }
      };

      testSection.appendChild(btn);
      testSection.appendChild(progress);
      testSection.appendChild(resultDiv);
      testSection.appendChild(meta);
      container.appendChild(testSection);

      // ——— استطلاع الشبكة كل ثانية ———
      let intervalId = null;
      const poll = async () => {
        if (!container.isConnected) {
          if (intervalId) clearInterval(intervalId);
          intervalId = null;
          return;
        }
        try {
          const data = await api.network.throughput();
          if (!container.isConnected) return;
          if (data) {
            rxLive.bdi.textContent = formatSpeed(data.rxBps || 0);
            txLive.bdi.textContent = formatSpeed(data.txBps || 0);
            drawGraph(canvas, data.history || []);
          }
        } catch (e) {
          // تجاهل أخطاء الاستطلاع المؤقتة
        }
      };

      poll();
      intervalId = setInterval(poll, 1000);
    };

    api.home.addToDeviceCard(render);
  }
});
