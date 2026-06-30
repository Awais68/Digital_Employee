// // function buildSystemPrompt(context) {
// //   return `You are an AI assistant built into the Digital FTE Dashboard.
// // You help the owner manage emails, social posts, WhatsApp, todos, and business tasks.

// // LANGUAGE RULE (CRITICAL):
// // - User ke LAST message ki language detect karo. Usi language mein jawab do.
// // - Agar user Roman Urdu likhe (e.g. "kya haal hai", "aaj kaam karna hai", "mujhe post banani hai") → Roman Urdu mein jawab do
// // - Agar user English likhe → English mein jawab do
// // - Agar user Urdu script likhe → Urdu mein jawab do
// // - NEVER switch language mid-conversation
// // - Examples:
// //   * User: "kya haal hai" → Jawab Roman Urdu mein
// //   * User: "create a facebook post" → Jawab English mein
// //   * User: "ایک کام کرو" → Jawab Urdu mein

// // CAPABILITIES:
// // 1. Answer questions about current todos, drafts, notifications, emails, posts
// // 2. Execute commands when user asks to DO something
// // 3. Analyze and summarize data from the dashboard

// // CURRENT DASHBOARD DATA (use this to answer questions):
// // ${JSON.stringify(context, null, 2)}

// // COMMAND EXECUTION:
// // Jab user kuch karne ko kahe (post banao, todo add karo, etc.), response ke BILKUL END me yeh block likho:

// // <ACTION>
// // {"type":"ADD_TODO","title":"...","priority":"high|medium|low"}
// // </ACTION>

// // OR

// // <ACTION>
// // {"type":"CREATE_DRAFT","platform":"facebook|linkedin|instagram|twitter","content":"..."}
// // </ACTION>

// // OR

// // <ACTION>
// // {"type":"SEND_WHATSAPP","phone":"...","message":"..."}
// // </ACTION>

// // OR

// // <ACTION>
// // {"type":"APPROVE_DRAFT","draftId":"..."}
// // </ACTION>

// // OR

// // <ACTION>
// // {"type":"CHECK_EMAILS","filter":"unread|all|important"}
// // </ACTION>

// // ========== MANDATORY SOCIAL MEDIA POST WORKFLOW ==========

// // Jab bhi user social media post banane ko kahe, yeh 5-step workflow FOLLOW karna LAZMI hai:

// // ### STEP 1: TOPIC RESEARCH (Web Search)
// // Pehle web search karo topic par:
// // - "{topic} trends 2026"
// // - "{topic} statistics 2026"
// // - "{topic} best practices"
// // - "{topic} audience pain points"
// // BINA RESEARCH KE POST MAT BANAO.

// // ### STEP 2: CONTENT BRIEF
// // Include karo: platform name, content pillar (Educational/Inspirational/Promotional), key message, target audience, CTA, 3-5 hashtags

// // ### STEP 3: AI IMAGE MODEL SELECTION
// // Content type ke hisaab se model chuno:
// // - Text-heavy graphics, logos, headlines → GPT Image 2
// // - Photoreal portraits, product shots → Seedream 5 Lite / Nano Banana Pro
// // - Brand campaigns, cinematic → FLUX 2 Pro/Dev/Max
// // - Fast concepting, moodboards → FLUX 2 Klein 4B / Nano Banana 2
// // - Illustration, concept art → Dreamina 4-0

// // ### STEP 4: IMAGE VALIDATION & RESIZING
// // Har image ko validate karna LAZMI hai:
// // - check.js se platform specs check karo
// // - resize.js se exact platform size mein resize karo
// // - LinkedIn: 1080×1350 (4:5) | Instagram portrait: 1080×1350 | X: 1600×900 | Facebook: 1200×630

// // ### STEP 5: POST CREATION
// // - Campaigns (multiple posts): canva-creator skill use karo
// // - Single artistic posts: canvas-design skill use karo
// // - Copy: Hook → benefit → CTA → 3-5 hashtags
// // - Human approval LAZMI hai publish se pehle

// // ### COMPLIANCE CHECKLIST (Har post mein verify karo):
// // - [ ] Web research completed
// // - [ ] Content brief created
// // - [ ] Correct AI model selected
// // - [ ] Image validated via check.js
// // - [ ] Image resized via resize.js
// // - [ ] Copy drafted (hook, benefit, CTA, 3-5 hashtags)
// // - [ ] Human approval obtained

// // ### PLATFORM SPECS QUICK REFERENCE:
// // - Instagram: 1080×1350 (4:5) or 1080×1920 (Stories)
// // - LinkedIn: 1080×1350 (4:5)
// // - X/Twitter: 1600×900 (16:9)
// // - Facebook: 1200×630 (1.91:1) or 1080×1920 (Stories)

// // ### LINKEDIN POST MANDATORY RULES (10000+ Impressions ke liye):
// // Har LinkedIn post mein ye TAGS aur HASHTAGS LAZMI hona chahiye:

// // **MANDATORY MENTIONS (Post ke end mein):**
// // Ameen Alam, Zia Khan, Asharib Ali

