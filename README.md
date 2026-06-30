# AI Employee Vault — Digital FTE 24/7

> **Personal AI Employee Hackathon 2026** — A full-stack AI employee system with file-based orchestration, real-time web dashboard, multi-platform social media management, ERP integration, and autonomous task completion.

## Tier Progress

| Tier | Status | Completion Date | Features |
|------|--------|-----------------|----------|
| **Bronze** | ✅ Complete | 2026-04-02 | Basic orchestration, Dashboard, Plans |
| **Silver** | ✅ Complete | 2026-04-03 | Email MCP, LinkedIn MCP, Gmail/WhatsApp Watchers, Approval Workflow, Cron, LLM Router |
| **Gold** | ✅ Complete | 2026-04-10 | Odoo ERP (7 tools), Facebook/Instagram/Twitter Skills, CEO Briefing, Ralph Wiggum Loop, Audit Logging, Error Recovery |
| **Platinum** | ✅ **100% COMPLETE** | 2026-06-30 | Full Web Dashboard, Real-time WebSocket, Social Media Management, AI Email Processing, WhatsApp Chat, Multi-Provider AI, OAuth Auth, Admin Panel, Notifications, Oracle Cloud Monitoring, Chatbot, Docker Deployment, MCP Servers, Automated Daily Posting, Image Generation |

---

## Platinum Tier — The Complete Digital Employee

> **Version 6.0.0** — From file-based orchestrator to full-stack AI employee with web dashboard, real-time updates, and autonomous operations.

### What Platinum Tier Delivers

- **Full Web Dashboard** — 11-page React SPA with dark/light theme, lazy loading, error boundaries
- **Real-time WebSocket** — Live updates for vault changes, notifications, WhatsApp, social posts
- **Social Media Empire** — Compose, AI-generate, approve, schedule, auto-post to LinkedIn/Facebook/Instagram
- **AI Email Processing** — Dual-layer dedup, AI analysis, auto-draft replies, priority detection
- **WhatsApp Integration** — Full chat interface, QR auth, real-time messaging, morning briefings
- **Multi-Provider AI** — Claude → GPT-4o → OpenRouter → Gemini failover chain with smart mock fallback
- **OAuth + JWT Auth** — Register/login, role-based access, CSRF protection, session management
- **Admin Panel** — API key management for 11 services, encrypted storage
- **Oracle Cloud Monitoring** — SSH-based VM stats, CPU/RAM/disk/network, top processes, auto-refresh
- **Chatbot** — SSE streaming, action parsing (ADD_TODO, CREATE_DRAFT, SEND_WHATSAPP), dashboard context
- **Docker Deployment** — Full compose stack: PostgreSQL, backend, frontend, orchestrator, email MCP, watchers
- **6 MCP Servers** — Email, LinkedIn, Odoo, Facebook, Instagram, Canva
- **Automated Daily Posting** — 3 slots/day, multi-platform, AI-generated content + images
- **Image Generation** — Wikipedia, Canva SVG, Pollinations AI, GPT Image, platform-specific resizing
- **Keyboard Shortcuts** — Ctrl+K search, Alt+1-9 navigation, Ctrl+S save, Ctrl+Enter approve
- **Security** — Rate limiting, security headers, CORS, audit logging, approval history with undo

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
cd vault-control

# Start everything
docker-compose -f docker-compose.prod.yml up -d

# Access dashboard
open http://localhost
```

### Option 2: Development

```bash
# Backend
cd vault-control/server
npm install
npm run dev

# Frontend
cd vault-control
npm install
npm run dev

