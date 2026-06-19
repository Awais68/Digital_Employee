# LEAA-5: QA Report — Enriched Lead Database Validation

**Date:** 2026-06-13
**Source reviewed:** LEAA-4 enriched-leads (35 B2B SaaS companies)
**QA Agent:** 2967e276

---

## Summary

| Check | Result |
|-------|--------|
| **Duplicate entries** | ✅ None found — all 35 company names are unique |
| **Invalid email formats** | ⚠️ 3 rows flagged |
| **Invalid phone formats** | ✅ All phone numbers valid |
| **Missing contact (no email & no contactable decision-maker)** | ⚠️ 12 rows flagged |
| **Total rows with issues** | **15 of 35** (42.9%) |

---

## Issue Details

### A. Invalid Email Formats (3 rows)

These rows list email **format descriptions** (e.g. "Format: firstname@domain.com") rather than an actual contactable email address. These are not valid for outreach.

| Row | Company | Field Value | Issue |
|-----|---------|-------------|-------|
| **6** | Zenskar | `Format: firstname@zenskar.com` | Invalid email format — pattern description, not an actual email |
| **14** | Nash | `Format: First@usenash.com` | Invalid email format — pattern description, not an actual email |
| **17** | Churnkey | `Format: first@churnkey.co` | Invalid email format — pattern description, not an actual email |

### B. Missing Business Email (all remaining rows without an email)

The following rows have **no business email** and rely solely on a named decision-maker for contact. Flagged for awareness — outreach may require LinkedIn messaging or further enrichment.

| Row | Company | Notes |
|-----|---------|-------|
| **2** | Fazeshift | CEO via LinkedIn only |
| **4** | Sandstone | CEO named, no email, no LinkedIn link |
| **5** | Jedify | CEO via LinkedIn only |
| **9** | Scotch | CEO named, no email |
| **11** | LightTable | CEO named, no email |
| **13** | Blacksmith | CEO via LinkedIn only |
| **16** | HIREXE | CEO named, no email |
| **20** | Builder.io | CEO named, no email |
| **21-35** | See section C below | |

### C. Missing Critical Fields (12 rows — no email AND no decision-maker)

These rows are missing **at least one contact** (no business email and no decision-maker identified). They fail the critical fields requirement.

| Row | Company | Website | Business Email | Decision-Maker | Flags |
|-----|---------|---------|----------------|----------------|-------|
| **21** | Nova Credit | novacredit.com | Not found | Not found | Missing email & decision-maker |
| **22** | Topsort | topsort.com | Not found | Not found | Missing email & decision-maker |
| **23** | Profit Isle | profitisle.com | Not found | Not found | Missing email & decision-maker |
| **24** | NumeralHQ | numeralhq.com | Not found | Not found | Missing email & decision-maker |
| **25** | DualEntry | dualentry.com | Not found | Not found | Missing email & decision-maker |
| **26** | MonkSpaces.Ai | monkspaces.ai | Not found | Not found | Missing email & decision-maker |
| **27** | Pantheon Platform | pantheon.io | Not found | Not found | Missing email & decision-maker |
| **28** | Cara (Oyster Tech) | getcara.ai | Not found | Not found | Missing email & decision-maker |
| **30** | Instantly | instantly.ai | Not found | Not found | Missing email & decision-maker |
| **32** | Maxio | maxio.com | Not found | Not found | Missing email & decision-maker |
| **33** | Hearth | hearth.ai | Not found | Not found | Missing email & decision-maker |
| **34** | nGrow | ngrow.ai | Not found | Not found | Missing email & decision-maker |

### D. Partial Contact — Decision-Maker Named but No Contact Info (3 rows)

These rows have a named CEO/decision-maker but no email, phone, or LinkedIn link to facilitate direct outreach.

| Row | Company | Decision-Maker | Issue |
|-----|---------|----------------|-------|
| **4** | Sandstone | Nicholas (Nick) Fleisher — Co-Founder & CEO | No email, no LinkedIn, no phone |
| **9** | Scotch | Jake Bolling — Founder & CEO | No email, no LinkedIn, no phone |
| **29** | Mecka AI | Josh Gao — Co-Founder & CEO | No email, no LinkedIn, no phone |
| **31** | Poetic | Markie Wagner — CEO | No email, no LinkedIn, no phone |
| **35** | Geordie AI | Henry Comfort — Co-Founder & CEO | No email, no LinkedIn, no phone |

