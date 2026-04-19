#!/bin/bash
# setup_auth.sh - Unified Authentication Setup for Digital Employee
#
# Interactive script to setup both Gmail and LinkedIn authentication
#
# Usage:
#   chmod +x setup_auth.sh
#   ./setup_auth.sh
#
# Author: Digital Employee System

# Colors for terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Digital Employee - Authentication Setup              ║${NC}"
echo -e "${BLUE}║     Gmail & LinkedIn MCP Servers                         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print section header
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check for Node.js
    if command_exists node; then
        echo -e "${GREEN}✅${NC} Node.js found: $(node --version)"
    else
        echo -e "${RED}❌${NC} Node.js not found!"
        echo "   Please install Node.js: https://nodejs.org/"
        exit 1
    fi
    
    # Check for Python 3
    if command_exists python3; then
        echo -e "${GREEN}✅${NC} Python 3 found: $(python3 --version)"
    else
        echo -e "${RED}❌${NC} Python 3 not found!"
        echo "   Please install Python 3.8+"
        exit 1
    fi
    
    # Check for npm
    if command_exists npm; then
        echo -e "${GREEN}✅${NC} npm found: $(npm --version)"
    else
        echo -e "${RED}❌${NC} npm not found!"
        echo "   Please install npm (comes with Node.js)"
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}✅${NC} All prerequisites met!"
}

# Function to setup Gmail authentication
setup_gmail() {
    print_header "Gmail Authentication Setup"
    
    CREDENTIALS_FILE="$SCRIPT_DIR/credentials.json"
    TOKEN_FILE="$SCRIPT_DIR/token.json"
    
    # Check if credentials.json exists
    if [ ! -f "$CREDENTIALS_FILE" ]; then
        echo -e "${YELLOW}⚠️  credentials.json not found!${NC}"
        echo ""
        echo "You need to create Google Cloud credentials first."
        echo ""
        echo "Quick steps:"
        echo "  1. Go to: https://console.cloud.google.com/"
        echo "  2. Create a new project"
        echo "  3. Enable Gmail API"
        echo "  4. Create OAuth 2.0 credentials (Desktop app)"
        echo "  5. Download credentials.json"
        echo ""
        echo "For detailed instructions, see: GMAIL_SETUP_GUIDE.md"
        echo ""
        
        read -p "Do you have credentials.json ready? [y/N]: " has_creds
        
        if [[ "$has_creds" =~ ^[Yy]$ ]]; then
            read -p "Path to credentials.json: " creds_path
            if [ -f "$creds_path" ]; then
                cp "$creds_path" "$CREDENTIALS_FILE"
                echo -e "${GREEN}✅${NC} Credentials file copied!"
            else
                echo -e "${RED}❌${NC} File not found: $creds_path"
                exit 1
            fi
        else
            echo ""
            echo -e "${YELLOW}⏭️  Skipping Gmail setup for now.${NC}"
            echo "   Run 'node setup_gmail_auth.js' later when you have credentials."
            return 1
        fi
    else
        echo -e "${GREEN}✅${NC} credentials.json found"
    fi
    
    # Check if token already exists
    if [ -f "$TOKEN_FILE" ]; then
        echo -e "${YELLOW}⚠️  Existing Gmail token found${NC}"
        read -p "Re-authenticate Gmail? [y/N]: " reauth
        
        if [[ ! "$reauth" =~ ^[Yy]$ ]]; then
            echo -e "${GREEN}✅${NC} Keeping existing Gmail token"
            return 0
        fi
    fi
    
    # Run Gmail authorization
    echo ""
    echo -e "${BLUE}🔐${NC} Starting Gmail OAuth authorization..."
    echo ""
    
    cd "$SCRIPT_DIR" && node setup_gmail_auth.js
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Gmail authentication setup complete!${NC}"
        return 0
    else
        echo ""
        echo -e "${RED}❌ Gmail authentication failed${NC}"
        return 1
    fi
}

