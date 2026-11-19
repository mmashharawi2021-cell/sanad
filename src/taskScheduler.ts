import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { executeTerminalCommand } from "./codeRunner";
import { getSystemStats } from "./systemTools";

export type TaskType = "interval" | "daily" | "watcher";
export type TaskActionType = "command" | "healthcheck" | "backup";

export type TaskLogEntry = {
  runAt: string;
  status: "success" | "error";
  output: string;
  durationMs: number;
};

export type ScheduledTask = {
  id: string;
  title: string;
  type: TaskType;
  scheduleStr: string;
  intervalMinutes: number;
  actionType: TaskActionType;
  actionValue: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: "success" | "error" | "never";
  lastOutput: string | null;
  runCount: number;
  logs: TaskLogEntry[];
};

type TaskFile = {
  version: number;
  lastUpdated: string;
  tasks: ScheduledTask[];
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

const DEFAULT_TASKS: ScheduledTask[] = [
  {
    id: "task_health_check",
    title: "فحص أداء النظام والبطارية الدوري",
    type: "interval",
    scheduleStr: "كل 30 دقيقة",
    intervalMinutes: 30,
    actionType: "healthcheck",
    actionValue: "check_specs",
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    nextRunAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    lastStatus: "never",
    lastOutput: null,
    runCount: 0,
    logs: [],
  },
  {
    id: "task_auto_backup",
    title: "مراقبة مساحة سطح المكتب وإنشاء تقرير",
    type: "interval",
    scheduleStr: "كل 60 دقيقة",
    intervalMinutes: 60,
    actionType: "command",
    actionValue: "dir C:\\Users\\mozar\\Desktop",
    enabled: false,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    nextRunAt: null,
    lastStatus: "never",
    lastOutput: null,
    runCount: 0,
    logs: [],
  },
];

let tasksCache: ScheduledTask[] | null = null;
const activeTimers = new Map<string, NodeJS.Timeout>();

async function ensureTaskFile(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  if (!existsSync(TASKS_FILE)) {
    const initial: TaskFile = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      tasks: DEFAULT_TASKS,
    };
    await writeFile(TASKS_FILE, JSON.stringify(initial, null, 2), "utf8");
    tasksCache = [...DEFAULT_TASKS];
  }
}

export async function getTasks(): Promise<ScheduledTask[]> {
  if (tasksCache) return tasksCache;
  await ensureTaskFile();
  try {
    const raw = await readFile(TASKS_FILE, "utf8");
    const parsed = JSON.parse(raw) as TaskFile;
    tasksCache = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    return tasksCache;
  } catch (err) {
    console.warn("[scheduler] failed to read tasks file:", err);
    tasksCache = [...DEFAULT_TASKS];
    return tasksCache;
  }
}

export async function saveTasks(tasks: ScheduledTask[]): Promise<void> {
  await ensureTaskFile();
  tasksCache = tasks;
  const payload: TaskFile = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    tasks,
  };
  await writeFile(TASKS_FILE, JSON.stringify(payload, null, 2), "utf8");
}

export async function createTask(data: {
  title: string;
  intervalMinutes: number;
  actionType: TaskActionType;
  actionValue: string;
  type?: TaskType;
  scheduleStr?: string;
}): Promise<ScheduledTask> {
  const tasks = await getTasks();
  const minutes = Math.max(1, data.intervalMinutes || 10);
  const now = new Date();
  const nextRun = new Date(now.getTime() + minutes * 60 * 1000);

  const newTask: ScheduledTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: data.title.trim(),
    type: data.type || "interval",
    scheduleStr: data.scheduleStr || `كل ${minutes} دقيقة`,
    intervalMinutes: minutes,
    actionType: data.actionType || "command",
    actionValue: data.actionValue.trim(),
    enabled: true,
    createdAt: now.toISOString(),
    lastRunAt: null,
    nextRunAt: nextRun.toISOString(),
    lastStatus: "never",
    lastOutput: null,
    runCount: 0,
    logs: [],
  };

  tasks.unshift(newTask);
  await saveTasks(tasks);
  scheduleTaskTimer(newTask);
  return newTask;
}

export async function toggleTask(id: string, enabled?: boolean): Promise<ScheduledTask | null> {
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;

  task.enabled = typeof enabled === "boolean" ? enabled : !task.enabled;
  if (task.enabled) {
    const minutes = Math.max(1, task.intervalMinutes || 10);
    task.nextRunAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    scheduleTaskTimer(task);
  } else {
    task.nextRunAt = null;
    clearTaskTimer(task.id);
  }

  await saveTasks(tasks);
  return task;
}

export async function deleteTask(id: string): Promise<boolean> {
  clearTaskTimer(id);
  const tasks = await getTasks();
  const filtered = tasks.filter((t) => t.id !== id);
  if (filtered.length === tasks.length) return false;

  await saveTasks(filtered);
  return true;
}

export async function runTaskNow(id: string): Promise<{ success: boolean; output: string }> {
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return { success: false, output: "المهمة غير موجودة." };

  const startedAt = Date.now();
  let status: "success" | "error" = "success";
  let output = "";

  try {
    if (task.actionType === "healthcheck") {
      const stats = await getSystemStats();
      output = `[تقرير فحص النظام]\n- استهلاك الذاكرة: ${stats.usedMemoryPercent}%\n- البطارية: ${stats.batteryPercent ?? "غير متوفر"}%\n- وقت التشغيل: ${stats.uptimeHours} ساعة.`;
    } else {
      const res = await executeTerminalCommand(task.actionValue, undefined, 60_000);
      status = res.success ? "success" : "error";
      output = res.stdout || res.stderr || (res.success ? "اكتمل بنجاح" : "حدث خطأ أثناء التشغيل");
    }
  } catch (err: any) {
    status = "error";
    output = `خطأ أثناء تنفيذ المهمة: ${err.message}`;
  }

  const durationMs = Date.now() - startedAt;
  const now = new Date();

  task.lastRunAt = now.toISOString();
  task.lastStatus = status;
  task.lastOutput = output.slice(0, 1000);
  task.runCount = (task.runCount || 0) + 1;

  if (task.enabled) {
    task.nextRunAt = new Date(now.getTime() + task.intervalMinutes * 60 * 1000).toISOString();
    scheduleTaskTimer(task);
  }

  const logEntry: TaskLogEntry = {
    runAt: now.toISOString(),
    status,
    output: output.slice(0, 500),
    durationMs,
  };

  task.logs = [logEntry, ...(task.logs || []).slice(0, 19)]; // Keep last 20 logs
  await saveTasks(tasks);

  return { success: status === "success", output };
}

function clearTaskTimer(id: string) {
  const timer = activeTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(id);
  }
}

function scheduleTaskTimer(task: ScheduledTask) {
  clearTaskTimer(task.id);
  if (!task.enabled) return;

  const ms = Math.max(10_000, task.intervalMinutes * 60 * 1000);
  const timer = setTimeout(async () => {
    console.log(`[scheduler] running task: ${task.title} (${task.id})`);
    await runTaskNow(task.id);
  }, ms);

  activeTimers.set(task.id, timer);
}

export async function initTaskScheduler(): Promise<void> {
  const tasks = await getTasks();
  console.log(`[scheduler] initializing ${tasks.length} tasks...`);
  for (const task of tasks) {
    if (task.enabled) {
      scheduleTaskTimer(task);
    }
  }
}
