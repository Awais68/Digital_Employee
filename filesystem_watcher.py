#!/usr/bin/env python3
"""
filesystem_watcher.py - Bronze Tier Inbox Monitor

Monitors the /Inbox folder for new files and processes them according to
Bronze Tier rules. Uses the BaseWatcher pattern for extensibility.

Supports running in tmux for persistent background operation.

Usage:
    python filesystem_watcher.py              # Run in foreground
    python filesystem_watcher.py --start      # Start in tmux (background)
    python filesystem_watcher.py --stop       # Stop tmux watcher
    python filesystem_watcher.py --status     # Check if running
"""

import os
import shutil
import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent

# Configuration
VAULT_ROOT = Path(__file__).parent.resolve()
INBOX_DIR = VAULT_ROOT / "Inbox"
NEEDS_ACTION_DIR = VAULT_ROOT / "Needs_Action"
LOGS_DIR = VAULT_ROOT / "Logs"
DONE_DIR = VAULT_ROOT / "Done"

# Ensure directories exist
INBOX_DIR.mkdir(parents=True, exist_ok=True)
NEEDS_ACTION_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)
DONE_DIR.mkdir(parents=True, exist_ok=True)

# Setup logging
LOG_FILE = LOGS_DIR / f"watcher_{datetime.now().strftime('%Y%m%d')}.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class BaseWatcher(FileSystemEventHandler):
    """
    Base class for file system watchers.
    Provides common functionality for monitoring and processing files.
    """
    
    def __init__(self, source_dir: Path, dest_dir: Path):
        """
        Initialize the base watcher.
        
        Args:
            source_dir: Directory to monitor
            dest_dir: Destination directory for processed files
        """
        super().__init__()
        self.source_dir = source_dir
        self.dest_dir = dest_dir
        self.processed_files = set()
    
    def on_created(self, event):
        """Handle file creation events."""
        if event.is_directory:
            return
        self._process_file(event.src_path, "created")
    
    def on_modified(self, event):
        """Handle file modification events."""
        if event.is_directory:
            return
        # Only process if file is new (not already processed)
        if event.src_path not in self.processed_files:
            self._process_file(event.src_path, "modified")
    
    def _process_file(self, file_path: str, event_type: str):
        """
        Process a file event. To be overridden by subclasses.
        
        Args:
            file_path: Path to the file
            event_type: Type of event (created, modified, etc.)
        """
        raise NotImplementedError("Subclasses must implement _process_file")
    
    def log_action(self, action: str, details: str):
        """
        Log an action to the Done folder.
        
        Args:
            action: Action performed
            details: Additional details
        """
        log_entry = f"{datetime.now().isoformat()} - {action}: {details}\n"
        log_file = DONE_DIR / f"action_log_{datetime.now().strftime('%Y%m%d')}.md"
        
        # Append to existing log or create new
        with open(log_file, 'a') as f:
            f.write(log_entry)
        
        logger.info(f"Logged: {action} - {details}")


class InboxWatcher(BaseWatcher):
    """
    Watches the Inbox folder and moves new files to Needs_Action
    with accompanying metadata.
    """
    
    def _process_file(self, file_path: str, event_type: str):
        """
        Process incoming inbox files.

        Args:
            file_path: Path to the incoming file
            event_type: Type of filesystem event
        """
        src_path = Path(file_path)

        # Skip already processed files
        if str(src_path) in self.processed_files:
            return

        # Skip temporary files (e.g., .swp, ~files)
        if src_path.name.startswith('.') or src_path.name.endswith('~'):
            return

        # Wait for file to be fully written (retry logic)
        max_retries = 5
        for attempt in range(max_retries):
            if src_path.exists():
                try:
                    # Try to open file for reading to check if it's stable
                    with open(src_path, 'rb') as f:
                        pass
                    break  # File is stable
                except (IOError, PermissionError):
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(0.5)  # Wait and retry
                    else:
                        logger.warning(f"File {src_path.name} is being written, skipping")
                        return
            else:
                if attempt < max_retries - 1:
                    import time
                    time.sleep(0.5)  # Wait and retry
                else:
                    logger.debug(f"File {src_path.name} not found after retries, may have been moved")
                    return

        # Final check - file might have been moved by another process
        if not src_path.exists():
            logger.debug(f"File {src_path.name} no longer exists, skipping")
            return

        logger.info(f"Processing new file: {src_path.name} (event: {event_type})")

        try:
            # Generate unique filename with timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            base_name = src_path.stem
            extension = src_path.suffix
            new_name = f"{timestamp}_{base_name}{extension}"

            dest_path = self.dest_dir / new_name

            # Copy file to Needs_Action
            shutil.copy2(src_path, dest_path)
            logger.info(f"Copied {src_path.name} -> {dest_path.name}")

            # Create metadata file
            metadata = self._create_metadata(src_path, dest_path)
            metadata_path = self.dest_dir / f"{timestamp}_{base_name}.meta.md"
            with open(metadata_path, 'w') as f:
                f.write(metadata)
            logger.info(f"Created metadata: {metadata_path.name}")

            # Mark as processed
            self.processed_files.add(str(src_path))

            # Log the action
            self.log_action(
                "FILE_PROCESSED",
                f"{src_path.name} -> {dest_path.name}"
            )

            # Remove original from Inbox after successful processing
            src_path.unlink()
            logger.info(f"Removed original from Inbox: {src_path.name}")

        except Exception as e:
            logger.error(f"Error processing {src_path.name}: {str(e)}")
            self.log_action(
                "FILE_PROCESS_ERROR",
                f"{src_path.name} - {str(e)}"
            )
    
    def _create_metadata(self, src_path: Path, dest_path: Path) -> str:
        """
        Create metadata markdown for the processed file.
        
        Args:
            src_path: Original file path
            dest_path: Destination file path
            
        Returns:
            Markdown formatted metadata string
        """
        stat = src_path.stat()
        
        return f"""---
source_file: {src_path.name}
destination_file: {dest_path.name}
original_path: {src_path}
processed_path: {dest_path}
processed_at: {datetime.now().isoformat()}
file_size: {stat.st_size} bytes
status: pending_review
priority: normal
---

# File Processing Metadata

## Source Information
- **Original Name:** {src_path.name}
- **Original Location:** {src_path}
- **Current Location:** {dest_path}

## Processing Details
- **Processed At:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- **File Size:** {stat.st_size} bytes
- **Event Type:** File dropped in Inbox

## Status
- [ ] Review content
- [ ] Categorize
- [ ] Take action
- [ ] Move to appropriate folder

## Notes
*Add any notes or context about this file here*

"""


