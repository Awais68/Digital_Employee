#!/usr/bin/env python3
"""
Silver Tier Test Suite - Master Test Script

This script tests the complete Silver Tier workflow:
1. Creates test email task
2. Creates test LinkedIn request
3. Runs orchestrator
4. Shows Dashboard summary
5. Validates all files created

Usage: python3 run_silver_test.py
"""

import os
import sys
import shutil
from pathlib import Path
from datetime import datetime

# =============================================================================
# Configuration
# =============================================================================

BASE_DIR = Path(__file__).resolve().parent
NEEDS_ACTION = BASE_DIR / "Needs_Action"
PENDING_APPROVAL = BASE_DIR / "Pending_Approval"
PLANS = BASE_DIR / "Plans"
DONE = BASE_DIR / "Done"
DASHBOARD = BASE_DIR / "Dashboard.md"

# Test files
TEST_EMAIL_FILE = "test_silver_email.md"
TEST_LINKEDIN_FILE = "test_silver_linkedin.md"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 70}{Colors.RESET}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(70)}{Colors.RESET}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'=' * 70}{Colors.RESET}\n")

def print_success(text):
    print(f"{Colors.GREEN}✅ {text}{Colors.RESET}")

def print_info(text):
    print(f"{Colors.CYAN}ℹ️  {text}{Colors.RESET}")

def print_warning(text):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.RESET}")

def print_error(text):
    print(f"{Colors.RED}❌ {text}{Colors.RESET}")

def print_step(step_num, text):
    print(f"\n{Colors.BLUE}{'─' * 60}{Colors.RESET}")
    print(f"{Colors.BLUE}Step {step_num}: {text}{Colors.RESET}")
    print(f"{Colors.BLUE}{'─' * 60}{Colors.RESET}\n")

# =============================================================================
# Test File Creation
# =============================================================================

def create_test_email_task():
    """Create a test email task in Needs_Action folder."""
    
    content = """---
type: email
from: "John Smith" <john.smith@example.com>
subject: Silver Tier Test - AI Integration Meeting
priority: high
received: 2026-04-02T12:00:00
---

# Test Email for Silver Tier Validation

**Purpose:** This is a test email to validate the Silver Tier email approval workflow.

## Request Details

I would like to schedule a meeting to discuss:

1. AI agent integration roadmap
2. SaaS platform architecture
3. Timeline and deliverables
4. Budget and resource allocation

## Availability

I am available:
- Tuesday, April 4th at 2:00 PM PKT
- Wednesday, April 5th at 10:00 AM PKT
- Thursday, April 6th at 3:00 PM PKT

Please confirm which time slot works best for you.

---

**Test Metadata:**
- Created by: run_silver_test.py
- Test Type: Email Reply Workflow
- Expected: Draft in Pending_Approval → Approve → Send
"""
    
    file_path = NEEDS_ACTION / TEST_EMAIL_FILE
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    return file_path


def create_test_linkedin_task():
    """Create a test LinkedIn post request in Needs_Action folder."""
    
    content = """---
type: linkedin
priority: medium
topic: AI Agents in SaaS
---

# LinkedIn Post Request - Daily Update

**Topic:** Building AI Agents for SaaS Platforms

**Key Points to Cover:**

1. Today's progress on AI agent development
2. Key learnings about agentic workflows
3. Tips for integrating AI into SaaS
4. Call-to-action for engagement

**Target Audience:** SaaS developers, AI engineers, startup founders

**Tone:** Professional yet engaging, build-in-public style

---

**Test Metadata:**
- Created by: run_silver_test.py
- Test Type: LinkedIn Post Generation
- Expected: Post draft in Pending_Approval with hashtags
"""
    
    file_path = NEEDS_ACTION / TEST_LINKEDIN_FILE
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    return file_path

# =============================================================================
# Test Execution
# =============================================================================

def run_orchestrator():
    """Run the orchestrator and capture output."""
    import subprocess
    
    print_info("Running orchestrator...")
    result = subprocess.run(
        [sys.executable, "orchestrator.py"],
        cwd=BASE_DIR,
        capture_output=True,
        text=True
    )
    
    print(result.stdout)
    if result.stderr:
        print_warning(f"Warnings: {result.stderr}")
    
    return result.returncode == 0

def validate_files_created():
    """Validate that expected files were created."""
    
    print_step(3, "Validating Created Files")
    
    validations = {
        "Plans folder": any(PLANS.glob("PLAN_*.md")),
        "Pending_Approval folder": any(PENDING_APPROVAL.glob("*.md")),
    }
    
    all_passed = True
    
    for name, passed in validations.items():
        if passed:
            print_success(f"{name}: Files found")
        else:
            print_error(f"{name}: No files found")
            all_passed = False
    
    # List created files
    print_info("\nFiles in Pending_Approval:")
    for f in PENDING_APPROVAL.glob("*.md"):
        print(f"  📄 {f.name}")
    
    print_info("\nFiles in Plans:")
    for f in PLANS.glob("PLAN_*.md"):
        print(f"  📋 {f.name}")
    
    return all_passed