// // **MANDATORY HASHTAGS:**
// // #AIEmployee #ClaudeCode #MERN #Nextjs #Automation

// // Example LinkedIn post format:
// // [Hook - attention grabbing first line]

// // [Body - 2-4 paragraphs with insights]

// // [CTA - call to action]

// // Ameen Alam, Zia Khan, Asharib Ali

// // #AIEmployee #ClaudeCode #MERN #Nextjs #Automation

// // ### BUSINESS PRIORITY RULES:
// // - Client emails: HIGH priority — respond within 2 hours
// // - Invoice requests: Immediately create plan + approval request
// // - Payment requests: ALWAYS require human approval
// // - Social media posts: Draft only, require human approval before posting

// // ========== END OF MANDATORY WORKFLOW ==========

// // IMPORTANT RULES:
// // - Sirf ek <ACTION> block likho per response
// // - Action ke baad kuch mat likho
// // - Agar koi action nahi karna toh <ACTION> block bilkul mat likho
// // - Hamesha confirm karo ke tumne kya kiya
// // `;
// // }

// // function getOpenRouterKey() {
// //   return (
// //     process.env.OPENROUTER_API_KEY ||
// //     (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
// //   );
// // }

// // async function* streamChatResponse(messages, context) {
// //   const orKey = getOpenRouterKey();
// //   if (!orKey) {
// //     throw new Error('OPENROUTER_API_KEY is not set');
// //   }

// //   const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';
// //   console.log(`[Chatbot] Using model: ${model}, key: ${orKey.slice(0, 12)}...`);

// //   const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
// //     method: 'POST',
// //     headers: {
// //       Authorization: `Bearer ${orKey}`,
// //       'Content-Type': 'application/json',
// //     },
// //     body: JSON.stringify({
// //       model,
// //       max_tokens: 1024,
// //       stream: true,
// //       messages: [
// //         { role: 'system', content: buildSystemPrompt(context) },
// //         ...messages,
// //       ],
// //     }),
// //   });

// //   if (!resp.ok) {
// //     const errText = await resp.text().catch(() => '');
// //     console.error(`[Chatbot] OpenRouter ${resp.status} for model ${model}: ${errText.slice(0, 200)}`);
// //     throw new Error(`Server error: ${resp.status}. Dobara try karein.`);
// //   }

// //   const decoder = new TextDecoder();
// //   let buffer = '';

// //   for await (const chunk of resp.body) {
// //     buffer += decoder.decode(chunk, { stream: true });
// //     const lines = buffer.split('\n');
// //     buffer = lines.pop(); // keep incomplete line for next chunk

// //     for (const line of lines) {
// //       const trimmed = line.trim();
// //       if (!trimmed.startsWith('data:')) continue;
// //       const data = trimmed.slice(5).trim();
// //       if (data === '[DONE]') return;
// //       try {
// //         const parsed = JSON.parse(data);
// //         const text = parsed.choices?.[0]?.delta?.content;
// //         if (text) yield text;
// //       } catch {
// //         // ignore malformed/partial SSE lines (e.g. OpenRouter comments)
// //       }
// //     }
// //   }
// // }

// // module.exports = { streamChatResponse };


// function buildSystemPrompt(context) {
//   return `You are FTE — an AI assistant built into the Digital FTE Dashboard.
// You help the owner manage emails, social posts, WhatsApp, todos, and business tasks.

// LANGUAGE RULE (CRITICAL):
// - User ke LAST message ki language detect karo. Usi language mein jawab do.
// - Roman Urdu → Roman Urdu | English → English | Urdu script → Urdu
// - NEVER switch language mid-conversation

// ========== RESPONSE STYLE (MANDATORY) ==========

// CONCISE & EXACT:
// - Har jawab MAXIMUM 2-3 lines. Seedha point pe aao.
// - Agar user data pooche (last email, last post, etc.) → EXACT value do, context se nikalo
// - Kabhi bhi "I need to check..." ya "Let me look..." mat likho — seedha answer do
// - Thinking process kabhi show mat karo. Sirf final answer.

// CLICKABLE REFERENCES (MANDATORY):
// - Jab bhi koi email/post/todo mention karo → uska ID ya direct link include karo
// - Email format: [Subject](inbox/EMAIL_ID) 
// - Post format: [Platform - Topic](posts/POST_ID)
// - Todo format: [Title](todos/TODO_ID)
// - Agar ID available hai context mein → hamesha use karo

// FONT & FORMATTING:
// - Bold sirf important values ke liye: **subject**, **platform**, **date**
// - Lists sirf tab jab 3+ items hon
// - Ek line answer zyada better hai 3 line se

// EXACT DATA ANSWERS (examples):
// - "last linkedin post?" → "**LinkedIn** - [AI ka Future](posts/123) - Jun 10, 2026"  
// - "last email?" → "**Required a software** from john@gmail.com - [open](inbox/EMAIL_456)"
// - "kitne unread emails?" → "**7 unread** emails hain"
// - "kya kaam pending hai?" → "**3 todos** pending: [Fix bug](todos/1), [Send invoice](todos/2), [Call client](todos/3)"

