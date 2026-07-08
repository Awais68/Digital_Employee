import os from "os";
import net from "net";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);
const VAULT_PATH = process.env.VAULT_PATH || path.join(process.cwd(), '../..');

// Service status tracking with realistic checks
const servicesConfig = [
  { name: "Odoo MCP", process: "odoo_mcp.py", type: "python" },
  { name: "Email MCP", process: "email_mcp.py", type: "python" },
  { name: "Gmail Watcher", process: "gmail_watcher.py", type: "python" },
  // WhatsApp is NOT a standalone process anymore — the Python whatsapp_watcher.py
  // was removed 2026-07-08 and WhatsApp now runs as an embedded whatsapp-web.js
  // client inside this server (services/whatsappService.js). pgrep-ing for the old
  // process always returned offline → a permanent false-red tile. Check the live
  // client status instead. type:"embedded" is handled specially in getServiceStatus.
  { name: "WhatsApp Watcher", type: "embedded", statusFn: getWhatsAppStatus },
  { name: "LinkedIn MCP", process: "linkedin_mcp.py", type: "python" },
  { name: "Instagram Bot", process: "instagram", type: "python", checkLogs: ["instagram", "insta"] },
  { name: "Facebook Bot", process: "facebook", type: "python", checkLogs: ["facebook", "fb", "meta"] },
];

// Live status of the embedded WhatsApp client. Re-probed on every request (no boot
// latch): reads the current module-level status var from whatsappService. Maps the
// client's connection lifecycle onto the dashboard's running/warning/offline states.
async function getWhatsAppStatus() {
  try {
    const ws = await import("./services/whatsappService.js");
    const s = ws.getStatus(); // 'connected'|'authenticated'|'qr_pending'|'auth_failed'|'disconnected'|'error'
    if (s === "connected") return "running";
    // Reachable but not fully ready (needs QR scan / mid-auth) → warning, not red.
    if (s === "authenticated" || s === "qr_pending") return "warning";
    return "offline";
  } catch {
    return "offline";
  }
}

// ─── Service Status ───────────────────────────────────────────────────────────

export async function getServiceStatus() {
  const statuses = await Promise.all(
    servicesConfig.map(async (svc) => {
      try {
        // Embedded services (e.g. the in-process WhatsApp client) have no OS
        // process to pgrep — probe their live status function each request.
        if (svc.type === "embedded") {
          const status = await svc.statusFn();
          return {
            name: svc.name,
            status,
            uptime: status === "running" ? "Active" : "—",
            lastActivity: status === "offline" ? "—" : "live",
          };
        }

        // Check if process is running
        const { stdout } = await execAsync(`pgrep -f ${svc.process}`).catch(
          () => ({ stdout: "" }),
        );
        const isRunning = stdout.trim().length > 0;

        let lastActivity = "—";
        let details = null;

        // Check log files for activity
        const logDir = path.join(VAULT_PATH, "Logs");
        if (fs.existsSync(logDir)) {
          const logFiles = fs.readdirSync(logDir);
          const relevantLogs = logFiles.filter(f => {
            if (svc.checkLogs) {
              return svc.checkLogs.some(kw => f.toLowerCase().includes(kw));
            }
            return f.toLowerCase().includes(svc.name.toLowerCase().replace(/ /g, "_"));
          });

          for (const logFile of relevantLogs) {
            const logPath = path.join(logDir, logFile);
            try {
              const stat = fs.statSync(logPath);
              const age = Date.now() - stat.mtimeMs;
              if (age < Date.now() - stat.mtimeMs || lastActivity === "—") {
                lastActivity = formatTime(age);
                details = logFile;
              }
            } catch {}
          }
        }

        // Also check main service log
        const mainLogFile = path.join(
          logDir,
          `${svc.name.toLowerCase().replace(/ /g, "_")}.log`,
        );
        if (fs.existsSync(mainLogFile)) {
          const stat = fs.statSync(mainLogFile);
          lastActivity = formatTime(Date.now() - stat.mtimeMs);
          if (!details) details = path.basename(mainLogFile);
        }

        return {
          name: svc.name,
          status: isRunning ? "running" : "offline",
          uptime: isRunning ? "Active" : "—",
          lastActivity,
        };
      } catch (err) {
        return {
          name: svc.name,
          status: "offline",
          uptime: "—",
          lastActivity: "—",
        };
      }
    }),
  );
  return statuses;
}

