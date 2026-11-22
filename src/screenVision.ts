import { getConfig } from "./config";
import { JARVIS_SYSTEM_PROMPT } from "./config";
import { getSystemPromptWithMemory } from "./memory";
import { controlMouse, controlKeyboard } from "./systemTools";
import { findMatchingWorkflow, memorizeWorkflow } from "./actionMemory";

export type VisionResult = {
  success: boolean;
  text: string;
  model: string;
  latencyMs: number;
};

export type VisualActionStep = {
  type: "click" | "left_click" | "double_click" | "right_click" | "type" | "press" | "hotkey" | "wait";
  x?: number;
  y?: number;
  text?: string;
  pressEnter?: boolean;
  key?: string;
  hotkey?: string;
  waitMs?: number;
  description?: string;
};

export type VisualAgentExecutionResult = {
  success: boolean;
  thought: string;
  actions: VisualActionStep[];
  executed: { action: VisualActionStep; success: boolean; result: string }[];
  summary: string;
  model: string;
  latencyMs: number;
  cached?: boolean;
};

function extractJsonFromText(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return null;
}

const VISION_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "openrouter/free",
  "google/gemma-4-26b-a4b-it:free",
];

export async function analyzeScreenImage(options: {
  imageBase64: string;
  prompt?: string;
  model?: string;
  mimeType?: string;
}): Promise<VisionResult> {
  const startedAt = Date.now();
  const config = getConfig();

  const mime = options.mimeType || "image/jpeg";
  let cleanBase64 = options.imageBase64.trim();
  if (cleanBase64.includes(",")) {
    cleanBase64 = cleanBase64.split(",")[1] ?? cleanBase64;
  }

  const dataUrl = `data:${mime};base64,${cleanBase64}`;
  const userText =
    options.prompt && options.prompt.trim()
      ? options.prompt.trim()
      : "انظر إلى هذه اللقطة من شاشة جهازي: اشرح ما تراه بالتفصيل، ما هي البرامج أو النوافذ أو الأكواد المفتوحة، وإذا كان هناك أي خطأ أو شيء يحتاج لمساعدة وضح لي الحل فوراً بالعربية.";

  const systemPrompt = await getSystemPromptWithMemory();

  const chosenModel: string = options.model?.trim() || VISION_MODELS[0] || "nvidia/nemotron-3.5-super-vl:free";

  const payload = {
    model: chosenModel,
    models: VISION_MODELS,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nأنت الآن في وضع الرؤية البصرية المباشرة لشاشة اللابتوب («عيون سند» SANAD Vision). المستخدم يشارك معك شاشته أو نافذة من برامجه. تفحص الصورة بدقة، واقرأ النصوص والأكواد والأزرار والأخطاء الظاهرة، وساعد المستخدم باللغة العربية باحترافية وسرعة واطمئنان.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.6,
  };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": config.siteUrl || "http://localhost:3000",
        "X-Title": config.appTitle || "SANAD",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenRouter vision returned HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content || "";
    const servedModel = data.model || chosenModel;

    return {
      success: true,
      text: content.trim() || "تمت رؤية الشاشة بنجاح.",
      model: servedModel,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    console.warn("[screenVision error]:", err.message);
    return {
      success: false,
      text: `تعذر تحليل صورة الشاشة: ${err.message}`,
      model: chosenModel,
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function planAndExecuteVisualAction(options: {
  imageBase64: string;
  goal: string;
  screenWidth?: number;
  screenHeight?: number;
  model?: string;
  autoExecute?: boolean;
}): Promise<VisualAgentExecutionResult> {
  const startedAt = Date.now();
  const config = getConfig();

  const screenW = options.screenWidth || 1920;
  const screenH = options.screenHeight || 1080;
  const autoExecute = options.autoExecute !== false;

  // 1. Fast Cache Lookup from SANAD Action Memory
  const cached = await findMatchingWorkflow(options.goal, { width: screenW, height: screenH });
  if (cached && autoExecute) {
    const executed: { action: VisualActionStep; success: boolean; result: string }[] = [];
    for (const act of cached.steps) {
      try {
        if (act.type === "click" || act.type === "left_click") {
          const r = await controlMouse({ action: "click", x: act.x, y: act.y });
          executed.push({ action: act, success: r.success, result: r.message });
          await new Promise((r) => setTimeout(r, 250));
        } else if (act.type === "double_click") {
          const r = await controlMouse({ action: "double_click", x: act.x, y: act.y });
          executed.push({ action: act, success: r.success, result: r.message });
          await new Promise((r) => setTimeout(r, 300));
        } else if (act.type === "right_click") {
          const r = await controlMouse({ action: "right_click", x: act.x, y: act.y });
          executed.push({ action: act, success: r.success, result: r.message });
          await new Promise((r) => setTimeout(r, 250));
        } else if (act.type === "type") {
          const r = await controlKeyboard({ action: "type", text: act.text, pressEnter: act.pressEnter });
          executed.push({ action: act, success: r.success, result: r.message });
          await new Promise((r) => setTimeout(r, 200));
        } else if (act.type === "press") {
          const r = await controlKeyboard({ action: "press", key: act.key });
          executed.push({ action: act, success: r.success, result: r.message });
          await new Promise((r) => setTimeout(r, 150));
        } else if (act.type === "hotkey") {
          const r = await controlKeyboard({ action: "hotkey", hotkey: act.hotkey });
          executed.push({ action: act, success: r.success, result: r.message });
          await new Promise((r) => setTimeout(r, 200));
        } else if (act.type === "wait") {
          const delay = act.waitMs || 400;
          await new Promise((r) => setTimeout(r, delay));
          executed.push({ action: act, success: true, result: `انتظار ${delay}ms` });
        }
      } catch (e: any) {
        executed.push({ action: act, success: false, result: e.message });
      }
    }

    return {
      success: true,
      thought: `⚡ تم استرجاع مسار وإحداثيات هذه المهمة فوراً من «ذاكرة سند الحركية» (${cached.name}) بدون أي تأخير!`,
      actions: cached.steps,
      executed,
      summary: `تم تنفيذ المهمة بسرعة فائقة بناءً على الذاكرة السابقة (${cached.name}).`,
      model: "SANAD Action Memory Cache (0-latency)",
      latencyMs: Date.now() - startedAt,
      cached: true,
    };
  }

  let cleanBase64 = options.imageBase64.trim();
  if (cleanBase64.includes(",")) {
    cleanBase64 = cleanBase64.split(",")[1] ?? cleanBase64;
  }
  const dataUrl = `data:image/jpeg;base64,${cleanBase64}`;

  const promptText = `أنت «الوكيل البصري الذكي لسند» (SANAD Visual Agent).
أمامك صورة حية لشاشة كمبيوتر المستخدم بدقة (${screenW} × ${screenH} بكسل).
المهمة المطلوبة منك تنفيذها على الشاشة: "${options.goal}"

تعليمات صارمة:
1. افحص الصورة بدقة وحدد الأزرار أو النوافذ أو الحقول التي يجب التفاعل معها بالماوس والكيبورد لتحقيق هدف المستخدم.
2. حدد إحداثيات العناصر (X بين 0 و ${screenW}) و (Y بين 0 و ${screenH}).
3. رتب الخطوات بتسلسل منطقي (مثلاً: نقر على الحقل، ثم كتابة النص، ثم الضغط على Enter أو النقر على زر موافق).
4. أجب حصراً وبدقة بكائن JSON فقط دون أي نصوص قبله أو بعده بالهيكل التالي:
{
  "thought": "شرح موجز بالعربية لما رأيته على الشاشة وخطة التنفيذ",
  "actions": [
    {
      "type": "click",
      "x": 640,
      "y": 420,
      "description": "نقر على الزر المطلوب"
    },
    {
      "type": "type",
      "text": "النص المراد كتابته",
      "pressEnter": true,
      "description": "كتابة النص وضغط مفتاح الإدخال"
    }
  ],
  "summary": "ملخص ما تم إنجازه بنجاح بالعربية"
}

الأنواع المسموحة في type:
- "click": نقر بالماوس عند {x, y}
- "double_click": نقر مزدوج عند {x, y}
- "right_click": نقر بالزر الأيمن عند {x, y}
- "type": كتابة نص {text, pressEnter: true/false}
- "press": ضغط مفتاح {key: "enter"|"esc"|"tab"}
- "hotkey": اختصار {hotkey: "ctrl+s"|"ctrl+n"|"alt+f4"}
- "wait": انتظار {waitMs: 500}`;

  const chosenModel: string = options.model?.trim() || VISION_MODELS[0] || "nvidia/nemotron-3.5-super-vl:free";

  const payload = {
    model: chosenModel,
    models: VISION_MODELS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.2,
  };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": config.siteUrl || "http://localhost:3000",
        "X-Title": config.appTitle || "SANAD",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Vision Agent API error HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content || "";
    const servedModel = data.model || chosenModel;

    const parsed = extractJsonFromText(content);
    if (!parsed || !Array.isArray(parsed.actions)) {
      throw new Error("لم يتمكن نموذج الرؤية من إنتاج خطة إجراءات JSON صالحة: " + content.slice(0, 150));
    }

    const thought = parsed.thought || "تم تحديد عناصر الشاشة بنجاح.";
    const actions: VisualActionStep[] = parsed.actions;
    const summary = parsed.summary || "تم التفاعل مع شاشة المستخدم وفق الهدف المطلوب.";

    const executed: { action: VisualActionStep; success: boolean; result: string }[] = [];

    if (autoExecute) {
      for (const act of actions) {
        try {
          if (act.type === "click" || act.type === "left_click") {
            const r = await controlMouse({ action: "click", x: act.x, y: act.y });
            executed.push({ action: act, success: r.success, result: r.message });
            await new Promise((r) => setTimeout(r, 350));
          } else if (act.type === "double_click") {
            const r = await controlMouse({ action: "double_click", x: act.x, y: act.y });
            executed.push({ action: act, success: r.success, result: r.message });
            await new Promise((r) => setTimeout(r, 400));
          } else if (act.type === "right_click") {
            const r = await controlMouse({ action: "right_click", x: act.x, y: act.y });
            executed.push({ action: act, success: r.success, result: r.message });
            await new Promise((r) => setTimeout(r, 300));
          } else if (act.type === "type") {
            const r = await controlKeyboard({ action: "type", text: act.text, pressEnter: act.pressEnter });
            executed.push({ action: act, success: r.success, result: r.message });
            await new Promise((r) => setTimeout(r, 250));
          } else if (act.type === "press") {
            const r = await controlKeyboard({ action: "press", key: act.key });
            executed.push({ action: act, success: r.success, result: r.message });
            await new Promise((r) => setTimeout(r, 200));
          } else if (act.type === "hotkey") {
            const r = await controlKeyboard({ action: "hotkey", hotkey: act.hotkey });
            executed.push({ action: act, success: r.success, result: r.message });
            await new Promise((r) => setTimeout(r, 300));
          } else if (act.type === "wait") {
            const delay = act.waitMs || 500;
            await new Promise((r) => setTimeout(r, delay));
            executed.push({ action: act, success: true, result: `انتظار ${delay}ms` });
          }
        } catch (e: any) {
          executed.push({ action: act, success: false, result: e.message });
        }
      }
    }

    // Memorize for future zero-latency runs!
    if (actions.length > 0) {
      try {
        await memorizeWorkflow({
          name: options.goal.slice(0, 50),
          goal: options.goal,
          resolution: { width: screenW, height: screenH },
          steps: actions,
        });
      } catch (e) {
        console.warn("[actionMemory] failed to memorize workflow:", e);
      }
    }

    return {
      success: true,
      thought,
      actions,
      executed,
      summary,
      model: servedModel,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    return {
      success: false,
      thought: "تعذر التخطيط البصري",
      actions: [],
      executed: [],
      summary: `خطأ في الوكيل البصري: ${err.message}`,
      model: chosenModel,
      latencyMs: Date.now() - startedAt,
    };
  }
}