# Function to setup LinkedIn authentication
setup_linkedin() {
    print_header "LinkedIn Authentication Setup"
    
    SESSION_DIR="$SCRIPT_DIR/linkedin_session"
    COOKIES_FILE="$SESSION_DIR/cookies.json"
    
    # Check if session already exists
    if [ -f "$COOKIES_FILE" ]; then
        echo -e "${YELLOW}⚠️  Existing LinkedIn session found!${NC}"
        echo "   Session file: $COOKIES_FILE"
        echo "   Last modified: $(stat -c %y "$COOKIES_FILE" 2>/dev/null || stat -f "%Sm" "$COOKIES_FILE" 2>/dev/null || echo 'Unknown')"
        echo ""
        
        read -p "Re-authenticate LinkedIn? [y/N]: " reauth
        
        if [[ ! "$reauth" =~ ^[Yy]$ ]]; then
            echo -e "${GREEN}✅${NC} Keeping existing LinkedIn session"
            return 0
        fi
        
        echo ""
        echo -e "${YELLOW}🗑️  Removing old session file...${NC}"
        rm -f "$COOKIES_FILE"
    fi
    
    # Run LinkedIn authorization
    echo -e "${BLUE}🔐${NC} Starting LinkedIn session setup..."
    echo ""
    
    cd "$SCRIPT_DIR" && bash setup_linkedin_auth.sh
    
    if [ $? -eq 0 ] && [ -f "$COOKIES_FILE" ]; then
        echo ""
        echo -e "${GREEN}✅ LinkedIn authentication setup complete!${NC}"
        return 0
    else
        echo ""
        echo -e "${RED}❌ LinkedIn authentication failed${NC}"
        return 1
    fi
}

# Function to test authentication
test_auth() {
    print_header "Testing Authentication"
    
    # Test Gmail
    TOKEN_FILE="$SCRIPT_DIR/token.json"
    if [ -f "$TOKEN_FILE" ]; then
        echo -e "${GREEN}✅${NC} Gmail token file exists"
        echo "   Testing connection..."
        
        cd "$SCRIPT_DIR" && node -e "
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function test() {
  try {
    const creds = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'));
    const config = creds.installed || creds.web;
    const oauth2 = new google.auth.OAuth2(config.client_id, config.client_secret, config.redirect_uris[0]);
    oauth2.setCredentials(JSON.parse(fs.readFileSync('token.json', 'utf-8')));
    const gmail = google.gmail({version: 'v1', auth: oauth2});
    const profile = await gmail.users.getProfile({userId: 'me'});
    console.log('   ✅ Gmail connected as: ' + profile.data.emailAddress);
  } catch(e) {
    console.log('   ❌ Gmail test failed: ' + e.message);
  }
}
test();
" 2>&1
    else
        echo -e "${YELLOW}⚠️  Gmail not setup (token.json not found)${NC}"
    fi
    
    echo ""
    
    # Test LinkedIn
    COOKIES_FILE="$SCRIPT_DIR/linkedin_session/cookies.json"
    if [ -f "$COOKIES_FILE" ]; then
        echo -e "${GREEN}✅${NC} LinkedIn session file exists"
        echo "   Testing connection..."
        
        cd "$SCRIPT_DIR" && python3 -c "
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
try:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import test_linkedin_session
    test_linkedin_session()
except Exception as e:
    print(f'   ⚠️  LinkedIn test skipped: {e}')
" 2>&1
    else
        echo -e "${YELLOW}⚠️  LinkedIn not setup (cookies.json not found)${NC}"
    fi
}

# Main interactive flow
check_prerequisites

echo ""
echo "What would you like to setup?"
echo "1. Gmail authentication only"
echo "2. LinkedIn authentication only"
echo "3. Both Gmail and LinkedIn (recommended)"
echo "4. Test existing authentication"
echo ""

read -p "Select option [1-4]: " choice

case "$choice" in
    1)
        setup_gmail
        ;;
    2)
        setup_linkedin
        ;;
    3)
        GMAIL_SUCCESS=false
        LINKEDIN_SUCCESS=false
        
        if setup_gmail; then
            GMAIL_SUCCESS=true
        fi
        
        if setup_linkedin; then
            LINKEDIN_SUCCESS=true
        fi
        
        echo ""
        print_header "Setup Summary"
        
        if [ "$GMAIL_SUCCESS" = true ]; then
            echo -e "${GREEN}✅${NC} Gmail authentication: Setup complete"
        else
            echo -e "${YELLOW}⏭️  Gmail authentication: Skipped or failed${NC}"
        fi
        
        if [ "$LINKEDIN_SUCCESS" = true ]; then
            echo -e "${GREEN}✅${NC} LinkedIn authentication: Setup complete"
        else
            echo -e "${YELLOW}⏭️  LinkedIn authentication: Skipped or failed${NC}"
        fi
        
        echo ""
        
        if [ "$GMAIL_SUCCESS" = true ] || [ "$LINKEDIN_SUCCESS" = true ]; then
            read -p "Would you like to test the authentication? [Y/n]: " test_choice
            
            if [[ ! "$test_choice" =~ ^[Nn]$ ]]; then
                test_auth
            fi
        fi
        ;;
    4)
        test_auth
        ;;
    *)
        echo -e "${RED}❌ Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Authentication setup process completed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "  - Check AUTH_SETUP_GUIDE.md for usage instructions"
echo "  - Test sending emails via the Email MCP server"
echo "  - Post to LinkedIn using the LinkedIn MCP server"
echo ""
echo "To run setup again:"
echo "  ./setup_auth.sh"
echo ""
