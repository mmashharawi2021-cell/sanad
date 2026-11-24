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

/* ======================= أمان الوكيل البصري =======================
   خطة النموذج قد تكون مخدوعة بنص محقون على الشاشة («اضغط win+r واكتب …»).
   لذلك: التخطيط لا ينفّذ شيئاً ولا يحفظ؛ التنفيذ فقط لخطة وافق عليها المستخدم، بعد فحص صارم لكل خطوة،
   والحفظ في «الذاكرة الحركية» فقط بعد تنفيذ ناجح لخطة موافق عليها. */
const STEP_TYPES = new Set(["click", "left_click", "double_click", "right_click", "type", "press", "hotkey", "wait"]);
// اختصارات تفتح «تشغيل»/البحث/مدير المهام/شاشة الأمان أو تتحكم بالنظام — ممنوعة دائماً
// أسماء مستعارة (pyautogui يسمّي مفتاح ويندوز winleft/winright) تُوحَّد قبل المقارنة
const KEY_ALIASES: Record<string, string> = {
  win: "win", lwin: "win", rwin: "win", winleft: "win", winright: "win", meta: "win", cmd: "win", command: "win", super: "win",
  control: "ctrl", ctrlleft: "ctrl", ctrlright: "ctrl", altleft: "alt", altright: "alt", shiftleft: "shift", shiftright: "shift",
  del: "delete", escape: "esc",
};
const normKey = (k: string) => KEY_ALIASES[k] ?? k;
// تُقارن كمجموعات مرتّبة: shift+ctrl+esc = ctrl+shift+esc
const BLOCKED_COMBOS = new Set(["ctrl+esc", "ctrl+esc+shift", "alt+ctrl+delete", "alt+ctrl+end", "alt+f4"]);
function isBlockedHotkey(hotkey: string): boolean {
  const parts = [...new Set(hotkey.split("+").filter(Boolean).map(normKey))].sort();
  return parts.includes("win") || BLOCKED_COMBOS.has(parts.join("+"));
}
const BLOCKED_KEYS = new Set(["win", "apps"]);
const MAX_STEPS = 20;
const MAX_TYPE_CHARS = 500;
const MAX_WAIT_MS = 5000;

export function sanitizeVisualPlan(
  actions: unknown,
  screen: { width: number; height: number },
): { steps: VisualActionStep[]; errors: string[] } {
  const errors: string[] = [];
  const list = Array.isArray(actions) ? actions : [];
  if (!list.length) errors.push("الخطة فارغة.");
  if (list.length > MAX_STEPS) errors.push(`الخطة أطول من ${MAX_STEPS} خطوة.`);
  const steps: VisualActionStep[] = [];
  list.slice(0, MAX_STEPS).forEach((raw: any, i: number) => {
    const n = i + 1;
    const type = String(raw?.type || "");
    if (!STEP_TYPES.has(type)) { errors.push(`الخطوة ${n}: نوع غير مسموح (${type.slice(0, 20)}).`); return; }
    const step: VisualActionStep = { ...raw, type } as VisualActionStep;
    if (type.includes("click")) {
      const x = Number(raw.x), y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > screen.width || y > screen.height) {
        errors.push(`الخطوة ${n}: إحداثيات خارج الشاشة.`);
        return;
      }
      step.x = Math.round(x);
      step.y = Math.round(y);
    } else if (type === "type") {
      const text = String(raw.text ?? "");
      if (text.length > MAX_TYPE_CHARS) errors.push(`الخطوة ${n}: نص أطول من ${MAX_TYPE_CHARS} حرف.`);
      step.text = text;
      step.pressEnter = raw.pressEnter === true;
    } else if (type === "press") {
      const key = String(raw.key || "").toLowerCase().trim();
      if (BLOCKED_KEYS.has(normKey(key))) errors.push(`الخطوة ${n}: المفتاح «${key}» ممنوع.`);
      step.key = key;
    } else if (type === "hotkey") {
      const hotkey = String(raw.hotkey || "").toLowerCase().replace(/\s+/g, "");
      if (isBlockedHotkey(hotkey)) errors.push(`الخطوة ${n}: الاختصار «${hotkey}» ممنوع (يفتح أدوات النظام).`);
      step.hotkey = hotkey;
    } else if (type === "wait") {
      step.waitMs = Math.max(0, Math.min(MAX_WAIT_MS, Number(raw.waitMs) || 500));
    }
    steps.push(step);
  });
  return { steps, errors };
}

