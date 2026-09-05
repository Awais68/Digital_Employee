#!/usr/bin/env python3
"""
Odoo MCP Server - Gold Tier
Connects to local Odoo 19 via JSON-RPC (XML-RPC) and exposes MCP tools
for business operations: invoices, customers, sales, accounting, journal entries.

Designed for use with Claude Code MCP / MCP-compliant clients.
"""

import os
import sys
import json
import logging
import xmlrpc.client
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from dotenv import load_dotenv

# Gold Tier Audit Logging
try:
    from audit_log import (
        AuditLogManager,
        AuditEntry,
        AuditCategory,
        AuditLevel,
        ErrorRecoveryManager,
        RetryPolicy,
        get_audit_manager,
        get_recovery_manager,
    )
    AUDIT_AVAILABLE = True
except ImportError:
    AUDIT_AVAILABLE = False

# ── Load environment variables ────────────────────────────────────────────────
load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("odoo_mcp")

# ── Configuration from .env ──────────────────────────────────────────────────
ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "digital_fte")
ODOO_USERNAME = os.getenv("ODOO_USERNAME", "admin")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD", "admin")

# XML-RPC endpoints
COMMON_URL = f"{ODOO_URL}/xmlrpc/2/common"
OBJECT_URL = f"{ODOO_URL}/xmlrpc/2/object"


# ── Odoo Connection Helper ───────────────────────────────────────────────────
class OdooClient:
    """Thin wrapper around xmlrpc.client for Odoo JSON-RPC with audit logging."""

    def __init__(self, url: str, db: str, username: str, password: str):
        self.url = url
        self.db = db
        self.username = username
        self.password = password
        self.common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
        self.models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
        self._uid: int | None = None

        # Audit integration
        self.audit = get_audit_manager() if AUDIT_AVAILABLE else None
        self.recovery = get_recovery_manager() if AUDIT_AVAILABLE else None
        self.retry_policy = RetryPolicy(
            max_retries=3,
            base_delay=2,
            backoff_factor=2,
            max_delay=30,
            retryable_exceptions=(xmlrpc.client.Fault, ConnectionError, OSError),
        )

    def _audit_log(self, level: str, action: str, details: dict = None, error: dict = None):
        """Helper to log audit entries if audit is available."""
        if self.audit:
            audit_level = getattr(AuditLevel, level.upper(), AuditLevel.INFO)
            entry = AuditEntry(
                category=AuditCategory.ODOO,
                level=audit_level,
                action=action,
                details=details or {},
                error=error,
                source="odoo_mcp",
            )
            self.audit.log(entry)

    # ── Authentication ───────────────────────────────────────────────────
    def authenticate(self) -> int:
        """Authenticate and return user id (uid) with retry logic."""
        def _do_auth():
            uid = self.common.authenticate(self.db, self.username, self.password, {})
            if not uid:
                raise AuthenticationError(
                    f"Authentication failed for user '{self.username}' on DB '{self.db}'"
                )
            return uid

        if self.recovery:
            result = self.recovery.execute_with_retry(
                _do_auth,
                policy=self.retry_policy,
                category=AuditCategory.ODOO,
                action="authenticate",
            )
            if result["success"]:
                self._uid = result["result"]
                self._audit_log("INFO", "authenticate_success", {"uid": self._uid})
                return self._uid
            else:
                self._audit_log("ERROR", "authenticate_failed", error={"message": result["error"]})
                raise AuthenticationError(result["error"])
        else:
            # Fallback without retry
            uid = _do_auth()
            self._uid = uid
            self._audit_log("INFO", "authenticate_success", {"uid": uid})
            return uid

    @property
    def uid(self) -> int:
        if self._uid is None:
            self.authenticate()
        return self._uid  # type: ignore[return-value]

    # ── Generic CRUD helpers ─────────────────────────────────────────────
    def execute_kw(
        self,
        model: str,
        method: str,
        args: list | None = None,
        kwargs: dict | None = None,
    ) -> Any:
        """Execute a method on an Odoo model with audit logging and retry."""
        def _do_execute():
            return self.models.execute_kw(
                self.db, self.uid, self.password, model, method, args or [], kwargs or {}
            )

        action = f"{model}.{method}"
        details = {"model": model, "method": method, "args_count": len(args or [])}

        if self.recovery:
            result = self.recovery.execute_with_retry(
                _do_execute,
                policy=self.retry_policy,
                category=AuditCategory.ODOO,
                action=action,
                details=details,
            )
            if result["success"]:
                return result["result"]
            else:
                self._audit_log("ERROR", f"{action}_failed", details, error={"message": result["error"]})
                raise OdooRPCError(f"{action}: {result['error']}")
        else:
            try:
                res = _do_execute()
                self._audit_log("INFO", action, details)
                return res
            except Exception as exc:
                self._audit_log("ERROR", f"{action}_failed", details, error={"type": type(exc).__name__, "message": str(exc)})
                raise

    def search_read(
        self,
        model: str,
        domain: list | None = None,
        fields: list | None = None,
        limit: int = 100,
        order: str = "id desc",
    ) -> list[dict]:
        return self.execute_kw(
            model,
            "search_read",
            [domain or []],
            {"fields": fields or [], "limit": limit, "order": order},
        )

    def create(self, model: str, values: dict) -> int:
        return self.execute_kw(model, "create", [values])

    def read(self, model: str, ids: list[int], fields: list | None = None) -> list:
        return self.execute_kw(model, "read", [ids], {"fields": fields or []})


