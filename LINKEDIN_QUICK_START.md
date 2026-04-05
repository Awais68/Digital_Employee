# 🚀 LinkedIn Quick Start

**Just 3 steps to start posting automatically!**

---

## ⚡ Step 1: Save Your LinkedIn Session (One-Time, 2 Minutes)

```bash
python3 setup_linkedin_session.py
```

**What happens:**
- Browser opens → Login to LinkedIn → Session saves automatically
- You only do this ONCE ever (session persists forever)

---

## ✅ Step 2: Verify Session Works

```bash
python3 setup_linkedin_session.py
# Choose option 1 to test
```

Should show: **✅ Session is valid!**

---

## 📝 Step 3: Create & Post LinkedIn Content

### Option A: Daily Post Request (Recommended)

```bash
# File already created at: Needs_Action/LINKEDIN_DAILY_POST.md
python3 orchestrator.py
```

This generates a professional post draft in `Pending_Approval/`

### Option B: Custom Content

```bash
python3 orchestrator.py tasks "Post on LinkedIn: Your content here"
```

---

## 🎯 Approval Workflow

```
1. Review draft → Pending_Approval/LINKEDIN_POST_*.md
2. Approve it → mv Pending_Approval/LINKEDIN_POST_* Approved/
3. Run orchestrator → python3 orchestrator.py
4. Posted! → Check Dashboard.md for URL
```

---

## 📊 Check Status

Open **Dashboard.md** → Scroll to **🔵 LinkedIn Pending Posts** section

Shows:
- 🟡 Posts awaiting your review
- 🟢 Posts approved and ready to publish
- ✅ Posts successfully published

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "No saved session" | Run `python3 setup_linkedin_session.py` |
| "Session expired" | Re-run `python3 setup_linkedin_session.py` |
| Post not appearing | Check Dashboard.md for status |
| Want to see logs | `tail -f Logs/orchestrator.log` |

---

## 📚 Full Documentation

- `LINKEDIN_SETUP_GUIDE.md` - Complete setup guide
- `LINKEDIN_INTEGRATION_COMPLETE.md` - Implementation summary
- `Agent_Skills/SKILL_LinkedIn_Playwright_MCP.md` - Skill documentation

---

*🔵 Always require human approval before posting!*