# =============================================================================
# Tmux Management Functions
# =============================================================================

TMUX_SESSION_NAME = "ai_employee_watcher"


def check_tmux_installed() -> bool:
    """Check if tmux is installed and available."""
    try:
        subprocess.run(["tmux", "-V"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def is_watcher_running() -> bool:
    """Check if the watcher tmux session exists."""
    try:
        result = subprocess.run(
            ["tmux", "has-session", "-t", TMUX_SESSION_NAME],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def start_watcher_in_tmux():
    """Start the filesystem watcher in a detached tmux session."""
    if is_watcher_running():
        print(f"✓ Watcher already running in tmux session '{TMUX_SESSION_NAME}'")
        return

    if not check_tmux_installed():
        print("✗ tmux is not installed. Please install tmux first.")
        print("  Ubuntu/Debian: sudo apt install tmux")
        print("  Arch: sudo pacman -S tmux")
        print("  macOS: brew install tmux")
        sys.exit(1)

    # Get the current script path and directory
    script_path = Path(__file__).resolve()
    script_dir = script_path.parent

    # Create a new detached tmux session running the watcher
    # Use the -c flag to set working directory (tmux 3.0+)
    cmd = [
        "tmux", "new-session", "-d", "-s", TMUX_SESSION_NAME,
        "-c", str(script_dir),
        "python3 filesystem_watcher.py"
    ]

    subprocess.run(cmd, check=True)
    print(f"✓ Watcher started in tmux session '{TMUX_SESSION_NAME}'")
    print(f"  Attach with: tmux attach -t {TMUX_SESSION_NAME}")
    print(f"  Detach with: Ctrl+b, then d")
    print(f"  Stop with:   python3 {script_path} --stop")


def stop_watcher_in_tmux():
    """Stop the watcher tmux session."""
    if not is_watcher_running():
        print(f"✗ Watcher is not running")
        return

    try:
        # Send Ctrl+C to the tmux session to gracefully stop
        subprocess.run(
            ["tmux", "send-keys", "-t", TMUX_SESSION_NAME, "C-c"],
            check=True
        )
        # Small delay to allow graceful shutdown
        import time
        time.sleep(0.5)
        # Kill the session
        subprocess.run(
            ["tmux", "kill-session", "-t", TMUX_SESSION_NAME],
            check=True
        )
        print(f"✓ Watcher stopped")
    except subprocess.CalledProcessError as e:
        print(f"✗ Error stopping watcher: {e}")
        # Force kill if graceful stop fails
        try:
            subprocess.run(
                ["tmux", "kill-session", "-t", TMUX_SESSION_NAME],
                check=True
            )
            print(f"✓ Watcher force-killed")
        except subprocess.CalledProcessError:
            pass


def show_status():
    """Show the current status of the watcher."""
    if is_watcher_running():
        print(f"✓ Watcher is RUNNING in tmux session '{TMUX_SESSION_NAME}'")
        print(f"  Logs: {LOG_FILE}")
        print(f"  Attach: tmux attach -t {TMUX_SESSION_NAME}")
    else:
        print(f"✗ Watcher is NOT running")
        print(f"  Start: python3 {Path(__file__).name} --start")


# =============================================================================
# Main Entry Point
# =============================================================================

def create_watcher():
    """Create and configure the file system watcher."""
    event_handler = InboxWatcher(INBOX_DIR, NEEDS_ACTION_DIR)
    observer = Observer()
    observer.schedule(event_handler, str(INBOX_DIR), recursive=False)
    return observer, event_handler


def main():
    """Main entry point for the filesystem watcher."""
    # Check for command-line arguments for tmux management
    if len(sys.argv) > 1:
        if sys.argv[1] == "--start":
            start_watcher_in_tmux()
            return
        elif sys.argv[1] == "--stop":
            stop_watcher_in_tmux()
            return
        elif sys.argv[1] == "--status":
            show_status()
            return
        elif sys.argv[1] in ["-h", "--help"]:
            print(__doc__)
            return

    # Standard foreground mode (when running directly or inside tmux)
    logger.info("=" * 60)
    logger.info("Bronze Tier Filesystem Watcher Starting")
    logger.info("=" * 60)
    logger.info(f"Vault Root: {VAULT_ROOT}")
    logger.info(f"Monitoring: {INBOX_DIR}")
    logger.info(f"Destination: {NEEDS_ACTION_DIR}")
    logger.info(f"Log File: {LOG_FILE}")

    observer, handler = create_watcher()
    observer.start()

    logger.info("Watcher is now active. Press Ctrl+C to stop.")

    try:
        while True:
            pass
    except KeyboardInterrupt:
        logger.info("Shutdown signal received")
        observer.stop()
        logger.info("Stopping observer...")

    observer.join()
    logger.info("Filesystem watcher stopped")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