# Access at http://localhost:5173
```

### Option 3: File-based Orchestrator (Original)

```bash
pip install -r requirements.txt
python3 orchestrator.py
```

---

## Project Structure

```
Digital_Employee/
├── vault-control/              # Full-stack web application
│   ├── src/                    # React frontend (11 pages)
│   │   ├── pages/              # Dashboard, Approvals, Emails, WhatsApp, Todos,
│   │   │                       # SocialMedia, Accounting, OracleCloud, Logs,
│   │   │                       # VaultEditor, AdminPanel
│   │   ├── components/         # Sidebar, TopBar, Chatbot, NotificationBell
│   │   ├── hooks/              # useWebSocket, useKeyboardShortcuts
│   │   └── context/            # AuthContext, ToastContext, AppContext
│   ├── server/                 # Express.js backend
│   │   ├── routes/             # approvals, emails, drafts, social, system, logs,
│   │   │                       # odoo, whatsapp, vault, export, auth, todos,
│   │   │                       # notifications, templates, posts, admin, oracle-cloud
│   │   ├── services/           # aiProvider, whatsappService, socialMediaService,
│   │   │                       # postGenerator, imageGenerator, imageHosting,
│   │   │                       # emailClassifier, notificationService, cache,
│   │   │                       # eventBus, eventListeners, scheduler, secretsManager, mcpClient
│   │   ├── database/           # connection.js (PostgreSQL), auth.js, csrf.js,
│   │   │                       # rateLimiter.js, errorHandler.js, audit.js
│   │   ├── oracle-ssh.js       # Oracle Cloud VM monitoring via SSH
│   │   └── index.js            # Main server (HTTP + WebSocket + file watcher)
│   ├── docker-compose.yml      # Dev stack
│   ├── docker-compose.prod.yml # Production stack
│   └── package.json
├── server/                     # Chatbot backend (Node.js CommonJS)
│   ├── chatbotRouter.js        # SSE streaming + action parsing
│   ├── chatbotService.js       # AI prompt templates
│   └── chatbotContext.js       # Dashboard context for chatbot
├── mcp_servers/                # MCP server implementations
│   ├── facebook-mcp/           # Meta Graph API
│   ├── instagram-mcp/          # Meta Graph API
│   └── linkedin-mcp/           # LinkedIn automation
├── .mcp.json                   # MCP server definitions (6 servers)
├── orchestrator.py             # Python orchestrator (Silver/Gold tier)
├── email_mcp.py                # Email MCP (Python)
├── odoo_mcp.py                 # Odoo ERP MCP
├── gmail_watcher.py            # Gmail polling
├── whatsapp_watcher.py         # WhatsApp polling
├── ralph_wiggum.py             # Autonomous task loop
├── provider_config.py          # AI provider auto-detection
├── smart_run.py                # Universal launcher
├── docker-compose.yml          # Root Docker stack
├── Needs_Action/               # Incoming tasks
├── Plans/                      # Generated action plans
├── Pending_Approval/           # Awaiting human review
├── Approved/                   # Ready to execute
├── Done/                       # Completed tasks
├── Rejected/                   # Rejected drafts
├── Logs/                       # System logs
└── Agent_Skills/               # Skill definitions
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PLATINUM TIER ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    REACT FRONTEND (Vite)                        │    │
│  │  Dashboard │ Approvals │ Emails │ WhatsApp │ Todos │ Social     │    │
│  │  Accounting │ Oracle Cloud │ Logs │ Vault Editor │ Admin Panel   │    │
│  │  Chatbot Panel │ Notification Bell │ Theme Toggle │ Search       │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │ HTTP + WebSocket                          │
│  ┌──────────────────────────┴──────────────────────────────────────┐    │
│  │                 EXPRESS.JS BACKEND (Node.js)                     │    │
│  │                                                                  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │    │
│  │  │ Auth     │ │ Posts    │ │ Emails   │ │ Social Media     │   │    │
│  │  │ JWT+RBAC │ │ Compose  │ │ AI+Dedup │ │ LinkedIn/FB/IG   │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │    │
│  │                                                                  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │    │
│  │  │ WhatsApp │ │ Odoo ERP │ │ Oracle   │ │ Notifications    │   │    │
│  │  │ Web.js   │ │ JSON-RPC │ │ SSH Mon  │ │ WS + DB + Push   │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │    │
│  │                                                                  │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │  AI Provider: Claude → GPT-4o → OpenRouter → Gemini      │   │    │
│  │  │  Image Gen: Wikipedia → Canva SVG → Pollinations → GPT   │   │    │
│  │  │  Scheduler: 3 daily slots, catch-up, morning briefing    │   │    │
│  │  └──────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                             │                                           │
│  ┌──────────────────────────┴──────────────────────────────────────┐    │
│  │                    PostgreSQL 16                                 │    │
│  │  users │ api_keys │ audit_log │ sessions │ notifications        │    │
│  │  todos │ scheduled_posts │ emails │ whatsapp_messages            │    │
│  │  approval_history │ rate_limits │ admin_settings                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    MCP SERVERS (6)                               │    │
│  │  email_mcp │ linkedin-playwright │ odoo-gold-tier               │    │
│  │  facebook-mcp │ instagram-mcp │ canva-mcp                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    FILE-BASED STATE                              │    │
│  │  Needs_Action/ → Plans/ → Pending_Approval/ → Approved/ → Done/ │    │
│  │  Vault Editor browses/edits all markdown files in real-time     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Features by Tier

