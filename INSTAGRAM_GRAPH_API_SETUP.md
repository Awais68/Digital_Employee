# Instagram Graph API Setup Guide

## Step-by-Step Instructions to Get Credentials

### Prerequisites
- You must have an **Instagram Business Account** (not personal)
- You must have a **Facebook Page** connected to your Instagram Business account
- You need a **Facebook Developer Account**

---

## Step 1: Convert to Instagram Business Account

1. Open Instagram app on your phone
2. Go to your Profile → Settings → Account
3. Tap "Switch to Professional Account"
4. Select "Business" (not Creator)
5. Connect to a Facebook Page (create one if needed)
6. Complete the setup

---

## Step 2: Create Facebook Developer Account

1. Go to: https://developers.facebook.com/
2. Click "Get Started" or "Create App"
3. Select "Business" as the app type
4. Fill in app details:
   - **App Name**: Digital Employee Social Media
   - **App Contact Email**: your-email@gmail.com
5. Complete app creation

---

## Step 3: Add Instagram Graph API Product

1. In your Facebook App Dashboard, go to "Add Products"
2. Find and add **"Instagram Graph API"**
3. Click "Set Up" on the Instagram Graph API product

---

## Step 4: Get Instagram Access Token

### Method 1: Graph API Explorer (Easiest)

1. Go to: https://developers.facebook.com/tools/explorer/
2. Select your app from the dropdown
3. Click "Generate Access Token"
4. Grant these permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
5. Click "Generate Token"
6. Copy the **Access Token** (it's a long string starting with "EAA...")

### Method 2: Manual OAuth Flow

1. Visit this URL (replace YOUR_APP_ID):
```
https://www.facebook.com/v18.0/dialog/oauth?
  client_id=YOUR_APP_ID
  &redirect_uri=https://www.facebook.com/connect/login_success.html
  &scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement
  &response_type=token
```
2. Authorize the app
3. Copy the `access_token` from the redirect URL

---

## Step 5: Get Instagram Account ID

### Option 1: Via Graph API Explorer

1. Go to: https://developers.facebook.com/tools/explorer/
2. Use your access token
3. Make this GET request:
```
GET me/accounts
```
4. Find your Facebook Page in the response
5. Copy the page `id`
6. Then make this request:
```
GET PAGE_ID?fields=instagram_business_account
```
7. Copy the `instagram_business_account.id` - **this is your Account ID**

### Option 2: Check Instagram App

1. Open Instagram app
2. Go to Settings → Account → About
3. Your Account ID may be listed (not always available)

### Option 3: Use This Command

Once you have your access token, run:
```bash
python3 Agent_Skills/SKILL_Instagram_Graph_API.py setup
```

This will attempt to fetch your account ID automatically.

---

## Step 6: Add Credentials to .env

Once you have both values, add them to your `.env` file:

```env
# Instagram Graph API Configuration
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
INSTAGRAM_ACCOUNT_ID=178414xxxxxxxxxxxxx
```

⚠️ **IMPORTANT**: 
- Never share your access token publicly
- Tokens expire after ~60 days (you'll need to refresh)
- Keep your .env file secure and never commit it to git

---

## Step 7: Test Your Credentials

After adding to .env, test with:
```bash
python3 Agent_Skills/SKILL_Instagram_Graph_API.py test
```

You should see:
```
✅ Credentials found in .env file
   Account ID: 178414xxxxxxxxxxxxx
   Access Token: EAAxxxxxxxx...
✅ Instagram API credentials are VALID!
   Username: your_instagram_username
   Account Type: BUSINESS
   Media Count: XX
```

---

## Troubleshooting

### "Invalid credentials" error
- Token may have expired - generate a new one
- Check token has correct permissions

### "Account not found" error  
- Ensure Instagram account is Business type
- Verify account is connected to Facebook Page

### "Permissions error"
- Make sure you granted `instagram_content_publish` permission
- App must be in development or approved mode

---

## Need More Help?

Official Facebook Documentation:
- https://developers.facebook.com/docs/instagram-api/getting-started
- https://developers.facebook.com/docs/instagram-api/instagram-graph-api
