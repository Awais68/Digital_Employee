# 🔑 Get LinkedIn Access Token - Complete Visual Guide

**Follow these exact steps to get your LinkedIn API access token**

---

## Step 1: Go to LinkedIn Token Generator

**URL:** https://www.linkedin.com/developers/tools/oauth/token-generator

![Step 1](https://img.shields.io/badge/Step-1-blue)

1. Open the URL in your browser
2. Sign in to LinkedIn if prompted
3. You'll see the OAuth 2.0 Token Generator page

---

## Step 2: Select Your App

![Step 2](https://img.shields.io/badge/Step-2-blue)

1. You'll see a dropdown labeled **"Select an app"**
2. Choose **"Digital Employee"** (or whatever you named your app)
3. If you don't see any app, click **"Create app"** first

### Create App (if needed):
- Go to: https://www.linkedin.com/developers/apps
- Click **"Create app"**
- App Name: `Digital Employee`
- Company: Select your LinkedIn Page (or create one)
- App URL: `https://your-website.com` (can be placeholder)
- Click **"Create app"**
- Go back to token generator

---

## Step 3: Select Scopes (IMPORTANT!)

![Step 3](https://img.shields.io/badge/Step-3-blue)

You'll see a list of **scopes** (permissions). **CHECK THESE BOXES:**

### ✅ Required Scopes:

```
☑ w_member_social     ← REQUIRED for posting!
☑ r_basicprofile      ← REQUIRED for profile info
```

**How to select:**
1. Scroll through the list of scopes
2. Find `w_member_social` - check the box
3. Find `r_basicprofile` - check the box
4. Make sure both are checked!

### ⚠️ Common Mistake:
- **DON'T** forget `w_member_social` - this is REQUIRED for posting
- Without it, you'll get 403 error

---

## Step 4: Generate Token

![Step 4](https://img.shields.io/badge/Step-4-blue)

1. Click the **"Generate token"** button (blue button)
2. A popup will appear asking you to authorize
3. Click **"Allow"** or **"Authorize"**
4. You'll be redirected back with your token

---

## Step 5: Copy Your Access Token

![Step 5](https://img.shields.io/badge/Step-5-blue)

You'll see a response like this:

```json
{
  "access_token": "AQU6Xqd-I5ZHq3o8KxkggMAMkCdTgSkv0lrqOu8zk2tuDyByfWi91Iyj6Br61s-XX5T8nU5LHhGy0eLOwkAgxXIo9QwoVaXIgl0c9x4i9CL3ypcWgPy94kwBlwzhq_dvO8ZJcqNUHytVENRXjGempF0MH4SuIzBX_UGQAF8NPFfftYufslaDAuMC9ytGzPGe3xEOrEKnPccnPQuCrqaMvjSE9mKn52jltr70MACJKqRuWdVzQZvu28jSDsOew54xwwH8HvhEsQZ8cU75N8gpCQDgkkZUNh7Qx2Z4Q_kvmQpyph0PIeXH8gtvUp683G2wSZsWZFY9ctafXSk0TsLxsfqHH8EhUQ",
  "expires_in": 2592000,
  "scope": "w_member_social r_basicprofile",
  "token_type": "Bearer",
  "refresh_token": "...",
  "refresh_token_expires_in": 31536000
}
```

**COPY THE `access_token` VALUE!**

It's the long string that starts with `AQU` or `AQW`.

**Example:**
```
AQU6Xqd-I5ZHq3o8KxkggMAMkCdTgSkv0lrqOu8zk2tuDyByfWi91Iyj6Br61s-XX5T8nU5LHhGy0eLOwkAgxXIo9QwoVaXIgl0c9x4i9CL3ypcWgPy94kwBlwzhq_dvO8ZJcqNUHytVENRXjGempF0MH4SuIzBX_UGQAF8NPFfftYufslaDAuMC9ytGzPGe3xEOrEKnPccnPQuCrqaMvjSE9mKn52jltr70MACJKqRuWdVzQZvu28jSDsOew54xwwH8HvhEsQZ8cU75N8gpCQDgkkZUNh7Qx2Z4Q_kvmQpyph0PIeXH8gtvUp683G2wSZsWZFY9ctafXSk0TsLxsfqHH8EhUQ
```

---

## Step 6: Update .env File

![Step 6](https://img.shields.io/badge/Step-6-blue)

1. Open your `.env` file in the Digital Employee folder
2. Find this line:
   ```
   LINKEDIN_ACCESS_TOKEN=your_current_token_here
   ```
3. Replace with your NEW token:
   ```
   LINKEDIN_ACCESS_TOKEN=AQU6Xqd-I5ZHq3o8KxkggMAMkCdTgSkv0lrqOu8zk2tuDyByfWi91Iyj6Br61s-XX5T8nU5LHhGy0eLOwkAgxXIo9QwoVaXIgl0c9x4i9CL3ypcWgPy94kwBlwzhq_dvO8ZJcqNUHytVENRXjGempF0MH4SuIzBX_UGQAF8NPFfftYufslaDAuMC9ytGzPGe3xEOrEKnPccnPQuCrqaMvjSE9mKn52jltr70MACJKqRuWdVzQZvu28jSDsOew54xwwH8HvhEsQZ8cU75N8gpCQDgkkZUNh7Qx2Z4Q_kvmQpyph0PIeXH8gtvUp683G2wSZsWZFY9ctafXSk0TsLxsfqHH8EhUQ
   ```
4. Save the file

---

## Step 7: Verify Token Works

Open terminal and run:

```bash
cd /path/to/Digital_Employee
python3 linkedin_mcp.py test
```

**Expected output (success):**
```
✅ Connection test successful: Connected as: Your Name
✅ Connection test passed
```

**If you still see 403 error:**
- Double-check you selected `w_member_social` scope
- Generate a new token
- Make sure you copied the entire token (no spaces)

---

## 🎯 Quick Reference

| Step | Action | URL |
|------|--------|-----|
| 1 | Open Token Generator | https://www.linkedin.com/developers/tools/oauth/token-generator |
| 2 | Select App | Choose "Digital Employee" |
| 3 | Select Scopes | ☑ w_member_social, ☑ r_basicprofile |
| 4 | Generate | Click "Generate token" |
| 5 | Copy Token | Copy the `access_token` value |
| 6 | Update .env | Replace `LINKEDIN_ACCESS_TOKEN` |
| 7 | Test | `python3 linkedin_mcp.py test` |

---

## ⏰ Token Expiry

- **Access tokens expire in 30 days** (2592000 seconds)
- **Refresh tokens expire in 1 year** (31536000 seconds)
- Set a reminder to regenerate every 25 days!

---

## 🆘 Troubleshooting

### "Select an app" dropdown is empty
- You need to create an app first
- Go to: https://www.linkedin.com/developers/apps
- Click "Create app"

### 403 Error after token generation
- You didn't select `w_member_social` scope
- Generate a new token with correct scopes

### Token doesn't work
- Make sure you copied the entire token (no trailing spaces)
- Token should start with `AQU` or `AQW`
- Try generating a new token

---

**Ready to post on LinkedIn! 🚀**
