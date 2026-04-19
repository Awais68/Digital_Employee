#!/bin/bash
# setup_linkedin_auth.sh - LinkedIn Authentication Setup Helper
#
# This script helps you set up LinkedIn session for automated posting.
#
# Usage:
#   chmod +x setup_linkedin_auth.sh
#   ./setup_linkedin_auth.sh
#
# The script will:
# 1. Check if Playwright is installed
# 2. Launch a browser for LinkedIn login
# 3. Save session cookies for future use
#
# Author: Digital Employee System

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     LinkedIn Session Authentication Setup                ║"
echo "║     Digital Employee System                              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
AGENT_SKILLS_DIR="$SCRIPT_DIR/Agent_Skills"

echo "🔍 Checking dependencies..."
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed!"
    echo "   Please install Python 3.8 or higher."
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"

# Check if Playwright is installed
if ! python3 -c "import playwright" &> /dev/null; then
    echo "⚠️  Playwright not found. Installing..."
    echo ""
    
    # Install Playwright
    pip3 install playwright
    
    # Install Chromium browser
    echo ""
    echo "🌐 Installing Chromium browser for Playwright..."
    python3 -m playwright install chromium
    
    echo ""
    echo "✅ Playwright installation complete!"
    echo ""
else
    echo "✅ Playwright already installed"
    echo ""
fi

# Check if session already exists
SESSION_DIR="$SCRIPT_DIR/linkedin_session"
COOKIES_FILE="$SESSION_DIR/cookies.json"

if [ -f "$COOKIES_FILE" ]; then
    echo "⚠️  Existing LinkedIn session found!"
    echo "   Session file: $COOKIES_FILE"
    echo "   Last modified: $(stat -c %y "$COOKIES_FILE" 2>/dev/null || stat -f "%Sm" "$COOKIES_FILE" 2>/dev/null || echo 'Unknown')"
    echo ""
    echo "Choose an option:"
    echo "1. Keep existing session (exit)"
    echo "2. Create new session (overwrite existing)"
    echo ""
    
    read -p "Select option [1/2]: " choice
    
    if [ "$choice" = "1" ]; then
        echo ""
        echo "✅ Keeping existing session. No changes made."
        exit 0
    fi
    
    echo ""
    echo "🗑️  Removing old session file..."
    rm -f "$COOKIES_FILE"
    echo ""
fi

# Create session directory if it doesn't exist
mkdir -p "$SESSION_DIR"

echo ""
echo "🔐 Starting LinkedIn authentication..."
echo ""
echo "A browser window will open for you to login to LinkedIn."
echo "After logging in successfully, the session will be saved automatically."
echo ""
echo "⏳ The script will wait for you to complete the login process..."
echo ""

# Run the LinkedIn session setup using Python
python3 << 'PYTHON_SCRIPT'
import sys
import os
from pathlib import Path

# Add the project root to Python path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Import the LinkedIn MCP module
try:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import save_linkedin_session
except ImportError as e:
    print(f"❌ Failed to import LinkedIn MCP module: {e}")
    print("   Make sure SKILL_LInkedin_Playwright_MCP.py exists in Agent_Skills/")
    sys.exit(1)

# Run the session setup
print("=" * 60)
print("")
save_linkedin_session()

print("")
print("=" * 60)
print("")

# Verify session was created
cookies_file = BASE_DIR / "linkedin_session" / "cookies.json"

if cookies_file.exists():
    import json
    with open(cookies_file, 'r', encoding='utf-8') as f:
        cookies = json.load(f)
    
    print(f"✅ Session file created: {cookies_file}")
    print(f"📊 Number of cookies saved: {len(cookies)}")
    print("")
    print("🎉 LinkedIn authentication setup complete!")
    print("")
    print("You can now:")
    print("  - Post to LinkedIn via the MCP server")
    print("  - Use the post_to_linkedin() function")
    print("  - Session will be reused automatically for future posts")
    print("")
else:
    print("❌ Session file was not created!")
    print("   Please try again or check for errors above.")
    sys.exit(1)
PYTHON_SCRIPT

# Check if setup was successful
if [ -f "$COOKIES_FILE" ]; then
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║     ✅ LinkedIn Authentication Setup Complete!           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    echo "📂 Session file: $COOKIES_FILE"
    echo "🔒 File permissions: $(stat -c %a "$COOKIES_FILE" 2>/dev/null || stat -f "%Lp" "$COOKIES_FILE" 2>/dev/null || echo '600')"
    echo ""
    echo "Your LinkedIn session is now saved and ready to use!"
    echo ""
    echo "To test the session, run:"
    echo "  python3 -c \"from Agent_Skills.SKILL_LInkedin_Playwright_MCP import test_linkedin_session; test_linkedin_session()\""
    echo ""
else
    echo ""
    echo "❌ Session setup failed!"
    echo "   Please check the error messages above and try again."
    echo ""
    exit 1
fi
