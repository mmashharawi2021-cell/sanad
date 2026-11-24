import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isProtectedProcessName, killProcess } from "./processMaestro";

const execFileAsync = promisify(execFile);

export type PortProtocol = "TCP" | "UDP";

export type ListeningPort = {
  port: number;
  protocol: PortProtocol;
  localAddress: string;
  pid: number;
  processName: string;
  processPath: string;
  label: string | null;
  isDevPort: boolean;
  isProtected: boolean;
};

export type PortCheckResult = {
  port: number;
  inUse: boolean;
  holders: ListeningPort[];
  message: string;
};

export type KillPortResult = {
  success: boolean;
  port: number;
  killed: { pid: number; processName: string }[];
  skipped: { pid: number; processName: string; reason: string }[];
  message: string;
};

export type PingResult = {
  success: boolean;
  host: string;
  sent: number;
  received: number;
  lossPercent: number;
  minMs: number | null;
  avgMs: number | null;
  maxMs: number | null;
  quality: "ممتاز" | "جيد" | "متوسط" | "ضعيف" | "منقطع";
  message: string;
};

export type NetworkAdapterInfo = {
  name: string;
  description: string;
  type: "Wi-Fi" | "Ethernet" | "Other";
  status: string;
  linkSpeed: string;
  macAddress: string;
  ipv4: string[];
  ipv6: string[];
  gateway: string | null;
  dns: string[];
  networkName: string | null;
};

export type NetworkInfo = {
  hostname: string;
  adapters: NetworkAdapterInfo[];
  primaryLocalIp: string | null;
  publicIp: string | null;
  message: string;
};

/** Well-known developer ports and the services that usually own them. */
const DEV_PORT_LABELS: Record<number, string> = {
  80: "HTTP",
  443: "HTTPS",
  1433: "SQL Server",
  3000: "Node / React / Next.js",
  3001: "Node (alt)",
  3306: "MySQL",
  4200: "Angular",
  5000: "Flask / .NET",
  5173: "Vite",
  5432: "PostgreSQL",
  5500: "Live Server",
  6379: "Redis",
  8000: "Django / FastAPI",
  8080: "HTTP (alt) / Tomcat",
  8081: "Metro / HTTP (alt)",
  8888: "Jupyter",
  9000: "PHP-FPM / SonarQube",
  9229: "Node Inspector",
  11434: "Ollama",
  27017: "MongoDB",
};


function isValidPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function parsePort(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return isValidPort(n) ? n : null;
}

/** Hostname / IPv4 / IPv6 only — blocks any shell metacharacters. */
function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  return /^[A-Za-z0-9.\-:]+$/.test(host);
}

function isProtected(pid: number, processName: string): boolean {
  // قائمة الحماية نفسها التي يستخدمها killProcess (مصدر واحد)
  if (pid <= 4 || pid === process.pid || pid === process.ppid) return true;
  return isProtectedProcessName(processName);
}

/**
 * Run a multi-line PowerShell script. -EncodedCommand (UTF-16LE base64) avoids Windows
 * command-line quoting/newline truncation that breaks multi-line `-Command` scripts.
 */
async function runPs(script: string, timeout = 8000): Promise<string> {
  const wrapped = `$ProgressPreference = 'SilentlyContinue'\n[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false\n${script}`;
  const encoded = Buffer.from(wrapped, "utf16le").toString("base64");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
  );
  return stdout.replace(/^﻿/, "").trim();
}

