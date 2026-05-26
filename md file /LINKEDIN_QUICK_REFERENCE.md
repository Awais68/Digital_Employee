# 📋 LinkedIn Posting - Quick Reference Card

**Everything you need to post on LinkedIn in one place**

---

## 🎯 Quick Start (3 Steps)

### Step 1: Get Token
```
👉 Go to: https://www.linkedin.com/developers/tools/oauth/token-generator
👉 Select app: Digital Employee
👉 Check scopes: w_member_social, r_basicprofile
👉 Click: Generate token
👉 Copy: access_token (long string starting with AQU or AQW)
```

### Step 2: Update .env
```bash
# Open .env file and replace:
LINKEDIN_ACCESS_TOKEN=YOUR_NEW_TOKEN_HERE
```

### Step 3: Test & Post
```bash
# Test connection
python3 linkedin_mcp.py test

# Post to LinkedIn
python3 linkedin_mcp.py post "Your post content here #hashtags"
```

---

## 📁 File Locations

| File | Purpose |
|------|---------|
| `.env` | LinkedIn credentials |
| `linkedin_mcp.py` | LinkedIn posting script |
| `GET_LINKEDIN_TOKEN_GUIDE.md` | Detailed token guide |
| `Pending_Approval/READY_TO_POST_LINKEDIN.md` | **Ready to publish post** |
| `Logs/linkedin_log_*.md` | Post logs |

---

## 🚀 Publishing Your First Post

### Option A: Using Orchestrator (Automated)

```bash
# 1. Move post to Approved folder
mv Pending_Approval/READY_TO_POST_LINKEDIN.md Approved/

# 2. Run orchestrator (auto-publishes)
python3 orchestrator.py

# 3. Check result
cat Done/READY_TO_POST_LINKEDIN.md
# Look for post URL in the file
```

### Option B: Direct Command

```bash
# Post directly via command line
python3 linkedin_mcp.py post "🚀 My Digital Employee System is live! #AI #Automation"
```

---

## ✅ Success Checklist

Before posting, verify:

- [ ] LinkedIn token generated with `w_member_social` scope
- [ ] Token updated in `.env` file
- [ ] Connection test passes: `python3 linkedin_mcp.py test`
- [ ] DRY_RUN=false in .env (for production posting)
- [ ] Post content ready in Pending_Approval/

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| **403 Error** | Token missing `w_member_social` scope - regenerate |
| **401 Error** | Token expired - get new token |
| **No post published** | Check DRY_RUN=false in .env |
| **Connection failed** | Verify token is correctly copied (no spaces) |

---

## 📞 Command Reference

```bash
# === TESTING ===
python3 linkedin_mcp.py test              # Test connection
python3 linkedin_mcp.py post "test"       # Test post (dry-run)

# === POSTING ===
python3 linkedin_mcp.py post "content"    # Create post
python3 linkedin_mcp.py post-file file.md # From file

# === WORKFLOW ===
mv Pending_Approval/*.md Approved/        # Approve post
python3 orchestrator.py                   # Auto-publish
cat Done/*.md                             # Check result
```

---

## 🎯 Your Next Actions

1. **Get Token:** Follow GET_LINKEDIN_TOKEN_GUIDE.md
2. **Update .env:** Replace LINKEDIN_ACCESS_TOKEN
3. **Test:** `python3 linkedin_mcp.py test`
4. **Publish:** Move READY_TO_POST_LINKEDIN.md to Approved/
5. **Verify:** Check your LinkedIn profile!

---

**Ready to post! 🚀**

---

## 📧 Support

If you get stuck:
1. Check GET_LINKEDIN_TOKEN_GUIDE.md for detailed steps
2. Run: `python3 setup_linkedin.py` (interactive setup)
3. Check logs: `tail -f Logs/linkedin_mcp.log`