# ── Custom Exceptions ────────────────────────────────────────────────────────
class AuthenticationError(Exception):
    pass


class OdooRPCError(Exception):
    pass


# ── Singleton client ─────────────────────────────────────────────────────────
_client: OdooClient | None = None


def get_client() -> OdooClient:
    global _client
    if _client is None:
        _client = OdooClient(ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD)
    return _client


# ── JSON serialisation helper ────────────────────────────────────────────────
def _json_serial(obj: Any) -> Any:
    """Make datetimes / Decimals JSON-safe."""
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _safe_json(data: Any) -> str:
    return json.dumps(data, default=_json_serial, indent=2)


# ── MCP Tool Implementations ─────────────────────────────────────────────────

def create_customer(
    name: str,
    email: str = "",
    phone: str = "",
    vat: str = "",
    street: str = "",
    city: str = "",
    country_id: int | None = None,
    **extra_fields: Any,
) -> dict:
    """Create a new customer (res.partner with customer rank) with audit logging."""
    from audit_log import get_audit_manager, AuditEntry, AuditCategory, AuditLevel

    audit = get_audit_manager()
    correlation_id = str(id(name))  # Simple correlation ID
    start_time = datetime.now()

    try:
        client = get_client()
        vals: dict[str, Any] = {
            "name": name,
            "email": email,
            "phone": phone,
            "vat": vat,
            "street": street,
            "city": city,
            "customer_rank": 1,
        }
        if country_id:
            vals["country_id"] = country_id
        vals.update(extra_fields)

        partner_id = client.create("res.partner", vals)
        logger.info("Created customer res.partner id=%d", partner_id)

        # Read back the created record
        partner = client.read("res.partner", [partner_id])[0]

        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ODOO,
            level=AuditLevel.SUCCESS,
            action="create_customer",
            correlation_id=correlation_id,
            details={
                "customer_name": name,
                "email": email,
                "phone": phone,
                "partner_id": partner_id,
            },
            duration_ms=round(duration_ms, 2),
            source="odoo_mcp",
        )
        audit.log(entry)

        return {
            "status": "success",
            "message": f"Customer '{name}' created successfully",
            "customer_id": partner_id,
            "customer": partner,
        }
    except Exception as e:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ODOO,
            level=AuditLevel.ERROR,
            action="create_customer",
            correlation_id=correlation_id,
            details={
                "customer_name": name,
                "email": email,
            },
            error={"type": type(e).__name__, "message": str(e)},
            duration_ms=round(duration_ms, 2),
            source="odoo_mcp",
        )
        audit.log(entry)
        raise


