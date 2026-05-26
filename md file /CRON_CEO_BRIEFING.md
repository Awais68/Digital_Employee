# CEO Briefing Cron Setup

Automate the Weekly Monday Morning CEO Briefing.

## Option 1: Crontab (Recommended)

```bash
# Open crontab
crontab -e

# Add this line (adjust paths as needed):
0 8 * * 1 cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee" && python3 scripts/ceo_briefing.py --force >> Logs/ceo_briefing.log 2>&1
```

This runs every Monday at 8:00 AM.

## Option 2: Systemd Timer (Linux Service)

### Create the service file:

```bash
sudo tee /etc/systemd/system/ceo-briefing.service > /dev/null << 'EOF'
[Unit]
Description=Generate Weekly CEO Briefing
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee
ExecStart=/usr/bin/python3 scripts/ceo_briefing.py --force
Environment=ODOO_URL=http://localhost:8069
Environment=ODOO_DB=odoo
Environment=ODOO_USERNAME=awaisniaz720@gmail.com
Environment=ODOO_PASSWORD=Haris@123
EOF
```

### Create the timer file:

```bash
sudo tee /etc/systemd/system/ceo-briefing.timer > /dev/null << 'EOF'
[Unit]
Description=Weekly CEO Briefing Timer

[Timer]
OnCalendar=Mon *-*-* 08:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
```

### Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ceo-briefing.timer
sudo systemctl start ceo-briefing.timer
sudo systemctl status ceo-briefing.timer
```

## Option 3: Manual Execution

```bash
cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee"

# Run with default settings (Mon-Sun last week)
python3 scripts/ceo_briefing.py --force

# Run with custom date range
python3 scripts/ceo_briefing.py --force --start-date 2026-04-07 --end-date 2026-04-13

# Run with custom Obsidian vault path
python3 scripts/ceo_briefing.py --force --vault-path /home/awais/ObsidianVault
```

## Verify It's Working

After setup, check the logs:

```bash
# Check last run
tail -f Logs/ceo_briefing.log

# Check systemd timer
systemctl list-timers ceo-briefing.timer

# Check generated briefings
ls -la Briefings/
```

## Output

Briefings are saved as: `/Briefings/CEO_Briefing_YYYY-MM-DD.md`

Example: `Briefings/CEO_Briefing_2026-04-14.md`
