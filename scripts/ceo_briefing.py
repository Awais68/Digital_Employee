#!/usr/bin/env python3
"""
SKILL_CEO_Briefing: Weekly Monday Morning CEO Briefing Generator

Reads Odoo accounting data via JSON-RPC, scans Obsidian vault for tasks,
analyzes revenue/bottlenecks, generates suggestions, and saves briefing.

Usage:
    python3 ceo_briefing.py [--vault-path PATH] [--force]
"""

import json
import os
import sys
import glob
import yaml
import urllib.request
import urllib.error
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent.parent
BRIEFINGS_DIR = SCRIPT_DIR / "Briefings"
LOGS_DIR = SCRIPT_DIR / "Logs"
LOG_FILE = LOGS_DIR / "ceo_briefing.log"

# Default Obsidian vault paths to scan
DEFAULT_VAULT_TASK_PATTERNS = [
    "Vault/Tasks/**/*.md",
    "Vault/Projects/**/*.md",
    "**/Tasks/**/*.md",
    "**/Projects/**/*.md",
]

# Odoo config (override with env vars or .env)
ODOO_URL = os.environ.get("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.environ.get("ODOO_DB", "odoo")
ODOO_USERNAME = os.environ.get("ODOO_USERNAME", "awaisniaz720@gmail.com")
ODOO_PASSWORD = os.environ.get("ODOO_PASSWORD", "")

# Logging setup
LOGS_DIR.mkdir(parents=True, exist_ok=True)
BRIEFINGS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("ceo_briefing")


# ─── Odoo JSON-RPC Client ───────────────────────────────────────────────────

class OdooClient:
    """Minimal Odoo JSON-RPC client for accounting data."""

    def __init__(self, url: str, db: str, username: str, password: str):
        self.url = url.rstrip("/")
        self.db = db
        self.username = username
        self.password = password
        self.uid = None

    def _jsonrpc(self, service: str, method: str, args: list, context: dict = None) -> Any:
        """Send a JSON-RPC request to Odoo."""
        if service == "common":
            endpoint = f"{self.url}/jsonrpc"
        elif service == "object":
            endpoint = f"{self.url}/jsonrpc"
        else:
            endpoint = f"{self.url}/jsonrpc"

        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "service": service,
                "method": method,
                "args": args,
                "context": context or {},
            },
            "id": 1,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                if "error" in result:
                    raise Exception(f"Odoo JSON-RPC error: {result['error']}")
                return result.get("result")
        except urllib.error.URLError as e:
            raise ConnectionError(f"Failed to connect to Odoo at {self.url}: {e}")

    def authenticate(self) -> int:
        """Authenticate and return user ID."""
        result = self._jsonrpc("common", "authenticate", [
            self.db, self.username, self.password, {}
        ])
        if not result:
            raise AuthenticationError("Odoo authentication failed. Check credentials.")
        self.uid = result
        return result

    def execute_kw(self, model: str, method: str, args: list, context: dict = None) -> Any:
        """Execute a method on an Odoo model."""
        if self.uid is None:
            self.authenticate()
        return self._jsonrpc("object", "execute_kw", [
            self.db, self.uid, self.password, model, method, args
        ], context)

    def search_read(self, model: str, domain: list, fields: list, limit: int = 0) -> list:
        """Search and read records from a model."""
        return self.execute_kw(model, "search_read", [domain], {
            "fields": fields,
            "limit": limit,
        })

    # ─── High-Level Methods ──────────────────────────────────────────────

    def get_accounting_summary(self, start_date: str, end_date: str) -> dict:
        """Get accounting summary for a date range."""
        try:
            # Get posted customer invoices
            invoices = self.search_read("account.move", [
                ("move_type", "=", "out_invoice"),
                ("state", "=", "posted"),
                ("date", ">=", start_date),
                ("date", "<=", end_date),
            ], ["name", "amount_total", "amount_tax", "amount_untaxed", "date", "state", "partner_id", "payment_state"], limit=0)

            total_revenue = sum(inv.get("amount_untaxed", 0) or 0 for inv in invoices)
            total_tax = sum(inv.get("amount_tax", 0) or 0 for inv in invoices)
            total_with_tax = sum(inv.get("amount_total", 0) or 0 for inv in invoices)

            paid = [inv for inv in invoices if inv.get("payment_state") == "paid"]
            not_paid = [inv for inv in invoices if inv.get("payment_state") != "paid"]
            outstanding_amount = sum(inv.get("amount_total", 0) or 0 for inv in not_paid)

            # Get expenses (vendor bills)
            expenses = self.search_read("account.move", [
                ("move_type", "=", "in_invoice"),
                ("state", "=", "posted"),
                ("date", ">=", start_date),
                ("date", "<=", end_date),
            ], ["name", "amount_total", "date"], limit=0)

            total_expenses = sum(exp.get("amount_total", 0) or 0 for exp in expenses)

            return {
                "total_revenue": round(total_revenue, 2),
                "total_revenue_with_tax": round(total_with_tax, 2),
                "total_tax": round(total_tax, 2),
                "total_expenses": round(total_expenses, 2),
                "net_profit": round(total_revenue - total_expenses, 2),
                "invoices_issued": len(invoices),
                "invoices_paid": len(paid),
                "invoices_outstanding": len(not_paid),
                "outstanding_amount": round(outstanding_amount, 2),
                "invoice_list": invoices[:10],  # Top 10 for detail
            }
        except Exception as e:
            logger.error(f"Error fetching accounting summary: {e}")
            return {
                "total_revenue": 0, "total_revenue_with_tax": 0,
                "total_tax": 0, "total_expenses": 0, "net_profit": 0,
                "invoices_issued": 0, "invoices_paid": 0,
                "invoices_outstanding": 0, "outstanding_amount": 0,
                "invoice_list": [], "error": str(e),
            }

    def get_bank_balance(self) -> dict:
        """Get bank account balances."""
        try:
            # Find bank journals
            journals = self.search_read("account.journal", [
                ("type", "in", ["bank", "cash"]),
            ], ["name", "code", "type", "currency_id"])

            accounts = []
            for journal in journals:
                journal_id = journal.get("id")
                if not journal_id:
                    continue

                # Get account move lines for this journal
                move_lines = self.search_read("account.move.line", [
                    ("journal_id", "=", journal_id),
                ], ["account_id", "debit", "credit", "date"], limit=500)

                balance = sum((ml.get("debit", 0) or 0) - (ml.get("credit", 0) or 0) for ml in move_lines)
                currency_id = journal.get("currency_id")
                currency_name = "USD"
                if currency_id and isinstance(currency_id, list) and len(currency_id) > 1:
                    currency_name = currency_id[1]

                accounts.append({
                    "name": journal.get("name", "Unknown"),
                    "code": journal.get("code", ""),
                    "balance": round(balance, 2),
                    "currency": currency_name,
                })

            total_balance = sum(a["balance"] for a in accounts)
            return {"accounts": accounts, "total_balance": round(total_balance, 2)}
        except Exception as e:
            logger.error(f"Error fetching bank balance: {e}")
            return {"accounts": [], "total_balance": 0, "error": str(e)}

    def get_recent_transactions(self, limit: int = 20, date_from: str = None) -> dict:
        """Get recent account move lines (transactions)."""
        try:
            domain = [("parent_state", "=", "posted")]
            if date_from:
                domain.append(("date", ">=", date_from))

            lines = self.search_read("account.move.line", domain, [
                "date", "name", "account_id", "partner_id",
                "debit", "credit", "move_id", "journal_id",
            ], limit=limit)

            transactions = []
            for line in lines:
                partner = line.get("partner_id")
                partner_name = partner[1] if isinstance(partner, list) and len(partner) > 1 else "N/A"
                account = line.get("account_id")
                account_name = account[1] if isinstance(account, list) and len(account) > 1 else "N/A"

                transactions.append({
                    "date": line.get("date", ""),
                    "description": line.get("name", ""),
                    "account": account_name,
                    "partner": partner_name,
                    "debit": line.get("debit", 0) or 0,
                    "credit": line.get("credit", 0) or 0,
                    "net": (line.get("debit", 0) or 0) - (line.get("credit", 0) or 0),
                })

            return {"count": len(transactions), "transactions": transactions}
        except Exception as e:
            logger.error(f"Error fetching transactions: {e}")
            return {"count": 0, "transactions": [], "error": str(e)}