def create_invoice(
    partner_id: int,
    invoice_type: str = "out_invoice",
    invoice_date: str = "",
    payment_term_id: int | None = None,
    invoice_line_ids: list[dict] | None = None,
    narrative: str = "",
    **extra_fields: Any,
) -> dict:
    """
    Create a customer invoice (account.move).

    invoice_type: out_invoice | out_refund | in_invoice | in_refund
    invoice_line_ids: list of dicts with keys:
        product_id, name, quantity, price_unit, tax_ids (optional)
    """
    client = get_client()

    # Build invoice lines as (0, 0, vals) commands
    lines = []
    if invoice_line_ids:
        for line in invoice_line_ids:
            line_vals = {
                "name": line.get("name", "Service"),
                "quantity": line.get("quantity", 1.0),
                "price_unit": line.get("price_unit", 0.0),
            }
            if line.get("product_id"):
                line_vals["product_id"] = line["product_id"]
            if line.get("tax_ids"):
                line_vals["tax_ids"] = [(6, 0, line["tax_ids"])]
            lines.append((0, 0, line_vals))

    move_vals: dict[str, Any] = {
        "move_type": invoice_type,
        "partner_id": partner_id,
        "invoice_line_ids": lines,
    }
    if invoice_date:
        move_vals["invoice_date"] = invoice_date
    else:
        move_vals["invoice_date"] = datetime.now().strftime("%Y-%m-%d")
    if payment_term_id:
        move_vals["invoice_payment_term_id"] = payment_term_id
    if narrative:
        move_vals["narration"] = narrative
    move_vals.update(extra_fields)

    invoice_id = client.create("account.move", move_vals)
    logger.info("Created invoice account.move id=%d", invoice_id)

    invoice = client.read("account.move", [invoice_id])[0]
    return {
        "status": "success",
        "message": f"Invoice created successfully (id={invoice_id})",
        "invoice_id": invoice_id,
        "invoice": invoice,
    }


def create_sale_order(
    partner_id: int,
    order_line_ids: list[dict] | None = None,
    date_order: str = "",
    validity_date: str = "",
    note: str = "",
    **extra_fields: Any,
) -> dict:
    """
    Create a Sale Order (sale.order).

    order_line_ids: list of dicts with keys:
        product_id, name, product_uom_qty, price_unit (optional)
    """
    client = get_client()

    lines = []
    if order_line_ids:
        for line in order_line_ids:
            line_vals = {
                "name": line.get("name", "Product"),
                "product_uom_qty": line.get("product_uom_qty", 1.0),
            }
            if line.get("product_id"):
                line_vals["product_id"] = line["product_id"]
            if line.get("price_unit"):
                line_vals["price_unit"] = line["price_unit"]
            lines.append((0, 0, line_vals))

    order_vals: dict[str, Any] = {
        "partner_id": partner_id,
        "order_line": lines,
    }
    if date_order:
        order_vals["date_order"] = date_order
    if validity_date:
        order_vals["validity_date"] = validity_date
    if note:
        order_vals["note"] = note
    order_vals.update(extra_fields)

    order_id = client.create("sale.order", order_vals)
    logger.info("Created sale.order id=%d", order_id)

    order = client.read("sale.order", [order_id])[0]
    return {
        "status": "success",
        "message": f"Sale Order created successfully (id={order_id})",
        "order_id": order_id,
        "order": order,
    }


def get_bank_balance() -> dict:
    """
    Return a summary of bank / cash journal balances.
    Queries account.journal of type 'bank' and 'cash' and sums
    the balance from related account.move.line entries.
    """
    client = get_client()

    # Get bank/cash journals
    journals = client.search_read(
        "account.journal",
        domain=[("type", "in", ["bank", "cash"])],
        fields=["id", "name", "type", "default_account_id"],
        limit=50,
    )

    summary = []
    total_balance = 0.0

    for journal in journals:
        default_account = journal.get("default_account_id")
        balance = 0.0
        if default_account and isinstance(default_account, list) and len(default_account) == 2:
            account_id = default_account[0]
            # Read account balance from account.account
            accounts = client.read("account.account", [account_id], ["name", "code"])
            if accounts:
                account = accounts[0]
                # Get balance from account_move_lines
                move_lines = client.search_read(
                    "account.move.line",
                    domain=[("account_id", "=", account_id), ("parent_state", "=", "posted")],
                    fields=["debit", "credit"],
                    limit=10000,
                )
                balance = sum(ml.get("debit", 0) - ml.get("credit", 0) for ml in move_lines)
                summary.append({
                    "journal": journal.get("name"),
                    "journal_type": journal.get("type"),
                    "account": account.get("name"),
                    "account_code": account.get("code"),
                    "balance": round(balance, 2),
                })
                total_balance += balance

    return {
        "status": "success",
        "message": "Bank balance summary retrieved",
        "journals": summary,
        "total_balance": round(total_balance, 2),
        "currency": "USD",  # Adjust as needed
    }