---

## Detailed Row-by-Row Report

| # | Company | Has Website? | Has Email? | Has Phone? | Has Decision-Maker? | Issues |
|---|---------|:-----------:|:----------:|:----------:|:-------------------:|--------|
| 1 | Capchase | ✅ | ✅ | ✅ | ✅ (with email) | — |
| 2 | Fazeshift | ✅ | ❌ | ❌ | ✅ (LinkedIn) | Missing email, missing phone |
| 3 | Monk | ✅ | ✅ | ✅ | ✅ (named) | — |
| 4 | Sandstone | ✅ | ❌ | ❌ | ✅ (named, no contact) | Missing email, missing phone, decision-maker lacks contact info |
| 5 | Jedify | ✅ | ❌ | ❌ | ✅ (LinkedIn) | Missing email, missing phone |
| 6 | Zenskar | ✅ | ⚠️ format only | ❌ | ✅ (LinkedIn) | **Invalid email format**, missing phone |
| 7 | Clarify | ✅ | ✅ | ❌ | ✅ (LinkedIn) | Missing phone |
| 8 | Lightfield | ✅ | ✅ | ❌ | ✅ (named) | Missing phone |
| 9 | Scotch | ✅ | ❌ | ❌ | ✅ (named, no contact) | Missing email, missing phone, decision-maker lacks contact info |
| 10 | Turnout | ✅ | ✅ | ❌ | ✅ (with email) | Missing phone |
| 11 | LightTable | ✅ | ❌ | ❌ | ✅ (named) | Missing email, missing phone |
| 12 | FirmPilot | ✅ | ✅ | ✅ | ✅ (named) | — |
| 13 | Blacksmith | ✅ | ❌ | ❌ | ✅ (LinkedIn) | Missing email, missing phone |
| 14 | Nash | ✅ | ⚠️ format only | ❌ | ✅ (LinkedIn) | **Invalid email format**, missing phone |
| 15 | Thoughtful AI | ✅ | ✅ | ❌ | ✅ (named) | Missing phone |
| 16 | HIREXE | ✅ | ❌ | ❌ | ✅ (named) | Missing email, missing phone |
| 17 | Churnkey | ✅ | ⚠️ format only | ❌ | ✅ (named) | **Invalid email format**, missing phone |
| 18 | Mintlify | ✅ | ✅ | ❌ | ✅ (LinkedIn) | Missing phone |
| 19 | Svix | ✅ | ✅ | ❌ | ✅ (LinkedIn) | Missing phone |
| 20 | Builder.io | ✅ | ❌ | ❌ | ✅ (named) | Missing email, missing phone |
| 21 | Nova Credit | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 22 | Topsort | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 23 | Profit Isle | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 24 | NumeralHQ | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 25 | DualEntry | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 26 | MonkSpaces.Ai | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 27 | Pantheon Platform | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 28 | Cara (Oyster Tech) | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 29 | Mecka AI | ✅ | ❌ | ❌ | ✅ (named, no contact) | Missing email, missing phone, decision-maker lacks contact info |
| 30 | Instantly | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 31 | Poetic | ✅ | ❌ | ❌ | ✅ (named, no contact) | Missing email, missing phone, decision-maker lacks contact info |
| 32 | Maxio | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 33 | Hearth | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 34 | nGrow | ✅ | ❌ | ❌ | ❌ | **Missing contact (no email, no decision-maker)** |
| 35 | Geordie AI | ✅ | ❌ | ❌ | ✅ (named, no contact) | Missing email, missing phone, decision-maker lacks contact info |

---

## Recommendations

1. **Rows 6, 14, 17** — Replace the `Format:` pattern descriptions with actual email lookups via Apollo, Lusha, or ZoomInfo enrichment.
2. **Rows 21-28, 30, 32-34** — These Tier 3 entries have no contact path at all. Recommend dropping or re-enriching through a paid data provider before outreach.
3. **Rows 4, 9, 29, 31, 35** — Decision-maker named but no contact info. Prioritize LinkedIn outreach or email finding.
4. **General** — Phone numbers are missing for most entries (only 3 companies have phones). This is acceptable for SaaS outreach where email/LinkedIn are primary channels, but note for the record.