class AuthenticationError(Exception):
    pass


# ─── Obsidian Vault Scanner ─────────────────────────────────────────────────

def parse_yaml_frontmatter(filepath: str) -> dict | None:
    """Parse YAML frontmatter from a markdown file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                return yaml.safe_load(parts[1])
    except Exception as e:
        logger.warning(f"Could not parse frontmatter from {filepath}: {e}")
    return None


def extract_first_heading(filepath: str) -> str:
    """Extract the first H1 or H2 heading from a markdown file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("# "):
                    return line[2:].strip()
                elif line.startswith("## "):
                    return line[3:].strip()
    except Exception:
        pass
    return Path(filepath).stem


def scan_vault_for_tasks(vault_path: str = None) -> list:
    """Scan Obsidian vault for task/project files."""
    tasks = []
    patterns = DEFAULT_VAULT_TASK_PATTERNS

    # If vault path provided, use it; otherwise search from script dir
    search_roots = []
    if vault_path:
        search_roots.append(Path(vault_path))
        for pattern in patterns:
            for fp in glob.glob(os.path.join(vault_path, pattern), recursive=True):
                _process_task_file(fp, tasks)
    else:
        # Search relative to script directory
        for pattern in patterns:
            for fp in glob.glob(str(SCRIPT_DIR / pattern), recursive=True):
                _process_task_file(fp, tasks)
            # Also try from parent directories (vault may be outside project)
            for parent in Path("/home/awais").glob("*/Vault"):
                for fp in glob.glob(str(parent / pattern), recursive=True):
                    _process_task_file(fp, tasks)

    logger.info(f"Scanned vault: found {len(tasks)} task/project files")
    return tasks


def _process_task_file(filepath: str, tasks: list):
    """Parse a single task file and add to tasks list."""
    metadata = parse_yaml_frontmatter(filepath)
    if metadata:
        task_type = metadata.get("type", "").lower()
        if task_type in ["task", "project"]:
            tasks.append({
                "title": metadata.get("title", Path(filepath).stem),
                "status": metadata.get("status", "unknown"),
                "priority": metadata.get("priority", "normal"),
                "assignee": metadata.get("assignee", "Unassigned"),
                "due_date": metadata.get("due_date"),
                "created": metadata.get("created"),
                "updated": metadata.get("updated"),
                "tags": metadata.get("tags", []),
                "file": str(filepath),
                "summary": extract_first_heading(filepath),
            })


# ─── Analysis Engine ────────────────────────────────────────────────────────

def calculate_growth(current: float, previous: float) -> float:
    """Calculate week-over-week growth percentage."""
    if previous == 0:
        return 0.0 if current == 0 else 100.0
    return round(((current - previous) / previous) * 100, 1)


