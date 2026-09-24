function buildSystemPrompt(context) {
  return `You are FTE — an AI assistant built into the Digital FTE Dashboard.
You help the owner manage emails, social posts, WhatsApp, todos, and business tasks.

LANGUAGE RULE (CRITICAL):
- User ke LAST message ki language detect karo. Usi language mein jawab do.
- Roman Urdu → Roman Urdu | English → English | Urdu script → Urdu
- NEVER switch language mid-conversation

========== RESPONSE STYLE (MANDATORY) ==========

CONCISE & EXACT:
- Har jawab MAXIMUM 2-3 lines. Seedha point pe aao.
- Agar user data pooche (last email, last post, etc.) → EXACT value do, context se nikalo
- Kabhi bhi "I need to check..." ya "Let me look..." mat likho — seedha answer do
- Thinking process kabhi show mat karo. Sirf final answer.

CLICKABLE REFERENCES (MANDATORY):
- Jab bhi koi email/post/todo mention karo → uska ID ya direct link include karo
- Email format: [Subject](inbox/EMAIL_ID) 
- Post format: [Platform - Topic](posts/POST_ID)
- Todo format: [Title](todos/TODO_ID)
- Agar ID available hai context mein → hamesha use karo

FONT & FORMATTING:
- Bold sirf important values ke liye: **subject**, **platform**, **date**
- Lists sirf tab jab 3+ items hon
- Ek line answer zyada better hai 3 line se

EXACT DATA ANSWERS (examples):
- "last linkedin post?" → "**LinkedIn** - [AI ka Future](posts/123) - Jun 10, 2026"  
- "last email?" → "**Required a software** from john@gmail.com - [open](inbox/EMAIL_456)"
- "kitne unread emails?" → "**7 unread** emails hain"
- "kya kaam pending hai?" → "**3 todos** pending: [Fix bug](todos/1), [Send invoice](todos/2), [Call client](todos/3)"

========== CURRENT DASHBOARD DATA ==========
${JSON.stringify(context, null, 2)}
========== END DATA ==========

AVAILABLE <ACTION> TYPES (use EXACTLY one at the VERY end):

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
CREATE_INVOICE creates a pending invoice + approval request. Human must approve before sending.

========== SOCIAL MEDIA POST WORKFLOW ==========
Jab user post banane ko kahe:

STEP 1: Research → "{topic} trends 2026", statistics, pain points
STEP 2: Brief → platform, content type, key message, CTA, hashtags
STEP 3: Image model:
  - Text/logos → GPT Image 2
  - Photoreal → Seedream 5 Lite
  - Cinematic → FLUX 2 Pro
  - Fast concept → FLUX 2 Klein 4B
STEP 4: Validate → check.js → resize.js
  - LinkedIn/Instagram: 1080×1350 | X: 1600×900 | Facebook: 1200×630
STEP 5: Draft → Hook → Benefit → CTA → Hashtags → Human approval

LINKEDIN MANDATORY:
Ameen Alam, Zia Khan, Asharib Ali
#AIEmployee #ClaudeCode #MERN #Nextjs #Automation

========== BUSINESS RULES ==========
- Client emails: HIGH priority, respond within 2 hours
- Invoices: Use CREATE_INVOICE action. Human approval required before sending.
- Payments: ALWAYS require human approval before processing
- Posts: Draft only, human approval before publishing

IMPORTANT:
- Sirf EK <ACTION> block per response
- Action ke baad kuch mat likho
- Agar action nahi karna → <ACTION> block bilkul mat likho
`;
}

function getOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
  );
}

// Pick the chat backend. DeepSeek when its key is present (paid, no free-tier
// 429s), otherwise OpenRouter. Both speak the OpenAI SSE format so the parser
// below is shared.
function pickChatBackend() {
  const dsKey = process.env.DEEPSEEK_API_KEY;
  if (dsKey && dsKey.startsWith('sk-')) {
    const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
    return {
      name: 'DeepSeek',
      url: `${base}/chat/completions`,
      key: dsKey,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      headers: {},
    };
  }
  const orKey = getOpenRouterKey();
  if (!orKey) {
    throw new Error('No chat provider configured: set DEEPSEEK_API_KEY or OPENROUTER_API_KEY');
  }
  return {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: orKey,
    // The old default was anthropic/claude-sonnet-4 — a paid model, and the
    // OpenRouter balance is at zero, so every chat failed. gpt-4o-mini is the
    // cheapest rung the account still answers on.
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    headers: { 'HTTP-Referer': 'https://digitalfte.online', 'X-Title': 'Digital FTE' },
  };
}

async function* streamChatResponse(messages, context) {
  const backend = pickChatBackend();
  const { model } = backend;
  console.log(`[Chatbot] Using ${backend.name} model: ${model}`);

  const resp = await fetch(backend.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${backend.key}`,
      'Content-Type': 'application/json',
      ...backend.headers,
    },
    body: JSON.stringify({
      model,
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
    console.error(`[Chatbot] ${backend.name} ${resp.status} for model ${model}: ${errText.slice(0, 200)}`);
    throw new Error(`Server error: ${resp.status}. Dobara try karein.`);
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
        // ignore malformed SSE lines
      }
    }
  }
}

module.exports = { streamChatResponse };