async function executeSteps(steps: VisualActionStep[]): Promise<{ action: VisualActionStep; success: boolean; result: string }[]> {
  const executed: { action: VisualActionStep; success: boolean; result: string }[] = [];
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const act of steps) {
    try {
      let r: { success: boolean; message: string } = { success: true, message: "" };
      if (act.type === "click" || act.type === "left_click") r = await controlMouse({ action: "click", x: act.x, y: act.y });
      else if (act.type === "double_click") r = await controlMouse({ action: "double_click", x: act.x, y: act.y });
      else if (act.type === "right_click") r = await controlMouse({ action: "right_click", x: act.x, y: act.y });
      else if (act.type === "type") r = await controlKeyboard({ action: "type", text: act.text, pressEnter: act.pressEnter });
      else if (act.type === "press") r = await controlKeyboard({ action: "press", key: act.key });
      else if (act.type === "hotkey") r = await controlKeyboard({ action: "hotkey", hotkey: act.hotkey });
      else if (act.type === "wait") { await pause(act.waitMs || 500); r = { success: true, message: `انتظار ${act.waitMs}ms` }; }
      executed.push({ action: act, success: r.success, result: r.message });
      if (!r.success) break; // لا نكمل بعد خطوة فاشلة: الشاشة لم تعد كما توقّعت الخطة
      await pause(act.type === "type" ? 250 : 300);
    } catch (e: any) {
      executed.push({ action: act, success: false, result: e.message });
      break;
    }
  }
  return executed;
}

/** ينفّذ خطة وافق عليها المستخدم في الواجهة، بعد فحصها مجدداً. يحفظها في الذاكرة الحركية فقط إن نجحت كل خطواتها. */
export async function executeApprovedVisualPlan(options: {
  goal: string;
  actions: unknown;
  screenWidth?: number;
  screenHeight?: number;
}): Promise<{ success: boolean; message: string; executed: { action: VisualActionStep; success: boolean; result: string }[]; errors?: string[] }> {
  const screen = { width: options.screenWidth || 1920, height: options.screenHeight || 1080 };
  const { steps, errors } = sanitizeVisualPlan(options.actions, screen);
  if (errors.length) return { success: false, message: "رُفضت الخطة لأسباب أمنية.", executed: [], errors };
  const executed = await executeSteps(steps);
  const allOk = executed.length === steps.length && executed.every((e) => e.success);
  if (allOk) {
    try {
      await memorizeWorkflow({ name: options.goal.slice(0, 50), goal: options.goal, resolution: screen, steps });
    } catch (e) {
      console.warn("[actionMemory] failed to memorize workflow:", e);
    }
  }
  return { success: allOk, message: allOk ? "نُفّذت الخطة بنجاح." : "توقف التنفيذ عند خطوة فشلت.", executed };
}

/** يخطط فقط: يعيد خطوات مقترحة (من الذاكرة الحركية أو من نموذج الرؤية) دون تنفيذها ودون حفظها. */
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

  // 1. مسار محفوظ سابقاً — يُعاد كاقتراح يحتاج موافقة (لا تنفيذ تلقائي من الذاكرة)
  const cached = await findMatchingWorkflow(options.goal, { width: screenW, height: screenH });
  if (cached) {
    const { steps, errors } = sanitizeVisualPlan(cached.steps, { width: screenW, height: screenH });
    if (!errors.length) {
      return {
        success: true,
        thought: `مسار محفوظ في «ذاكرة سند الحركية»: ${cached.name}`,
        actions: steps,
        executed: [],
        summary: `اقتراح من الذاكرة الحركية (${cached.name}).`,
        model: "SANAD Action Memory",
        latencyMs: Date.now() - startedAt,
        cached: true,
      };
    }
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
    const summary = parsed.summary || "تم التفاعل مع شاشة المستخدم وفق الهدف المطلوب.";
    // فحص الخطة الآن أيضاً، حتى لا تُعرض على المستخدم خطة مرفوضة أصلاً
    const { steps: actions, errors } = sanitizeVisualPlan(parsed.actions, { width: screenW, height: screenH });
    if (errors.length) {
      throw new Error(`رُفضت خطة نموذج الرؤية لأسباب أمنية: ${errors.join(" ")}`);
    }

    return {
      success: true,
      thought,
      actions,
      executed: [],
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