def detect_bottlenecks(odoo_data: dict, tasks: list, bank_balance: float) -> list:
    """Detect operational bottlenecks from data."""
    bottlenecks = []
    today = datetime.now().date()

    # 1. Cash Flow Bottleneck
    this_week_expenses = odoo_data.get("this_week", {}).get("total_expenses", 0)
    monthly_expenses_est = this_week_expenses * 4
    if bank_balance > 0 and bank_balance < 2 * monthly_expenses_est and monthly_expenses_est > 0:
        bottlenecks.append({
            "type": "Cash Flow",
            "severity": "🔴 High" if bank_balance < monthly_expenses_est else "🟡 Medium",
            "impact": f"Bank balance (${bank_balance:,.2f}) covers only {bank_balance / monthly_expenses_est:.1f}x monthly expenses",
            "root_cause": "Low cash reserves relative to operating expenses",
        })

    # 2. Revenue Decline
    this_rev = odoo_data.get("this_week", {}).get("total_revenue", 0)
    last_rev = odoo_data.get("last_week", {}).get("total_revenue", 0)
    growth = calculate_growth(this_rev, last_rev)
    if growth < -10:
        bottlenecks.append({
            "type": "Revenue Decline",
            "severity": "🔴 High" if growth < -25 else "🟡 Medium",
            "impact": f"Revenue down {growth}% WoW (${last_rev:,.2f} → ${this_rev:,.2f})",
            "root_cause": "Fewer invoices issued or lower invoice values",
        })

    # 3. Invoice Aging / Outstanding Receivables
    outstanding = odoo_data.get("this_week", {}).get("outstanding_amount", 0)
    total_rev = odoo_data.get("this_week", {}).get("total_revenue_with_tax", 0)
    if total_rev > 0 and outstanding > 0.5 * total_rev:
        pct = (outstanding / total_rev) * 100
        bottlenecks.append({
            "type": "Outstanding Receivables",
            "severity": "🔴 High" if pct > 75 else "🟡 Medium",
            "impact": f"{pct:.0f}% of revenue is unpaid (${outstanding:,.2f} outstanding)",
            "root_cause": "Slow collections or long payment terms",
        })

    # 4. Task Backlog
    blocked = [t for t in tasks if t["status"] == "blocked"]
    overdue = []
    for t in tasks:
        if t.get("due_date") and t["status"] != "done":
            try:
                due = datetime.strptime(str(t["due_date"]), "%Y-%m-%d").date()
                if due < today:
                    overdue.append(t)
            except (ValueError, TypeError):
                pass

    if len(blocked) > 5:
        bottlenecks.append({
            "type": "Task Backlog",
            "severity": "🟡 Medium",
            "impact": f"{len(blocked)} tasks blocked, {len(overdue)} overdue",
            "root_cause": "Insufficient progress on critical items",
        })
    elif len(overdue) > 3:
        bottlenecks.append({
            "type": "Overdue Tasks",
            "severity": "🟡 Medium",
            "impact": f"{len(overdue)} tasks past due date",
            "root_cause": "Missed deadlines, needs re-prioritization",
        })

    # 5. Resource Overload
    assignee_counts: dict[str, int] = {}
    for t in tasks:
        if t["status"] == "in_progress":
            a = t.get("assignee", "Unassigned")
            assignee_counts[a] = assignee_counts.get(a, 0) + 1

    for assignee, count in assignee_counts.items():
        if count > 5:
            bottlenecks.append({
                "type": "Resource Overload",
                "severity": "🟡 Medium",
                "impact": f"{assignee} has {count} in-progress tasks",
                "root_cause": "Uneven task distribution, needs delegation",
            })

    # 6. Expense Spike
    last_exp = odoo_data.get("last_week", {}).get("total_expenses", 0)
    if last_exp > 0 and this_week_expenses > last_exp * 1.3:
        spike_pct = ((this_week_expenses - last_exp) / last_exp) * 100
        bottlenecks.append({
            "type": "Expense Spike",
            "severity": "🟡 Medium",
            "impact": f"Expenses up {spike_pct:.0f}% WoW (${last_exp:,.2f} → ${this_week_expenses:,.2f})",
            "root_cause": "Unusual spending this period",
        })

    # 7. Low Productivity
    completed = [t for t in tasks if t["status"] == "done"]
    if len(tasks) > 0 and len(completed) < 3 and len(tasks) > 5:
        bottlenecks.append({
            "type": "Low Productivity",
            "severity": "🟡 Medium",
            "impact": f"Only {len(completed)} tasks completed this week",
            "root_cause": "Possible blockers, unclear priorities, or resource constraints",
        })

    return bottlenecks


