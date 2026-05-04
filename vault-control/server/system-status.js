import os from "os";
import { exec } from "child_process";
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
  { name: "WhatsApp Watcher", process: "whatsapp_watcher.py", type: "python" },
  { name: "LinkedIn MCP", process: "linkedin_mcp.py", type: "python" },
  { name: "Instagram Bot", process: "instagram", type: "python", checkLogs: ["instagram", "insta"] },
  { name: "Facebook Bot", process: "facebook", type: "python", checkLogs: ["facebook", "fb", "meta"] },
];

// ─── Service Status ───────────────────────────────────────────────────────────

export async function getServiceStatus() {
  const statuses = await Promise.all(
    servicesConfig.map(async (svc) => {
      try {
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

export function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();

  return {
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || "Unknown",
    },
    memory: {
      total: Math.round(totalMem / 1024 / 1024 / 1024),
      used: Math.round(usedMem / 1024 / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024 / 1024),
      percent: Math.round((usedMem / totalMem) * 100),
    },
    uptime: os.uptime(),
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

export async function refreshAndBroadcast() {
  const vaultCounts = getVaultCounts(true);

  const data = {
    type: "dashboard_update",
    vaultCounts,
    linkedInPosts: vaultCounts.linkedInPosts,
    recentActivity: getRecentActivity(10),
    pendingApprovals: getPendingApprovals(),
    services: await getServiceStatus(),
    timestamp: new Date(),
  };

  if (global.broadcast) {
    global.broadcast(data);
  }

  return data;
}
