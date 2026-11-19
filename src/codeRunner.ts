import { exec, spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type CommandResult = {
  success: boolean;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export type ProjectFile = {
  relativePath: string;
  content: string;
};

const BLOCKED_COMMANDS = [
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\brmdir\s+\/s\s+\/q\s+[c-z]:\\(?:windows|program files)?/i,
  /\bdel\s+\/f\s+\/s\s+\/q\s+[c-z]:\\(?:windows)?/i,
  /\bshutdown\s+\/[s|r]/i,
];

function resolveWorkingDirectory(cwdInput?: string): string {
  const home = os.homedir();
  if (!cwdInput || !cwdInput.trim()) {
    return path.join(home, "Desktop");
  }

  let clean = cwdInput.trim().replace(/^['"]|['"]$/g, "");
  if (clean.toLowerCase().startsWith("desktop/") || clean.toLowerCase().startsWith("desktop\\")) {
    clean = path.join(home, "Desktop", clean.replace(/^desktop[\/\\]/i, ""));
  } else if (clean.toLowerCase().startsWith("downloads/") || clean.toLowerCase().startsWith("downloads\\")) {
    clean = path.join(home, "Downloads", clean.replace(/^downloads[\/\\]/i, ""));
  } else if (clean.toLowerCase().startsWith("documents/") || clean.toLowerCase().startsWith("documents\\")) {
    clean = path.join(home, "Documents", clean.replace(/^documents[\/\\]/i, ""));
  } else if (clean === "." || clean.toLowerCase() === "project" || clean.toLowerCase() === "المشروع") {
    clean = process.cwd();
  }

  const finalPath = path.isAbsolute(clean) ? clean : path.join(home, "Desktop", clean);
  return finalPath;
}

export async function executeTerminalCommand(
  rawCommand: string,
  cwdInput?: string,
  timeoutMs: number = 45_000
): Promise<CommandResult> {
  const startedAt = Date.now();
  const trimmed = rawCommand.trim();

  // Safety filter
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(trimmed)) {
      return {
        success: false,
        command: trimmed,
        cwd: cwdInput || "Desktop",
        stdout: "",
        stderr: "⚠️ تم حظر هذا الأمر لأسباب أمنية (أمر تدميري محظور للنظام).",
        exitCode: 1,
        durationMs: 0,
      };
    }
  }

  const workingDir = resolveWorkingDirectory(cwdInput);

  if (!existsSync(workingDir)) {
    try {
      await mkdir(workingDir, { recursive: true });
    } catch {
      // Continue, let command handle it or report error
    }
  }

  // Smart CLI Aliases for Windows:
  // 1. "python script.py" -> "py script.py" (to bypass MS store alias)
  let cmdToRun = trimmed;
  if (/^python\s+/i.test(cmdToRun)) {
    cmdToRun = cmdToRun.replace(/^python\s+/i, "py ");
  } else if (/^python$/i.test(cmdToRun)) {
    cmdToRun = "py";
  }

  // 2. npm/npx on Windows .cmd
  if (/^npm\s+/i.test(cmdToRun)) {
    cmdToRun = cmdToRun.replace(/^npm\s+/i, "npm.cmd ");
  }
  if (/^npx\s+/i.test(cmdToRun)) {
    cmdToRun = cmdToRun.replace(/^npx\s+/i, "npx.cmd ");
  }

  return new Promise((resolve) => {
    // Force UTF-8 in Windows console and Python runtime
    const psCommand = `$env:PYTHONIOENCODING='utf-8'; $env:PYTHONUTF8='1'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; chcp 65001 >$null; ${cmdToRun}`;
    const child = exec(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psCommand.replace(/"/g, '\\"')}"`,
      {
        cwd: workingDir,
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024, // 5 MB output
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startedAt;
        const exitCode = error ? (error.code ?? 1) : 0;
        const success = exitCode === 0;

        resolve({
          success,
          command: trimmed,
          cwd: workingDir,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          durationMs,
        });
      }
    );
  });
}

export async function createFullProject(options: {
  projectName: string;
  files: ProjectFile[];
  baseFolder?: "desktop" | "downloads" | "documents";
  openInVsCode?: boolean;
}): Promise<{ success: boolean; message: string; projectPath: string; fileCount: number }> {
  const home = os.homedir();
  let base = path.join(home, "Desktop");
  if (options.baseFolder === "downloads") base = path.join(home, "Downloads");
  if (options.baseFolder === "documents") base = path.join(home, "Documents");

  const projectPath = path.isAbsolute(options.projectName)
    ? options.projectName
    : path.join(base, options.projectName);

  try {
    await mkdir(projectPath, { recursive: true });

    let count = 0;
    for (const file of options.files) {
      const fullFilePath = path.join(projectPath, file.relativePath);
      await mkdir(path.dirname(fullFilePath), { recursive: true });
      await writeFile(fullFilePath, file.content, "utf8");
      count++;
    }

    if (options.openInVsCode !== false) {
      const child = spawn("code.cmd", [projectPath], {
        detached: true,
        stdio: "ignore",
        shell: true,
      });
      child.unref();
    }

    return {
      success: true,
      message: `تم إنشاء المشروع بنجاح في: ${projectPath} وتجهيز ${count} ملف، وتم فتحه في Visual Studio Code.`,
      projectPath,
      fileCount: count,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر إنشاء المشروع: ${err.message}`,
      projectPath,
      fileCount: 0,
    };
  }
}

export async function readProjectTree(dirPath: string, maxDepth: number = 3): Promise<string[]> {
  const results: string[] = [];
  const target = resolveWorkingDirectory(dirPath);

  async function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const items = await readdir(current);
      for (const item of items) {
        if (item === "node_modules" || item === ".git" || item === "dist") continue;
        const full = path.join(current, item);
        const s = await stat(full);
        const rel = path.relative(target, full);
        if (s.isDirectory()) {
          results.push(`📁 ${rel}/`);
          await walk(full, depth + 1);
        } else {
          results.push(`📄 ${rel}`);
        }
      }
    } catch {
      // Ignore unreadable
    }
  }

  await walk(target, 1);
  return results;
}
