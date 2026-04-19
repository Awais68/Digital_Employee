#!/usr/bin/env python3
"""
Audit Log System — Gold Tier v5.0
Centralized audit logging with structured JSON, error recovery, and immutable audit trails.

Provides:
- Immutable JSON audit log entries for all system operations
- Structured logging with correlation IDs
- Error tracking and recovery action logging
- Audit trail for compliance and debugging
- Performance metrics per operation
- Automated error recovery with configurable retry policies

Author: Digital Employee System
Tier: Gold v5.0 — Business Operator
"""

import os
import json
import uuid
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Callable
from functools import wraps
from enum import Enum


# =============================================================================
# Configuration
# =============================================================================

BASE_DIR = Path(__file__).resolve().parent
AUDIT_LOG_DIR = BASE_DIR / "Logs" / "audit"
AUDIT_LOG_DIR.mkdir(parents=True, exist_ok=True)

AUDIT_INDEX_FILE = AUDIT_LOG_DIR / "audit_log.json"
AUDIT_ERRORS_FILE = AUDIT_LOG_DIR / "audit_errors.json"
AUDIT_RECOVERY_FILE = AUDIT_LOG_DIR / "audit_recovery.json"

# Maximum entries per file before rotation
MAX_INDEX_ENTRIES = 10000
MAX_ERROR_ENTRIES = 5000
MAX_RECOVERY_ENTRIES = 5000

# Default retry policy
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 2  # seconds
DEFAULT_RETRY_BACKOFF = 2  # exponential backoff multiplier


# =============================================================================
# Enums
# =============================================================================

class AuditLevel(str, Enum):
    """Audit log severity levels."""
    INFO = "INFO"
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class AuditCategory(str, Enum):
    """Categories of audit events."""
    ORCHESTRATOR = "orchestrator"
    EMAIL = "email"
    LINKEDIN = "linkedin"
    ODOO = "odoo"
    WHATSAPP = "whatsapp"
    APPROVAL = "approval"
    WORKFLOW = "workflow"
    SYSTEM = "system"
    NLU = "nlu"
    FINANCE = "finance"


class RecoveryAction(str, Enum):
    """Types of recovery actions."""
    RETRY = "retry"
    FALLBACK = "fallback"
    ESCALATE = "escalate"
    SKIP = "skip"
    MANUAL_INTERVENTION = "manual_intervention"


# =============================================================================
# Audit Entry Builder
# =============================================================================

