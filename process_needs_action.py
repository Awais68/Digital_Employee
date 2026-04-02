#!/usr/bin/env python3
"""
Bronze Tier Orchestrator - process_needs_action.py

This script acts as the "brain" for processing items in the Needs_Action folder.
It reads markdown files, creates corresponding plan files, updates the dashboard,
and moves processed files to the Done folder.

Usage: python process_needs_action.py
"""

import os
from pathlib import Path
from datetime import datetime
import shutil


# =============================================================================
# Configuration - Base directory is the vault root
# =============================================================================
BASE_DIR = Path(__file__).parent.resolve()
NEEDS_ACTION_DIR = BASE_DIR / "Needs_Action"
PLANS_DIR = BASE_DIR / "Plans"
DONE_DIR = BASE_DIR / "Done"
DASHBOARD_FILE = BASE_DIR / "Dashboard.md"


def get_current_timestamp() -> str:
    """Return current timestamp in ISO format for frontmatter."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_current_time_hhmm() -> str:
    """Return current time in HH:MM format for dashboard logging."""
    return datetime.now().strftime("%H:%M")


def read_needs_action_file(filepath: Path) -> str:
    """Read and return the content of a needs action markdown file."""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def create_plan_file(original_filename: str, content: str) -> Path:
    """
    Create a new plan file in the Plans directory.
    
    Args:
        original_filename: Name of the original file (without path)
        content: Original content from the needs action file
    
    Returns:
        Path to the created plan file
    """
    # Create plan filename: PLAN_{original_filename}.md
    plan_filename = f"PLAN_{original_filename}"
    plan_path = PLANS_DIR / plan_filename
    
    # Extract objective from content (first non-empty line or default)
    lines = content.strip().split("\n")
    objective = lines[0].strip() if lines and lines[0].strip() else "Process this item"
    
    # Build the plan file content with proper markdown structure
    plan_content = f"""---
type: plan
status: pending
created: {get_current_timestamp()}
---

# Plan: {original_filename}

## Objective
{objective}

## Steps
1. Review the original content below
2. Determine required actions
3. Execute the plan
4. Mark as complete

## Original Content
{content}

## Decision
*Pending review - Bronze Tier acknowledgment complete*
"""
    
    # Write the plan file
    with open(plan_path, "w", encoding="utf-8") as f:
        f.write(plan_content)
    
    return plan_path


def update_dashboard(filename: str) -> None:
    """
    Append a processed entry to the Dashboard.md file.
    
    Args:
        filename: Name of the processed file
    """
    timestamp = get_current_time_hhmm()
    entry = f"- [x] Processed {filename} at {timestamp}\n"
    
    # Append to dashboard
    with open(DASHBOARD_FILE, "a", encoding="utf-8") as f:
        f.write(entry)


def move_to_done(source_path: Path, filename: str) -> Path:
    """
    Move a file from Needs_Action to Done folder.
    
    Args:
        source_path: Full path to the source file
        filename: Name of the file
    
    Returns:
        Path to the destination file
    """
    dest_path = DONE_DIR / filename
    shutil.move(str(source_path), str(dest_path))
    return dest_path


def process_needs_action() -> int:
    """
    Main orchestrator function.
    
    Scans the Needs_Action folder, processes each markdown file,
    creates corresponding plan files, updates dashboard, and moves
    files to Done.
    
    Returns:
        Number of files processed successfully
    """
    # Ensure output directories exist
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get all .md files in Needs_Action folder
    md_files = list(NEEDS_ACTION_DIR.glob("*.md"))
    
    # If no files to process, exit early
    if not md_files:
        print("Nothing to process right now.")
        return 0
    
    processed_count = 0
    
    # Process each markdown file
    for filepath in md_files:
        filename = filepath.name
        
        try:
            # Step 1: Read the content
            content = read_needs_action_file(filepath)
            
            # Step 2 & 3: Create plan file with frontmatter and sections
            plan_path = create_plan_file(filename, content)
            
            # Step 4: Bronze tier - just acknowledge and mark as processed
            # (Decision is already written in the plan file)
            
            # Step 5: Update dashboard
            update_dashboard(filename)
            
            # Step 6: Move original file to Done
            move_to_done(filepath, filename)
            
            processed_count += 1
            
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            continue
    
    return processed_count


def main():
    """Entry point for the script."""
    print(f"Starting Bronze Tier Orchestrator...")
    print(f"Scanning: {NEEDS_ACTION_DIR}")
    print("-" * 50)
    
    # Process all files
    count = process_needs_action()
    
    # Print summary
    print("-" * 50)
    print(f"{count} files processed successfully.")


if __name__ == "__main__":
    main()
