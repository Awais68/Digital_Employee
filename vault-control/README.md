# Vault Control - AI Employee Dashboard

A powerful local web dashboard for controlling your Personal AI Employee automation system. Built with React, Express, and WebSocket for real-time updates.

## Features

- **Dashboard** - System metrics, service status, analytics charts
- **Approvals (HITL)** - Human-in-the-Loop control center for payment/email/post approvals
- **Emails** - Manage email actions and responses
- **WhatsApp** - Chat-style interface for message management
- **Social Media** - Bulk post composer with multi-platform scheduling
- **Accounting** - Odoo integration, invoices, CEO briefing
- **Cloud Status** - Oracle Cloud VM control and delegation queue
- **Logs** - Comprehensive activity logging with filtering

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, Lucide Icons
- **Backend**: Express.js, WebSocket (ws), Chokidar (file watching)
- **Data**: Markdown files with YAML frontmatter (no database)
- **Themes**: Dark mode (cyberpunk green) + Light mode (blue/white)

## Quick Start

### 1. Install Dependencies

```bash
cd vault-control
npm install
```

### 2. Configure Environment

Edit `.env` with your vault path:

```bash
VAULT_PATH=/path/to/AI_Employee_Vault
PORT=3000
WS_PORT=3001
```

### 3. Run Development Server

```bash
npm run dev
```

This starts:
- Frontend on `http://localhost:3000` (Vite)
- Backend on `http://localhost:3001` (Express + WebSocket)

### 4. Build for Production

```bash
npm run build
npm run start
```

## Project Structure

```
vault-control/
├── server/                     # Express.js backend
│   ├── index.js               # Main server + WebSocket
│   ├── vault-reader.js        # YAML parsing + file ops
│   ├── system-status.js       # Service monitoring
│   └── routes/                # API endpoints
│       ├── approvals.js
│       ├── emails.js
│       ├── social.js
│       ├── system.js
│       ├── logs.js
│       └── drafts.js
├── src/                        # React frontend
│   ├── main.jsx               # Entry point
│   ├── App.jsx                # Main app + routing
│   ├── index.css              # Tailwind + custom styles
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── TopBar.jsx
│   │   └── StatusIndicator.jsx
│   └── pages/
│       ├── Dashboard.jsx
│       ├── Approvals.jsx      # HITL control center
│       ├── Emails.jsx
│       ├── WhatsApp.jsx
│       ├── SocialMedia.jsx
│       ├── Accounting.jsx
│       ├── CloudStatus.jsx
│       └── Logs.jsx
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── .env
```

## API Routes

### System
- `GET /api/system/health` - System health status
- `GET /api/system/services` - Service statuses
- `GET /api/system/metrics` - CPU/Memory/Disk
- `GET /api/system/stats` - Platform message counts

### Approvals
- `GET /api/approvals` - Pending approvals
- `GET /api/approvals/approved` - Approved items
- `GET /api/approvals/rejected` - Rejected items
- `POST /api/approvals/:id/approve` - Approve item
- `POST /api/approvals/:id/reject` - Reject item

### Emails
- `GET /api/emails` - Email list
- `GET /api/emails/:id` - Single email
- `POST /api/emails/:id/send` - Send email

### Social
- `GET /api/social/drafts` - Saved drafts
- `GET /api/social/history` - Posted history
- `POST /api/social/post` - Create post (for approval)
- `POST /api/social/draft` - Save as draft

### Logs
- `GET /api/logs?service=&action=&status=` - Filtered logs
- `GET /api/logs/:id` - Log details

## WebSocket Events

Real-time updates via WebSocket on `ws://localhost:3001`:

```javascript
// Server → Client
{
  type: 'vault_change',
  action: 'add|change|delete',
  path: '/path/to/file.md'
}

{
  type: 'approval_changed',
  action: 'approved|rejected|updated',
  id: 'item-id'
}

{
  type: 'email_sent',
  id: 'email-id'
}
```

## Theme Toggle

The app supports dark and light themes. Click the 🌙/☀️ button in the top bar to toggle.

