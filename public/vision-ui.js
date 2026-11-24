/* سند — فحص الشاشة وتحليلها (عيون سند)
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Screen Vision (عيون سند) ======================= */

      async function captureAndAnalyzeScreen(promptText = "", targetConv = null, targetAssistant = null) {
        const conv = targetConv || ensureConversation();
        let assistant = targetAssistant;

        if (!assistant) {
          const userMsg = {
            role: "user",
            content: promptText || "انظر إلى شاشتي وافحص ما تراه بالتفصيل.",
            displayContent: promptText ? `👁️ ${promptText}` : "👁️ [طلب فحص الشاشة الحية]",
          };
          conv.messages.push(userMsg);
          assistant = { role: "assistant", content: "👁️ جارٍ فتح نافذة التقاط الشاشة...", pending: true };
          conv.messages.push(assistant);
          saveState();
          renderAll();
        } else {
          assistant.content = "👁️ جارٍ فتح نافذة التقاط الشاشة...";
          assistant.pending = true;
          saveState();
          renderAll();
        }

        try {
          let base64DataUrl;

          if (liveMediaStream && liveStreamVideo && liveStreamVideo.videoWidth > 0) {
            playSciFiSound("vision");
            assistant.content = "📸 تم التقاط إطار مباشر من بث الشاشة فوراً! جاري التحليل بالذكاء الاصطناعي...";
            renderAll();

            let targetW = liveStreamVideo.videoWidth || 1280;
            let targetH = liveStreamVideo.videoHeight || 720;
            const maxDim = 1280;
            if (targetW > maxDim || targetH > maxDim) {
              if (targetW > targetH) {
                targetH = Math.round((targetH * maxDim) / targetW);
                targetW = maxDim;
              } else {
                targetW = Math.round((targetW * maxDim) / targetH);
                targetH = maxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(liveStreamVideo, 0, 0, targetW, targetH);
            base64DataUrl = canvas.toDataURL("image/jpeg", 0.78);
          } else {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
              throw new Error("المتصفح لا يدعم مشاركة الشاشة المباشرة (getDisplayMedia).");
            }

            // Open screen selector
            const stream = await navigator.mediaDevices.getDisplayMedia({
              video: {
                cursor: "always",
                displaySurface: "monitor"
              },
              audio: false
            });

            playSciFiSound("vision");
            assistant.content = "📸 تم التقاط إطار الشاشة! جارٍ تجهيز الصورة وإرسالها لنموذج الرؤية...";
            renderAll();

            const video = document.createElement("video");
            video.srcObject = stream;
            video.muted = true;

            await new Promise((resolve) => {
              video.onloadedmetadata = () => {
                video.play().then(resolve).catch(resolve);
              };
            });

            // Wait 300ms for video buffer to populate
            await new Promise((r) => setTimeout(r, 300));

            // Downscale frame proportionally for high speed & reliability
            let targetW = video.videoWidth || 1280;
            let targetH = video.videoHeight || 720;
            const maxDim = 1280;
            if (targetW > maxDim || targetH > maxDim) {
              if (targetW > targetH) {
                targetH = Math.round((targetH * maxDim) / targetW);
                targetW = maxDim;
              } else {
                targetW = Math.round((targetW * maxDim) / targetH);
                targetH = maxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, targetW, targetH);

            // Stop screen capture track immediately to dismiss browser sharing bar
            stream.getTracks().forEach((track) => track.stop());

            base64DataUrl = canvas.toDataURL("image/jpeg", 0.78);
          }

          assistant.content = `
<div style="margin: 10px 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: rgba(0,0,0,0.2);">
  <div style="padding: 8px 12px; background: rgba(255,255,255,0.05); font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 8px;">
    <span>👁️</span> <span>لقطة الشاشة الحية:</span>
  </div>
  <img src="${base64DataUrl}" alt="لقطة الشاشة" style="max-width: 100%; max-height: 280px; object-fit: contain; display: block; margin: 0 auto; border-top: 1px solid var(--border);" />
</div>

⏳ **عيون سند تفحص الشاشة الآن وتستخرج التفاصيل...**
`;
          renderAll();

          // Resilient fetch with automatic retry in case of transient network reload
          let res;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              res = await fetch("/api/vision/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  imageBase64: base64DataUrl,
                  prompt: promptText || undefined,
                }),
                signal: AbortSignal.timeout(60_000),
              });
              if (res.ok) break;
            } catch (netErr) {
              if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 800));
                continue;
              }
              throw netErr;
            }
          }

          if (!res || !res.ok) {
            const err = await res?.json().catch(() => ({ error: "فشل استدعاء نموذج الرؤية" })) || { error: "خطأ في الاتصال بالخادم" };
            throw new Error(err.error || `HTTP ${res?.status}`);
          }

          const data = await res.json();
          playSciFiSound("done");
          assistant.pending = false;
          assistant.model = data.model || "Vision Model";
          assistant.latencyMs = data.latencyMs;

          assistant.content = `
<div style="margin: 10px 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: rgba(0,0,0,0.2);">
  <div style="padding: 8px 12px; background: rgba(255,255,255,0.05); font-size: 13px; font-weight: bold; display: flex; align-items: center; justify-content: space-between;">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span>👁️</span> <span>تم فحص الشاشة بنجاح</span>
    </div>
    <span style="font-size: 11px; opacity: 0.7;">${Math.round((data.latencyMs || 0) / 100) / 10} ث</span>
  </div>
  <img src="${base64DataUrl}" alt="لقطة الشاشة" style="max-width: 100%; max-height: 280px; object-fit: contain; display: block; margin: 0 auto; border-top: 1px solid var(--border); cursor: pointer;" onclick="window.open('${base64DataUrl}')" title="انقر لفتح الصورة بحجمها الكامل" />
</div>

${data.text}
`;

          saveState();
          renderAll();
          loadAndRenderWorkflows();

        } catch (err) {
          console.warn("Screen vision error:", err);
          assistant.pending = false;
          const isCancel = err.name === "NotAllowedError" || (err.message && err.message.includes("Permission denied"));
          if (isCancel) {
            assistant.content = "⚠️ تم إلغاء مشاركة الشاشة. يمكنك النقر على 👁️ في أي وقت لمشاركة الشاشة وفحصها.";
          } else {
            assistant.content = `❌ حدث خطأ أثناء التقاط أو فحص الشاشة: ${err.message || err}`;
          }
          saveState();
          renderAll();
        } finally {
          busy = false;
          setBusy(false);
        }
      }

      if (topScreenVisionBtn) {
        topScreenVisionBtn.addEventListener("click", () => {
          const promptVal = promptEl?.value?.trim() || "";
          if (promptEl) {
            promptEl.value = "";
            autoGrow();
          }
          captureAndAnalyzeScreen(promptVal);
        });
      }

      if (screenVisionBtn) {
        screenVisionBtn.addEventListener("click", () => {
          const promptVal = promptEl?.value?.trim() || "";
          if (promptEl) {
            promptEl.value = "";
            autoGrow();
          }
          captureAndAnalyzeScreen(promptVal);
        });
      }