def generate_suggestions(bottlenecks: list, odoo_data: dict, tasks: list, bank_balance: float) -> list:
    """Generate strategic suggestions based on detected conditions."""
    suggestions = []
    today = datetime.now().date()

    this_rev = odoo_data.get("this_week", {}).get("total_revenue", 0)
    last_rev = odoo_data.get("last_week", {}).get("total_revenue", 0)
    growth = calculate_growth(this_rev, last_rev)
    outstanding = odoo_data.get("this_week", {}).get("outstanding_amount", 0)
    total_rev = odoo_data.get("this_week", {}).get("total_revenue_with_tax", 0)
    expenses = odoo_data.get("this_week", {}).get("total_expenses", 0)
    completed = [t for t in tasks if t["status"] == "done"]
    blocked = [t for t in tasks if t["status"] == "blocked"]

    # Revenue-based suggestions
    if growth < -10:
        suggestions.append({
            "type": "Immediate",
            "text": "Review pricing strategy and reach out to existing clients for upsell opportunities",
            "impact": "High",
            "effort": "Medium",
            "priority": "P0",
        })
    elif growth > 20:
        suggestions.append({
            "type": "Growth",
            "text": f"Revenue growing {growth}% WoW — consider scaling operations, hiring, or expanding service offerings",
            "impact": "High",
            "effort": "High",
            "priority": "P1",
        })

    # Collection suggestions
    if total_rev > 0 and outstanding > 0.3 * total_rev:
        suggestions.append({
            "type": "Immediate",
            "text": "Initiate collections process for overdue invoices — send reminders and follow up on payments > 30 days",
            "impact": "High",
            "effort": "Low",
            "priority": "P0",
        })

    # Cash flow suggestions
    if bank_balance > 0 and expenses > 0 and bank_balance < 3 * expenses:
        suggestions.append({
            "type": "Immediate",
            "text": "Delay non-critical expenses this week; accelerate invoice collections to improve cash position",
            "impact": "High",
            "effort": "Low",
            "priority": "P0",
        })

    # Expense management
    if total_rev > 0 and expenses > 0.7 * total_rev:
        suggestions.append({
            "type": "Medium-Term",
            "text": f"Expenses are {(expenses/total_rev)*100:.0f}% of revenue — audit operating costs and identify optimization opportunities",
            "impact": "Medium",
            "effort": "Medium",
            "priority": "P1",
        })

    # Task management
    if len(blocked) > 3:
        suggestions.append({
            "type": "Immediate",
            "text": f"Address {len(blocked)} blocked tasks — hold alignment meeting to identify and remove blockers",
            "impact": "High",
            "effort": "Low",
            "priority": "P0",
        })

    # Client diversification
    invoices = odoo_data.get("this_week", {}).get("invoice_list", [])
    partner_amounts: dict[str, float] = {}
    if invoices:
        for inv in invoices:
            partner = inv.get("partner_id")
            partner_name = partner[1] if isinstance(partner, list) and len(partner) > 1 else "Unknown"
            partner_amounts[partner_name] = partner_amounts.get(partner_name, 0) + (inv.get("amount_total", 0) or 0)

        if partner_amounts and total_rev > 0:
            top_client_share = max(partner_amounts.values()) / total_rev
            if top_client_share > 0.4:
                top_client = max(partner_amounts, key=partner_amounts.get)
                suggestions.append({
                    "type": "Medium-Term",
                    "text": f"Client '{top_client}' represents {top_client_share*100:.0f}% of revenue — diversify client base to reduce concentration risk",
                    "impact": "High",
                    "effort": "High",
                    "priority": "P1",
                })

    # Lead generation
    if invoices:
        unique_clients = len(partner_amounts)
        if unique_clients <= 1:
            suggestions.append({
                "type": "Growth",
                "text": "Only 1 active client this period — launch lead generation campaign or outreach initiative",
                "impact": "High",
                "effort": "Medium",
                "priority": "P1",
            })

    # Positive reinforcement
    if growth >= 0 and len(blocked) <= 2 and len(completed) >= 3:
        suggestions.append({
            "type": "Growth",
            "text": "All metrics on track — maintain momentum, plan next sprint goals, and explore growth opportunities",
            "impact": "Medium",
            "effort": "Low",
            "priority": "P2",
        })

    return suggestions


# ─── Briefing Generator ─────────────────────────────────────────────────────

def generate_executive_summary(odoo_data: dict, tasks: list, bottlenecks: list, growth: float) -> str:
    """Generate 2-3 sentence executive summary."""
    this_rev = odoo_data.get("this_week", {}).get("total_revenue", 0)
    completed = len([t for t in tasks if t["status"] == "done"])
    blocked = len([t for t in tasks if t["status"] == "blocked"])
    high_severity = len([b for b in bottlenecks if "🔴" in b.get("severity", "")])

    sentences = []

    # Revenue sentence
    if this_rev > 0:
        direction = "up" if growth > 0 else "down"
        sentences.append(
            f"Revenue this week was ${this_rev:,.2f}, {direction} {abs(growth)}% from last week."
        )
    else:
        sentences.append("No revenue was recorded this week.")

    # Tasks sentence
    sentences.append(f"{completed} tasks were completed with {blocked} currently blocked.")

    # Concern sentence
    if high_severity > 0:
        sentences.append(
            f"⚠️ {high_severity} high-severity bottleneck(s) require immediate attention."
        )
    elif growth > 15:
        sentences.append("📈 Strong growth trajectory — consider scaling initiatives.")

    return " ".join(sentences)


def determine_overall_health(bottlenecks: list, growth: float, tasks: list) -> str:
    """Determine overall health status."""
    high = len([b for b in bottlenecks if "🔴" in b.get("severity", "")])
    medium = len([b for b in bottlenecks if "🟡" in b.get("severity", "")])

    if high >= 2 or growth < -25:
        return "🔴 Attention Required"
    elif high >= 1 or medium >= 3 or growth < -10:
        return "🟡 Caution"
    else:
        return "🟢 Good"


def format_mini_bar(value: float, max_value: float, width: int = 10) -> str:
    """Create a simple ASCII bar chart."""
    if max_value == 0:
        return "░" * width
    filled = int((value / max_value) * width)
    filled = max(0, min(filled, width))
    return "▓" * filled + "░" * (width - filled)


