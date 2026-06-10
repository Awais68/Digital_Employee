# CI/CD Deployment Setup Guide

## Current Status

Your CI/CD pipeline is **ready** and configured to deploy to Oracle Cloud (144.24.142.167).

### Files Created:
- ✅ `.github/workflows/deploy-oracle.yml` - GitHub Actions workflow
- ✅ `deploy/push_to_oracle.sh` - Local deployment script
- ✅ `deploy/remote_deploy.sh` - Remote deployment script (runs on VM)

## Required GitHub Secrets

To activate CI/CD, configure these secrets in your GitHub repository:

**Repository → Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value | Description |
|------------|-------|-------------|
| `ORACLE_SSH_KEY` | `[Contents of your SSH private key]` | SSH key for VM access |
| `ORACLE_HOST` | `144.24.142.167` | Oracle VM IP address |
| `ORACLE_USER` | `ubuntu` | VM username |

### How to get SSH key content:
```bash
cat ~/Downloads/oracle-new-key
```
Copy the entire output (including BEGIN/END lines) as the secret value.

## How It Works

### Automatic Deployment (CI/CD)
1. **Push to main branch** → Triggers GitHub Actions
2. **Workflow runs:**
   - Installs dependencies
   - Syntax checks server code
   - Builds frontend (vite)
   - Checks Python workers
   - Creates tarball (excluding secrets, node_modules, vault data)
   - Uploads to Oracle VM via SSH
   - Runs remote deployment script
   - Performs health check
   - Auto-rollback if health check fails

### Manual Deployment (Local)
```bash
# Full deployment
./deploy/push_to_oracle.sh

# Skip frontend build (server-only changes)
./deploy/push_to_oracle.sh --skip-build
```

## Safety Features

- **Never overwrites vault data** (Pending_Approval, Needs_Action, Done, Logs, Metrics, .env)
- **Automatic backup** before deployment
- **Health check** with 60-second timeout
- **Auto-rollback** if deployment fails
- **Keeps last 5 backups** for quick recovery

## Verify Deployment

After pushing code:
1. Go to GitHub → Actions tab
2. Watch the "Deploy to Oracle Cloud" workflow
3. Check deployment status
4. Verify: `http://144.24.142.167/api/health`

## Troubleshooting

### Health check fails?
```bash
ssh -i ~/Downloads/oracle-new-key ubuntu@144.24.142.167
sudo systemctl status digitalfte-server
sudo journalctl -u digitalfte-server -n 50
```

### Need to rollback manually?
```bash
ssh -i ~/Downloads/oracle-new-key ubuntu@144.24.142.167
ls ~/deploy_backups/
# Find latest good backup and restore
```

## Workflow Triggers

The workflow runs automatically when you push changes to:
- `vault-control/server/**`
- `vault-control/src/**`
- `vault-control/package.json`
- `*.py` (Python workers)
- `deploy/**`
- `.github/workflows/deploy-oracle.yml`

You can also trigger manually from GitHub Actions tab.
