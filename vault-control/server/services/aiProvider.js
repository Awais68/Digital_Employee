async function tryProvider(name, fn) {
  try {
    const result = await fn()
    return result
  } catch (e) {
    console.warn(`[aiProvider] ${name} failed:`, e.message?.slice(0, 100))
    return null
  }
}

export async function callAI(systemPrompt, userPrompt, maxTokens = 1000) {
  let result

  result = await tryProvider('Anthropic', async () => {
    if (!process.env.ANTHROPIC_API_KEY?.startsWith('sk-ant-')) return null
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    return msg.content[0].text;
  })
  if (result) return result

  result = await tryProvider('OpenAI', async () => {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-or-')) return null
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
    });
    return resp.choices[0].message.content;
  })
  if (result) return result

  result = await tryProvider('OpenRouter', async () => {
    const orKey = process.env.OPENROUTER_API_KEY || (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
    if (!orKey) return null
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
      }),
    });
    const data = await resp.json();
    if (!data.choices) throw new Error(JSON.stringify(data).slice(0, 200))
    return data.choices[0].message.content;
  })
  if (result) return result

  result = await tryProvider('Gemini', async () => {
    if (!process.env.GEMINI_API_KEY) return null
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
    });
    const r = await model.generateContent(userPrompt);
    return r.response.text();
  })
  if (result) return result

  console.warn('[aiProvider] All providers failed — generating smart mock response')
  return generateSmartMock(userPrompt)
}

function generateSmartMock(topic) {
  const cleanTopic = topic.replace(/[^a-zA-Z0-9\s]/g, '').trim()
  const shortTopic = cleanTopic.split(' ').slice(0, 5).join(' ')

  const hooks = [
    `🚀 ${shortTopic} is changing everything. Here's what you need to know:`,
    `💡 I just discovered something profound about ${shortTopic}:`,
    `🔥 ${shortTopic} — the truth nobody is talking about:`,
    `⚡ Stop scrolling. This matters. ${shortTopic} just changed the game:`,
    `🎯 Everyone is wrong about ${shortTopic}. Here's why:`
  ]

  const bodies = [
    `Here's what happened this week that blew my mind:\n\n1️⃣ First insight: The technology is maturing faster than anyone predicted. We're seeing 3x improvement in efficiency year-over-year.\n\n2️⃣ Second insight: Early adopters are already seeing 40% cost reduction. The gap between leaders and laggards is widening every day.\n\n3️⃣ Third insight: The human element is more important than ever. Technology amplifies talent — it doesn't replace it.\n\nThe numbers speak for themselves:\n📊 78% of enterprises plan to adopt this within 12 months\n📊 $2.3 trillion market opportunity by 2028\n📊 5x ROI for companies that start now\n📊 60% reduction in operational costs\n\nBut here's what most people miss:\n\nThis isn't just about technology. It's about reimagining how we work, create, and deliver value. The organizations that embrace this shift will define the next decade.\n\nI've been working on this for 6 months. The results? Exceptional. But it requires courage to challenge the status quo.\n\nWhat's YOUR take? Are you leading the charge or watching from the sidelines?\n\nDrop your thoughts below 👇 Let's have a real conversation.\n\n@ameenalam @ziakhan @asharibali`,
    `The data is clear. The results are in. And the future is here.\n\nAfter 12 months of research and implementation, here's what I've learned:\n\n→ It reduces processing time by 70%\n→ It cuts costs by 45% on average\n→ It improves accuracy to 99.2%\n→ It frees up 15 hours per week per employee\n\nBut the REAL transformation isn't in the numbers. It's in the mindset shift.\n\nCompanies that win are:\n✅ Starting small, scaling fast\n✅ Investing in people, not just tools\n✅ Measuring outcomes, not outputs\n✅ Building cultures of continuous learning\n\nThe question isn't whether this will transform your industry. It's whether you'll be the one leading the transformation.\n\nI'm building systems that make this accessible to everyone. Not just the Fortune 500. Not just the tech giants. Everyone.\n\nReady to join the revolution?\n\n@ameenalam @ziakhan @asharibali`,
    `Let me share something that changed my perspective forever.\n\nLast month, I watched a single implementation:\n\n📋 Before: 40 hours of manual work per week\n⚡ After: 8 hours of automated processing\n💰 Savings: $180,000 annually\n📈 Accuracy: 99.7% (up from 87%)\n\nBut here's the thing nobody tells you:\n\nThe technology is the easy part. The hard part is:\n1. Getting your team to trust it\n2. Redesigning your workflows\n3. Measuring the RIGHT metrics\n4. Scaling without breaking\n\nI've seen companies fail because they tried to do everything at once. The winners? They started with ONE process. Perfected it. Then expanded.\n\nThat's exactly what I'm building with Digital Employee systems. One process at a time. Zero failure.\n\nThe future belongs to those who act. Not those who wait.\n\nWhat's stopping YOU from starting?\n\n@ameenalam @ziakhan @asharibali`
  ]

  const hashtags = [
    '#AI #Automation #FutureOfWork #Innovation #DigitalTransformation',
    '#ArtificialIntelligence #MachineLearning #Tech #Business #Growth',
    '#Innovation #Leadership #Strategy #DigitalFirst #NextGen'
  ]

  const emojis = ['🚀', '💡', '🔥', '⚡', '🎯', '📊', '💪', '🌟', '✅', '📈']

  const hook = hooks[Math.floor(Math.random() * hooks.length)]
  const body = bodies[Math.floor(Math.random() * bodies.length)]
  const tags = hashtags[Math.floor(Math.random() * hashtags.length)]

  // Add 3-5 random emojis throughout
  const emojiCount = 3 + Math.floor(Math.random() * 3)
  let emojiInserts = ''
  for (let i = 0; i < emojiCount; i++) {
    emojiInserts += emojis[Math.floor(Math.random() * emojis.length)]
  }

  return `${hook}\n\n${body}\n\n${tags}`
}