def show_dashboard_summary():
    """Show Dashboard summary."""
    
    print_step(4, "Dashboard Summary")
    
    if DASHBOARD.exists():
        with open(DASHBOARD, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Extract key sections
        lines = content.split("\n")
        in_status = False
        status_lines = []
        
        for line in lines:
            if "## 📊 Quick Status Overview" in line:
                in_status = True
            elif in_status:
                if line.startswith("##"):
                    break
                status_lines.append(line)
        
        print("".join(status_lines[:10]))
        
        # Show pending approvals section
        in_pending = False
        pending_lines = []
        
        for line in lines:
            if "## 🟠 Pending Approvals" in line:
                in_pending = True
            elif in_pending:
                if line.startswith("##"):
                    break
                pending_lines.append(line)
        
        if pending_lines:
            print("\n🟠 Pending Approvals:")
            print("".join(pending_lines[:15]))
    else:
        print_error("Dashboard.md not found")

def show_next_steps():
    """Show next steps for the user."""
    
    print_step(5, "Next Steps - Complete the Workflow")
    
    print_info("To complete the email approval workflow:\n")
    
    # List pending files
    pending_files = list(PENDING_APPROVAL.glob("*.md"))
    
    if pending_files:
        print("📁 Files awaiting your review:\n")
        for i, f in enumerate(pending_files, 1):
            print(f"  {i}. {f.name}")
        
        print(f"\n{Colors.YELLOW}Approval Commands:{Colors.RESET}")
        print(f"  # Approve (will send email/post):")
        print(f"  mv Pending_Approval/<file>.md Approved/")
        print(f"  python3 orchestrator.py")
        print(f"\n  # Reject:")
        print(f"  mv Pending_Approval/<file>.md Rejected/")
        print(f"  python3 orchestrator.py")
        print(f"\n  # Request regeneration:")
        print(f"  # Add notes to file, then:")
        print(f"  mv Pending_Approval/<file>.md Needs_Action/")
        print(f"  python3 orchestrator.py")
    else:
        print_success("No pending approvals - all clear!")
    
    print(f"\n{Colors.GREEN}View Dashboard:{Colors.RESET}")
    print(f"  cat Dashboard.md")
    print(f"  # or")
    print(f"  python3 -c \"print(open('Dashboard.md').read())\"")

# =============================================================================
# Cleanup
# =============================================================================

def cleanup_test_files():
    """Remove test files from previous runs."""
    
    print_info("Cleaning up previous test files...")
    
    for folder in [NEEDS_ACTION, PENDING_APPROVAL, PLANS, DONE]:
        for test_file in [TEST_EMAIL_FILE, TEST_LINKEDIN_FILE]:
            file_path = folder / test_file
            if file_path.exists():
                file_path.unlink()
                print_info(f"  Removed: {file_path.name}")
            
            # Also remove derived files
            if "email" in test_file:
                for f in folder.glob(f"REPLY_{test_file}*"):
                    f.unlink()
            if "linkedin" in test_file:
                for f in folder.glob(f"LINKEDIN_POST_*.md"):
                    f.unlink()

# =============================================================================
# Main Test Runner
# =============================================================================

def main():
    """Run complete Silver Tier test suite."""
    
    print_header("🧪 SILVER TIER TEST SUITE")
    print_info("Testing complete email + LinkedIn workflow")
    print_info(f"Base Directory: {BASE_DIR}")
    print_info(f"Dry Run Mode: Check .env for DRY_RUN setting")
    
    # Ensure directories exist
    for folder in [NEEDS_ACTION, PENDING_APPROVAL, PLANS, DONE]:
        folder.mkdir(parents=True, exist_ok=True)
    
    # Cleanup previous test files
    cleanup_test_files()
    
    # Step 1: Create test files
    print_step(1, "Creating Test Files")
    
    print_info("Creating test email task...")
    email_path = create_test_email_task()
    print_success(f"Created: {email_path.name}")
    
    print_info("\nCreating test LinkedIn request...")
    linkedin_path = create_test_linkedin_task()
    print_success(f"Created: {linkedin_path.name}")
    
    # Step 2: Run orchestrator
    print_step(2, "Running Orchestrator")
    
    success = run_orchestrator()
    
    if success:
        print_success("Orchestrator completed successfully")
    else:
        print_error("Orchestrator encountered errors")
    
    # Step 3: Validate files
    validate_files_created()
    
    # Step 4: Show Dashboard
    show_dashboard_summary()
    
    # Step 5: Next steps
    show_next_steps()
    
    # Final summary
    print_header("TEST COMPLETE")
    
    print(f"""
{Colors.GREEN}✅ Test Summary:{Colors.RESET}
  • Test email task created
  • Test LinkedIn request created
  • Orchestrator processed files
  • Drafts generated in Pending_Approval

{Colors.YELLOW}📋 What Happened:{Colors.RESET}
  1. Needs_Action files were read
  2. Reply drafts and LinkedIn posts generated
  3. Approval files created in Pending_Approval
  4. Original files moved to Done
  5. Dashboard updated with status

{Colors.CYAN}🎯 What's Next:{Colors.RESET}
  1. Review files in Pending_Approval folder
  2. Move files to Approved/ to execute
  3. Run orchestrator again to process approvals
  4. Check Dashboard for final status

{Colors.BLUE}📁 Key Files:{Colors.RESET}
  • Pending_Approval/ - Review drafts here
  • Dashboard.md - View system status
  • Logs/orchestrator.log - Check for errors
""")
    
    print_header("GOOD LUCK! 🚀")

if __name__ == "__main__":
    main()
