/* سند — الوكيل البصري: خطة نقرات على الشاشة بموافقة المستخدم
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Autonomous Visual Action Agent (سند البصري الذكي) ======================= */

      async function runVisualAgentLoop(goalText, targetConv = null, targetAssistant = null) {
        const conv = targetConv || ensureConversation();
        let assistant = targetAssistant;

        if (!assistant) {
          const userMsg = {
            role: "user",
            content: goalText,
            displayContent: `🤖 [مهمة بصرية]: ${goalText}`,
          };
          conv.messages.push(userMsg);
          assistant = {
            role: "assistant",
            content: "🤖 **[وكيل سند البصري]:** جاري التقاط شاشتك وتحليل العناصر البصرية لتنفيذ المهمة...",
            pending: true,
          };
          conv.messages.push(assistant);
          saveState();
          renderAll();
        } else {
          assistant.content = "🤖 **[وكيل سند البصري]:** جاري التقاط شاشتك وتحليل العناصر البصرية لتنفيذ المهمة...";
          assistant.pending = true;
          saveState();
          renderAll();
        }

        try {
          let base64DataUrl = null;

          if (liveMediaStream && liveStreamVideo && liveStreamVideo.videoWidth > 0) {
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
              throw new Error("المتصفح لا يدعم التقاط الشاشة المباشر.");
            }
            const stream = await navigator.mediaDevices.getDisplayMedia({
              video: { cursor: "always", displaySurface: "monitor" },
              audio: false,
            });
            const video = document.createElement("video");
            video.srcObject = stream;
            video.muted = true;
            await new Promise((r) => { video.onloadedmetadata = () => video.play().then(r).catch(r); });
            await new Promise((r) => setTimeout(r, 250));

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
            stream.getTracks().forEach((t) => t.stop());
            base64DataUrl = canvas.toDataURL("image/jpeg", 0.78);
          }

          // صورة حقيقية كعنصر DOM (renderMarkdown يهرّب HTML عمداً)، ولا تُحفظ في التخزين
          if (/^data:image\/(jpeg|png);base64,/.test(base64DataUrl)) transientScreenshots.set(assistant, base64DataUrl);
          assistant.content = "⏳ **يدرس وكيل سند البصري الشاشة الآن ويجهّز خطة لتعرضها عليك قبل التنفيذ...**";
          renderAll();

          const screenW = window.screen.width || 1920;
          const screenH = window.screen.height || 1080;

          const res = await fetch("/api/vision/act", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: base64DataUrl,
              goal: goalText,
              screenWidth: screenW,
              screenHeight: screenH,
            }),
            signal: AbortSignal.timeout(75_000),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || `HTTP ${res.status}`);
          }

          // 1) الخادم يخطط فقط. 2) نعرض الخطوات للموافقة. 3) ننفّذ عبر /api/vision/execute.
          const plan = await res.json();
          if (!plan.success || !Array.isArray(plan.actions) || !plan.actions.length) {
            throw new Error(plan.summary || plan.thought || "لم يقترح الوكيل البصري أي خطوات.");
          }

          const stepLabel = (a) => {
            const d = a.description ? ` — ${a.description}` : "";
            if (String(a.type).includes("click")) return `${a.type === "double_click" ? "نقر مزدوج" : a.type === "right_click" ? "نقر أيمن" : "نقر"} عند (${a.x}، ${a.y})${d}`;
            if (a.type === "type") return `كتابة: «${a.text}»${a.pressEnter ? " ثم Enter" : ""}${d}`;
            if (a.type === "press") return `مفتاح: ${a.key}${d}`;
            if (a.type === "hotkey") return `اختصار: ${a.hotkey}${d}`;
            if (a.type === "wait") return `انتظار ${a.waitMs}ms`;
            return `${a.type}${d}`;
          };
          const stepsText = plan.actions.map((a, i) => `${i + 1}. ${stepLabel(a)}`).join("\n");

          const approved = await sanadConfirm({
            title: plan.cached ? "تنفيذ مسار محفوظ على شاشتك؟" : "تنفيذ خطة الوكيل البصري على شاشتك؟",
            message: `${plan.thought}\n\n${stepsText}\n\nسيتحكم سند بالفأرة ولوحة المفاتيح لتنفيذ هذه الخطوات بالضبط.`,
            confirmText: "نفّذ",
            destructive: true,
          });

          assistant.pending = false;
          assistant.model = plan.model || "SANAD Visual Agent";
          assistant.latencyMs = plan.latencyMs;

          if (!approved) {
            assistant.content = `🛑 **لم تُنفَّذ الخطة البصرية** — ألغيتَها.\n\n**الهدف:** ${goalText}\n\n**الخطوات المقترحة:**\n${stepsText}`;
            saveState();
            renderAll();
            return;
          }

          const execRes = await fetch("/api/vision/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goal: goalText, actions: plan.actions, screenWidth: screenW, screenHeight: screenH }),
          });
          const data = await execRes.json();
          playSciFiSound(data.success ? "done" : "confirm");

          const doneLines = (data.executed || [])
            .map((item, idx) => `${idx + 1}. ${item.success ? "✓" : "✗"} ${stepLabel(item.action)}${item.success ? "" : ` (${item.result})`}`)
            .join("\n");
          const rejected = (data.errors || []).map((e) => `- ${e}`).join("\n");

          assistant.content = `${data.success ? "✅ **اكتملت المهمة البصرية**" : "⚠️ **لم تكتمل المهمة البصرية**"}\n\n**التحليل:** ${plan.thought}\n\n**الخطوات المنفذة:**\n${doneLines || "لا شيء"}${rejected ? `\n\n**أسباب الرفض:**\n${rejected}` : ""}\n\n**النتيجة:** ${data.success ? plan.summary : data.message}`;
          saveState();
          renderAll();
          loadAndRenderWorkflows();

        } catch (err) {
          console.warn("Visual agent error:", err);
          assistant.pending = false;
          assistant.content = `❌ تعذر إكمال المهمة البصرية: ${err.message || err}`;
          saveState();
          renderAll();
        } finally {
          busy = false;
          setBusy(false);
        }
      }
