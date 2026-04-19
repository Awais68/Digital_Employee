# Gmail MCP Authentication Setup Guide

This guide will walk you through setting up Gmail OAuth 2.0 authentication for the Email MCP server.

## Prerequisites

- Google Cloud Platform account
- Gmail account you want to use for sending emails
- Node.js and npm installed

## Step-by-Step Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Name it (e.g., "Digital Employee Gmail")
4. Click **Create**

### Step 2: Enable Gmail API

1. In your new project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Gmail API"**
3. Click on it and press **"Enable"**

### Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **External** user type (unless you have Google Workspace)
3. Fill in required fields:
   - **App name**: Digital Employee
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. **Scopes**: Add the following scope:
   - `.../auth/gmail.send` - Send emails on your behalf
6. Click **Update** → **Save and Continue**
7. **Test users**: Add your Gmail address as a test user
8. Click **Save and Continue**

### Step 4: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. Application type: **Desktop app**
4. Name: **Digital Employee Gmail**
5. Click **Create**
6. **Download the credentials JSON** file

### Step 5: Save Credentials

1. Rename the downloaded file to `credentials.json`
2. Place it in the project root directory:
   ```
   /media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee/credentials.json
   ```

### Step 6: Run Authorization Script

Run the authorization script to get the OAuth token:

```bash
node setup_gmail_auth.js
```

This will:
1. Open a browser window
2. Ask you to login with your Google account
3. Request permission to send emails
4. Save the token to `token.json`

### Step 7: Verify Setup

After successful authorization, the script will:
- Create `token.json` in the project root
- Test the Gmail API connection
- Display your authenticated email address

## File Structure

After setup, you should have:
```
Digital_Employee/
├── credentials.json          # OAuth 2.0 credentials (DO NOT SHARE)
├── token.json                # OAuth token (auto-generated, DO NOT SHARE)
└── email_mcp.js             # Email MCP server
```

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit `credentials.json` or `token.json` to version control
- These files are already in `.gitignore`
- Keep these files secure - they provide access to your Gmail account
- Token expires periodically - re-run `setup_gmail_auth.js` if needed

## Troubleshooting

### "No token found" Error
- Run `node setup_gmail_auth.js` to authenticate

### "Authentication failed" Error
- Token may have expired
- Delete `token.json` and re-run authorization

### "Permission denied" Error
- Check that Gmail API is enabled in Google Cloud Console
- Verify OAuth consent screen is configured
- Ensure your email is added as a test user

### Credentials File Issues
- Ensure `credentials.json` is valid JSON
- Check that it contains `installed` or `web` OAuth client configuration
- File should have `client_id`, `client_secret`, and `redirect_uris`

## Next Steps

Once authenticated, you can:
- Send emails via the Email MCP server
- Use email templates
- Attach files to emails
- Enable dry-run mode for testing

For more details, see the email MCP server documentation in `email_mcp.js`.
