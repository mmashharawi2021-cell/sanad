import { exec, execFile } from "node:child_process";
import fs from "node:fs";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ShellType = "powershell" | "cmd" | "python" | "node" | "git";

export type UniversalCommandResult = {
  success: boolean;
  command: string;
  shell: ShellType;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  diagnosis?: string;
  suggestedFix?: string;
};

const BLOCKED_COMMANDS = [
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\brmdir\s+\/s\s+\/q\s+[c-z]:\\(?:windows|program files)?/i,
  /\bdel\s+\/f\s+\/s\s+\/q\s+[c-z]:\\(?:windows)?/i,
  /\bshutdown\s+\/[s|r]/i,
];

export function resolveWorkingDir(cwdInput?: string): string {
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

  return path.isAbsolute(clean) ? clean : path.join(home, "Desktop", clean);
}

function diagnoseError(shell: ShellType, command: string, stderr: string): { diagnosis: string; suggestedFix?: string } | undefined {
  if (!stderr) return undefined;

  // 1. Python Module Not Found
  const modMatch = stderr.match(/ModuleNotFoundError:\s+No module named\s+'([^']+)'/i);
  if (modMatch) {
    const mod = modMatch[1];
    return {
      diagnosis: `المكتبة البرمجية "${mod}" غير مثبتة في بيئة بايثون الحالية.`,
      suggestedFix: `py -m pip install ${mod}`,
    };
  }

  // 2. Python Syntax Error
  if (/SyntaxError:/i.test(stderr)) {
    return {
      diagnosis: "يوجد خطأ في بناء الجملة البرمجية (Syntax Error) في كود بايثون.",
      suggestedFix: "تحقق من الأقواس المفتوحة أو المسافات البادئة (Indentation) في الكود.",
    };
  }

  // 3. Command Not Found in PowerShell / CMD
  if (/is not recognized as the name of a cmdlet|is not recognized as an internal or external command/i.test(stderr)) {
    const cmdName = command.trim().split(/\s+/)[0];
    return {
      diagnosis: `الأمر أو البرنامج "${cmdName}" غير مثبت في مسار النظام (PATH) أو لم يتم التعرف عليه.`,
      suggestedFix: `تأكد من تثبيت ${cmdName} أو إضافة مساره إلى متغيرات البيئة.`,
    };
  }

  // 4. Git Not a repository
  if (/fatal:\s+not a git repository/i.test(stderr)) {
    return {
      diagnosis: "المجلد الحالي ليس مستودع Git.",
      suggestedFix: "git init",
    };
  }

  // 5. NPM package not found / lockfile issue
  if (/npm ERR!\s+code\s+ENOENT/i.test(stderr)) {
    return {
      diagnosis: "ملف package.json غير موجود في هذا المجلد.",
      suggestedFix: "npm init -y",
    };
  }

  return undefined;
}

export async function runUniversalCommand(options: {
  command: string;
  shell?: ShellType;
  cwd?: string;
  timeoutMs?: number;
}): Promise<UniversalCommandResult> {
  const { command, shell = "powershell", cwd, timeoutMs = 45_000 } = options;
  const startedAt = Date.now();
  const trimmed = command.trim();

  // Security check
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(trimmed)) {
      return {
        success: false,
        command: trimmed,
        shell,
        cwd: cwd || "Desktop",
        stdout: "",
        stderr: "⚠️ تم حظر هذا الأمر لأسباب أمنية (أمر تدميري محظور للنظام).",
        exitCode: 1,
        durationMs: 0,
        diagnosis: "أمر محظور أمنياً لحماية النظام.",
      };
    }
  }

  const workingDir = resolveWorkingDir(cwd);
  if (!fs.existsSync(workingDir)) {
    try {
      await mkdir(workingDir, { recursive: true });
    } catch {}
  }

  let tempScriptPath: string | null = null;

  try {
    let finalExec: { cmd: string; args: string[] };

    if (shell === "python") {
      // If multiline code or complex expression, execute via temp python file
      if (trimmed.includes("\n") || trimmed.includes(";") || trimmed.length > 80) {
        tempScriptPath = path.join(os.tmpdir(), `sanad_run_${Date.now()}.py`);
        await writeFile(tempScriptPath, trimmed, "utf-8");
        finalExec = { cmd: "py", args: ["-u", tempScriptPath] };
      } else {
        finalExec = { cmd: "py", args: ["-c", trimmed] };
      }
    } else if (shell === "node") {
      if (trimmed.includes("\n") || trimmed.length > 80) {
        tempScriptPath = path.join(os.tmpdir(), `sanad_run_${Date.now()}.js`);
        await writeFile(tempScriptPath, trimmed, "utf-8");
        finalExec = { cmd: "node", args: [tempScriptPath] };
      } else {
        finalExec = { cmd: "node", args: ["-e", trimmed] };
      }
    } else if (shell === "cmd") {
      finalExec = { cmd: "cmd.exe", args: ["/c", `chcp 65001 >nul && ${trimmed}`] };
    } else if (shell === "git") {
      const gitArgs = trimmed.startsWith("git ") ? trimmed.slice(4).trim().split(/\s+/) : trimmed.split(/\s+/);
      finalExec = { cmd: "git", args: gitArgs };
    } else {
      // Default: PowerShell with UTF-8
      const psCommand = `$env:PYTHONIOENCODING='utf-8'; $env:PYTHONUTF8='1'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; chcp 65001 >$null; ${trimmed}`;
      finalExec = {
        cmd: "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
      };
    }

    return await new Promise<UniversalCommandResult>((resolve) => {
      execFile(
        finalExec.cmd,
        finalExec.args,
        {
          cwd: workingDir,
          timeout: timeoutMs,
          maxBuffer: 6 * 1024 * 1024,
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONUTF8: "1",
          },
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startedAt;
          const exitCode = error ? (error.code ?? 1) : 0;
          const success = exitCode === 0;
          const errText = (stderr || "").trim();
          const outText = (stdout || "").trim();

          const diag = !success ? diagnoseError(shell, trimmed, errText || outText) : undefined;

          resolve({
            success,
            command: trimmed,
            shell,
            cwd: workingDir,
            stdout: outText,
            stderr: errText,
            exitCode: typeof exitCode === "number" ? exitCode : 1,
            durationMs,
            diagnosis: diag?.diagnosis,
            suggestedFix: diag?.suggestedFix,
          });
        }
      );
    });
  } finally {
    if (tempScriptPath && fs.existsSync(tempScriptPath)) {
      try {
        await unlink(tempScriptPath);
      } catch {}
    }
  }
}
