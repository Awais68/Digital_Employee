# 🤖 Orchestrator Cron Setup Guide

**Digital Employee System**
**Last Updated:** 2026-04-05

---

## 📋 Overview

The `run_orchestrator_once.py` script is a lightweight wrapper designed for cron scheduling. It runs the orchestrator once with timestamp logging and graceful error handling.

---

## 🚀 Quick Start

### Test the Script

```bash
cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee"

# Run manually
python3 run_orchestrator_once.py
```

**Expected Output:**
```
======================================================================
  🤖 ORCHESTRATOR CRON RUN - 2026-04-05 17:22:14 UTC
======================================================================

[Orchestrator output...]

======================================================================
  ✅ ORCHESTRATOR COMPLETED - 2026-04-05 17:23:02 UTC
  ⏱️  Duration: 0.02 seconds
======================================================================
```

---

## ⏰ Cron Setup

### Option 1: Every 5 Minutes (Recommended)

```bash
# Edit crontab
crontab -e

# Add this line:
*/5 * * * * cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee" && python3 run_orchestrator_once.py >> Logs/cron_orchestrator.log 2>&1
```

### Option 2: Every Minute (High Frequency)

```bash
* * * * * cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee" && python3 run_orchestrator_once.py >> Logs/cron_orchestrator.log 2>&1
```

### Option 3: Every 15 Minutes (Low Frequency)

```bash
*/15 * * * * cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee" && python3 run_orchestrator_once.py >> Logs/cron_orchestrator.log 2>&1
```

### Option 4: Business Hours Only (9 AM - 6 PM, Every 5 Minutes)

```bash
*/5 9-18 * * * cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee" && python3 run_orchestrator_once.py >> Logs/cron_orchestrator.log 2>&1
```

---

## 📁 Log Files

### Cron Log (All Output)

```bash
# View cron log
tail -f Logs/cron_orchestrator.log

# Search for errors
grep "❌" Logs/cron_orchestrator.log

# Search for successful runs
grep "✅" Logs/cron_orchestrator.log
```

### Error Log (Failures Only)

```bash
# View errors (created by script)
cat Logs/cron_orchestrator_errors.log
```

### Orchestrator Log (Detailed)

```bash
# View orchestrator log
tail -f Logs/orchestrator.log
```

---

## 🔧 Cron Management

### View Current Cron Jobs

```bash
crontab -l
```

### Edit Cron Jobs

```bash
crontab -e
```

### Remove All Cron Jobs

```bash
crontab -r
```

### Check if Cron is Running

```bash
# Check cron service status
systemctl status cron

# View cron logs (systemd)
journalctl -u cron -f
```

---

## 🧪 Testing

### Test 1: Manual Run

```bash
python3 run_orchestrator_once.py
```

**Expected:**
- ✅ Timestamp printed at start
- ✅ Orchestrator processes files
- ✅ Timestamp printed at end
- ✅ Exit code 0 (success)

### Test 2: Check Exit Code

```bash
python3 run_orchestrator_once.py
echo "Exit code: $?"
```

**Expected:**
- `Exit code: 0` (success)
- `Exit code: 1` (error - check output)

### Test 3: Cron Simulation

```bash
# Run as cron would (with output redirection)
python3 run_orchestrator_once.py >> Logs/cron_orchestrator.log 2>&1

# Check the log
tail -20 Logs/cron_orchestrator.log
```

### Test 4: Error Handling

```bash
# Test with missing orchestrator (simulate error)
mv orchestrator.py orchestrator.py.bak
python3 run_orchestrator_once.py
echo "Exit code: $?"

# Restore orchestrator
mv orchestrator.py.bak orchestrator.py
```

**Expected:**
- ❌ Error message printed
- ❌ Exit code 1
- ✅ Error logged to `cron_orchestrator_errors.log`

---

## 📊 Monitoring

### Create a Monitoring Script

Create `check_orchestrator.sh`:

