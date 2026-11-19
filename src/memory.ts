import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { JARVIS_SYSTEM_PROMPT } from "./config";

export type MemoryCategory = "user" | "project" | "preference" | "system" | "general";

export type MemoryEntry = {
  id: string;
  content: string;
  category: MemoryCategory;
  createdAt: string;
  updatedAt: string;
};

type MemoryFile = {
  version: number;
  lastUpdated: string;
  entries: MemoryEntry[];
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

const DEFAULT_MEMORIES: MemoryEntry[] = [
  {
    id: "mem_init_1",
    content: "المستخدم يعمل على لابتوب بنظام Windows 11، ولديه صلاحيات تشغيل البرامج وقراءة الملفات.",
    category: "system",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mem_init_2",
    content: "المشروع الحالي هو OpenCode / JARVIS، يحتوي على واجهة ويب، خادم Node/TS، ومحرك أولاما أوفلاين.",
    category: "project",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mem_init_3",
    content: "تم تثبيت محرك Ollama محلياً مع موديل qwen2.5-coder:7b ويعمل أوفلاين بدون إنترنت.",
    category: "system",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let memoryCache: MemoryEntry[] | null = null;

async function ensureMemoryFile(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  if (!existsSync(MEMORY_FILE)) {
    const initial: MemoryFile = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      entries: DEFAULT_MEMORIES,
    };
    await writeFile(MEMORY_FILE, JSON.stringify(initial, null, 2), "utf8");
    memoryCache = [...DEFAULT_MEMORIES];
  }
}

export async function getMemories(): Promise<MemoryEntry[]> {
  if (memoryCache) return memoryCache;

  await ensureMemoryFile();
  try {
    const raw = await readFile(MEMORY_FILE, "utf8");
    const parsed = JSON.parse(raw) as MemoryFile;
    memoryCache = Array.isArray(parsed.entries) ? parsed.entries : [];
    return memoryCache;
  } catch (err) {
    console.warn("[memory] failed to read memory file, using defaults:", err);
    memoryCache = [...DEFAULT_MEMORIES];
    return memoryCache;
  }
}

export async function saveMemories(entries: MemoryEntry[]): Promise<void> {
  await ensureMemoryFile();
  memoryCache = entries;
  const payload: MemoryFile = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    entries,
  };
  await writeFile(MEMORY_FILE, JSON.stringify(payload, null, 2), "utf8");
}

export async function addMemory(
  content: string,
  category: MemoryCategory = "general"
): Promise<MemoryEntry> {
  const clean = content.trim();
  const memories = await getMemories();

  // Deduplicate if identical content already exists
  const existing = memories.find((m) => m.content.toLowerCase() === clean.toLowerCase());
  if (existing) {
    existing.updatedAt = new Date().toISOString();
    await saveMemories(memories);
    return existing;
  }

  const now = new Date().toISOString();
  const newEntry: MemoryEntry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    content: clean,
    category,
    createdAt: now,
    updatedAt: now,
  };

  memories.unshift(newEntry);
  await saveMemories(memories);
  return newEntry;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const memories = await getMemories();
  const filtered = memories.filter((m) => m.id !== id);
  if (filtered.length === memories.length) return false;

  await saveMemories(filtered);
  return true;
}

export async function clearAllMemories(): Promise<void> {
  await saveMemories([]);
}

/** Formats the long-term memory for injection into the model's System Prompt */
export async function getSystemPromptWithMemory(): Promise<string> {
  const memories = await getMemories();
  if (!memories.length) {
    return JARVIS_SYSTEM_PROMPT;
  }

  const memoryBlock = memories
    .map((m, i) => `${i + 1}. [${getCategoryLabel(m.category)}] ${m.content}`)
    .join("\n");

  return `${JARVIS_SYSTEM_PROMPT}

### 🧠 الذاكرة الدائمة المرجعية عن المستخدم والنظام (Long-Term Memory):
المعلومات التالية محفوظة في ذاكرتك الدائمة من محادثات وسجلات سابقة. تذكرها واعتمد عليها دائماً دون أن تطلب من المستخدم تكرارها:
${memoryBlock}
`;
}

function getCategoryLabel(cat: MemoryCategory): string {
  switch (cat) {
    case "user":
      return "عن المستخدم";
    case "project":
      return "عن المشروع";
    case "preference":
      return "تفضيلات المستخدم";
    case "system":
      return "معلومات النظام";
    default:
      return "ذاكرة عامة";
  }
}