### Silver Tier — Communication Assistant

| Feature | File | Description |
|---------|------|-------------|
| Email MCP | `email_mcp.py` | SMTP/Gmail email sending |
| LinkedIn MCP | `linkedin_mcp.py` | LinkedIn API + session persistence |
| Gmail Watcher | `gmail_watcher.py` | 30s interval email monitoring |
| WhatsApp Watcher | `whatsapp_watcher.py` | Twilio WhatsApp polling |
| Approval Workflow | `orchestrator.py` | Pending → Approved → Sent pipeline |
| Cron Scheduling | `setup_cron.py` | Background task automation |
| LLM Router | `provider_config.py` | Multi-provider AI failover |
| Dry-Run Mode | `.env` | Test without sending |

### Gold Tier — Business Operator

| Feature | File | Description |
|---------|------|-------------|
| Odoo MCP | `odoo_mcp.py` | 7 tools: invoices, orders, accounting, bank |
| Facebook/Instagram Skill | `Agent_Skills/` | Playwright-based social posting |
| Twitter/X Skill | `Agent_Skills/` | Playwright-based tweeting |
| CEO Briefing | `scripts/ceo_briefing.py` | Weekly Monday executive summary |
| Ralph Wiggum Loop | `ralph_wiggum.py` | Autonomous task completion |
| Audit Logging | `audit_log.py` | JSON trails + error recovery |
| Enhanced Orchestrator | `orchestrator.py` | Cross-domain, all skills |

### Platinum Tier — Full Digital Employee

| Feature | Location | Description |
|---------|----------|-------------|
| **Web Dashboard** | `vault-control/src/pages/` | 11 React pages, dark/light theme, lazy loading |
| **Real-time WebSocket** | `vault-control/server/index.js` | Live updates, file watcher, auto-reconnect |
| **Social Media Management** | `vault-control/src/pages/SocialMedia.jsx` | Compose, AI-generate, approve, schedule, publish |
| **AI Email Processing** | `vault-control/server/index.js` | Dedup, AI analysis, auto-draft, priority detection |
| **WhatsApp Chat** | `vault-control/src/pages/WhatsApp.jsx` | Full chat UI, QR auth, real-time messaging |
| **Multi-Provider AI** | `vault-control/server/services/aiProvider.js` | Claude → GPT-4o → OpenRouter → Gemini |
| **OAuth + JWT Auth** | `vault-control/server/routes/auth.js` | Register, login, roles, CSRF, sessions |
| **Admin Panel** | `vault-control/src/pages/AdminPanel.jsx` | API key management for 11 services |
| **Oracle Cloud Monitoring** | `vault-control/server/oracle-ssh.js` | SSH-based VM stats, auto-refresh |
| **Chatbot** | `vault-control/src/components/Chatbot/` | SSE streaming, action parsing, dashboard context |
| **Docker Deployment** | `vault-control/docker-compose.prod.yml` | Full stack: PostgreSQL, backend, frontend, services |
| **6 MCP Servers** | `.mcp.json` | Email, LinkedIn, Odoo, Facebook, Instagram, Canva |
| **Automated Daily Posting** | `vault-control/server/services/scheduler.js` | 3 slots/day, multi-platform, AI content |
| **Image Generation** | `vault-control/server/services/imageGenerator.js` | Multi-source, platform-specific resizing |
| **Keyboard Shortcuts** | `vault-control/src/hooks/useKeyboardShortcuts.js` | Ctrl+K, Alt+1-9, Ctrl+S, Ctrl+Enter |
| **Notification System** | `vault-control/server/services/notificationService.js` | WS + DB + browser push, smart routing |
| **Vault Editor** | `vault-control/src/pages/VaultEditor.jsx` | Browse, edit, create, delete markdown files |
| **Search** | `vault-control/src/components/TopBar.jsx` | Global vault search with folder navigation |
| **Audit Logging** | `vault-control/server/database/audit.js` | PostgreSQL audit trail with undo support |
| **Rate Limiting** | `vault-control/server/database/rateLimiter.js` | Global + auth-specific rate limits |
| **Security Headers** | `vault-control/server/index.js` | X-Content-Type, X-Frame-Options, XSS-Protection |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, Tailwind CSS, Recharts, Lucide Icons |
| **Backend** | Express.js, Node.js, WebSocket (ws) |
| **Database** | PostgreSQL 16 (UUID PKs, JSONB, indexes) |
| **Auth** | JWT + bcryptjs + CSRF tokens |
| **AI Providers** | Anthropic Claude, OpenAI GPT-4o, OpenRouter, Google Gemini |
| **Social APIs** | Meta Graph API (Facebook/Instagram), LinkedIn, Twitter |
| **ERP** | Odoo JSON-RPC |
| **WhatsApp** | whatsapp-web.js (Web) + Twilio (Python) |
| **Image Gen** | Wikipedia, Canva SVG, Pollinations AI, GPT Image, Sharp |
| **MCP** | @modelcontextprotocol/sdk (6 servers) |
| **Deploy** | Docker Compose, Nginx, PostgreSQL Alpine |
| **Monitoring** | Oracle Cloud SSH, Chokidar file watcher |
| **State** | File-based (markdown + YAML frontmatter) + PostgreSQL |