class AuditEntry:
    """Represents a single audit log entry with immutable properties."""

    def __init__(
        self,
        category: AuditCategory,
        level: AuditLevel,
        action: str,
        **kwargs
    ):
        self.entry_id = str(uuid.uuid4())
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.category = category.value
        self.level = level.value
        self.action = action
        self.correlation_id = kwargs.get("correlation_id", str(uuid.uuid4()))
        self.source = kwargs.get("source", "unknown")
        self.details = kwargs.get("details", {})
        self.metadata = kwargs.get("metadata", {})
        self.duration_ms = kwargs.get("duration_ms")
        self.error = kwargs.get("error")
        self.recovery_action = kwargs.get("recovery_action")
        self.user_id = kwargs.get("user_id", "system")

        # Create immutable hash for integrity verification
        self._compute_hash()

    def _compute_hash(self):
        """Compute SHA-256 hash of entry for integrity verification."""
        hash_data = f"{self.entry_id}{self.timestamp}{self.category}{self.action}{json.dumps(self.details, sort_keys=True)}"
        self.integrity_hash = hashlib.sha256(hash_data.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """Convert entry to dictionary for JSON serialization."""
        data = {
            "entry_id": self.entry_id,
            "timestamp": self.timestamp,
            "category": self.category,
            "level": self.level,
            "action": self.action,
            "correlation_id": self.correlation_id,
            "source": self.source,
            "user_id": self.user_id,
            "details": self.details,
            "metadata": self.metadata,
            "integrity_hash": self.integrity_hash,
        }
        if self.duration_ms is not None:
            data["duration_ms"] = self.duration_ms
        if self.error:
            data["error"] = self.error
        if self.recovery_action:
            data["recovery_action"] = self.recovery_action
        return data

    def __repr__(self):
        return f"AuditEntry({self.category}/{self.level}: {self.action})"


# =============================================================================
# Audit Log Manager
# =============================================================================

class AuditLogManager:
    """Manages audit log entries with rotation, querying, and integrity checks."""

    def __init__(
        self,
        index_file: Path = AUDIT_INDEX_FILE,
        errors_file: Path = AUDIT_ERRORS_FILE,
        recovery_file: Path = AUDIT_RECOVERY_FILE,
        max_index: int = MAX_INDEX_ENTRIES,
        max_errors: int = MAX_ERROR_ENTRIES,
        max_recovery: int = MAX_RECOVERY_ENTRIES,
    ):
        self.index_file = index_file
        self.errors_file = errors_file
        self.recovery_file = recovery_file
        self.max_index = max_index
        self.max_errors = max_errors
        self.max_recovery = max_recovery

        # Ensure files exist
        self._ensure_file(self.index_file, {"entries": [], "last_rotation": None, "total_entries": 0})
        self._ensure_file(self.errors_file, {"errors": [], "total_errors": 0})
        self._ensure_file(self.recovery_file, {"recoveries": [], "total_recoveries": 0})

    def _ensure_file(self, file_path: Path, default: Dict):
        """Ensure audit file exists with default structure."""
        if not file_path.exists():
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(default, f, indent=2)

    def log(self, entry: AuditEntry):
        """Add an audit entry to the appropriate log file."""
        data = entry.to_dict()

        # Always add to main index
        self._add_to_index(data)

        # Add to errors file if error/critical
        if entry.level in (AuditLevel.ERROR.value, AuditLevel.CRITICAL.value):
            self._add_to_errors(data)

        # Add to recovery file if recovery action present
        if entry.recovery_action:
            self._add_to_recovery(data)

    def _add_to_index(self, data: Dict):
        """Add entry to main audit index with rotation."""
        audit_data = self._load_json(self.index_file)
        audit_data["entries"].append(data)
        audit_data["total_entries"] = audit_data.get("total_entries", 0) + 1

        # Rotate if needed
        if len(audit_data["entries"]) > self.max_index:
            self._rotate_log(audit_data, self.index_file)

        self._save_json(self.index_file, audit_data)

    def _add_to_errors(self, data: Dict):
        """Add error entry to error log."""
        error_data = self._load_json(self.errors_file)
        error_data["errors"].append(data)
        error_data["total_errors"] = error_data.get("total_errors", 0) + 1

        if len(error_data["errors"]) > self.max_errors:
            self._rotate_log(error_data, self.errors_file)

        self._save_json(self.errors_file, error_data)

    def _add_to_recovery(self, data: Dict):
        """Add recovery entry to recovery log."""
        recovery_data = self._load_json(self.recovery_file)
        recovery_data["recoveries"].append(data)
        recovery_data["total_recoveries"] = recovery_data.get("total_recoveries", 0) + 1

        if len(recovery_data["recoveries"]) > self.max_recovery:
            self._rotate_log(recovery_data, self.recovery_file)

        self._save_json(self.recovery_file, recovery_data)

    def _load_json(self, file_path: Path) -> Dict:
        """Load JSON from file with fallback to default."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            if "errors" in str(file_path):
                return {"errors": [], "total_errors": 0}
            elif "recovery" in str(file_path):
                return {"recoveries": [], "total_recoveries": 0}
            return {"entries": [], "last_rotation": None, "total_entries": 0}

    def _save_json(self, file_path: Path, data: Dict):
        """Save JSON to file atomically."""
        temp_file = file_path.with_suffix(".tmp")
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            temp_file.replace(file_path)
        except Exception as e:
            # Fallback to direct write if atomic fails
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)

    def _rotate_log(self, data: Dict, file_path: Path):
        """Rotate audit log by archiving oldest entries."""
        rotation_count = data.get("rotation_count", 0) + 1
        archive_file = file_path.with_suffix(f".archive.{rotation_count}.json")

        # Archive first half of entries
        half = len(data["entries"]) // 2
        archive_data = {
            "rotation": rotation_count,
            "rotated_at": datetime.now(timezone.utc).isoformat(),
            "archived_entries": data["entries"][:half],
        }

        with open(archive_file, "w", encoding="utf-8") as f:
            json.dump(archive_data, f, indent=2, default=str)

        # Keep only second half in main file
        data["entries"] = data["entries"][half:]
        data["last_rotation"] = datetime.now(timezone.utc).isoformat()
        data["rotation_count"] = rotation_count

    def query(
        self,
        category: Optional[str] = None,
        level: Optional[str] = None,
        correlation_id: Optional[str] = None,
        since: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict]:
        """Query audit log entries with filters."""
        audit_data = self._load_json(self.index_file)
        entries = audit_data.get("entries", [])

        # Apply filters
        if category:
            entries = [e for e in entries if e.get("category") == category]
        if level:
            entries = [e for e in entries if e.get("level") == level]
        if correlation_id:
            entries = [e for e in entries if e.get("correlation_id") == correlation_id]
        if since:
            entries = [e for e in entries if e.get("timestamp", "") >= since]

        # Sort by timestamp descending and limit
        entries = sorted(entries, key=lambda x: x.get("timestamp", ""), reverse=True)[:limit]

        return entries

    def get_error_summary(self) -> Dict[str, Any]:
        """Get summary of errors for reporting."""
        error_data = self._load_json(self.errors_file)
        errors = error_data.get("errors", [])

        # Group by category and action
        summary = {}
        for error in errors[-100:]:  # Last 100 errors
            key = f"{error.get('category')}/{error.get('action')}"
            if key not in summary:
                summary[key] = {"count": 0, "last_error": None, "last_timestamp": None}
            summary[key]["count"] += 1
            summary[key]["last_error"] = error.get("error")
            summary[key]["last_timestamp"] = error.get("timestamp")

        return {
            "total_errors": error_data.get("total_errors", 0),
            "error_summary": summary,
            "last_error_at": errors[-1].get("timestamp") if errors else None,
        }

    def get_recovery_summary(self) -> Dict[str, Any]:
        """Get summary of recovery actions."""
        recovery_data = self._load_json(self.recovery_file)
        recoveries = recovery_data.get("recoveries", [])

        # Group by recovery action type
        summary = {}
        for recovery in recoveries[-100:]:
            action = recovery.get("recovery_action", "unknown")
            if action not in summary:
                summary[action] = {"count": 0, "success_rate": 0}
            summary[action]["count"] += 1

        return {
            "total_recoveries": recovery_data.get("total_recoveries", 0),
            "recovery_summary": summary,
        }

    def verify_integrity(self) -> Dict[str, Any]:
        """Verify integrity of recent audit entries."""
        audit_data = self._load_json(self.index_file)
        entries = audit_data.get("entries", [])

        valid = 0
        invalid = 0

        for entry in entries[-100:]:
            # Recompute hash and compare
            hash_data = f"{entry['entry_id']}{entry['timestamp']}{entry['category']}{entry['action']}{json.dumps(entry.get('details', {}), sort_keys=True)}"
            expected_hash = hashlib.sha256(hash_data.encode()).hexdigest()

            if entry.get("integrity_hash") == expected_hash:
                valid += 1
            else:
                invalid += 1

        return {
            "verified_entries": valid + invalid,
            "valid_entries": valid,
            "invalid_entries": invalid,
            "integrity_status": "PASS" if invalid == 0 else "FAIL",
        }


# =============================================================================
# Retry Policy and Error Recovery
# =============================================================================

class RetryPolicy:
    """Configurable retry policy with exponential backoff."""

    def __init__(
        self,
        max_retries: int = DEFAULT_MAX_RETRIES,
        base_delay: float = DEFAULT_RETRY_DELAY,
        backoff_factor: float = DEFAULT_RETRY_BACKOFF,
        max_delay: float = 60.0,
        retryable_exceptions: tuple = (Exception,),
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.backoff_factor = backoff_factor
        self.max_delay = max_delay
        self.retryable_exceptions = retryable_exceptions

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt with exponential backoff."""
        delay = self.base_delay * (self.backoff_factor ** attempt)
        return min(delay, self.max_delay)

    def is_retryable(self, exception: Exception) -> bool:
        """Check if exception is retryable."""
        return isinstance(exception, self.retryable_exceptions)


class ErrorRecoveryManager:
    """Manages error recovery with retry, fallback, and escalation."""

    def __init__(self, audit_manager: AuditLogManager, default_policy: Optional[RetryPolicy] = None):
        self.audit = audit_manager
        self.default_policy = default_policy or RetryPolicy()
        self.recovery_history = []

    def execute_with_retry(
        self,
        func: Callable,
        *args,
        policy: Optional[RetryPolicy] = None,
        category: AuditCategory = AuditCategory.SYSTEM,
        action: str = "unknown",
        correlation_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Execute function with automatic retry on failure."""
        retry_policy = policy or self.default_policy
        correlation_id = correlation_id or str(uuid.uuid4())
        last_exception = None

        # Pop audit-only kwargs so they don't get passed to the wrapped function
        _details = kwargs.pop("details", {})
        _recovery_action = kwargs.pop("recovery_action", None)
        func_source = func.__module__ if hasattr(func, "__module__") else "unknown"

        for attempt in range(retry_policy.max_retries + 1):
            start_time = datetime.now()

            try:
                result = func(*args, **kwargs)

                # Log success — merge our _details with attempt info
                duration_ms = (datetime.now() - start_time).total_seconds() * 1000
                merged_details = {"attempt": attempt + 1, "result_summary": str(result)[:200] if result else None}
                if _details:
                    merged_details.update(_details)

                entry = AuditEntry(
                    category=category,
                    level=AuditLevel.SUCCESS,
                    action=action,
                    correlation_id=correlation_id,
                    details=merged_details,
                    duration_ms=round(duration_ms, 2),
                    source=func_source,
                )
                self.audit.log(entry)

                return {"success": True, "result": result, "attempts": attempt + 1, "correlation_id": correlation_id}

            except Exception as exc:
                last_exception = exc
                duration_ms = (datetime.now() - start_time).total_seconds() * 1000

                if retry_policy.is_retryable(exc) and attempt < retry_policy.max_retries:
                    # Log retry attempt
                    delay = retry_policy.get_delay(attempt)
                    retry_details = {
                        "attempt": attempt + 1,
                        "max_retries": retry_policy.max_retries,
                        "retry_delay_seconds": delay,
                        "error_type": type(exc).__name__,
                    }
                    if _details:
                        retry_details.update(_details)

                    entry = AuditEntry(
                        category=category,
                        level=AuditLevel.WARNING,
                        action=action,
                        correlation_id=correlation_id,
                        details=retry_details,
                        error={"type": type(exc).__name__, "message": str(exc)},
                        recovery_action={"type": RecoveryAction.RETRY.value, "attempt": attempt + 1, "next_retry_in_seconds": delay},
                        duration_ms=round(duration_ms, 2),
                        source=func_source,
                    )
                    self.audit.log(entry)

                    import time
                    time.sleep(delay)
                else:
                    # All retries exhausted — log final error
                    error_details = {
                        "attempt": attempt + 1,
                        "max_retries": retry_policy.max_retries,
                        "error_type": type(exc).__name__,
                    }
                    if _details:
                        error_details.update(_details)

                    entry = AuditEntry(
                        category=category,
                        level=AuditLevel.CRITICAL if attempt >= retry_policy.max_retries else AuditLevel.ERROR,
                        action=action,
                        correlation_id=correlation_id,
                        details=error_details,
                        error={"type": type(exc).__name__, "message": str(exc)},
                        recovery_action={
                            "type": RecoveryAction.ESCALATE.value,
                            "reason": "All retries exhausted",
                            "requires_manual_intervention": True,
                        },
                        duration_ms=round(duration_ms, 2),
                        source=func_source,
                    )
                    self.audit.log(entry)

                    return {
                        "success": False,
                        "error": str(exc),
                        "error_type": type(exc).__name__,
                        "attempts": attempt + 1,
                        "correlation_id": correlation_id,
                    }

        # Should not reach here, but safety net
        return {
            "success": False,
            "error": str(last_exception),
            "error_type": type(last_exception).__name__ if last_exception else "Unknown",
            "attempts": retry_policy.max_retries + 1,
            "correlation_id": correlation_id,
        }


# =============================================================================
# Decorator for Automatic Audit Logging
# =============================================================================

def audit_logged(
    category: AuditCategory,
    action: str,
    audit_manager: Optional[AuditLogManager] = None,
):
    """Decorator to automatically audit-log function calls."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            nonlocal audit_manager
            if audit_manager is None:
                audit_manager = get_audit_manager()

            start_time = datetime.now()
            correlation_id = str(uuid.uuid4())

            try:
                result = func(*args, **kwargs)

                duration_ms = (datetime.now() - start_time).total_seconds() * 1000
                entry = AuditEntry(
                    category=category,
                    level=AuditLevel.SUCCESS,
                    action=action,
                    correlation_id=correlation_id,
                    details={"args_count": len(args), "kwargs_keys": list(kwargs.keys())},
                    duration_ms=round(duration_ms, 2),
                    source=func.__module__,
                )
                audit_manager.log(entry)

                return result

            except Exception as exc:
                duration_ms = (datetime.now() - start_time).total_seconds() * 1000
                entry = AuditEntry(
                    category=category,
                    level=AuditLevel.ERROR,
                    action=action,
                    correlation_id=correlation_id,
                    error={"type": type(exc).__name__, "message": str(exc)},
                    duration_ms=round(duration_ms, 2),
                    source=func.__module__,
                )
                audit_manager.log(entry)
                raise

        return wrapper
    return decorator


# =============================================================================
# Singleton Manager
# =============================================================================

_audit_manager: Optional[AuditLogManager] = None


def get_audit_manager() -> AuditLogManager:
    """Get or create the global audit log manager instance."""
    global _audit_manager
    if _audit_manager is None:
        _audit_manager = AuditLogManager()
    return _audit_manager


def get_recovery_manager() -> ErrorRecoveryManager:
    """Get or create the global error recovery manager instance."""
    return ErrorRecoveryManager(get_audit_manager())


# =============================================================================
# CLI Utilities
# =============================================================================

def cli_query(args):
    """CLI handler for querying audit logs."""
    manager = get_audit_manager()

    if args.query_type == "recent":
        entries = manager.query(limit=args.limit)
    elif args.query_type == "errors":
        entries = manager.query(level="ERROR", limit=args.limit)
    elif args.query_type == "category":
        entries = manager.query(category=args.category, limit=args.limit)
    elif args.query_type == "correlation":
        entries = manager.query(correlation_id=args.correlation_id, limit=args.limit)
    else:
        print("Unknown query type. Use: recent, errors, category, correlation")
        return

    print(f"\n📋 Audit Log Query Results ({len(entries)} entries):\n")
    for entry in entries:
        ts = entry.get("timestamp", "")[:19]
        cat = entry.get("category", "?")
        lvl = entry.get("level", "?")
        act = entry.get("action", "?")
        corr = entry.get("correlation_id", "")[:8]
        print(f"  [{ts}] {cat}/{lvl:8} | {act:30} | corr:{corr}")
        if "error" in entry:
            err = entry["error"]
            print(f"           Error: {err.get('type', '?')}: {err.get('message', '?')}")
        if "duration_ms" in entry:
            print(f"           Duration: {entry['duration_ms']}ms")
        print()


def cli_summary():
    """CLI handler for audit log summary."""
    manager = get_audit_manager()

    error_summary = manager.get_error_summary()
    recovery_summary = manager.get_recovery_summary()
    integrity = manager.verify_integrity()

    print("\n" + "=" * 60)
    print("📊 Audit Log Summary")
    print("=" * 60)
    print(f"\n  Total Entries:     {manager._load_json(AUDIT_INDEX_FILE).get('total_entries', 0):>10}")
    print(f"  Total Errors:      {error_summary['total_errors']:>10}")
    print(f"  Total Recoveries:  {recovery_summary['total_recoveries']:>10}")
    print(f"\n  Integrity Status:  {integrity['integrity_status']}")
    print(f"  Valid Entries:     {integrity['valid_entries']:>10}")
    print(f"  Invalid Entries:   {integrity['invalid_entries']:>10}")

    if error_summary.get("error_summary"):
        print("\n  Top Errors:")
        for key, info in sorted(error_summary["error_summary"].items(), key=lambda x: x[1]["count"], reverse=True)[:5]:
            print(f"    {key}: {info['count']} occurrences")
            last_err = info.get('last_error')
            if isinstance(last_err, dict):
                err_msg = f"{last_err.get('type', '?')}: {last_err.get('message', '?')}"
            elif isinstance(last_err, str):
                err_msg = last_err
            else:
                err_msg = 'N/A'
            print(f"      Last: {err_msg[:80]}")

    if recovery_summary.get("recovery_summary"):
        print("\n  Recovery Actions:")
        for action, info in recovery_summary["recovery_summary"].items():
            print(f"    {action}: {info['count']} attempts")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python audit_log.py <command> [options]")
        print("\nCommands:")
        print("  summary              Show audit log summary")
        print("  query recent [N]     Show N recent entries (default 20)")
        print("  query errors [N]     Show N recent errors")
        print("  query category <cat> Show entries for category")
        print("  query correlation <id>  Show entries for correlation ID")
        print("  verify               Verify audit log integrity")
        sys.exit(0)

    command = sys.argv[1].lower()

    if command == "summary":
        cli_summary()
    elif command == "query":
        class Args:
            pass
        args = Args()
        args.query_type = sys.argv[2] if len(sys.argv) > 2 else "recent"
        args.limit = 20

        if len(sys.argv) > 3:
            try:
                args.limit = int(sys.argv[3])
            except ValueError:
                if args.query_type == "category":
                    args.category = sys.argv[3]
                elif args.query_type == "correlation":
                    args.correlation_id = sys.argv[3]

        cli_query(args)
    elif command == "verify":
        manager = get_audit_manager()
        integrity = manager.verify_integrity()
        print(f"\n🔒 Audit Log Integrity Check")
        print(f"  Status:  {integrity['integrity_status']}")
        print(f"  Valid:   {integrity['valid_entries']}")
        print(f"  Invalid: {integrity['invalid_entries']}")
    else:
        print(f"Unknown command: {command}")