// ─── System Metrics ───────────────────────────────────────────────────────────

// CPU usage % computed from /proc-style cpu time deltas between calls
let _prevCpuTimes = null;
function getCpuUsagePercent() {
  const cpus = os.cpus();
  const totals = cpus.reduce(
    (acc, c) => {
      acc.idle += c.times.idle;
      acc.total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
      return acc;
    },
    { idle: 0, total: 0 },
  );

  let percent = 0;
  if (_prevCpuTimes) {
    const idleDelta = totals.idle - _prevCpuTimes.idle;
    const totalDelta = totals.total - _prevCpuTimes.total;
    if (totalDelta > 0) percent = Math.round((1 - idleDelta / totalDelta) * 100);
  } else {
    // First call — fall back to 1-min load average normalized by core count
    percent = Math.min(100, Math.round((os.loadavg()[0] / cpus.length) * 100));
  }
  _prevCpuTimes = totals;
  return Math.max(0, Math.min(100, percent));
}

// Real disk usage for the root filesystem (Linux `df`) — async to avoid blocking event loop
async function getDiskMetrics() {
  try {
    const { stdout } = await execAsync("df -kP /", { timeout: 5000 });
    const out = stdout.trim().split("\n").pop();
    const parts = out.split(/\s+/);
    const totalKb = parseInt(parts[1], 10);
    const usedKb = parseInt(parts[2], 10);
    const freeKb = parseInt(parts[3], 10);
    return {
      total: Math.round(totalKb / 1024 / 1024),
      used: Math.round(usedKb / 1024 / 1024),
      free: Math.round(freeKb / 1024 / 1024),
      percent: Math.round((usedKb / (usedKb + freeKb)) * 100),
    };
  } catch (err) {
    return { total: 0, used: 0, free: 0, percent: 0 };
  }
}

export async function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();

  const disk = await getDiskMetrics();

  return {
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || "Unknown",
      percent: getCpuUsagePercent(),
      loadavg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    },
    memory: {
      total: Math.round(totalMem / 1024 / 1024 / 1024),
      used: Math.round(usedMem / 1024 / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024 / 1024),
      percent: Math.round((usedMem / totalMem) * 100),
    },
    disk,
    uptime: os.uptime(),
  };
}

// ─── VM Info (Oracle Cloud) ───────────────────────────────────────────────────

const VM_IP = process.env.VM_IP || "144.24.142.167";
const VM_REGION = process.env.VM_REGION || "Hyderabad, India (ap-hyderabad-1)";
const VM_PROVIDER = process.env.VM_PROVIDER || "Oracle Cloud";

// TCP reachability check — is the VM answering on port 80?
function checkVmReachable(ip, port = 80, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, ip);
  });
}