---

## Environment Variables

```bash
# AI Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
GEMINI_API_KEY=AIza...

# Email
SENDER_EMAIL=your@gmail.com
EMAIL_PASSWORD=your-app-password
DRY_RUN=true

# Social Media
META_SYSTEM_USER_TOKEN=...
INSTAGRAM_ACCESS_TOKEN=...
LINKEDIN_ACCESS_TOKEN=...

# Odoo ERP
ODOO_URL=http://localhost:8069
ODOO_DB=odoo_db
ODOO_USER=admin
ODOO_PASSWORD=admin

# Oracle Cloud
ORACLE_SSH_HOST=140.245.241.95
ORACLE_SSH_USER=opc
ORACLE_SSH_KEY path or password

# WhatsApp
WHATSAPP_API_KEY=...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vault_control

# Auth
ENABLE_AUTH=false
JWT_SECRET=your-secret
ENCRYPTION_KEY=hex-64-chars

# Server
PORT=3000
VAULT_PATH=/path/to/Digital_Employee
```

---

## Docker Commands

```bash
# Development
cd vault-control && docker-compose up -d

# Production
cd vault-control && docker-compose -f docker-compose.prod.yml up -d

# Full stack (with orchestrator + watchers)
docker-compose -f docker-compose.prod.yml --profile full up -d

# View logs
docker-compose logs -f backend

# Stop all
docker-compose -f docker-compose.prod.yml down
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/auth/login` | POST | Login (JWT) |
| `/api/auth/register` | POST | Register |
| `/api/posts/generate` | POST | AI-generate posts |
| `/api/posts/compose` | POST | Create post |
| `/api/posts/publish-now` | POST | Publish to platforms |
| `/api/posts/pending-approval` | GET | Pending posts |
| `/api/posts/:id/approve-publish` | POST | Approve & publish |
| `/api/social/drafts` | GET | Draft posts |
| `/api/emails/*` | GET/POST | Email operations |
| `/api/whatsapp/*` | GET/POST | WhatsApp operations |
| `/api/oracle/stats` | GET | Oracle Cloud VM stats |
| `/api/system/vm-info` | GET | System VM info |
| `/api/odoo/*` | GET | Odoo ERP data |
| `/api/todos/*` | GET/POST/PUT/DELETE | Todo CRUD |
| `/api/notifications/*` | GET/POST | Notifications |
| `/api/admin/*` | GET/PUT | Admin API keys |
| `/api/chat/stream` | GET | Chatbot SSE stream |
| `/ws` | WebSocket | Real-time updates |

---

## Documentation

| Document | Location |
|----------|----------|
| Company Handbook | `Company_Handbook.md` |
| Business Rules | `Business_Rules.md` |
| Business Goals | `Business_Goals.md` |
| Oracle Cloud Skill | `oracle-cloud/SKILL.md` |
| Odoo MCP Guide | `ODOO_MCP_GUIDE.md` |
| LLM Router Guide | `LLM_ROUTER_GUIDE.md` |
| LinkedIn Setup | `LINKEDIN_SETUP_GUIDE.md` |
| Email MCP Guide | `EMAIL_MCP_QUICK_REFERENCE.md` |
| Instagram Setup | `INSTAGRAM_GRAPH_API_SETUP.md` |

---

**Hackathon:** Personal AI Employee Hackathon 2026
**All Tiers:** Bronze ✅ | Silver ✅ | Gold ✅ | **Platinum ✅**
**Version:** 6.0.0 (Platinum Tier — Complete)
**Last Updated:** 2026-06-30
