#!/usr/bin/env node
/**
 * setup_gmail_auth.js - Gmail OAuth 2.0 Authorization Helper
 * 
 * This script helps you authenticate with Gmail and save the OAuth token.
 * 
 * Usage:
 *   node setup_gmail_auth.js
 * 
 * The script will:
 * 1. Load your credentials.json
 * 2. Generate an authorization URL
 * 3. Open it in your browser (or display the URL)
 * 4. Wait for you to complete the OAuth flow
 * 5. Save the token to token.json
 * 
 * Author: Digital Employee System
 */

const { google } = require('googleapis');
const http = require('http');
const open = require('open');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const BASE_DIR = process.cwd();
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(BASE_DIR, 'credentials.json');
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.join(BASE_DIR, 'token.json');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Load OAuth credentials
 */
async function loadCredentials() {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(content);
    
    // Support both 'installed' and 'web' application types
    const config = credentials.installed || credentials.web;
    
    if (!config) {
      throw new Error('Invalid credentials format. Expected "installed" or "web" OAuth client.');
    }
    
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('❌ Error: credentials.json not found!');
      console.error('');
      console.error('Please follow these steps:');
      console.error('1. Go to https://console.cloud.google.com/');
      console.error('2. Create a new project or select existing');
      console.error('3. Enable Gmail API');
      console.error('4. Create OAuth 2.0 credentials (Desktop app)');
      console.error('5. Download the credentials.json file');
      console.error('6. Place it in: ' + CREDENTIALS_PATH);
      console.error('');
      console.error('See GMAIL_SETUP_GUIDE.md for detailed instructions.');
    } else {
      console.error('❌ Failed to load credentials:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Save OAuth token
 */
async function saveToken(token) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), 'utf-8');
  console.log(`\n💾 Token saved to: ${TOKEN_PATH}`);
}

/**
 * Method 1: Local server callback (preferred)
 * Starts a local server to receive the OAuth callback
 */
async function authWithLocalServer(config) {
  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    'http://localhost:3000/oauth2callback'
  );

  const scopes = ['https://www.googleapis.com/auth/gmail.send'];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Force consent screen to ensure refresh token
  });

  console.log('🔐 Gmail OAuth 2.0 Authorization');
  console.log('=' .repeat(60));
  console.log('Opening browser for authentication...');
  console.log('');

  // Try to open browser
  try {
    await open(authUrl);
    console.log('✅ Browser opened automatically');
  } catch (error) {
    console.log('⚠️  Could not open browser automatically');
    console.log('Please copy and paste this URL into your browser:');
    console.log('');
    console.log(authUrl);
    console.log('');
  }

  console.log('Waiting for authentication...');
  console.log('');

  // Create local server to receive callback
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:3000');
        
        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');
          
          if (!code) {
            res.writeHead(400);
            res.end('Error: No authorization code received');
            reject(new Error('No authorization code'));
            return;
          }

          console.log('✅ Authorization code received!');
          
          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code);
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h2>✅ Authentication Successful!</h2>
                <p>Gmail access has been granted to Digital Employee.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);

          console.log('🎉 Authentication completed successfully!');
          server.close();
          resolve(tokens);
        }
      } catch (error) {
        res.writeHead(500);
        res.end('Error processing callback');
        server.close();
        reject(error);
      }
    });

    server.listen(3000, () => {
      console.log('🌐 Local server listening on http://localhost:3000');
      console.log('');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 5 minutes'));
    }, 300000);
  });
}

/**
 * Method 2: Manual code input (fallback)
 */
async function authWithManualCode(config) {
  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const scopes = ['https://www.googleapis.com/auth/gmail.send'];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  console.log('🔐 Gmail OAuth 2.0 Authorization (Manual Mode)');
  console.log('=' .repeat(60));
  console.log('');
  console.log('Please visit this URL in your browser:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('=' .repeat(60));
  console.log('');

  const answer = await new Promise((resolve) => {
    rl.question('Enter the authorization code from the page: ', (code) => {
      resolve(code);
    });
  });

  const code = answer.trim();
  
  if (!code) {
    throw new Error('No authorization code provided');
  }

  console.log('\n⏳ Exchanging code for tokens...');
  
  const { tokens } = await oauth2Client.getToken(code);
  
  console.log('✅ Authentication successful!');
  
  return tokens;
}

/**
 * Test the Gmail connection
 */
async function testConnection(oauth2Client) {
  console.log('\n🧪 Testing Gmail connection...');
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`✅ Successfully connected as: ${profile.data.emailAddress}`);
    return profile.data.emailAddress;
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Gmail OAuth 2.0 Authentication Setup               ║');
  console.log('║     Digital Employee System                             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  // Load credentials
  const config = await loadCredentials();
  console.log('✅ Credentials loaded from: ' + CREDENTIALS_PATH);
  console.log('');

  // Ask user for authentication method
  console.log('Choose authentication method:');
  console.log('1. Local server (recommended - opens browser automatically)');
  console.log('2. Manual code input (fallback)');
  console.log('');

  const method = await new Promise((resolve) => {
    rl.question('Select method [1/2]: ', (answer) => {
      resolve(answer.trim() === '2' ? 'manual' : 'local');
    });
  });

  console.log('');

  let tokens;
  
  try {
    if (method === 'local') {
      tokens = await authWithLocalServer(config);
    } else {
      tokens = await authWithManualCode(config);
    }

    // Save token
    await saveToken(tokens);

    // Test connection
    const oauth2Client = new google.auth.OAuth2(
      config.client_id,
      config.client_secret,
      config.redirect_uris[0]
    );
    oauth2Client.setCredentials(tokens);
    
    const email = await testConnection(oauth2Client);

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║     ✅ Authentication Setup Complete!                   ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📧 Authenticated email: ${email}`);
    console.log(`💾 Token file: ${TOKEN_PATH}`);
    console.log('');
    console.log('You can now use the Email MCP server to send emails!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Authentication failed:', error.message);
    console.error('');
    console.error('Troubleshooting tips:');
    console.error('1. Ensure credentials.json is correct');
    console.error('2. Check that Gmail API is enabled');
    console.error('3. Verify your email is added as a test user in OAuth consent screen');
    console.error('4. Try the other authentication method if one fails');
    console.error('');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
