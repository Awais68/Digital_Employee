#!/bin/bash
set -e

PROJECT=/home/ubuntu/Digital_Employee
VENV=$PROJECT/venv
LOG=/tmp/remote_deploy.log

echo "🚀 Deploy started at $(date)" | tee $LOG

cd $PROJECT

# 1. Python dependencies
echo "📦 Installing Python deps..." | tee -a $LOG
source $VENV/bin/activate
pip install -q -r requirements.txt 2>&1 | tail -5 | tee -a $LOG

# 2. Node dependencies for vault-control
echo "📦 Installing Node deps..." | tee -a $LOG
cd $PROJECT/vault-control
npm ci --no-audit --no-fund --omit=dev 2>&1 | tail -5 | tee -a $LOG
cd $PROJECT

# 3. Restart backend service
echo "🔄 Restarting digitalfte-server..." | tee -a $LOG
sudo systemctl restart digitalfte-server
sleep 3

# 4. Quick health check
if sudo systemctl is-active --quiet digitalfte-server; then
  echo "✅ Service is running" | tee -a $LOG
else
  echo "❌ Service failed to start!" | tee -a $LOG
  sudo journalctl -u digitalfte-server -n 30 --no-pager | tee -a $LOG
  exit 1
fi

echo "✅ Deploy complete at $(date)" | tee $LOG