def get_accounting_summary() -> dict:
    """
    Return a high-level accounting summary:
    - Total Receivable
    - Total Payable
    - Bank Balance
    - Recent invoices count
    """
    client = get_client()

    def _get_balance(account_code_prefix: str) -> float:
        accounts = client.search_read(
            "account.account",
            domain=[("code", "=like", f"{account_code_prefix}%")],
            fields=["id"],
            limit=50,
        )
        total = 0.0
        for acc in accounts:
            lines = client.search_read(
                "account.move.line",
                domain=[("account_id", "=", acc["id"]), ("parent_state", "=", "posted")],
                fields=["debit", "credit"],
                limit=10000,
            )
            total += sum(ml.get("debit", 0) - ml.get("credit", 0) for ml in lines)
        return total

    # Receivable (typically 12xxxx) and Payable (typically 2xxxxx)
    receivable = _get_balance("12")
    payable = _get_balance("2")
    bank_info = get_bank_balance()

    # Recent posted invoices count (last 30 days)
    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    recent_invoices = client.search_read(
        "account.move",
        domain=[
            ("move_type", "in", ["out_invoice", "in_invoice"]),
            ("state", "=", "posted"),
            ("date", ">=", thirty_days_ago),
        ],
        fields=["id"],
        limit=500,
    )

    return {
        "status": "success",
        "message": "Accounting summary retrieved",
        "total_receivable": round(receivable, 2),
        "total_payable": round(abs(payable), 2),
        "bank_balance": bank_info["total_balance"],
        "recent_invoices_count": len(recent_invoices),
        "currency": "USD",
    }


def get_recent_transactions(
    limit: int = 20, days: int = 30, move_type: str = ""
) -> dict:
    """
    Retrieve recent account.move.line transactions.

    :param limit: max number of records
    :param days: look back this many days
    :param move_type: filter by move type (optional) e.g. 'out_invoice'
    """
    client = get_client()

    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    domain = [("date", ">=", since), ("parent_state", "=", "posted")]

    if move_type:
        domain.append(("move_id.move_type", "=", move_type))

    lines = client.search_read(
        "account.move.line",
        domain=domain,
        fields=[
            "id",
            "date",
            "name",
            "account_id",
            "partner_id",
            "move_id",
            "debit",
            "credit",
            "balance",
            "amount_currency",
            "currency_id",
        ],
        limit=limit,
        order="date desc, id desc",
    )

    return {
        "status": "success",
        "message": f"Retrieved {len(lines)} recent transactions",
        "count": len(lines),
        "transactions": lines,
    }


def create_journal_entry(
    journal_id: int,
    date: str = "",
    line_ids: list[dict] | None = None,
    ref: str = "",
    **extra_fields: Any,
) -> dict:
    """
    Create a Journal Entry (account.move).

    line_ids: list of dicts, each with:
        account_id (int), name (str), debit (float), credit (float),
        partner_id (int, optional)
    """
    client = get_client()

    lines = []
    if line_ids:
        for ln in line_ids:
            line_vals = {
                "account_id": ln["account_id"],
                "name": ln.get("name", "/"),
                "debit": ln.get("debit", 0.0),
                "credit": ln.get("credit", 0.0),
            }
            if ln.get("partner_id"):
                line_vals["partner_id"] = ln["partner_id"]
            lines.append((0, 0, line_vals))

    move_vals: dict[str, Any] = {
        "journal_id": journal_id,
        "date": date or datetime.now().strftime("%Y-%m-%d"),
        "line_ids": lines,
    }
    if ref:
        move_vals["ref"] = ref
    move_vals.update(extra_fields)

    move_id = client.create("account.move", move_vals)
    logger.info("Created journal entry account.move id=%d", move_id)

    move = client.read("account.move", [move_id])[0]
    return {
        "status": "success",
        "message": f"Journal Entry created successfully (id={move_id})",
        "move_id": move_id,
        "entry": move,
    }


# ── MCP Protocol ─────────────────────────────────────────────────────────────
# MCP servers communicate via stdin/stdout using JSON-RPC 2.0 messages.
# This implementation follows the Model Context Protocol spec.

MCP_SERVER_INFO = {
    "name": "odoo-gold-tier",
    "version": "1.0.0",
    "description": "Odoo 19 Gold Tier MCP Server — invoices, customers, sales, accounting",
}

