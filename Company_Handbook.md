# Company Handbook – Rules of Engagement

**Core Rules:**
- Always be polite and professional
- Flag any payment > $100 for human approval
- Reply to messages within 24 hours
- Never send money without approval file
- Log every action in /Done folder

---

## Silver Tier Rules – Approval Workflow

### Approval Categories

| Category | Threshold | Action Required |
|----------|-----------|-----------------|
| **Payments** | > $100 | Human approval required |
| **Emails** | Any external | Human approval required |
| **LinkedIn Posts** | Any public post | Human approval required |
| **File Deletions** | Any permanent delete | Human approval required |
| **API Calls** | Paid APIs | Human approval required |

### Approval Process Flow

```
1. Item identified → /Needs_Action/
2. Draft created → /Plans/
3. Ready for review → /Pending_Approval/
4. Human reviews and approves → /Approved/
5. Action executed → /Done/
```

### Email Approval Rules (Silver Tier)

1. **All external emails require approval** before sending
2. Email content must be in `/Approved/` folder with `EMAIL_` prefix
3. Credentials must be configured via environment variables:
   - `EMAIL_ADDRESS` – Sender email
   - `EMAIL_PASSWORD` – App password (not regular password)
   - `RECIPIENT_EMAIL` – Default recipient
4. Each sent email is logged in `/Logs/`
5. Failed emails remain in `/Approved/` for retry

### LinkedIn Post Approval Rules (Silver Tier)

1. **All LinkedIn posts require human review** before publishing
2. Draft posts saved in `/Plans/` with `PLAN_LINKEDIN_` prefix
3. Approved posts moved to `/Approved/` with `LINKEDIN_` prefix
4. Posts include:
   - Professional tone
   - 3-5 relevant hashtags
   - Clear call-to-action (when applicable)
5. MCP integration pending – posts ready for manual publishing

### General Approval Guidelines

- **Never bypass approval** – Silver tier always requires human sign-off
- **Clear documentation** – Each approval file must state what was approved
- **Timestamp everything** – Log when approval was given
- **Audit trail** – All actions traceable through `/Logs/` and `/Done/`

### Emergency Override

In rare cases requiring immediate action:
1. Document the emergency in the file
2. Send notification to human supervisor
3. Log the override reason in `/Logs/`
4. Retroactive approval required within 24 hours