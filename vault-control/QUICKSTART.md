# Vault Control — Quick Start Guide

Get the Zoya dashboard running in 5 minutes.

## Prerequisites

- Node.js 18+ (check: `node --version`)
- npm (check: `npm --version`)

## Step 1: Install Dependencies (2 min)

```bash
cd vault-control
npm install
```

This installs:
- Express (backend server)
- React + Vite (frontend)
- Tailwind CSS (styling)
- gray-matter (YAML parsing)
- chokidar (file watching)
- Recharts (charts)
- Lucide React (icons)

## Step 2: Start Development Server (1 min)

```bash
npm run dev
```

You'll see:
```
✓ Vault Control server running on port 3001
✓ Watching vault at: /path/to/AI_Employee_Vault
✓ WebSocket: ws://localhost:3001/ws
...
Port 3000 is in use, trying 3001...
```

## Step 3: Open Dashboard (30 sec)

Open your browser to:
```
http://localhost:3000
```

You should see the cyberpunk-themed Vault Control dashboard with:
- ✅ Live stats from your vault
- ✅ Service health indicators
- ✅ Activity charts
- ✅ Pending approvals counter

## Step 4: Test Live Updates (1 min)

1. Navigate to **Approvals** tab
2. In another terminal, create a test file:
   ```bash
   cat > AI_Employee_Vault/Pending_Approval/social/TEST_TWITTER_2026-03-05.md << 'EOF'
   ---
   type: twitter
   status: pending
   created_at: 2026-03-05T12:00:00Z
   priority: normal
   ---
   Hello world! This is a test tweet.
   EOF
   ```
3. Watch the dashboard — **Approvals tab should update within 1 second** ✨

## Step 5: Try Approval (1 min)

1. In Approvals tab, you'll see your test post card
2. Click the card to select it
3. Click **Approve** button
4. File moves to `AI_Employee_Vault/Approved/social/TEST_TWITTER_...`
5. Approvals (Pending) tab count decreases by 1

**Done!** You now have a working local control dashboard for Zoya.

## Navigation

| Page | Purpose |
|------|---------|
| **Dashboard** | Stats, charts, system health |
| **Emails** | Email approval center |
| **WhatsApp** | WhatsApp message threads |
| **Approvals** | HITL decision control (most important) |
| **Social Media** | Post composer and queue |
| **Accounting** | Odoo integration, transactions |
| **Cloud Status** | VM control, sync status |
| **Logs** | Filtered activity logs |

## Keyboard Shortcuts

- `Ctrl+K` (or `Cmd+K`) — Search (if implemented)
- `?` — Help menu (if implemented)

## Common Tasks

### View Pending Approvals
1. Click **Approvals** in sidebar
2. Stay on **Pending** tab
3. Cards show items waiting for your decision

### Compose Social Post
1. Click **Social Media** in sidebar
2. Select platforms (Twitter, LinkedIn, etc.)
3. Type content (char counter shows limit per platform)
4. Click **Post Now** or **Schedule**

### Check System Health
1. Look at top-right badge in header
2. Green = all services OK
3. Yellow = some services offline
4. Red = critical alert

### Review Logs
1. Click **Logs** in sidebar
2. Filter by date/service/action
3. Click row to expand JSON details
4. Click **Export** to download CSV

## Troubleshooting

### Port 3000 already in use
Change port in `.env`:
```ini
PORT=3002
```

### WebSocket connection failed
- Check that backend is running (`npm run dev`)
- Ensure firewall allows port 3001
- Check browser console for errors (`F12`)

### No vault data appearing
- Verify `VAULT_PATH` in `.env` is correct
- Check file permissions (vault folder readable by node process)
- Look for errors in server console

### CSS not loading (looks broken)
```bash
npm install
npm run dev
```

## Next Steps

- **Production**: Run `npm run build && npm start`
- **PM2 Management**: Install PM2 and configure auto-restart
- **HTTPS**: Setup nginx reverse proxy
- **Backup**: Vault is Git-tracked, push to remote

## Help

See **README.md** for:
- Full feature documentation
- API endpoint reference
- Architecture overview
- Advanced configuration

## Development

```bash
# Dev mode (hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Preview build
npm run preview
```

---

**Questions?** Check the console logs — most errors are descriptive and actionable.

**Happy vaulting!** 🔐✨
