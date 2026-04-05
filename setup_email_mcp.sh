#!/bin/bash
# Quick setup script for Email MCP

echo "📧 Email MCP Setup Script"
echo "========================="
echo ""

# Check if credentials.json exists
if [ ! -f "credentials.json" ]; then
    echo "⚠️  credentials.json not found!"
    echo ""
    echo "Please download credentials from Google Cloud Console:"
    echo "1. Go to: https://console.cloud.google.com/apis/credentials"
    echo "2. Download OAuth 2.0 Client ID credentials"
    echo "3. Save as: credentials.json in this directory"
    echo ""
    exit 1
fi

echo "✅ credentials.json found"

# Test if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js v18 or higher."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if dependencies are installed
if [ ! -d "node_modules/@modelcontextprotocol" ]; then
    echo "📦 Installing dependencies..."
    npm install @modelcontextprotocol/sdk googleapis
fi

echo "✅ Dependencies installed"
echo ""
echo "🚀 Starting Email MCP Server..."
echo ""
echo "The server will start and you can use the following tools:"
echo "  - get_auth_url: Get OAuth2 authorization URL"
echo "  - set_auth_code: Complete OAuth2 flow"
echo "  - test_email_connection: Test connection"
echo "  - send_email: Send emails"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the MCP server
node email_mcp.js