```bash
#!/bin/bash
# Check if orchestrator ran in the last 10 minutes

LOG_FILE="Logs/cron_orchestrator.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ No cron log found"
    exit 1
fi

# Check last run time
LAST_RUN=$(grep "ORCHESTRATOR CRON RUN" "$LOG_FILE" | tail -1)

if [ -z "$LAST_RUN" ]; then
    echo "❌ No orchestrator runs found"
    exit 1
fi

echo "✅ Last run: $LAST_RUN"

# Check for errors
ERRORS=$(grep "❌" "$LOG_FILE" | tail -5)
if [ -n "$ERRORS" ]; then
    echo ""
    echo "⚠️  Recent errors:"
    echo "$ERRORS"
fi
```

Make it executable:

```bash
chmod +x check_orchestrator.sh
./check_orchestrator.sh
```

---

## ⚠️ Troubleshooting

### Issue: Cron job not running

**Solutions:**

1. Check if cron service is running:
   ```bash
   systemctl status cron
   ```

2. Check cron syntax:
   ```bash
   # Verify crontab syntax
   crontab -l
   ```

3. Check cron logs:
   ```bash
   journalctl -u cron -f
   ```

4. Test the command manually:
   ```bash
   cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee"
   python3 run_orchestrator_once.py
   ```

### Issue: Permission denied

**Solution:**

```bash
# Make script executable
chmod +x run_orchestrator_once.py

# Check Python path
which python3

# Use full path in crontab
*/5 * * * * /usr/bin/python3 /path/to/run_orchestrator_once.py
```

### Issue: Module not found errors

**Solution:**

1. Check working directory in cron:
   ```bash
   # Add this to crontab for debugging
   */5 * * * * cd /path/to/Digital_Employee && pwd >> /tmp/cron_debug.log && python3 run_orchestrator_once.py
   ```

2. Ensure dependencies are installed:
   ```bash
   pip3 install python-dotenv schedule
   ```

### Issue: Errors in orchestrator

**Check error logs:**

```bash
# View orchestrator errors
cat Logs/cron_orchestrator_errors.log

# View detailed orchestrator log
tail -100 Logs/orchestrator.log
```

---

## 🎯 Recommended Setup

### Production Setup (Every 5 Minutes)

```bash
# Edit crontab
crontab -e

# Add this line:
*/5 * * * * cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee" && python3 run_orchestrator_once.py >> Logs/cron_orchestrator.log 2>&1
```

### Monitor Dashboard

```bash
# Watch dashboard updates
watch -n 5 cat Dashboard.md
```

### Check Logs

```bash
# Follow orchestrator log
tail -f Logs/orchestrator.log

# Follow cron log
tail -f Logs/cron_orchestrator.log
```

---

## 📝 Cron Syntax Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * * command_to_run
```

### Special Characters

- `*` - Any value (every minute, every hour, etc.)
- `,` - Value list separator (1,15 = 1st and 15th)
- `-` - Range of values (1-5 = Monday to Friday)
- `/` - Step values (*/5 = every 5 minutes)

### Examples

| Schedule | Cron Expression | Description |
|----------|----------------|-------------|
| Every minute | `* * * * *` | Highest frequency |
| Every 5 minutes | `*/5 * * * *` | **Recommended** |
| Every 15 minutes | `*/15 * * * *` | Low frequency |
| Every hour | `0 * * * *` | On the hour |
| Every day at 9 AM | `0 9 * * *` | Morning only |
| Weekdays only | `*/5 * * * 1-5` | Mon-Fri |
| Business hours | `*/5 9-18 * * *` | 9 AM - 6 PM |

---

## ✅ Setup Checklist

- [x] `run_orchestrator_once.py` created
- [x] Script tested manually
- [x] Script made executable (`chmod +x`)
- [x] Error handling implemented
- [x] Timestamp logging working
- [ ] Cron job added (`crontab -e`)
- [ ] Cron job verified (`crontab -l`)
- [ ] Logs monitored (`tail -f Logs/cron_orchestrator.log`)

---

**Digital Employee System - Orchestrator Cron v1.0**
**Last Updated:** 2026-04-05
