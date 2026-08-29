// Single source of truth for every long-running process.
//
// Ownership matters here: previously cron ran run_orchestrator_once.py every
// 3 minutes AND workers.py spawned orchestrator.py --continuous, while PM2 ran
// gmail-watcher AND workers.py spawned a second gmail_watcher. Everything was
// processed twice. PM2 now owns all of it; cron only handles periodic scripts
// that are not daemons.
const path = require('path');

// Load the root .env so PM2-managed processes inherit DRY_RUN, tokens, etc.
// Parsed inline: there is no dotenv in the repo-root node_modules.
const fs = require('fs');
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch { /* .env is optional */ }

const common = {
  cwd: __dirname,
  watch: false,
  merge_logs: true,
  max_restarts: 10,
  restart_delay: 5000,
  // Without this an unexpected exit-loop burns CPU until max_restarts is hit.
  min_uptime: 20000,
  kill_timeout: 10000,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'vault-control',
      script: 'vault-control/server/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        // vault-control owns WhatsApp (whatsapp-web.js + LocalAuth). Hardcoding
        // 'true' here meant every deployment ran a headless Chrome against the
        // SAME LocalAuth session name — two instances invalidate each other and
        // both end up in a "detached Frame" reconnect loop. Env-driven so only
        // one host runs it; defaults to on for a single-host setup.
        ENABLE_WHATSAPP: process.env.ENABLE_WHATSAPP || 'true',
      },
      error_file: 'Logs/vault-control-error.log',
      out_file: 'Logs/vault-control-out.log',
    },
    {
      ...common,
      name: 'gmail-watcher',
      script: 'gmail_watcher.py',
      args: '--continuous',
      interpreter: 'python3',
      // No DRY_RUN override here: gmail_watcher.py loads .env itself, and the
      // old `process.env.DRY_RUN || 'true'` silently forced dry-run under
      // systemd (where DRY_RUN is not exported) so no email was ever sent.
      error_file: 'Logs/gmail-watcher-error.log',
      out_file: 'Logs/gmail-watcher-out.log',
    },
    {
      ...common,
      name: 'email-mcp',
      script: 'email_mcp.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        GMAIL_CREDENTIALS_PATH: path.join(__dirname, 'credentials/credentials.json'),
        GMAIL_TOKEN_PATH: path.join(__dirname, 'token.json'),
      },
      error_file: 'Logs/email-mcp-error.log',
      out_file: 'Logs/email-mcp-out.log',
    },
    {
      ...common,
      name: 'orchestrator',
      script: 'run_orchestrator_once.py',
      interpreter: 'python3',
      // One-shot every 3 minutes — identical cadence to the old crontab entry,
      // but supervised and visible in `pm2 list` / the dashboard.
      autorestart: false,
      cron_restart: '*/3 * * * *',
      min_uptime: undefined,
      error_file: 'Logs/orchestrator-error.log',
      out_file: 'Logs/orchestrator-out.log',
    },
  ],
};
