# Deploy to Oracle Cloud (144.24.142.167 — Hyderabad, India)

Existing deployment ko **safe** rakhte hue new code push karne ke 2 tareeqay:

## Existing VM setup (touch nahi hota)

- App: `~/Digital_Employee` (git clone of this repo)
- Backend: `digitalfte-server.service` (systemd) → `node vault-control/server/index.js` on port 3000
- Nginx: `digitalfte` site → proxies to backend, redirects to `https://digitalfte.online`
- Vault data (`Pending_Approval/`, `Needs_Action/`, `Done/`, `Logs/`, `Metrics/`, `.env`) — **deploy kabhi inhe overwrite nahi karta**

## Option 1: Local one-command deploy

```bash
./deploy/push_to_oracle.sh              # build + upload + deploy
./deploy/push_to_oracle.sh --skip-build # server-only change (faster)
```

Config (defaults already correct):
```bash
export ORACLE_HOST=144.24.142.167
export ORACLE_USER=ubuntu
export ORACLE_SSH_KEY=~/Downloads/oracle-new-key
```

## Option 2: GitHub Actions (push to main = auto deploy)

`.github/workflows/deploy-oracle.yml` — push to `main` par:
1. **Test job**: npm ci → server syntax check → vite build → python syntax check
2. **Deploy job**: tarball → upload → remote deploy → public health check

### Required GitHub secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `ORACLE_HOST` | `144.24.142.167` |
| `ORACLE_USER` | `ubuntu` |
| `ORACLE_SSH_KEY` | contents of `~/Downloads/oracle-new-key` (private key) |

Optionally create a `production` environment with required reviewers for manual approval before each deploy.

## Safety mechanism (both options)

`deploy/remote_deploy.sh` runs on the VM:
1. **Backup** current code → `~/deploy_backups/<timestamp>/` (last 5 kept)
2. Extract **code-only** tarball (`server/`, `dist/`, `*.py`, package files) — vault data, `.env`, `whatsapp_session` excluded
3. `npm ci` **only if** `package-lock.json` changed
4. `systemctl restart digitalfte-server`
5. Health check `http://localhost:3000/api/health` (12 retries × 5s)
6. Fail hone par **automatic rollback** to backup + restart

## Rollback manually

```bash
ssh -i ~/Downloads/oracle-new-key ubuntu@144.24.142.167
ls ~/deploy_backups/                    # pick a timestamp
# restore server/ dist/ from that backup, then:
sudo systemctl restart digitalfte-server
```