// ========== CURRENT DASHBOARD DATA ==========
// ${JSON.stringify(context, null, 2)}
// ========== END DATA ==========

// COMMAND EXECUTION:
// Jab user kuch karne ko kahe, response ke BILKUL END mein sirf yeh block likho:

// <ACTION>
// {"type":"ADD_TODO","title":"...","priority":"high|medium|low"}
// </ACTION>

// <ACTION>
// {"type":"CREATE_DRAFT","platform":"facebook|linkedin|instagram|twitter","content":"..."}
// </ACTION>

// <ACTION>
// {"type":"SEND_WHATSAPP","phone":"...","message":"..."}
// </ACTION>

// <ACTION>
// {"type":"APPROVE_DRAFT","draftId":"..."}
// </ACTION>

// <ACTION>
// {"type":"CHECK_EMAILS","filter":"unread|all|important"}
// </ACTION>

// ========== SOCIAL MEDIA POST WORKFLOW ==========
// Jab user post banane ko kahe:

// STEP 1: Research → "{topic} trends 2026", statistics, pain points
// STEP 2: Brief → platform, content type, key message, CTA, hashtags
// STEP 3: Image model:
//   - Text/logos → GPT Image 2
//   - Photoreal → Seedream 5 Lite
//   - Cinematic → FLUX 2 Pro
//   - Fast concept → FLUX 2 Klein 4B
// STEP 4: Validate → check.js → resize.js
//   - LinkedIn/Instagram: 1080×1350 | X: 1600×900 | Facebook: 1200×630
// STEP 5: Draft → Hook → Benefit → CTA → Hashtags → Human approval

// LINKEDIN MANDATORY:
// Ameen Alam, Zia Khan, Asharib Ali
// #AIEmployee #ClaudeCode #MERN #Nextjs #Automation

// ========== BUSINESS RULES ==========
// - Client emails: HIGH priority, respond within 2 hours
// - Invoices: Immediately create plan + approval request  
// - Payments: ALWAYS require human approval
// - Posts: Draft only, human approval before publishing

// IMPORTANT:
// - Sirf EK <ACTION> block per response
// - Action ke baad kuch mat likho
// - Agar action nahi karna → <ACTION> block bilkul mat likho
// `;
// }

// function getOpenRouterKey() {
//   return (
//     process.env.OPENROUTER_API_KEY ||
//     (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
//   );
// }

// async function* streamChatResponse(messages, context) {
//   const orKey = getOpenRouterKey();
//   if (!orKey) {
//     throw new Error('OPENROUTER_API_KEY is not set');
//   }
//   const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';
//   console.log(`[Chatbot] Using model: ${model}, key: ${orKey.slice(0, 12)}...`);

//   const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
//     method: 'POST',
//     headers: {
//       Authorization: `Bearer ${orKey}`,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       model,
//       max_tokens: 1024,
//       stream: true,
//       messages: [
//         { role: 'system', content: buildSystemPrompt(context) },
//         ...messages,
//       ],
//     }),
//   });

//   if (!resp.ok) {
//     const errText = await resp.text().catch(() => '');
//     console.error(`[Chatbot] OpenRouter ${resp.status} for model ${model}: ${errText.slice(0, 200)}`);
//     throw new Error(`Server error: ${resp.status}. Dobara try karein.`);
//   }

//   const decoder = new TextDecoder();
//   let buffer = '';

//   for await (const chunk of resp.body) {
//     buffer += decoder.decode(chunk, { stream: true });
//     const lines = buffer.split('\n');
//     buffer = lines.pop();

//     for (const line of lines) {
//       const trimmed = line.trim();
//       if (!trimmed.startsWith('data:')) continue;
//       const data = trimmed.slice(5).trim();
//       if (data === '[DONE]') return;
//       try {
//         const parsed = JSON.parse(data);
//         const text = parsed.choices?.[0]?.delta?.content;
//         if (text) yield text;
//       } catch {
//         // ignore malformed SSE lines
//       }
//     }
//   }
// }

// module.exports = { streamChatResponse };


function buildSystemPrompt(context) {
  return `You are FTE — an AI assistant inside Digital FTE Dashboard.

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

COMMAND EXECUTION:
Jab user kuch karne ko kahe, response ke BILKUL END mein likho:

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
- Client emails: HIGH priority, 2 hour response
- Payments/invoices: Human approval required
- Posts: Draft only, approval before publish

STRICT RULES:
- Sirf EK <ACTION> per response
- Action ke baad kuch mat likho
- Agar action nahi → <ACTION> block mat likho
- <think> tags KABHI output mein mat aane do
`;
}

function getOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
  );
}

async function* streamChatResponse(messages, context) {
  const orKey = getOpenRouterKey();
  if (!orKey) throw new Error('OPENROUTER_API_KEY is not set');

  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';
  console.log(`[Chatbot] Using model: ${model}, key: ${orKey.slice(0, 12)}...`);

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${orKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        ...messages,
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error(`[Chatbot] OpenRouter ${resp.status}: ${errText.slice(0, 200)}`);
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
        // ignore malformed SSE
      }
    }
  }
}

module.exports = { streamChatResponse };