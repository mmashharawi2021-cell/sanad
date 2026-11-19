import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runUniversalCommand } from "./universalTerminal";

export type ProjectFile = {
  relativePath: string;
  content: string;
};

export type ProjectTemplate = "web-dashboard" | "task-manager" | "python-gui" | "python-api" | "custom";

export type BuildProjectOptions = {
  projectName: string;
  template?: ProjectTemplate;
  description?: string;
  files?: ProjectFile[];
  baseFolder?: "desktop" | "downloads" | "documents";
  openInVsCode?: boolean;
};

export type BuildProjectResult = {
  success: boolean;
  projectName: string;
  projectPath: string;
  fileCount: number;
  previewUrl?: string;
  entryFile?: string;
  message: string;
  filesCreated: string[];
};

export function getProjectBasePath(baseFolder: "desktop" | "downloads" | "documents" = "desktop"): string {
  const home = os.homedir();
  if (baseFolder === "downloads") return path.join(home, "Downloads");
  if (baseFolder === "documents") return path.join(home, "Documents");
  return path.join(home, "Desktop");
}

export function generateTemplateFiles(template: ProjectTemplate, projectName: string, description?: string): ProjectFile[] {
  const cleanTitle = projectName.replace(/[-_]/g, " ");

  if (template === "task-manager") {
    return [
      {
        relativePath: "index.html",
        content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle} · Task Manager</title>
  <link rel="stylesheet" href="styles.css">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="app-container">
    <header class="app-header">
      <div class="logo">
        <span class="icon">⚡</span>
        <h1>${cleanTitle}</h1>
      </div>
      <p class="subtitle">${description || "نظام ذكي متكامل لتنظيم وإدارة المهام اليومية مع حفظ تلقائي."}</p>
    </header>

    <main class="main-content">
      <div class="input-card">
        <form id="taskForm">
          <input type="text" id="taskInput" placeholder="أضف مهمة جديدة للبدء بها..." required autocomplete="off" />
          <button type="submit" class="btn-primary">➕ إضافة مهمة</button>
        </form>
      </div>

      <div class="stats-row">
        <div class="stat-pill"><span id="totalCount">0</span> إجمالي المهام</div>
        <div class="stat-pill completed"><span id="doneCount">0</span> مكتملة ✓</div>
      </div>

      <div class="tasks-list" id="tasksList">
        <!-- Rendered by JS -->
      </div>
    </main>

    <footer>
      <p>تم إنشاؤه بواسطة مساعد ويندوز الذكي <strong>«سند» (SANAD)</strong></p>
    </footer>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        relativePath: "styles.css",
        content: `* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
body { background: #0b0f19; color: #f1f5f9; min-height: 100vh; display: flex; justify-content: center; padding: 20px; }
.app-container { width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 20px; }
.app-header { text-align: center; padding: 20px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.logo { display: flex; align-items: center; justify-content: center; gap: 10px; }
.logo h1 { font-size: 26px; color: #00f2fe; }
.subtitle { color: #94a3b8; font-size: 13px; margin-top: 6px; }
.input-card { background: #131b2e; border: 1px solid rgba(0, 242, 254, 0.2); border-radius: 12px; padding: 14px; }
#taskForm { display: flex; gap: 10px; }
#taskInput { flex: 1; background: #1c2742; border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 8px; padding: 10px 14px; font-size: 14px; outline: none; }
#taskInput:focus { border-color: #00f2fe; }
.btn-primary { background: linear-gradient(135deg, #00c6ff, #0072ff); color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.stats-row { display: flex; gap: 10px; }
.stat-pill { background: #1e293b; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #94a3b8; }
.stat-pill.completed { color: #10b981; }
.tasks-list { display: flex; flex-direction: column; gap: 10px; }
.task-item { background: #131b2e; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; transition: 0.2s; }
.task-item:hover { border-color: rgba(0,242,254,0.3); }
.task-item.completed .task-text { text-decoration: line-through; color: #64748b; }
.task-actions { display: flex; gap: 8px; }
.action-btn { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px; border-radius: 4px; transition: 0.15s; }
.action-btn:hover { background: rgba(255,255,255,0.1); }
footer { text-align: center; font-size: 12px; color: #64748b; margin-top: auto; padding: 14px 0; }`,
      },
      {
        relativePath: "app.js",
        content: `const STORAGE_KEY = "${projectName}_tasks_v1";
let tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const tasksList = document.getElementById("tasksList");
const totalCount = document.getElementById("totalCount");
const doneCount = document.getElementById("doneCount");

function saveAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  render();
}

function render() {
  tasksList.innerHTML = "";
  if (tasks.length === 0) {
    tasksList.innerHTML = '<div style="text-align: center; color: #64748b; padding: 30px;">🎉 لا توجد مهام حالياً، أنت حر تماماً!</div>';
  } else {
    tasks.forEach((t, i) => {
      const el = document.createElement("div");
      el.className = 'task-item' + (t.done ? ' completed' : '');
      el.innerHTML = \`
        <span class="task-text">\${escapeHtml(t.title)}</span>
        <div class="task-actions">
          <button class="action-btn" title="تبديل الإكمال" onclick="toggleTask(\${i})">\${t.done ? '↩️' : '✅'}</button>
          <button class="action-btn" title="حذف" onclick="deleteTask(\${i})">🗑️</button>
        </div>
      \`;
      tasksList.appendChild(el);
    });
  }

  totalCount.textContent = tasks.length;
  doneCount.textContent = tasks.filter(t => t.done).length;
}

window.toggleTask = (i) => {
  tasks[i].done = !tasks[i].done;
  saveAndRender();
};

window.deleteTask = (i) => {
  tasks.splice(i, 1);
  saveAndRender();
};

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = taskInput.value.trim();
  if (!val) return;
  tasks.unshift({ title: val, done: false, date: new Date().toISOString() });
  taskInput.value = "";
  saveAndRender();
});

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

render();`,
      },
    ];
  }

  if (template === "python-gui") {
    return [
      {
        relativePath: "main.py",
        content: `# -*- coding: utf-8 -*-
import tkinter as tk
from tkinter import ttk, messagebox
import time

class ${cleanTitle.replace(/\s+/g, "")}App:
    def __init__(self, root):
        self.root = root
        self.root.title("${cleanTitle} · SANAD Desktop Tool")
        self.root.geometry("450x400")
        self.root.configure(bg="#0f172a")

        # Title
        title_label = tk.Label(root, text="${cleanTitle}", font=("Cairo", 18, "bold"), fg="#38bdf8", bg="#0f172a")
        title_label.pack(pady=15)

        sub_label = tk.Label(root, text="${description || "أداة سطح مكتب مستقلة تم إنشاؤها عبر سند"}", font=("Cairo", 10), fg="#94a3b8", bg="#0f172a")
        sub_label.pack(pady=5)

        # Input Frame
        frame = tk.Frame(root, bg="#1e293b", padx=15, pady=15, relief="flat", highlightbackground="#334155", highlightthickness=1)
        frame.pack(fill="x", padx=25, pady=15)

        tk.Label(frame, text="النص أو المعامل:", font=("Cairo", 11), fg="#f1f5f9", bg="#1e293b").pack(anchor="e")
        self.entry = tk.Entry(frame, font=("Cairo", 12), bg="#0f172a", fg="#ffffff", insertbackground="#38bdf8", relief="flat")
        self.entry.pack(fill="x", pady=8)
        self.entry.focus()

        # Action Button
        btn = tk.Button(root, text="⚡ تشغيل المعالجة", font=("Cairo", 12, "bold"), bg="#0284c7", fg="#ffffff", relief="flat", cursor="hand2", command=self.process_action)
        btn.pack(pady=10, fill="x", padx=25)

        # Output Box
        self.output_label = tk.Label(root, text="النتائج ستظهر هنا...", font=("Cairo", 11), fg="#38bdf8", bg="#1e293b", wraplength=380, pady=12)
        self.output_label.pack(fill="both", expand=True, padx=25, pady=15)

    def process_action(self):
        val = self.entry.get().strip()
        if not val:
            messagebox.showwarning("تنبيه", "يرجى إدخال نص أولاً!")
            return
        res = f"تمت المعالجة بنجاح: '{val}'\\nالطول: {len(val)} حرف\\nالوقت: {time.strftime('%H:%M:%S')}"
        self.output_label.config(text=res)

if __name__ == "__main__":
    root = tk.Tk()
    app = ${cleanTitle.replace(/\s+/g, "")}App(root)
    root.mainloop()
`,
      },
      {
        relativePath: "README.md",
        content: `# ${cleanTitle}\n\n${description || "تطبيق سطح مكتب مكتوب بلغة Python 3.14 وTkinter تم إنشاؤه عبر المساعد الذكي سند."}\n\n## التشغيل:\n\`\`\`powershell\npy main.py\n\`\`\`\n`,
      },
    ];
  }

  // Default: web-dashboard
  return [
    {
      relativePath: "index.html",
      content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle} · Analytics Dashboard</title>
  <link rel="stylesheet" href="styles.css">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div class="dashboard-wrapper">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-icon">🌐</span>
        <h2>${cleanTitle}</h2>
      </div>
      <nav class="nav-menu">
        <a href="#" class="nav-item active">📊 لوحة التحكم</a>
        <a href="#" class="nav-item">📈 التقارير المباشرة</a>
        <a href="#" class="nav-item">⚙️ الإعدادات</a>
      </nav>
      <div class="user-badge">
        <span class="user-avatar">👤</span>
        <div>
          <div class="user-name">المهندس</div>
          <div class="user-status">متصل · نظام سند</div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <header class="top-bar">
        <div>
          <h1>لوحة التحليلات والمراقبة</h1>
          <p class="subtitle">${description || "نظام تفاعلي متكامل مبني ومصمم خصيصاً عبر مساعد ويندوز الذكي «سند»."}</p>
        </div>
        <div class="time-display" id="timeDisplay">--:--:--</div>
      </header>

      <!-- KPI Cards -->
      <section class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-head"><span>⚡ الإنتاجية اليومية</span><span class="badge green">+18%</span></div>
          <div class="kpi-val">94.8%</div>
          <div class="kpi-sub">أداء استثنائي ومستقر</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-head"><span>🚀 العمليات المنجزة</span><span class="badge blue">اليوم</span></div>
          <div class="kpi-val">128</div>
          <div class="kpi-sub">تمت أتمتتها بالكامل</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-head"><span>⏱️ سرعة الاستجابة</span><span class="badge purple">لحظي</span></div>
          <div class="kpi-val">42 ms</div>
          <div class="kpi-sub">زمن وصول محلي فائق</div>
        </div>
      </section>

      <!-- Interactive Playground -->
      <section class="panel-card">
        <h3>🎯 مركز التفاعل والتجربة</h3>
        <div class="calc-row">
          <input type="text" id="userInput" placeholder="اكتب قيمة أو فكرة للتجربة..." autocomplete="off" />
          <button id="actionBtn" class="btn-accent">معالجة فورية</button>
        </div>
        <div class="output-box" id="outputBox">النتائج تظهر هنا فورياً...</div>
      </section>
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
    },
    {
      relativePath: "styles.css",
      content: `* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
body { background: #090d16; color: #f8fafc; min-height: 100vh; overflow-x: hidden; }
.dashboard-wrapper { display: flex; min-height: 100vh; }
.sidebar { width: 260px; background: #0f172a; border-left: 1px solid rgba(255,255,255,0.06); padding: 24px; display: flex; flex-direction: column; gap: 30px; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand h2 { font-size: 20px; color: #38bdf8; }
.nav-menu { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.nav-item { padding: 10px 14px; border-radius: 8px; color: #94a3b8; text-decoration: none; font-size: 14px; transition: 0.2s; }
.nav-item.active, .nav-item:hover { background: rgba(56, 189, 248, 0.12); color: #38bdf8; font-weight: 600; }
.user-badge { display: flex; align-items: center; gap: 10px; padding: 12px; background: #1e293b; border-radius: 10px; }
.user-avatar { font-size: 22px; }
.user-name { font-size: 13px; font-weight: 600; }
.user-status { font-size: 11px; color: #10b981; }
.main-content { flex: 1; padding: 30px; display: flex; flex-direction: column; gap: 24px; }
.top-bar { display: flex; justify-content: space-between; align-items: center; }
.top-bar h1 { font-size: 26px; font-weight: 800; }
.subtitle { color: #94a3b8; font-size: 13px; margin-top: 4px; }
.time-display { background: #1e293b; border: 1px solid rgba(56,189,248,0.2); color: #38bdf8; padding: 8px 16px; border-radius: 8px; font-family: monospace; font-size: 16px; font-weight: bold; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.kpi-card { background: #0f172a; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 8px; transition: 0.2s; }
.kpi-card:hover { border-color: rgba(56,189,248,0.3); transform: translateY(-2px); }
.kpi-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #94a3b8; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
.badge.green { background: rgba(16,185,129,0.15); color: #10b981; }
.badge.blue { background: rgba(56,189,248,0.15); color: #38bdf8; }
.badge.purple { background: rgba(168,85,247,0.15); color: #c084fc; }
.kpi-val { font-size: 28px; font-weight: 800; color: #f8fafc; }
.kpi-sub { font-size: 12px; color: #64748b; }
.panel-card { background: #0f172a; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.calc-row { display: flex; gap: 10px; }
#userInput { flex: 1; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 8px; padding: 10px 14px; font-size: 14px; outline: none; }
#userInput:focus { border-color: #38bdf8; }
.btn-accent { background: #0284c7; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-accent:hover { background: #0369a1; }
.output-box { background: #1e293b; border-radius: 8px; padding: 14px; color: #38bdf8; font-size: 14px; line-height: 1.6; }`,
    },
    {
      relativePath: "app.js",
      content: `// Live Clock
function updateClock() {
  const el = document.getElementById("timeDisplay");
  if (el) el.textContent = new Date().toLocaleTimeString("ar-SA");
}
setInterval(updateClock, 1000);
updateClock();

// Interaction
const input = document.getElementById("userInput");
const btn = document.getElementById("actionBtn");
const output = document.getElementById("outputBox");

if (btn && input && output) {
  btn.addEventListener("click", () => {
    const val = input.value.trim();
    if (!val) {
      output.textContent = "⚠️ يرجى كتابة نص أو قيمة في الحقل أعلاه!";
      return;
    }
    output.innerHTML = \`✅ <strong>تمت المعالجة بنجاح:</strong> "\${escapeHtml(val)}" <br />⚡ عدد الحروف: \${val.length} | الكلمات: \${val.split(/\\s+/).length} | الحالة: نشط وقيد التشغيل.\`;
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}`,
    },
  ];
}