TOOLS = [
    {
        "name": "create_customer",
        "description": "Create a new customer (contact) in Odoo",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Customer name"},
                "email": {"type": "string", "description": "Email address"},
                "phone": {"type": "string", "description": "Phone number"},
                "vat": {"type": "string", "description": "VAT / Tax ID"},
                "street": {"type": "string", "description": "Street address"},
                "city": {"type": "string", "description": "City"},
                "country_id": {"type": "integer", "description": "Odoo country ID"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "create_invoice",
        "description": "Create a customer invoice in Odoo",
        "inputSchema": {
            "type": "object",
            "properties": {
                "partner_id": {"type": "integer", "description": "Customer ID"},
                "invoice_type": {
                    "type": "string",
                    "enum": ["out_invoice", "out_refund", "in_invoice", "in_refund"],
                    "description": "Invoice type",
                },
                "invoice_date": {"type": "string", "description": "Invoice date (YYYY-MM-DD)"},
                "invoice_line_ids": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "product_id": {"type": "integer"},
                            "name": {"type": "string"},
                            "quantity": {"type": "number"},
                            "price_unit": {"type": "number"},
                        },
                    },
                    "description": "Invoice line items",
                },
                "payment_term_id": {"type": "integer", "description": "Payment term ID"},
                "narrative": {"type": "string", "description": "Additional notes"},
            },
            "required": ["partner_id"],
        },
    },
    {
        "name": "create_sale_order",
        "description": "Create a Sale Order in Odoo",
        "inputSchema": {
            "type": "object",
            "properties": {
                "partner_id": {"type": "integer", "description": "Customer ID"},
                "order_line_ids": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "product_id": {"type": "integer"},
                            "name": {"type": "string"},
                            "product_uom_qty": {"type": "number"},
                            "price_unit": {"type": "number"},
                        },
                    },
                    "description": "Order line items",
                },
                "date_order": {"type": "string", "description": "Order date (YYYY-MM-DD)"},
                "validity_date": {"type": "string", "description": "Quotation expiry (YYYY-MM-DD)"},
                "note": {"type": "string", "description": "Additional notes"},
            },
            "required": ["partner_id"],
        },
    },
    {
        "name": "get_bank_balance",
        "description": "Get bank/cash journal balance summary from Odoo accounting",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_accounting_summary",
        "description": "Get overall accounting summary (receivable, payable, bank balance)",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_recent_transactions",
        "description": "Get recent accounting transactions / journal items",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max records to return", "default": 20},
                "days": {"type": "integer", "description": "Look back this many days", "default": 30},
                "move_type": {"type": "string", "description": "Filter by move type (optional)"},
            },
        },
    },
    {
        "name": "create_journal_entry",
        "description": "Create a journal entry (account.move) with debit/credit lines",
        "inputSchema": {
            "type": "object",
            "properties": {
                "journal_id": {"type": "integer", "description": "Odoo journal ID"},
                "date": {"type": "string", "description": "Entry date (YYYY-MM-DD)"},
                "ref": {"type": "string", "description": "Reference / memo"},
                "line_ids": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "account_id": {"type": "integer"},
                            "name": {"type": "string"},
                            "debit": {"type": "number"},
                            "credit": {"type": "number"},
                            "partner_id": {"type": "integer"},
                        },
                        "required": ["account_id", "name"],
                    },
                    "description": "Journal lines with debit/credit",
                },
            },
            "required": ["journal_id", "line_ids"],
        },
    },
]

TOOL_HANDLERS = {
    "create_customer": create_customer,
    "create_invoice": create_invoice,
    "create_sale_order": create_sale_order,
    "get_bank_balance": get_bank_balance,
    "get_accounting_summary": get_accounting_summary,
    "get_recent_transactions": get_recent_transactions,
    "create_journal_entry": create_journal_entry,
}


def _handle_initialize(params: dict) -> dict:
    """MCP initialize handshake."""
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {"listChanged": False},
        },
        "serverInfo": {
            "name": MCP_SERVER_INFO["name"],
            "version": MCP_SERVER_INFO["version"],
        },
    }


def _handle_tools_list(params: dict) -> dict:
    """Return list of available tools."""
    return {"tools": TOOLS}


