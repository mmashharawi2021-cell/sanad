import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { type VisualActionStep } from "./screenVision";

export type VisualWorkflow = {
  id: string;
  name: string;
  goal: string;
  keywords: string[];
  appName?: string;
  resolution: { width: number; height: number };
  steps: VisualActionStep[];
  successCount: number;
  lastUsed: string;
  createdAt: string;
};

type WorkflowsFile = {
  version: number;
  lastUpdated: string;
  workflows: VisualWorkflow[];
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const WORKFLOWS_FILE = path.join(DATA_DIR, "actionWorkflows.json");

const DEFAULT_WORKFLOWS: VisualWorkflow[] = [
  {
    id: "wf_arcgis_new_project",
    name: "إنشاء مشروع جديد في ArcGIS Pro",
    goal: "انشاء مشروع جديد في ارك برو",
    keywords: ["ارك برو", "آرك برو", "arcgis pro", "مشروع جديد", "new project", "ارك بروه"],
    appName: "ArcGISPro",
    resolution: { width: 1920, height: 1080 },
    steps: [
      {
        type: "click",
        x: 630,
        y: 285,
        description: "النقر على قالب خريطة جديدة (Map Template) في ArcGIS Pro",
      },
      {
        type: "wait",
        waitMs: 500,
        description: "انتظار ظهور نافذة تسمية المشروع الجديد",
      },
      {
        type: "type",
        text: "مشروع_سند_الجديد",
        pressEnter: true,
        description: "إدخال اسم المشروع الافتراضي والضغط على Enter للتأكيد",
      },
    ],
    successCount: 1,
    lastUsed: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "wf_quick_save",
    name: "حفظ المشروع النشط (Quick Save)",
    goal: "احفظ المشروع",
    keywords: ["احفظ", "حفظ", "سيف", "save", "احفظ المشروع", "احفظ الملف"],
    resolution: { width: 1920, height: 1080 },
    steps: [
      {
        type: "hotkey",
        hotkey: "ctrl+s",
        description: "تنفيذ اختصار الحفظ السريع Ctrl+S",
      },
    ],
    successCount: 3,
    lastUsed: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

let workflowsCache: VisualWorkflow[] | null = null;

async function ensureWorkflowsFile(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  if (!existsSync(WORKFLOWS_FILE)) {
    const initial: WorkflowsFile = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      workflows: DEFAULT_WORKFLOWS,
    };
    await writeFile(WORKFLOWS_FILE, JSON.stringify(initial, null, 2), "utf8");
    workflowsCache = [...DEFAULT_WORKFLOWS];
  }
}

export async function getWorkflows(): Promise<VisualWorkflow[]> {
  if (workflowsCache) return workflowsCache;

  await ensureWorkflowsFile();
  try {
    const raw = await readFile(WORKFLOWS_FILE, "utf8");
    const parsed = JSON.parse(raw) as WorkflowsFile;
    workflowsCache = Array.isArray(parsed.workflows) ? parsed.workflows : [];
    return workflowsCache;
  } catch (err) {
    console.warn("[actionMemory] failed to read workflows file, using defaults:", err);
    workflowsCache = [...DEFAULT_WORKFLOWS];
    return workflowsCache;
  }
}

export async function saveWorkflows(workflows: VisualWorkflow[]): Promise<void> {
  await ensureWorkflowsFile();
  workflowsCache = workflows;
  const payload: WorkflowsFile = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    workflows,
  };
  await writeFile(WORKFLOWS_FILE, JSON.stringify(payload, null, 2), "utf8");
}

export async function findMatchingWorkflow(
  query: string,
  resolution: { width: number; height: number }
): Promise<VisualWorkflow | null> {
  const clean = query.trim().toLowerCase();
  const workflows = await getWorkflows();

  // Search by exact keyword or substring match
  for (const wf of workflows) {
    const matchKeyword = wf.keywords.some((k) => clean.includes(k.toLowerCase()) || k.toLowerCase().includes(clean));
    const matchName = clean.includes(wf.name.toLowerCase()) || wf.name.toLowerCase().includes(clean);
    const matchGoal = clean.includes(wf.goal.toLowerCase()) || wf.goal.toLowerCase().includes(clean);

    if (matchKeyword || matchName || matchGoal) {
      // Scale coordinates if resolution differs
      const scaleX = resolution.width / (wf.resolution.width || 1920);
      const scaleY = resolution.height / (wf.resolution.height || 1080);

      const scaledSteps: VisualActionStep[] = wf.steps.map((st) => {
        if (typeof st.x === "number" && typeof st.y === "number") {
          return {
            ...st,
            x: Math.round(st.x * scaleX),
            y: Math.round(st.y * scaleY),
          };
        }
        return { ...st };
      });

      wf.lastUsed = new Date().toISOString();
      wf.successCount = (wf.successCount || 0) + 1;
      await saveWorkflows(workflows);

      return {
        ...wf,
        steps: scaledSteps,
      };
    }
  }

  return null;
}

export async function memorizeWorkflow(options: {
  name: string;
  goal: string;
  keywords?: string[];
  appName?: string;
  resolution: { width: number; height: number };
  steps: VisualActionStep[];
}): Promise<VisualWorkflow> {
  const workflows = await getWorkflows();
  const now = new Date().toISOString();

  // Extract keywords from goal and name
  const words = `${options.name} ${options.goal}`
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const keywords = Array.from(new Set([...(options.keywords || []), ...words]));

  // Check if similar exists to update
  const existingIndex = workflows.findIndex(
    (w) => w.goal.toLowerCase() === options.goal.toLowerCase() || w.name.toLowerCase() === options.name.toLowerCase()
  );

  if (existingIndex !== -1 && workflows[existingIndex]) {
    const existing = workflows[existingIndex];
    existing.steps = options.steps;
    existing.resolution = options.resolution;
    existing.lastUsed = now;
    existing.successCount += 1;
    await saveWorkflows(workflows);
    return existing;
  }

  const newWf: VisualWorkflow = {
    id: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: options.name,
    goal: options.goal,
    keywords,
    appName: options.appName,
    resolution: options.resolution,
    steps: options.steps,
    successCount: 1,
    lastUsed: now,
    createdAt: now,
  };

  workflows.unshift(newWf);
  await saveWorkflows(workflows);
  return newWf;
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const workflows = await getWorkflows();
  const filtered = workflows.filter((w) => w.id !== id);
  if (filtered.length === workflows.length) return false;

  await saveWorkflows(filtered);
  return true;
}