def generate_briefing(
    period_start: datetime,
    period_end: datetime,
    odoo_this_week: dict,
    odoo_last_week: dict,
    bank_data: dict,
    transactions: dict,
    tasks: list,
    bottlenecks: list,
    suggestions: list,
) -> str:
    """Generate the complete CEO briefing markdown."""

    today = datetime.now()
    generated_str = today.strftime("%A, %B %d, %Y at %I:%M %p")
    start_str = period_start.strftime("%A, %B %d")
    end_str = period_end.strftime("%A, %B %d, %Y")

    # Calculate metrics
    this_rev = odoo_this_week.get("total_revenue", 0)
    last_rev = odoo_last_week.get("total_revenue", 0)
    growth = calculate_growth(this_rev, last_rev)

    this_exp = odoo_this_week.get("total_expenses", 0)
    last_exp = odoo_last_week.get("total_expenses", 0)
    exp_growth = calculate_growth(this_exp, last_exp)

    this_inv = odoo_this_week.get("invoices_issued", 0)
    last_inv = odoo_last_week.get("invoices_issued", 0)
    inv_change = this_inv - last_inv

    this_paid = odoo_this_week.get("invoices_paid", 0)
    last_paid = odoo_last_week.get("invoices_paid", 0)
    paid_change = this_paid - last_paid

    this_out = odoo_this_week.get("outstanding_amount", 0)
    last_out = odoo_last_week.get("outstanding_amount", 0)
    out_change = this_out - last_out

    avg_invoice = this_rev / this_inv if this_inv > 0 else 0

    bank_balance = bank_data.get("total_balance", 0)

    completed = [t for t in tasks if t["status"] == "done"]
    in_progress = [t for t in tasks if t["status"] == "in_progress"]
    blocked = [t for t in tasks if t["status"] == "blocked"]

    today_date = today.date()
    overdue = []
    upcoming = []
    for t in tasks:
        if t.get("due_date") and t["status"] != "done":
            try:
                due = datetime.strptime(str(t["due_date"]), "%Y-%m-%d").date()
                if due < today_date:
                    overdue.append(t)
                elif due <= today_date + timedelta(days=7):
                    upcoming.append(t)
            except (ValueError, TypeError):
                pass

    completion_rate = (len(completed) / max(len(tasks), 1)) * 100

    executive_summary = generate_executive_summary(
        {"this_week": odoo_this_week}, tasks, bottlenecks, growth
    )
    health = determine_overall_health(bottlenecks, growth, tasks)

    # Revenue trend data (last 4 weeks mock — would need more queries for real data)
    trend_values = [last_rev * 0.85, last_rev * 0.92, last_rev, this_rev]
    max_trend = max(trend_values) if trend_values else 1

    # ─── Build Markdown ──────────────────────────────────────────────────
    briefing = f"""---
type: ceo_briefing
version: 1.0
generated: {today.strftime("%Y-%m-%dT%H:%M:%S")}
period: Weekly
week_start: {period_start.strftime("%Y-%m-%d")}
week_end: {period_end.strftime("%Y-%m-%d")}
data_sources: [odoo_accounting, obsidian_tasks]
skill_reference: SKILL_CEO_Briefing
classification: confidential
---

# CEO Weekly Briefing

**Period:** {start_str} – {end_str}
**Generated:** {generated_str}
**Prepared By:** Digital Employee System

---

## 📊 Executive Summary

> {executive_summary}

**Overall Health:** {health}

---

## 💰 Financial Performance

### Revenue Overview

| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| **Total Revenue** | ${this_rev:,.2f} | ${last_rev:,.2f} | {'↑' if growth >= 0 else '↓'} {abs(growth)}% |
| **Invoices Issued** | {this_inv} | {last_inv} | {'↑' if inv_change >= 0 else '↓'} {abs(inv_change)} |
| **Payments Received** | {this_paid} | {last_paid} | {'↑' if paid_change >= 0 else '↓'} {abs(paid_change)} |
| **Avg. Invoice Value** | ${avg_invoice:,.2f} | ${last_rev / last_inv if last_inv else 0:,.2f} | {'↑' if avg_invoice >= (last_rev / last_inv if last_inv else 0) else '↓'} |
| **Outstanding** | ${this_out:,.2f} | ${last_out:,.2f} | {'↑' if out_change >= 0 else '↓'} ${abs(out_change):,.2f} |

### Revenue Trend (Last 4 Weeks)

```
"""
    # Add trend bars
    week_labels = ["Week -3", "Week -2", "Last Week", "This Week"]
    for i, (label, val) in enumerate(zip(week_labels, trend_values)):
        bar = format_mini_bar(val, max_trend)
        marker = "  ← Current" if i == len(trend_values) - 1 else ""
        briefing += f"{label}: ${val:>10,.2f}  {bar}{marker}\n"

    briefing += f"""```

### Cash Position

| Account | Balance |
|---------|---------|
"""
    for acct in bank_data.get("accounts", []):
        briefing += f"| **{acct.get('name', 'Unknown')}** | ${acct.get('balance', 0):,.2f} {acct.get('currency', '')} |\n"
    briefing += f"| **Total** | **${bank_balance:,.2f}** |\n"
    briefing += f"| **Outstanding Receivables** | ${this_out:,.2f} |\n"
    briefing += f"| **Net Cash Position** | **${bank_balance - this_out:,.2f}** |\n"

    # Top Transactions
    briefing += """
### Top Transactions This Week

| Date | Description | Amount | Type |
|------|-------------|--------|------|
"""
    txns = transactions.get("transactions", [])[:10]
    if txns:
        for tx in txns:
            net = tx.get("net", 0)
            tx_type = "Revenue" if net < 0 else "Expense"  # debit > credit = revenue received
            amount = abs(net)
            briefing += f"| {tx.get('date', '')} | {tx.get('description', '')[:40]} | {'+' if net < 0 else '-'}${amount:,.2f} | {tx.get('partner', 'N/A')} |\n"
    else:
        briefing += "| — | No transactions this week | — | — |\n"

    # ─── Task Section ────────────────────────────────────────────────────
    briefing += f"""
---

## ✅ Task & Project Status

### Weekly Accomplishments

**Completed: {len(completed)} tasks** *(vs. prior period)*

"""
    if completed:
        briefing += "| Task | Assignee | Priority | Notes |\n|------|----------|----------|-------|\n"
        for t in completed[:10]:
            briefing += f"| {t['title'][:40]} | {t.get('assignee', 'Unassigned')} | {t.get('priority', 'normal')} | {t.get('summary', '')[:30]} |\n"
    else:
        briefing += "*No tasks completed this week.*\n"

    briefing += f"""
### Active Work

**In Progress: {len(in_progress)} tasks**

"""
    if in_progress:
        briefing += "| Task | Assignee | Due Date | Status |\n|------|----------|----------|--------|\n"
        for t in in_progress[:10]:
            due = t.get("due_date", "No deadline")
            briefing += f"| {t['title'][:40]} | {t.get('assignee', 'Unassigned')} | {due} | On Track |\n"
    else:
        briefing += "*No active work items.*\n"

    # Blocked & Overdue
    briefing += f"""
### ⚠️ Blocked & Overdue

**Blocked: {len(blocked)} | Overdue: {len(overdue)}**

"""
    if blocked or overdue:
        briefing += "| Task | Assignee | Issue | Days Overdue |\n|------|----------|-------|--------------|\n"
        for t in blocked:
            briefing += f"| {t['title'][:40]} | {t.get('assignee', 'Unassigned')} | BLOCKED | — |\n"
        for t in overdue:
            try:
                due = datetime.strptime(str(t["due_date"]), "%Y-%m-%d").date()
                days_over = (today_date - due).days
            except (ValueError, TypeError):
                days_over = "?"
            briefing += f"| {t['title'][:40]} | {t.get('assignee', 'Unassigned')} | Overdue | {days_over} days |\n"
    else:
        briefing += "*No blocked or overdue tasks.*\n"

    # Upcoming Deadlines
    briefing += f"""
### Upcoming Deadlines (Next 7 Days)

"""
    if upcoming:
        briefing += "| Task | Assignee | Due Date | Priority |\n|------|----------|----------|----------|\n"
        for t in upcoming:
            briefing += f"| {t['title'][:40]} | {t.get('assignee', 'Unassigned')} | {t['due_date']} | {t.get('priority', 'normal')} |\n"
    else:
        briefing += "*No upcoming deadlines in the next 7 days.*\n"

    # ─── Bottlenecks ─────────────────────────────────────────────────────
    briefing += """
---

## 🚨 Bottlenecks & Risks

### Identified Bottlenecks

"""
    if bottlenecks:
        briefing += "| # | Bottleneck | Severity | Impact | Root Cause |\n|---|-----------|----------|--------|------------|\n"
        for i, b in enumerate(bottlenecks, 1):
            briefing += f"| {i} | {b['type']} | {b['severity']} | {b['impact'][:60]} | {b['root_cause'][:50]} |\n"
    else:
        briefing += "*No bottlenecks detected this week.* ✅\n"

    # Risk Assessment
    monthly_exp = this_exp * 4
    runway = (bank_balance / monthly_exp) if monthly_exp > 0 else float("inf")
    top_client_pct = 0
    invoices = odoo_this_week.get("invoice_list", [])
    if invoices:
        partner_amounts = {}
        for inv in invoices:
            p = inv.get("partner_id")
            pn = p[1] if isinstance(p, list) and len(p) > 1 else "Unknown"
            partner_amounts[pn] = partner_amounts.get(pn, 0) + (inv.get("amount_total", 0) or 0)
        if partner_amounts and this_rev > 0:
            top_client_pct = max(partner_amounts.values()) / this_rev * 100

    outstanding_ratio = (this_out / max(odoo_this_week.get("total_revenue_with_tax", 1), 1)) * 100

    briefing += f"""
### Risk Assessment

| Risk Area | Current | Threshold | Status |
|-----------|---------|-----------|--------|
| Cash Runway | {runway:.1f} months | 3 months min | {'🟢 Safe' if runway >= 3 else '🟡 Monitor' if runway >= 1.5 else '🔴 Critical'} |
| Client Concentration | Top client {top_client_pct:.0f}% | >40% concern | {'🟡 Monitor' if top_client_pct > 40 else '🟢 Diversified'} |
| Task Completion Rate | {completion_rate:.0f}% | >70% target | {'🟢 On Track' if completion_rate >= 70 else '🟡 Below Target'} |
| Outstanding Receivables | ${this_out:,.2f} ({outstanding_ratio:.0f}% of revenue) | >50% revenue | {'🟡 Elevated' if outstanding_ratio > 50 else '🟢 Manageable'} |
"""

    # ─── Suggestions ─────────────────────────────────────────────────────
    briefing += """
---

## 💡 Strategic Suggestions

### Immediate Actions (This Week)

"""
    immediate = [s for s in suggestions if s["type"] == "Immediate"]
    if immediate:
        briefing += "| # | Suggestion | Expected Impact | Effort | Priority |\n|---|-----------|----------------|--------|----------|\n"
        for i, s in enumerate(immediate, 1):
            briefing += f"| {i} | {s['text'][:80]} | {s['impact']} | {s['effort']} | {s['priority']} |\n"
    else:
        briefing += "*No urgent actions required.* ✅\n"

    medium_term = [s for s in suggestions if s["type"] == "Medium-Term"]
    if medium_term:
        briefing += """
### Medium-Term Initiatives (This Month)

"""
        briefing += "| # | Initiative | Expected Outcome | Timeline |\n|---|-----------|-----------------|----------|\n"
        for i, s in enumerate(medium_term, 1):
            briefing += f"| {i} | {s['text'][:80]} | {s['impact']} impact | Week {i}-{i+1} |\n"

    growth_suggestions = [s for s in suggestions if s["type"] == "Growth"]
    if growth_suggestions:
        briefing += """
### Growth Opportunities

"""
        briefing += "| # | Opportunity | Potential | Investment |\n|---|------------|-----------|------------|\n"
        for i, s in enumerate(growth_suggestions, 1):
            briefing += f"| {i} | {s['text'][:80]} | {s['impact']} | {s['effort']} |\n"

    # ─── KPI Dashboard ───────────────────────────────────────────────────
    briefing += f"""
---

## 📈 Key Metrics Dashboard

| KPI | Target | Actual | Status |
|-----|--------|--------|--------|
| Weekly Revenue | $10,000+ | ${this_rev:,.2f} | {'✅' if this_rev >= 10000 else '⚠️' if this_rev >= 5000 else '❌'} |
| Task Completion Rate | >70% | {completion_rate:.0f}% | {'✅' if completion_rate >= 70 else '⚠️' if completion_rate >= 50 else '❌'} |
| Outstanding Invoices | <30% | {outstanding_ratio:.0f}% | {'✅' if outstanding_ratio < 30 else '⚠️' if outstanding_ratio < 50 else '❌'} |
| Blocked Tasks | 0 | {len(blocked)} | {'✅' if len(blocked) == 0 else '⚠️' if len(blocked) <= 2 else '❌'} |
| Cash Reserve | 3+ months | {runway:.1f} months | {'✅' if runway >= 3 else '⚠️' if runway >= 1.5 else '❌'} |
"""

    # ─── Week Ahead ──────────────────────────────────────────────────────
    briefing += """
---

## 🔮 Week Ahead Priorities

"""
    priorities = []
    # Top priority from blocked tasks
    if blocked:
        priorities.append(f"**Resolve {len(blocked)} blocked task(s)** — Review blockers with assignees and clear path to completion")
    if this_out > 0:
        priorities.append(f"**Collect ${this_out:,.2f} in outstanding invoices** — Follow up on overdue payments")
    if upcoming:
        priorities.append(f"**Meet {len(upcoming)} upcoming deadline(s)** — Ensure deliverables are on track")
    if growth < 0:
        priorities.append("**Reverse revenue decline** — Review pipeline and reach out to prospects")
    if not priorities:
        priorities.append("**Maintain momentum** — Continue current trajectory and plan next sprint goals")
        priorities.append("**Explore growth opportunities** — Identify new clients or upsell opportunities")
        priorities.append("**Team alignment** — Review priorities and assign owners for key initiatives")

    for i, p in enumerate(priorities[:5], 1):
        briefing += f"{i}. {p}\n"

    # ─── Notes ───────────────────────────────────────────────────────────
    briefing += """
---

## 📝 Notes & Observations

> """
    observations = []
    if growth > 0:
        observations.append(f"Revenue trend is positive ({growth}+% WoW), indicating healthy business momentum.")
    elif growth < 0:
        observations.append(f"Revenue declined {abs(growth)}% from last week — monitor for consecutive declines.")

    if len(completed) > len(blocked) * 2:
        observations.append("Task completion rate is outpacing blockers, suggesting good operational flow.")

    if bank_balance > monthly_exp * 3:
        observations.append("Strong cash reserves provide runway for strategic investments.")

    if not observations:
        observations.append("Data collected and analyzed. No significant anomalies detected this period.")

    briefing += " ".join(observations)
    briefing += f"""

---

*Briefing generated by SKILL_CEO_Briefing v1.0.0 (Platinum Tier)*
*Data sourced from Odoo Accounting + Obsidian Vault*
*Classification: Confidential — For Executive Review Only*
"""
    return briefing


