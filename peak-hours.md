---
title: DeepSeek peak / off-peak rules
applies_to: DEEPSEEK_API_KEY (all Python + vault-control callers)
data_file: deepseek_calendar.json
code: [deepseek_peak.py, vault-control/server/services/deepseekPeak.js]
---

# DeepSeek peak / off-peak rules (STRICT)

DeepSeek charges **2x during peak**. Every DeepSeek call in this repo goes
through `deepseek_peak.py` (Python) or `deepseekPeak.js` (vault-control) before
it is made. No caller may call the DeepSeek API directly without this check.

## Rule 1 — Daily windows (Monday–Friday, Chinese working day)

| Beijing (UTC+8) | Pakistan (UTC+5) | Rate |
|---|---|---|
| 00:00–09:00 | 21:00–06:00 | Off-peak |
| 09:00–12:00 | 06:00–09:00 | **Peak (2x)** |
| 12:00–14:00 | 09:00–11:00 | Off-peak |
| 14:00–18:00 | 11:00–15:00 | **Peak (2x)** |
| 18:00–24:00 | 15:00–21:00 | Off-peak |

The code always evaluates in `Asia/Shanghai`, so server timezone (UTC on the
Oracle VM) does not matter. Windows are start-inclusive, end-exclusive
(e.g. 15:00:00 PKT is already off-peak).

## Rule 2 — Saturday and Sunday are off-peak all day

## Rule 3 — Chinese public holidays are off-peak all day

| Date | Day | Beijing status | DeepSeek rate |
|---|---|---|---|
| 25–27 Sep 2026 | Fri–Sun | Mid-Autumn Festival holiday | Full day off-peak |
| 28–30 Sep 2026 | Mon–Wed | Normal working days | Normal peak windows |
| 1–7 Oct 2026 | Thu–Wed | National Day Golden Week | Full day off-peak |
| 8–9 Oct 2026 | Thu–Fri | Normal working days | Normal peak windows |
| 10 Oct 2026 | Sat | Make-up workday in China | Off-peak (weekend rule wins) |

To add future holidays, edit `deepseek_calendar.json` (`holidays_off_peak`,
`makeup_workdays_off_peak`) — no code change needed. Both Python and JS read it.

## Rule 4 — What happens during peak

Set with `DEEPSEEK_PEAK_POLICY` in `.env`:

| Policy | Behaviour in peak |
|---|---|
| `last_resort` (default) | DeepSeek skipped; Groq / Gemini / OpenRouter etc. are tried first. DeepSeek is used only if **all** of them fail, so nothing breaks. |
| `block` | DeepSeek is never called in peak. If every other provider fails the call fails. |
| `allow` | Rule disabled (not recommended). |

Off-peak, DeepSeek is always the **first** provider.

## Rule 5 — Cost controls

- Model: `DEEPSEEK_MODEL=deepseek-flash` (cheapest V4 model).
- `DEEPSEEK_THINKING=disabled`: reasoning mode uses 2–3x output tokens and
  can return an empty answer when `max_tokens` is small. Turn it on only for a
  task that genuinely needs reasoning.
- Batch / scheduled jobs (daily posts, content generation) should be scheduled
  in off-peak windows, e.g. 15:00–21:00 or 21:00–06:00 PKT.

## Rule 6 — Key safety

- `DEEPSEEK_API_KEY` lives only in `.env` (git-ignored) locally and on the VM.
- Never log, print, commit or send the key, not even a prefix.
- The Admin panel shows only the last 4 characters.

## Images

The DeepSeek API is text-only (no image output). For images DeepSeek writes the
overlay content (headline, bullets, stats, CTA) that `imageGenerator.js` renders
into the branded template. The pixels still come from the template / Gemini / Pollinations.

## Check current status

```bash
python3 deepseek_peak.py
# peak=False policy=last_resort deepseek_mode=primary
```
