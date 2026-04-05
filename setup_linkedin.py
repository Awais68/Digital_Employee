#!/usr/bin/env python3
"""
setup_linkedin.py - LinkedIn MCP Setup Wizard

This interactive script helps you:
1. Get your LinkedIn Person URN
2. Test your access token
3. Update .env file automatically
4. Test post creation

Usage:
    python3 setup_linkedin.py
"""

import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

# Colors for output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 70}")
    print(f"  {text}")
    print(f"{'=' * 70}{Colors.ENDC}\n")

def print_success(text):
    print(f"{Colors.OKGREEN}✅ {text}{Colors.ENDC}")

def print_error(text):
    print(f"{Colors.FAIL}❌ {text}{Colors.ENDC}")

def print_warning(text):
    print(f"{Colors.WARNING}⚠️  {text}{Colors.ENDC}")

def main():
    print_header("LINKEDIN MCP SETUP WIZARD")
    
    BASE_DIR = Path(__file__).parent.resolve()
    ENV_FILE = BASE_DIR / ".env"
    
    # Load environment
    load_dotenv(ENV_FILE)
    
    # Get current credentials
    client_id = os.getenv("LINKEDIN_CLIENT_ID", "")
    client_secret = os.getenv("LINKEDIN_CLIENT_SECRET", "")
    access_token = os.getenv("LINKEDIN_ACCESS_TOKEN", "")
    person_urn = os.getenv("LINKEDIN_PERSON_URN", "")
    
    print("📋 Current Configuration:")
    print(f"   Client ID: {client_id[:10]}..." if client_id else "   Client ID: Not configured")
    print(f"   Client Secret: {'*' * 10}..." if client_secret else "   Client Secret: Not configured")
    print(f"   Access Token: {access_token[:20]}..." if access_token else "   Access Token: Not configured")
    print(f"   Person URN: {person_urn}" if person_urn else "   Person URN: Not configured")
    print()
    
    # Check if we have credentials
    if not access_token:
        print_error("LinkedIn Access Token not configured!")
        print()
        print("To get your access token:")
        print("1. Go to: https://www.linkedin.com/developers/tools/oauth/token-generator")
        print("2. Select your app")
        print("3. Choose scopes: w_member_social, r_basicprofile")
        print("4. Click 'Generate token'")
        print("5. Copy the token")
        print()
        
        token = input("Paste your access token here (or press Enter to skip): ").strip()
        
        if token:
            # Update .env
            with open(ENV_FILE, 'r', encoding='utf-8') as f:
                env_content = f.read()
            
            # Replace old token
            import re
            old_token_pattern = r'LINKEDIN_ACCESS_TOKEN=.*'
            new_line = f'LINKEDIN_ACCESS_TOKEN={token}'
            
            if 'LINKEDIN_ACCESS_TOKEN=' in env_content:
                env_content = re.sub(old_token_pattern, new_line, env_content)
            else:
                env_content += f'\n{new_line}\n'
            
            with open(ENV_FILE, 'w', encoding='utf-8') as f:
                f.write(env_content)
            
            print_success("Access token saved to .env")
            access_token = token
        else:
            print_warning("Skipping token configuration")
            return
    
    # Test the token
    print()
    print_header("TESTING LINKEDIN CONNECTION")
    
    try:
        import requests
        
        response = requests.get(
            "https://api.linkedin.com/v2/me",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-Restli-Protocol-Version": "2.0.0"
            }
        )
        
        if response.status_code == 200:
            profile = response.json()
            person_id = profile.get('id', '')
            first_name = profile.get('localizedFirstName', 'Unknown')
            
            print_success(f"Connected to LinkedIn as: {first_name}")
            print(f"   Person ID: {person_id}")
            
            # Get/update Person URN
            expected_urn = f"urn:li:person:{person_id}"
            
            if not person_urn or person_urn == "urn:li:person:YOUR_PERSON_ID":
                print()
                print_warning("Person URN not configured. Auto-configuring...")
                
                with open(ENV_FILE, 'r', encoding='utf-8') as f:
                    env_content = f.read()
                
                old_line = "LINKEDIN_PERSON_URN=urn:li:person:YOUR_PERSON_ID"
                new_line = f"LINKEDIN_PERSON_URN={expected_urn}"
                
                if old_line in env_content:
                    env_content = env_content.replace(old_line, new_line)
                    
                    with open(ENV_FILE, 'w', encoding='utf-8') as f:
                        f.write(env_content)
                    
                    print_success(f"Person URN saved: {expected_urn}")
                    person_urn = expected_urn
            else:
                print(f"   Person URN: {person_urn}")
            
            print()
            print_success("LinkedIn connection is working!")
            
        elif response.status_code == 401:
            print_error("Authentication failed - Access token expired or invalid")
            print()
            print("Please get a new token from:")
            print("https://www.linkedin.com/developers/tools/oauth/token-generator")
            return
            
        elif response.status_code == 403:
            print_error("Access denied - Missing permissions")
            print()
            print("Required scopes: w_member_social, r_basicprofile")
            print("Please regenerate token with these scopes")
            return
            
        else:
            print_error(f"API Error: {response.status_code}")
            print(f"Response: {response.text}")
            return
            
    except ImportError:
        print_error("'requests' library not installed")
        print("Install with: pip install requests")
        return
    
    # Test post creation (dry-run)
    print()
    print_header("TESTING POST CREATION (DRY-RUN)")
    
    sys.path.insert(0, str(BASE_DIR))
    
    try:
        from linkedin_mcp import create_post
        
        test_content = """🚀 Testing LinkedIn integration!

This is a test post from my Digital Employee System.

#AI #Testing #Automation"""
        
        print("Creating test post (DRY-RUN mode)...")
        result = create_post(content=test_content, dry_run=True)
        
        if result.get("success"):
            print_success("Test post created successfully!")
            print(f"   Message: {result['message']}")
            print(f"   Post ID: {result.get('post_id', 'N/A')}")
        else:
            print_error(f"Test post failed: {result.get('message', 'Unknown error')}")
            
    except Exception as e:
        print_error(f"Error testing post creation: {e}")
    
    # Summary
    print()
    print_header("SETUP COMPLETE!")
    
    print("✅ Configuration Summary:")
    print(f"   • Access Token: Configured")
    print(f"   • Person URN: {person_urn}")
    print(f"   • Connection: Working")
    print()
    
    print("📝 Next Steps:")
    print("   1. Set DRY_RUN=false in .env (when ready for production)")
    print("   2. Move LinkedIn drafts from Pending_Approval/ to Approved/")
    print("   3. Run: python3 orchestrator.py")
    print()
    
    print("🚀 Ready to post on LinkedIn!")
    print()


if __name__ == "__main__":
    main()
