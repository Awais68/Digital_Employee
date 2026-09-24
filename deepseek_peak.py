"""
deepseek_peak.py
DeepSeek peak / off-peak rule (see peak-hours.md, data in deepseek_calendar.json).

Peak (2x price): Mon-Fri 09:00-12:00 and 14:00-18:00 Beijing time.
Everything else is off-peak: nights, lunch, Sat/Sun, Chinese holidays.

DEEPSEEK_PEAK_POLICY decides what callers do during peak:
  last_resort (default)  DeepSeek is tried only after every other provider fails
  block                  DeepSeek is never called during peak
  allow                  ignore the rule
"""
import json
import os
from datetime import datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

_CAL_PATH = Path(__file__).resolve().parent / "deepseek_calendar.json"
_DEFAULT = {
    "timezone": "Asia/Shanghai",
    "peak_windows": [["09:00", "12:00"], ["14:00", "18:00"]],
    "peak_weekdays": [0, 1, 2, 3, 4],
    "holidays_off_peak": {},
    "makeup_workdays_off_peak": {},
}


def _calendar() -> dict:
    try:
        return {**_DEFAULT, **json.loads(_CAL_PATH.read_text())}
    except (OSError, ValueError):
        return _DEFAULT


def is_peak(now: datetime | None = None) -> bool:
    cal = _calendar()
    tz = ZoneInfo(cal["timezone"])
    now = (now or datetime.now(tz)).astimezone(tz)
    day = now.date().isoformat()
    if day in cal["holidays_off_peak"] or day in cal["makeup_workdays_off_peak"]:
        return False
    if now.weekday() not in cal["peak_weekdays"]:
        return False
    t = now.time()
    return any(time.fromisoformat(a) <= t < time.fromisoformat(b) for a, b in cal["peak_windows"])


def peak_policy() -> str:
    p = os.getenv("DEEPSEEK_PEAK_POLICY", "last_resort").strip().lower()
    return p if p in ("last_resort", "block", "allow") else "last_resort"


def deepseek_mode(now: datetime | None = None) -> str:
    """'primary' off-peak, else the policy: 'last_resort' | 'block' | 'primary' (allow)."""
    if not is_peak(now):
        return "primary"
    p = peak_policy()
    return "primary" if p == "allow" else p


if __name__ == "__main__":
    print(f"peak={is_peak()} policy={peak_policy()} deepseek_mode={deepseek_mode()}")
