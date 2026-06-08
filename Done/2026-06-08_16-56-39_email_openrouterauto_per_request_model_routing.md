---
type: email
from: OpenRouter Team <welcome@openrouter.ai>
subject: openrouter/auto: per-request model routing
received: 2026-06-08T16:56:39.109Z
priority: medium
status: pending
email_id: 19ea78bf7a71e945
thread_id: 19ea78bf7a71e945
---

# 📧 Email: openrouter/auto: per-request model routing

## Email Details

| Field | Value |
|-------|-------|
| **From** | OpenRouter Team <welcome@openrouter.ai> |
| **Received** | 2026-06-08T16:56:39.109Z |
| **Priority** | MEDIUM |
| **Status** | Pending |

---

## Email Content

One model name. The router picks per request based on task complexity. No routing fee.  

OpenRouter
OpenRouter ( https://openrouter.ai/?utm_campaign=Onboarding+Flow+-+v4+April+2026&utm_content=A3+Auto+Router&utm_medium=email_action&utm_source=customer.io )

 

Hi Code,

Picking the right model for every request is a job. openrouter/auto is the model name you use when you want OpenRouter to do that job for you. Pass it as the model on any request. The router classifies the request, picks a model from the auto pool based on task complexity, and runs it. You pay the standard rate for whichever model serves the response. There is no routing fee.

See the auto pool ( https://openrouter.ai/models/openrouter/auto?utm_source=email&utm_medium=lifecycle&utm_campaign=onboarding_v2&utm_content=a2_auto_routing&utm_campaign=Onboarding+Flow+-+v4+April+2026&utm_content=A3+Auto+Router&utm_medium=email_action&utm_source=customer.io )

 

response = client.chat.completions.create
(   model="openrouter/auto",
  messages=[{"role": "user", "content": "Summarize this document"}], )


print(response.model)  # which model actually served the request

 

A few things worth knowing:

A simple classification does not need a frontier model. A nuanced analysis does not belong on a small one. The router handles the call without you writing any branching logic.

Roughly 63 percent of auto traffic routes to models priced under $1 per million tokens. That is how simple prompts stop hitting expensive models without any routing code on your side, and it is the reason most teams see lower per-request cost on auto than on a single pinned frontier model.

You can still pass route="fallback" alongside auto if you want a named backstop on top of automatic selection. If the auto pick fails, the fallback list runs in order until one returns a response.

The auto pool changes as new models launch. You do not have to update your code when it does. Read response.model in the res

---

*Processed by vault-control server on 2026-06-08T16:56:39.109Z*