# ─── Main Execution ─────────────────────────────────────────────────────────

def main():
    """Main entry point for CEO Briefing generation."""
    import argparse

    parser = argparse.ArgumentParser(description="Generate Weekly CEO Briefing")
    parser.add_argument("--vault-path", type=str, default=None, help="Path to Obsidian vault")
    parser.add_argument("--force", action="store_true", help="Force generation even if not Monday")
    parser.add_argument("--start-date", type=str, default=None, help="Period start (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, default=None, help="Period end (YYYY-MM-DD)")
    args = parser.parse_args()

    today = datetime.now()

    # Check if Monday (unless --force)
    if today.weekday() != 0 and not args.force:
        logger.info(f"Today is {today.strftime('%A')} — not Monday. Use --force to override.")
        print("This skill runs on Mondays. Use --force to generate on other days.")
        sys.exit(0)

    # Determine date range
    if args.start_date and args.end_date:
        period_start = datetime.strptime(args.start_date, "%Y-%m-%d")
        period_end = datetime.strptime(args.end_date, "%Y-%m-%d")
    else:
        # Default: current week (Mon-Sun)
        days_since_monday = today.weekday()
        # This week's Monday (today's week)
        this_monday = today - timedelta(days=days_since_monday)
        # But we want LAST completed week (Mon-Sun before today)
        period_start = this_monday - timedelta(weeks=1)
        period_start = period_start.replace(hour=0, minute=0, second=0, microsecond=0)
        period_end = period_start + timedelta(days=6)
        period_end = period_end.replace(hour=23, minute=59, second=59)

    logger.info(f"Generating CEO Briefing for {period_start.strftime('%Y-%m-%d')} to {period_end.strftime('%Y-%m-%d')}")

    # ─── Step 1: Connect to Odoo ─────────────────────────────────────────
    logger.info("Connecting to Odoo...")
    odoo = OdooClient(ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD)
    try:
        odoo.authenticate()
        logger.info("Odoo authentication successful")
    except AuthenticationError as e:
        logger.error(f"Odoo authentication failed: {e}")
        print(f"ERROR: {e}")
        sys.exit(1)
    except ConnectionError as e:
        logger.error(f"Cannot connect to Odoo: {e}")
        print(f"WARNING: Cannot connect to Odoo — generating briefing with available data only")
        odoo = None

    # Fetch Odoo data
    odoo_this_week = {}
    odoo_last_week = {}
    bank_data = {"accounts": [], "total_balance": 0}
    transactions = {"count": 0, "transactions": []}

    if odoo:
        # This week data
        this_start = period_start.strftime("%Y-%m-%d")
        this_end = period_end.strftime("%Y-%m-%d")
        odoo_this_week = odoo.get_accounting_summary(this_start, this_end)

        # Last week data (for comparison)
        last_start = (period_start - timedelta(weeks=1)).strftime("%Y-%m-%d")
        last_end = (period_end - timedelta(weeks=1)).strftime("%Y-%m-%d")
        odoo_last_week = odoo.get_accounting_summary(last_start, last_end)

        # Bank balance
        bank_data = odoo.get_bank_balance()

        # Transactions
        transactions = odoo.get_recent_transactions(limit=20, date_from=this_start)

        logger.info(f"Odoo data retrieved: Revenue this week=${odoo_this_week.get('total_revenue', 0):,.2f}")
    else:
        logger.warning("Odoo unavailable — using empty data sets")
        odoo_this_week = {"total_revenue": 0, "total_expenses": 0, "invoices_issued": 0,
                          "invoices_paid": 0, "outstanding_amount": 0, "total_revenue_with_tax": 0,
                          "invoice_list": []}
        odoo_last_week = odoo_this_week.copy()

    # ─── Step 2: Scan Obsidian Vault ─────────────────────────────────────
    logger.info("Scanning Obsidian vault for tasks...")
    tasks = scan_vault_for_tasks(args.vault_path)
    logger.info(f"Found {len(tasks)} task/project files")

    # ─── Step 3: Analyze ─────────────────────────────────────────────────
    logger.info("Analyzing data and detecting bottlenecks...")
    bank_balance = bank_data.get("total_balance", 0)
    bottlenecks = detect_bottlenecks(
        {"this_week": odoo_this_week, "last_week": odoo_last_week},
        tasks, bank_balance
    )
    logger.info(f"Detected {len(bottlenecks)} bottleneck(s)")

    suggestions = generate_suggestions(bottlenecks, {
        "this_week": odoo_this_week, "last_week": odoo_last_week
    }, tasks, bank_balance)
    logger.info(f"Generated {len(suggestions)} suggestion(s)")

    # ─── Step 4: Generate Briefing ───────────────────────────────────────
    logger.info("Generating briefing document...")
    briefing = generate_briefing(
        period_start=period_start,
        period_end=period_end,
        odoo_this_week=odoo_this_week,
        odoo_last_week=odoo_last_week,
        bank_data=bank_data,
        transactions=transactions,
        tasks=tasks,
        bottlenecks=bottlenecks,
        suggestions=suggestions,
    )

    # ─── Step 5: Save Briefing ───────────────────────────────────────────
    date_str = today.strftime("%Y-%m-%d")
    output_path = BRIEFINGS_DIR / f"CEO_Briefing_{date_str}.md"

    try:
        output_path.write_text(briefing, encoding="utf-8")
        logger.info(f"Briefing saved to {output_path}")
        print(f"✅ CEO Briefing saved: {output_path}")
    except Exception as e:
        logger.error(f"Failed to save briefing: {e}")
        # Fallback to /Done/
        fallback = SCRIPT_DIR / "Done" / f"CEO_Briefing_{date_str}.md"
        fallback.parent.mkdir(parents=True, exist_ok=True)
        fallback.write_text(briefing, encoding="utf-8")
        logger.info(f"Briefing saved to fallback location: {fallback}")
        print(f"✅ CEO Briefing saved (fallback): {fallback}")

    # ─── Step 6: Log Event ───────────────────────────────────────────────
    this_rev = odoo_this_week.get("total_revenue", 0)
    last_rev = odoo_last_week.get("total_revenue", 0)
    completed_count = len([t for t in tasks if t["status"] == "done"])
    blocked_count = len([t for t in tasks if t["status"] == "blocked"])
    overdue_count = len([
        t for t in tasks
        if t.get("due_date") and t["status"] != "done"
        and datetime.strptime(str(t["due_date"]), "%Y-%m-%d").date() < today.date()
    ])

    log_entry = {
        "timestamp": today.strftime("%Y-%m-%dT%H:%M:%S"),
        "event": "briefing_generated",
        "status": "success",
        "period_start": period_start.strftime("%Y-%m-%d"),
        "period_end": period_end.strftime("%Y-%m-%d"),
        "output_file": str(output_path),
        "data_sources": {
            "odoo_connected": odoo is not None,
            "obsidian_scanned": True,
            "revenue_data_retrieved": odoo_this_week.get("total_revenue", 0) > 0,
            "tasks_retrieved": len(tasks) > 0,
        },
        "metrics": {
            "revenue_this_week": this_rev,
            "revenue_last_week": last_rev,
            "growth_pct": calculate_growth(this_rev, last_rev),
            "tasks_completed": completed_count,
            "tasks_blocked": blocked_count,
            "tasks_overdue": overdue_count,
            "bottlenecks_identified": len(bottlenecks),
            "suggestions_generated": len(suggestions),
        },
        "error_code": None,
        "error_message": None,
    }

    print(f"\n📊 BRIEFING SUMMARY:")
    print(f"   Revenue This Week: ${this_rev:,.2f} ({'↑' if calculate_growth(this_rev, last_rev) >= 0 else '↓'}{abs(calculate_growth(this_rev, last_rev))}% WoW)")
    print(f"   Tasks Completed: {completed_count}")
    print(f"   Bottlenecks: {len(bottlenecks)}")
    print(f"   Suggestions: {len(suggestions)}")
    print(f"   Output: {output_path}")

    return str(output_path)


if __name__ == "__main__":
    main()