export async function buildProject(options: BuildProjectOptions): Promise<BuildProjectResult> {
  const { projectName, template = "web-dashboard", description, baseFolder = "desktop", openInVsCode = true } = options;
  const baseDir = getProjectBasePath(baseFolder);
  const cleanName = projectName.trim().replace(/[\/\\:*?"<>|]/g, "_");
  const projectPath = path.isAbsolute(projectName) ? projectName : path.join(baseDir, cleanName);

  if (!fs.existsSync(projectPath)) {
    await mkdir(projectPath, { recursive: true });
  }

  const filesToCreate = options.files && options.files.length > 0
    ? options.files
    : generateTemplateFiles(template, cleanName, description);

  const filesCreated: string[] = [];

  for (const f of filesToCreate) {
    const fullPath = path.join(projectPath, f.relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, f.content, "utf8");
    filesCreated.push(f.relativePath);
  }

  // Open in VS Code
  if (openInVsCode) {
    try {
      const child = spawn("cmd.exe", ["/c", "start", "", "code", projectPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    } catch {}
  }

  const entryFile = filesCreated.find((f) => f.endsWith(".html") || f === "main.py" || f === "index.js") || filesCreated[0];
  const previewUrl = entryFile?.endsWith(".html") ? `/api/project/preview?project=${encodeURIComponent(cleanName)}&file=${encodeURIComponent(entryFile)}` : undefined;

  return {
    success: true,
    projectName: cleanName,
    projectPath,
    fileCount: filesCreated.length,
    previewUrl,
    entryFile,
    message: `تم بنجاح بناء وتطوير مشروع «${cleanName}» في: ${projectPath}\nتم إنشاء ${filesCreated.length} ملفات جاهزة للتشغيل والمعاينة المباشرة.`,
    filesCreated,
  };
}

export async function getProjectFileContent(projectName: string, relativeFile: string = "index.html"): Promise<{ found: boolean; content: string; contentType: string }> {
  const baseDir = getProjectBasePath("desktop");
  const projectPath = path.join(baseDir, projectName);
  const targetFile = path.resolve(projectPath, relativeFile);

  // Security check: ensure targetFile stays within projectPath
  if (!targetFile.startsWith(projectPath)) {
    return { found: false, content: "Access Denied", contentType: "text/plain" };
  }

  if (!fs.existsSync(targetFile)) {
    return { found: false, content: "File Not Found", contentType: "text/plain" };
  }

  const ext = path.extname(targetFile).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".py": "text/plain; charset=utf-8",
  };

  const buffer = await readFile(targetFile);
  return {
    found: true,
    content: buffer.toString("utf8"),
    contentType: mimeTypes[ext] || "text/plain; charset=utf-8",
  };
}

export async function listBuiltProjects(): Promise<Array<{ name: string; path: string; hasPreview: boolean; modifiedAt: string }>> {
  const baseDir = getProjectBasePath("desktop");
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(baseDir, entry.name);
      const hasHtml = fs.existsSync(path.join(full, "index.html"));
      const hasPy = fs.existsSync(path.join(full, "main.py"));
      const hasJs = fs.existsSync(path.join(full, "package.json")) || fs.existsSync(path.join(full, "app.js"));

      if (hasHtml || hasPy || hasJs) {
        const fileStat = await stat(full);
        results.push({
          name: entry.name,
          path: full,
          hasPreview: hasHtml,
          modifiedAt: fileStat.mtime.toISOString(),
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}