let _vmOnlineCache = { value: null, at: 0 };
export async function getVmInfo() {
  // Cache reachability for 15s to avoid hammering the VM
  const now = Date.now();
  if (_vmOnlineCache.value === null || now - _vmOnlineCache.at > 15000) {
    _vmOnlineCache = { value: await checkVmReachable(VM_IP), at: now };
  }

  return {
    ip: VM_IP,
    region: VM_REGION,
    provider: VM_PROVIDER,
    online: _vmOnlineCache.value,
    metrics: getSystemMetrics(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    timestamp: new Date(),
  };
}

// ─── System Health ────────────────────────────────────────────────────────────

export async function getSystemHealth() {
  const metrics = getSystemMetrics();
  const services = await getServiceStatus();

  const allRunning = services.every((s) => s.status !== "offline");
  const hasWarnings = services.some((s) => s.status === "warning");

  return {
    overall: hasWarnings ? "warning" : allRunning ? "ok" : "critical",
    metrics,
    services,
    timestamp: new Date(),
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Count files recursively ─────────────────────────────────────────────────

function countFilesRecursive(dirPath) {
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        count += countFilesRecursive(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
        count++;
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }
  return count;
}

// ─── Get all .md files recursively ────────────────────────────────────────────

function getMdFilesRecursive(dirPath) {
  const files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(...getMdFilesRecursive(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
        files.push({ name: entry.name, path: fullPath, stat: fs.statSync(fullPath) });
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }
  return files;
}

// ─── LinkedIn Post Count (real — from Done/ folder) ───────────────────────────

export function getLinkedInPostCount() {
  try {
    const donePath = path.join(VAULT_PATH, "Done");
    if (!fs.existsSync(donePath)) return 0;

    return fs
      .readdirSync(donePath)
      .filter((f) => f.toLowerCase().includes("linkedin") && f.endsWith(".md") && !f.startsWith(".")).length;
  } catch (err) {
    return 0;
  }
}

// ─── Vault Folder Counts ──────────────────────────────────────────────────────

export function getVaultCounts(forceRefresh = false) {
  const folders = [
    "Inbox",
    "Needs_Action",
    "Pending_Approval",
    "Approved",
    "Done",
    "Rejected",
    "LinkedIn",
    "Contacts",
  ];

  const counts = {};
  for (const folder of folders) {
    try {
      const folderPath = path.join(VAULT_PATH, folder);
      counts[folder] = countFilesRecursive(folderPath);
    } catch (err) {
      counts[folder] = 0;
    }
  }

  // Real LinkedIn post count from Done/
  counts.linkedInPosts = getLinkedInPostCount();

  return counts;
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

export function getRecentActivity(limit = 10) {
  try {
    const donePath = path.join(VAULT_PATH, "Done");
    if (!fs.existsSync(donePath)) return [];

    const files = getMdFilesRecursive(donePath);
    
    return files
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .slice(0, limit)
      .map((file) => ({
        filename: file.name,
        updatedAt: file.stat.mtime,
        size: file.stat.size,
      }));
  } catch (err) {
    return [];
  }
}

// ─── Pending Approvals ────────────────────────────────────────────────────────

export function getPendingApprovals() {
  try {
    const pendingPath = path.join(VAULT_PATH, "Pending_Approval");
    if (!fs.existsSync(pendingPath)) return [];

    const files = getMdFilesRecursive(pendingPath);
    
    return files
      .map((file) => ({
        id: file.name.replace(".md", ""),
        filename: file.name,
        title: file.name.replace(".md", "").replace(/_/g, " "),
        createdAt: file.stat.birthtime,
        updatedAt: file.stat.mtime,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    return [];
  }
}

// ─── Refresh & Broadcast ──────────────────────────────────────────────────────

async function getWorkerStatus() {
  const workerList = ['orchestrator', 'whatsapp_watcher', 'gmail_watcher']
  const workers = {}
  for (const name of workerList) {
    let running = false, pid = null
    try {
      const { stdout } = await execAsync(`pgrep -f "${name}\\.py"`).catch(() => ({ stdout: '' }))
      const pids = stdout.trim().split('\n').filter(Boolean).map(Number)
      if (pids.length > 0) { running = true; pid = pids[0] }
    } catch {}
    workers[name] = { name, running, pid }
  }
  return workers
}

export async function refreshAndBroadcast() {
  const vaultCounts = getVaultCounts(true);

  const data = {
    type: "dashboard_update",
    vaultCounts,
    linkedInPosts: vaultCounts.linkedInPosts,
    recentActivity: getRecentActivity(10),
    pendingApprovals: getPendingApprovals(),
    services: await getServiceStatus(),
    workers: await getWorkerStatus(),
    timestamp: new Date(),
  };

  if (global.broadcast) {
    global.broadcast(data);
  }

  return data;
}
