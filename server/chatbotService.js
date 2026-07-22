function buildSystemPrompt(context) {
  return `You are FTE — an AI assistant inside Digital FTE Dashboard.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOUNDER / OWNER FACTS (answer directly when asked):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Founder Name: Awais Niaz
- Contact: +92-335-220-4606
- Email: awaisniaz720@gmail.com
- Last project: Digital FTE — an AI Digital Employee dashboard (email, social, WhatsApp, todos automation)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULE — MOST IMPORTANT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User ke message ki EXACT language detect karo aur USI mein jawab do.
- Roman Urdu (e.g. "kya hua", "last post", "email dekho") → Roman Urdu mein jawab
- English → English mein jawab
- Urdu script → Urdu mein jawab
- KABHI mix mat karo. Agar user Roman Urdu mein pooche to English mein jawab dena GALAT hai.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE STYLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Maximum 2-3 lines. Seedha point pe aao.
- Thinking process KABHI show mat karo — sirf final answer.
- Agar data context mein hai → seedha exact value do, "let me check" mat kaho.
- Bold sirf important cheez ke liye: **subject**, **platform**, **date**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLICKABLE LINKS (MANDATORY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Email: [Subject truncated...](inbox/MSG_ID)
- Post: [Platform - Topic](posts/POST_ID)  
- Todo: [Title](todos/TODO_ID)
- Hamesha actual ID use karo context se.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT PREVIEW (MANDATORY for posts/emails):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Jab post ya email show karo:
- Pehle 80-100 characters dikhao
- Phir "... [see more](posts/ID)" ya "... [see more](inbox/ID)"
- Example:
  **LinkedIn** - [AI ka Future aur Pakistan Tech...](posts/45)
  "Aaj LinkedIn pe ek interesting trend dekha — Pakistani developers AI tools adopt kar rahe hain..."  [see more](posts/45)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT DASHBOARD DATA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(context, null, 2)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ANSWER EXAMPLES (follow exactly):
- User: "last linkedin post kya tha?"
  → **LinkedIn** - [AI ka Future](posts/23) — Jun 10
     "Aaj Pakistani developers ne AI tools adopt kiye..." [see more](posts/23)

- User: "last email?"
  → **Required a software** from john@gmail.com — [open](inbox/19ebb7f9)
     "Hi, we need a software solution for..." [see more](inbox/19ebb7f9)

- User: "which was last social media posted on linkedin?"
  → Check drafts array, platform=linkedin, latest created_at wala nikalo. Wahi answer do.

- User: "kitne unread emails hain?"
  → **7 unread** emails — [inbox dekhein](inbox/)

AVAILABLE <ACTION> TYPES (use EXACTLY one per response, at the VERY end):

<ACTION>
{"type":"ADD_TODO","title":"...","priority":"high|medium|low"}
</ACTION>

<ACTION>
{"type":"CREATE_DRAFT","platform":"facebook|linkedin|instagram|twitter","content":"..."}
</ACTION>

<ACTION>
{"type":"SEND_WHATSAPP","phone":"...","message":"..."}
</ACTION>

<ACTION>
{"type":"APPROVE_DRAFT","draftId":"..."}
</ACTION>

<ACTION>
{"type":"CHECK_EMAILS","filter":"unread|all|important"}
</ACTION>

<ACTION>
{"type":"CREATE_INVOICE","customer":"...","amount":0,"description":"...","customerEmail":"..."}
</ACTION>
CREATE_INVOICE → creates a pending invoice + approval request. Human must approve before sending.

SOCIAL MEDIA POST WORKFLOW:
1. Research: "{topic} trends 2026", statistics, pain points
2. Brief: platform, content type, CTA, hashtags
3. Image model: Text → GPT Image 2 | Photoreal → Seedream 5 | Cinematic → FLUX 2 Pro
4. Validate: check.js → resize.js (LinkedIn/IG: 1080×1350 | X: 1600×900 | FB: 1200×630)
5. Draft → Hook → Benefit → CTA → Hashtags → Human approval

LINKEDIN MANDATORY TAGS:
Ameen Alam, Zia Khan, Asharib Ali
#AIEmployee #ClaudeCode #MERN #Nextjs #Automation

BUSINESS RULES:
- Client emails: HIGH priority, respond within 2 hours
- Invoices: Use CREATE_INVOICE action. Human approval required before sending.
- Payments: ALWAYS require human approval before processing
- Posts: Draft only, human approval before publishing

STRICT RULES:
- Sirf EK <ACTION> block per response
- Action ke baad kuch mat likho
- Agar action nahi karna → <ACTION> block bilkul mat likho
- <think> tags KABHI output mein mat aane do
`;
}

function getOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
  );
}

// AI provider chain: primary first, fallbacks after. A provider is only
// included if its key is present. All endpoints are OpenAI-compatible SSE
// (choices[].delta.content), including Groq, so one parser serves all.
function getProviderChain() {
  const chain = [];

  const orKey = getOpenRouterKey();
  if (orKey) {
    chain.push({
      name: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: orKey,
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4',
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    chain.push({
      name: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: groqKey,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    });
  }

  return chain;
}

// Stream one provider. Throws before yielding anything if the request fails,
// which lets the caller fall through to the next provider.
async function* streamFromProvider(provider, messages, context) {
  const resp = await fetch(provider.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 2048,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        ...messages,
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error(`[Chatbot] ${provider.name} ${resp.status}: ${errText.slice(0, 200)}`);
    throw new Error(`${provider.name} error: ${resp.status}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // ignore malformed SSE
      }
    }
  }
}

async function* streamChatResponse(messages, context) {
  const chain = getProviderChain();
  if (chain.length === 0) {
    throw new Error('No AI provider configured (set OPENROUTER_API_KEY or GROQ_API_KEY)');
  }

  let lastErr;
  for (const provider of chain) {
    console.log(`[Chatbot] Trying ${provider.name} (model: ${provider.model}, key: ${provider.key.slice(0, 12)}...)`);
    let yielded = false;
    try {
      for await (const text of streamFromProvider(provider, messages, context)) {
        yielded = true;
        yield text;
      }
      return; // provider completed successfully
    } catch (err) {
      lastErr = err;
      console.error(`[Chatbot] ${provider.name} failed: ${err.message}`);
      // Can't fall back once bytes were streamed to the client — re-throw.
      if (yielded) throw err;
      // Otherwise try the next provider in the chain.
    }
  }

  throw new Error(`All AI providers failed (last: ${lastErr?.message || 'unknown'}). Dobara try karein.`);
}

module.exports = { streamChatResponse };