function parseJsonArray<T>(raw: string): T[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as T | T[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

type RawPortRow = { Port: number; Protocol: PortProtocol; Address: string; Pid: number; Name: string; Path: string };

function toListeningPort(row: RawPortRow): ListeningPort {
  const pid = Number(row.Pid) || 0;
  const processName = String(row.Name || (pid === 4 ? "System" : "غير معروف"));
  const label = DEV_PORT_LABELS[row.Port] ?? null;
  return {
    port: Number(row.Port),
    protocol: row.Protocol,
    localAddress: String(row.Address || ""),
    pid,
    processName,
    processPath: String(row.Path || ""),
    label,
    isDevPort: label !== null,
    isProtected: isProtected(pid, processName),
  };
}

/* ------------------------------------------------------------------------------------------
 * Fast path. Measured on this laptop: netstat ≈ 35 ms, `tasklist` (all) ≈ 600 ms, `tasklist`
 * for one PID ≈ 190 ms, PowerShell Get-NetTCPConnection + Get-Process ≈ 1.8 s.
 * So: netstat every time, process names from a short-lived cache, single-PID lookups for new PIDs.
 * ---------------------------------------------------------------------------------------- */

const NAME_TTL_MS = 15_000;
let nameCache: { map: Map<number, string>; at: number } = { map: new Map(), at: 0 };
let nameRefresh: Promise<void> | null = null;

/** Parse `tasklist /fo csv /nh` → PID → process name (without ".exe"). */
function parseTasklistCsv(stdout: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (m && m[1] && m[2]) map.set(Number(m[2]), m[1].replace(/\.exe$/i, ""));
  }
  return map;
}

function refreshProcessNames(): Promise<void> {
  if (nameRefresh) return nameRefresh;
  nameRefresh = execFileAsync("tasklist.exe", ["/fo", "csv", "/nh"], { timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    .then(({ stdout }) => {
      nameCache = { map: parseTasklistCsv(stdout), at: Date.now() };
    })
    .finally(() => {
      nameRefresh = null;
    });
  return nameRefresh;
}

/** Look up one PID right now (never from cache) — used before killing, where the name decides protection. */
async function lookupProcessName(pid: number): Promise<string | null> {
  if (pid === 0) return "Idle";
  if (pid === 4) return "System";
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/fo", "csv", "/nh", "/fi", `PID eq ${pid}`], { timeout: 5000, windowsHide: true });
    const name = parseTasklistCsv(stdout).get(pid) ?? null;
    if (name) nameCache.map.set(pid, name);
    return name;
  } catch {
    return null;
  }
}

/** Names for the given PIDs: cached when fresh, few unknown PIDs looked up one by one, many → full refresh. */
async function namesFor(pids: number[]): Promise<Map<number, string>> {
  if (Date.now() - nameCache.at > NAME_TTL_MS && pids.length > 3) await refreshProcessNames().catch(() => undefined);
  const missing = [...new Set(pids)].filter((p) => p !== 0 && p !== 4 && !nameCache.map.has(p));
  if (missing.length > 3) await refreshProcessNames().catch(() => undefined);
  else if (missing.length) await Promise.all(missing.map(lookupProcessName));
  return nameCache.map;
}

/** Listening TCP ports (and bound UDP) from netstat, with process names. */
async function listPortsViaNetstat(): Promise<ListeningPort[]> {
  const rows = await netstatRows();
  const names = await namesFor(rows.map((r) => r.Pid));
  return rows.map((r) => toListeningPort({ ...r, Name: names.get(r.Pid) ?? "" }));
}

async function netstatRows(): Promise<RawPortRow[]> {
  const { stdout } = await execFileAsync("netstat.exe", ["-ano"], { timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const rows: RawPortRow[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    const proto = parts[0];
    const m = (parts[1] ?? "").match(/^(.*):(\d+)$/);
    if (!m) continue;
    const address = m[1] ?? "";
    const port = Number(m[2]);
    // TCP rows: proto local foreign STATE pid — only LISTENING. UDP rows: proto local foreign pid.
    if (proto === "TCP" && parts.length >= 5 && parts[3] === "LISTENING") {
      rows.push({ Port: port, Protocol: "TCP", Address: address, Pid: Number(parts[4]), Name: "", Path: "" });
    } else if (proto === "UDP" && parts.length >= 4) {
      rows.push({ Port: port, Protocol: "UDP", Address: address, Pid: Number(parts[parts.length - 1]), Name: "", Path: "" });
    }
  }
  return rows;
}

function dedupeAndSort(ports: ListeningPort[]): ListeningPort[] {
  const seen = new Map<string, ListeningPort>();
  for (const p of ports) {
    const key = `${p.protocol}:${p.port}:${p.pid}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()].sort((a, b) => {
    if (a.isDevPort !== b.isDevPort) return a.isDevPort ? -1 : 1;
    if (a.protocol !== b.protocol) return a.protocol === "TCP" ? -1 : 1;
    return a.port - b.port;
  });
}

/**
 * List all listening TCP ports and bound UDP endpoints with their owning process.
 */
export async function listListeningPorts(options?: { includeUdp?: boolean }): Promise<ListeningPort[]> {
  const includeUdp = options?.includeUdp ?? true;
  try {
    const ports = await listPortsViaNetstat();
    if (ports.length) return dedupeAndSort(includeUdp ? ports : ports.filter((p) => p.protocol === "TCP"));
  } catch {
    // fall through to PowerShell
  }
  return listPortsViaPowerShell(includeUdp);
}

/** Slower fallback (≈1.8 s) that also returns process paths. */
async function listPortsViaPowerShell(includeUdp: boolean): Promise<ListeningPort[]> {
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = @{}
Get-Process | ForEach-Object { $procs[[int]$_.Id] = $_ }
$rows = @(Get-NetTCPConnection -State Listen | ForEach-Object {
  $p = $procs[[int]$_.OwningProcess]
  [pscustomobject]@{ Port = [int]$_.LocalPort; Protocol = 'TCP'; Address = [string]$_.LocalAddress; Pid = [int]$_.OwningProcess; Name = [string]$p.ProcessName; Path = [string]$p.Path }
})
${includeUdp ? `$rows += @(Get-NetUDPEndpoint | ForEach-Object {
  $p = $procs[[int]$_.OwningProcess]
  [pscustomobject]@{ Port = [int]$_.LocalPort; Protocol = 'UDP'; Address = [string]$_.LocalAddress; Pid = [int]$_.OwningProcess; Name = [string]$p.ProcessName; Path = [string]$p.Path }
})` : ""}
ConvertTo-Json -InputObject $rows -Compress
`;
  try {
    const raw = await runPs(psScript, 12000);
    return dedupeAndSort(parseJsonArray<RawPortRow>(raw).map(toListeningPort));
  } catch {
    return [];
  }
}

/** Ports held on one port number, with names looked up fresh (not from cache). */
async function holdersOf(port: number): Promise<ListeningPort[]> {
  try {
    const rows = (await netstatRows()).filter((r) => r.Port === port);
    // one fresh lookup per distinct PID (IPv4 + IPv6 rows share a PID), in parallel
    const pids = [...new Set(rows.map((r) => r.Pid))];
    const names = new Map(await Promise.all(pids.map(async (pid) => [pid, (await lookupProcessName(pid)) ?? ""] as const)));
    return dedupeAndSort(rows.map((r) => toListeningPort({ ...r, Name: names.get(r.Pid) ?? "" })));
  } catch {
    return (await listPortsViaPowerShell(true)).filter((p) => p.port === port);
  }
}

/**
 * Check whether a specific port is currently held, and by whom.
 */
export async function checkPort(portInput: unknown): Promise<PortCheckResult> {
  const port = parsePort(portInput);
  if (port === null) {
    return { port: Number(portInput) || 0, inUse: false, holders: [], message: "رقم المنفذ غير صالح (يجب أن يكون بين 1 و 65535)." };
  }
  const holders = await holdersOf(port);
  if (holders.length === 0) {
    return { port, inUse: false, holders, message: `المنفذ ${port} متاح وغير محجوز ✅` };
  }
  const names = [...new Set(holders.map((h) => `${h.processName} (PID ${h.pid})`))].join("، ");
  return { port, inUse: true, holders, message: `المنفذ ${port} محجوز بواسطة: ${names}` };
}

/**
 * Terminate whatever process holds a port (fixes EADDRINUSE). Protected system processes are skipped.
 */
export async function killPort(portInput: unknown): Promise<KillPortResult> {
  const port = parsePort(portInput);
  if (port === null) {
    return { success: false, port: Number(portInput) || 0, killed: [], skipped: [], message: "رقم المنفذ غير صالح (يجب أن يكون بين 1 و 65535)." };
  }

  const { holders } = await checkPort(port);
  if (holders.length === 0) {
    return { success: true, port, killed: [], skipped: [], message: `المنفذ ${port} حر أصلاً، لا توجد عملية تحتجزه ✅` };
  }

  const uniqueByPid = new Map<number, ListeningPort>();
  for (const h of holders) uniqueByPid.set(h.pid, h);

  const killed: KillPortResult["killed"] = [];
  const skipped: KillPortResult["skipped"] = [];

  for (const h of uniqueByPid.values()) {
    if (h.isProtected) {
      const reason = h.pid === process.pid ? "هذه عملية خادم سند نفسه" : "عملية نظام محمية";
      skipped.push({ pid: h.pid, processName: h.processName, reason });
      continue;
    }
    const result = await killProcess(h.pid);
    if (result.success) killed.push({ pid: h.pid, processName: h.processName });
    else skipped.push({ pid: h.pid, processName: h.processName, reason: result.message });
  }

  const success = killed.length > 0 && skipped.length === 0;
  let message: string;
  if (killed.length > 0) {
    message = `تم تحرير المنفذ ${port} بإنهاء: ${killed.map((k) => `${k.processName} (PID ${k.pid})`).join("، ")} 🛑`;
    if (skipped.length > 0) message += ` — وتم تخطي: ${skipped.map((s) => `${s.processName} (${s.reason})`).join("، ")}`;
  } else {
    message = `تعذر تحرير المنفذ ${port}: ${skipped.map((s) => `${s.processName} (PID ${s.pid}) — ${s.reason}`).join("، ")}`;
  }
  return { success, port, killed, skipped, message };
}

function rateLatency(avgMs: number | null, lossPercent: number): PingResult["quality"] {
  if (avgMs === null || lossPercent >= 100) return "منقطع";
  if (lossPercent >= 25 || avgMs > 200) return "ضعيف";
  if (avgMs > 100) return "متوسط";
  if (avgMs > 40) return "جيد";
  return "ممتاز";
}

/**
 * Measure latency to a host using .NET Ping (locale-independent, no ping.exe output parsing).
 */
export async function pingHost(hostInput?: string, count = 4): Promise<PingResult> {
  const host = String(hostInput || "8.8.8.8").trim();
  const sent = Math.min(Math.max(Math.trunc(count) || 4, 1), 10);
  const empty = { host, sent, received: 0, lossPercent: 100, minMs: null, avgMs: null, maxMs: null };

  if (!isValidHost(host)) {
    return { success: false, ...empty, quality: "منقطع", message: "اسم المضيف أو عنوان IP غير صالح." };
  }

  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$ping = New-Object System.Net.NetworkInformation.Ping
$times = @()
for ($i = 0; $i -lt ${sent}; $i++) {
  try { $r = $ping.Send('${host}', 2000); if ($r.Status -eq 'Success') { $times += [int]$r.RoundtripTime } } catch {}
}
ConvertTo-Json -InputObject @($times) -Compress
`;
  try {
    const raw = await runPs(psScript, sent * 2500 + 4000);
    const times = parseJsonArray<number>(raw).map(Number).filter((n) => Number.isFinite(n));
    const received = times.length;
    const lossPercent = Math.round(((sent - received) / sent) * 100);
    const minMs = received ? Math.min(...times) : null;
    const maxMs = received ? Math.max(...times) : null;
    const avgMs = received ? Math.round(times.reduce((a, b) => a + b, 0) / received) : null;
    const quality = rateLatency(avgMs, lossPercent);
    const message =
      received === 0
        ? `لا يوجد رد من ${host} — الاتصال منقطع أو المضيف لا يستجيب ❌`
        : `زمن الاستجابة إلى ${host}: متوسط ${avgMs}ms (أدنى ${minMs}ms / أقصى ${maxMs}ms)، فقدان ${lossPercent}% — الجودة: ${quality}`;
    return { success: received > 0, host, sent, received, lossPercent, minMs, avgMs, maxMs, quality, message };
  } catch (err) {
    return { success: false, ...empty, quality: "منقطع", message: `تعذر فحص الاتصال: ${(err as Error).message}` };
  }
}

let publicIpCache: { ip: string; at: number } | null = null;
const PUBLIC_IP_TTL_MS = 5 * 60 * 1000;

/** Public IP via api.ipify.org (fallback: icanhazip.com), cached for 5 minutes. */
export async function getPublicIp(force = false): Promise<string | null> {
  if (!force && publicIpCache && Date.now() - publicIpCache.at < PUBLIC_IP_TTL_MS) return publicIpCache.ip;
  const sources = ["https://api.ipify.org", "https://icanhazip.com"];
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const ip = (await res.text()).trim();
      if (!/^[0-9a-fA-F.:]{3,45}$/.test(ip)) continue;
      publicIpCache = { ip, at: Date.now() };
      return ip;
    } catch {
      // try next source
    }
  }
  return null;
}

type RawAdapter = {
  Name: string;
  Description: string;
  Status: string;
  LinkSpeed: string;
  Mac: string;
  Media: string;
  IPv4: string[] | string | null;
  IPv6: string[] | string | null;
  Gateway: string | null;
  Dns: string[] | string | null;
  Profile: string | null;
};

function toArray(v: string[] | string | null | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean).map(String);
}

/**
 * Adapter details (type, speed, MAC, IPs, gateway, DNS, Wi-Fi network name) plus public IP.
 */
export async function getNetworkInfo(): Promise<NetworkInfo> {
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$out = @(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  $a = $_
  $cfg = Get-NetIPConfiguration -InterfaceIndex $a.ifIndex
  [pscustomobject]@{
    Name = [string]$a.Name
    Description = [string]$a.InterfaceDescription
    Status = [string]$a.Status
    LinkSpeed = [string]$a.LinkSpeed
    Mac = [string]$a.MacAddress
    Media = [string]$a.PhysicalMediaType
    IPv4 = @($cfg.IPv4Address | ForEach-Object { [string]$_.IPAddress })
    IPv6 = @($cfg.IPv6Address | ForEach-Object { [string]$_.IPAddress })
    Gateway = [string]($cfg.IPv4DefaultGateway | Select-Object -First 1).NextHop
    Dns = @($cfg.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses } | Select-Object -Unique)
    Profile = [string]$cfg.NetProfile.Name
  }
})
ConvertTo-Json -InputObject $out -Compress -Depth 4
`;
  const hostname = process.env.COMPUTERNAME || "";
  const [adaptersRaw, publicIp] = await Promise.all([
    runPs(psScript, 10000).then((raw) => parseJsonArray<RawAdapter>(raw)).catch(() => [] as RawAdapter[]),
    getPublicIp(),
  ]);

  const adapters: NetworkAdapterInfo[] = adaptersRaw.map((a) => {
    const text = `${a.Media} ${a.Name} ${a.Description}`.toLowerCase();
    const type: NetworkAdapterInfo["type"] = /802\.11|wi-?fi|wireless|wlan/.test(text) ? "Wi-Fi" : /802\.3|ethernet/.test(text) ? "Ethernet" : "Other";
    return {
      name: String(a.Name || ""),
      description: String(a.Description || ""),
      type,
      status: String(a.Status || ""),
      linkSpeed: String(a.LinkSpeed || ""),
      macAddress: String(a.Mac || ""),
      ipv4: toArray(a.IPv4),
      ipv6: toArray(a.IPv6),
      gateway: a.Gateway ? String(a.Gateway) : null,
      dns: toArray(a.Dns),
      networkName: a.Profile ? String(a.Profile) : null,
    };
  });

  // Primary = adapter with a default gateway, preferring physical Wi-Fi/Ethernet.
  const primary =
    adapters.find((a) => a.gateway && a.type !== "Other" && a.ipv4.length) ??
    adapters.find((a) => a.gateway && a.ipv4.length) ??
    adapters.find((a) => a.ipv4.length);
  const primaryLocalIp = primary?.ipv4[0] ?? null;

  const message = primary
    ? `متصل عبر ${primary.type} «${primary.networkName || primary.name}» بسرعة ${primary.linkSpeed} — IP المحلي: ${primaryLocalIp}${publicIp ? ` — IP العام: ${publicIp}` : ""}`
    : "لا يوجد اتصال شبكة نشط حالياً ❌";

  return { hostname, adapters, primaryLocalIp, publicIp, message };
}