def _handle_tools_call(params: dict) -> dict:
    """Execute a tool and return result with audit logging."""
    tool_name = params.get("name", "")
    arguments = params.get("arguments", {})

    handler = TOOL_HANDLERS.get(tool_name)
    if not handler:
        return {
            "content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}],
            "isError": True,
        }

    # Audit log start
    audit = get_audit_manager() if AUDIT_AVAILABLE else None
    if audit:
        entry = AuditEntry(
            category=AuditCategory.ODOO,
            level=AuditLevel.INFO,
            action=f"tool_call.{tool_name}",
            details={"arguments": {k: str(v)[:100] for k, v in arguments.items()}},
            source="odoo_mcp",
        )
        audit.log(entry)

    try:
        result = handler(**arguments)

        # Audit log success
        if audit:
            entry = AuditEntry(
                category=AuditCategory.ODOO,
                level=AuditLevel.SUCCESS,
                action=f"tool_call.{tool_name}",
                details={"status": "success"},
                source="odoo_mcp",
            )
            audit.log(entry)

        return {
            "content": [{"type": "text", "text": _safe_json(result)}],
            "isError": False,
        }
    except AuthenticationError as exc:
        logger.error("Auth error: %s", exc)
        if audit:
            entry = AuditEntry(
                category=AuditCategory.ODOO,
                level=AuditLevel.ERROR,
                action=f"tool_call.{tool_name}",
                error={"type": "AuthenticationError", "message": str(exc)},
                source="odoo_mcp",
            )
            audit.log(entry)
        return {
            "content": [{"type": "text", "text": f"Authentication error: {exc}"}],
            "isError": True,
        }
    except xmlrpc.client.Fault as exc:
        logger.error("Odoo XML-RPC fault: %s", exc)
        if audit:
            entry = AuditEntry(
                category=AuditCategory.ODOO,
                level=AuditLevel.ERROR,
                action=f"tool_call.{tool_name}",
                error={"type": "XMLRPCFault", "message": exc.faultString},
                source="odoo_mcp",
            )
            audit.log(entry)
        return {
            "content": [{"type": "text", "text": f"Odoo XML-RPC error: {exc.faultString}"}],
            "isError": True,
        }
    except Exception as exc:
        logger.exception("Tool '%s' raised exception: %s", tool_name, exc)
        if audit:
            entry = AuditEntry(
                category=AuditCategory.ODOO,
                level=AuditLevel.ERROR,
                action=f"tool_call.{tool_name}",
                error={"type": type(exc).__name__, "message": str(exc)},
                source="odoo_mcp",
            )
            audit.log(entry)
        return {
            "content": [{"type": "text", "text": f"Error: {exc}"}],
            "isError": True,
        }


# ── Main Loop (stdin/stdout JSON-RPC) ────────────────────────────────────────
REQUEST_HANDLERS = {
    "initialize": _handle_initialize,
    "tools/list": _handle_tools_list,
    "tools/call": _handle_tools_call,
}


def run_mcp_server():
    """
    Main MCP loop: read JSON-RPC requests from stdin, dispatch, write response to stdout.
    """
    logger.info(
        "Starting Odoo MCP Server '%s' v%s  (DB=%s, URL=%s)",
        MCP_SERVER_INFO["name"],
        MCP_SERVER_INFO["version"],
        ODOO_DB,
        ODOO_URL,
    )

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue

        try:
            request = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {exc}"},
            }
            print(json.dumps(response), flush=True)
            continue

        method = request.get("method", "")
        request_id = request.get("id")
        params = request.get("params", {})

        handler = REQUEST_HANDLERS.get(method)
        if handler is None:
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }
        else:
            try:
                result = handler(params)
                response = {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": result,
                }
            except Exception as exc:
                logger.exception("Unhandled error in %s", method)
                response = {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32603, "message": f"Internal error: {exc}"},
                }

        print(json.dumps(response, default=_json_serial), flush=True)


# ── CLI convenience: direct tool invocation ───────────────────────────────────
def cli_direct(tool_name: str, **kwargs):
    """Allow direct CLI calls: python odoo_mcp.py create_customer name='Test'"""
    handler = TOOL_HANDLERS.get(tool_name)
    if not handler:
        print(json.dumps({"error": f"Unknown tool: {tool_name}"}))
        sys.exit(1)
    try:
        result = handler(**kwargs)
        print(_safe_json(result))
    except Exception as exc:
        logger.exception("CLI call failed")
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    # If args provided, treat as direct CLI call; otherwise run MCP stdin loop
    if len(sys.argv) > 1:
        tool_name = sys.argv[1]
        # Parse key=value arguments
        cli_kwargs = {}
        for arg in sys.argv[2:]:
            if "=" in arg:
                key, value = arg.split("=", 1)
                # Try int / float
                try:
                    cli_kwargs[key] = int(value)
                except ValueError:
                    try:
                        cli_kwargs[key] = float(value)
                    except ValueError:
                        cli_kwargs[key] = value
        cli_direct(tool_name, **cli_kwargs)
    else:
        run_mcp_server()