- **Dark**: Cyberpunk aesthetic with #00FF88 green accent
- **Light**: Clean blue/white design with #3B82F6 accent

Preference is saved to localStorage.

## Vault File Structure

The dashboard watches your Obsidian vault for markdown files:

```
AI_Employee_Vault/
├── Pending_Approval/      # Files waiting for approval
│   ├── pay-001.md
│   ├── email-001.md
│   └── post-001.md
├── Approved/              # Approved items
├── Rejected/              # Rejected items
├── Needs_Action/          # New actions to process
├── Done/                  # Completed actions
├── Drafts/                # Saved drafts
├── Accounting/            # Invoice/transaction records
├── Briefings/             # CEO briefing reports
└── Logs/                  # Activity logs (JSON)
```

Each markdown file has YAML frontmatter:

```markdown
---
type: email
from: user@example.com
subject: Question
priority: high
createdAt: 2024-03-05T10:30:00Z
---

Email body content here...
```

## Mock Data

When the vault is empty, the dashboard shows realistic mock data so you can explore the UI:

- 6 platform stat cards with fake message counts
- Service status indicators (running/warning/offline)
- Chart data for last 7 days
- Sample approvals, emails, WhatsApp conversations
- Social media posts and history

Switch to your real vault by updating `VAULT_PATH` in `.env`.

## Performance

- File watching with chokidar (debounced 2s)
- WebSocket for real-time updates
- Responsive design (1366px+ desktop, mobile-friendly)
- Skeleton loaders for data fetching
- Paginated logs (50 per page)

## Error Handling

- Graceful fallback to mock data if vault files missing
- Toast notifications for actions
- Network error recovery
- Detailed error logs in browser console

## Security

- ⚠️ No authentication (local dashboard only)
- ⚠️ No secrets stored in frontend
- ✅ Git-ignored `.env` file
- ✅ YAML frontmatter prevents code injection

## Configuration

### Ports
- Frontend: `PORT=3000` (Vite dev server)
- Backend: `WS_PORT=3001` (Express + WebSocket)

### Odoo (Optional)
```
ODOO_URL=http://localhost:8069
ODOO_DB=company_db
ODOO_USERNAME=admin
ODOO_PASSWORD=admin
```

### Cloud VM (Optional)
```
CLOUD_VM_IP=xxx.xxx.xxx.xxx
```

## Development

### Debugging
- React DevTools recommended
- Network tab for API calls
- WebSocket messages visible in browser console

### Adding New Routes
1. Create `server/routes/yourroute.js`
2. Import in `server/index.js`
3. Add `app.use('/api/yourroute', yourRouter)`

### Adding New Pages
1. Create `src/pages/YourPage.jsx`
2. Import in `App.jsx`
3. Add case in `renderPage()`
4. Add to sidebar in `Sidebar.jsx`

## Deployment

### Local Machine
```bash
npm run dev      # Development
npm run build    # Build dist/
npm run start    # Production
```

### Docker (Future)
```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install && npm run build
EXPOSE 3000 3001
CMD ["npm", "start"]
```

## Keyboard Shortcuts

Coming soon! Currently supports:
- Click theme toggle (🌙/☀️) to switch dark/light
- Click sidebar tabs to navigate
- Search box in top bar (frontend filtering only)

## Known Limitations

- No offline support yet (requires live WebSocket)
- Mock data only for initial setup
- No user authentication
- Logs stored as JSON files (not queryable)
- Multi-user sync via Git (manual push/pull)

## Roadmap

- [ ] Keyboard shortcuts
- [ ] Dark mode animations
- [ ] Mobile app (React Native)
- [ ] OAuth2 for cloud services
- [ ] Real-time collaboration
- [ ] AI-powered suggestions
- [ ] Payment retry automation
- [ ] Sentiment analysis for emails

## Support

For issues, check:
1. `.env` file has correct `VAULT_PATH`
2. Vault folders exist and are readable
3. Ports 3000 and 3001 are available
4. Browser console for error messages
5. Server logs in terminal

## License

MIT - See LICENSE file

---

Built for the Personal AI Employee system. May your workflows be automated! 🚀
