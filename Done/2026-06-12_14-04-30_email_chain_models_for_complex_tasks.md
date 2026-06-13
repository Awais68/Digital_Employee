---
type: email
from: OpenRouter Team <welcome@openrouter.ai>
subject: Chain models for complex tasks
received: 2026-06-12T14:04:30.505Z
priority: normal
status: pending
email_id: 19ebc25e90a5fdab
thread_id: 19ebc25e90a5fdab
---

# 📧 Email: Chain models for complex tasks

## Email Details

| Field | Value |
|-------|-------|
| **From** | OpenRouter Team <welcome@openrouter.ai> |
| **Received** | 2026-06-12T14:04:30.505Z |
| **Priority** | NORMAL |
| **Status** | Pending |

---

## Email Content

Use a fast model for classification, a strong model for generation. One endpoint handles both.  

OpenRouter
OpenRouter ( https://openrouter.ai/?utm_campaign=Onboarding+Flow+-+v4+April+2026&utm_content=A7+Model+Chaining&utm_medium=email_action&utm_source=customer.io )

 

Hi Code,

Use a fast model for classification, a strong model for generation. Same endpoint, same auth, different model parameter. That is the point of having 300+ models on one API: you mix them per step instead of committing to one for the whole workload.

Browse models ( https://openrouter.ai/models?utm_source=email&utm_medium=lifecycle&utm_campaign=onboarding_v2&utm_content=a11_multi_model&utm_campaign=Onboarding+Flow+-+v4+April+2026&utm_content=A7+Model+Chaining&utm_medium=email_action&utm_source=customer.io )

 

PATTERN 1: CLASSIFY, THEN GENERATE

# Step 1: classify with a fast, cheap model
classify = client.chat.completions.create
(   model="openai/gpt-4o-mini",
  messages=[{"role": "user", "content": f"Classify: {query}"}], )


# Step 2: generate with a strong model
result = client.chat.completions.create
(   model="anthropic/claude-sonnet-4.6",
  messages=[{"role": "user", "content": f"{classify.choices[0].message.content}: {query}"}], )


GPT-4o-mini runs around $0.15 per million input tokens. Claude Sonnet 4.6 runs around $3 per million. Using the cheap model for routing and the expensive one only where it earns its cost can cut total spend 5 to 10x on mixed workloads.

 

PATTERN 2: EXTRACT, THEN WRITE

# Step 1: structured extraction
extracted = client.chat.completions.create
(   model="openai/gpt-4o-mini",
  response_format={"type": "json_object"},
  messages=[{"role": "user", "content": f"Extract fields as JSON: {doc}"}], )


# Step 2: long-form writing from the structured fields
draft = client.chat.completions.create
(   model="anthropic/claude-sonnet-4.6",
  messages=[{"role": "user", "content": f"Write a report from: {extracted.choices

---

*Processed by vault-control server on 2026-06-12T14:04:30.505Z*
