/**
 * Test script for Email MCP
 * This script tests the Email MCP module without starting the server
 */

const path = require('path');

async function testEmailMCP() {
  console.log('📧 Testing Email MCP Module...\n');

  try {
    // Import the module
    const { EmailMCP, GmailAuth } = require('./email_mcp');
    console.log('✅ Module imported successfully\n');

    // Check if credentials exist
    const credentialsPath = path.join(__dirname, 'credentials.json');
    const fs = require('fs');
    
    if (!fs.existsSync(credentialsPath)) {
      console.log('⚠️  credentials.json not found (this is expected on first setup)');
      console.log('📝 To get credentials:');
      console.log('   1. Go to https://console.cloud.google.com/apis/credentials');
      console.log('   2. Download OAuth 2.0 Client ID (Desktop app)');
      console.log('   3. Save as credentials.json in this directory\n');
      return;
    }

    console.log('✅ credentials.json found\n');

    // Test GmailAuth initialization
    console.log('🔧 Testing GmailAuth initialization...');
    const auth = new GmailAuth(credentialsPath);
    await auth.initialize();
    console.log('✅ GmailAuth initialized\n');

    // Test EmailMCP initialization
    console.log('🔧 Testing EmailMCP initialization...');
    const emailMCP = new EmailMCP();
    await emailMCP.initialize(credentialsPath);
    console.log('✅ EmailMCP initialized\n');
    console.log(`   Sender: ${emailMCP.senderName} <${emailMCP.senderEmail}>`);
    console.log(`   Dry Run: ${emailMCP.dryRun}\n`);

    // Test connection
    console.log('🔗 Testing Gmail API connection...');
    const result = await emailMCP.testConnection();
    console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Message: ${result.message}\n`);

    if (result.success) {
      console.log('🎉 Email MCP is ready to use!');
      console.log('\nAvailable tools:');
      console.log('  - send_email: Send emails via Gmail API');
      console.log('  - test_email_connection: Test connection');
      console.log('  - get_auth_url: Get OAuth2 authorization URL');
      console.log('  - set_auth_code: Complete OAuth2 flow');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nThis is expected if:');
    console.error('  1. credentials.json is not set up yet');
    console.error('  2. OAuth2 authorization hasn\'t been completed');
    console.error('\nFollow the setup guide in EMAIL_MCP_NODE_GUIDE.md');
  }
}

// Run the test
testEmailMCP();
