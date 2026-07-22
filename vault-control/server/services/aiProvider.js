// Global flag — set to true when ALL AI providers fail and mock content is returned.
// Consumers (postGenerator.js etc.) must check this after callAI() and abort/log loudly.
export let _lastCallUsedMock = false;

export function _resetMockFlag() {
  _lastCallUsedMock = false;
}

const FREE_OR_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-20b:free',
];

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
  _resetMockFlag()

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

    const configuredModel = process.env.OPENROUTER_MODEL;
    const modelsToTry = configuredModel
      ? [configuredModel, ...FREE_OR_MODELS.filter(m => m !== configuredModel)]
      : FREE_OR_MODELS;

    for (const model of modelsToTry) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: maxTokens,
          }),
        });
        const data = await resp.json();
        if (data.choices) {
          console.log(`[aiProvider] OpenRouter OK with model: ${model}`);
          return data.choices[0].message.content;
        }
        const errMsg = data.error?.message || JSON.stringify(data).slice(0, 100);
        console.warn(`[aiProvider] OpenRouter model ${model} failed: ${errMsg}`);
      } catch (e) {
        console.warn(`[aiProvider] OpenRouter model ${model} threw: ${e.message.slice(0, 80)}`);
      }
    }
    throw new Error('All OpenRouter models exhausted');
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

  _lastCallUsedMock = true;
  console.error('[aiProvider] ⚠ ALL AI PROVIDERS FAILED — returning mock content. Check API keys and billing.');
  return generateSmartMock(userPrompt)
}

function generateSmartMock(topic) {
  const cleanTopic = topic.replace(/[^a-zA-Z0-9\s]/g, '').trim()
  const shortTopic = cleanTopic.split(' ').slice(0, 5).join(' ')

  const bodies = [
    `${shortTopic} is transforming how teams operate — but success depends on the right strategy and execution. Whether you are exploring or already scaling, having the right partner makes all the difference.\n\n👉 DM me to discuss how this applies to your workflow.\n👉 Book a free consultation: https://calendly.com/digital-employee/strategy\n👉 Visit https://digitalemployee.ai`,
    `I have seen teams achieve 3x velocity by applying the right approach to ${shortTopic}. The results speak for themselves — faster iterations, lower costs, better outcomes.\n\n✅ Get the starter kit: https://digitalemployee.ai/start\n✅ Schedule a demo: https://calendly.com/digital-employee/demo\n✅ Contact our team: hello@digitalemployee.ai`,
    `Struggling with ${shortTopic}? You are not alone. Most teams face the same challenges — integration complexity, scaling bottlenecks, and measurement gaps. We help teams navigate exactly these problems every day.\n\n📅 Book a strategy session: https://calendly.com/digital-employee/strategy\n📧 Email us: hello@digitalemployee.ai\n🌐 Learn more: https://digitalemployee.ai`,
  ]

  const body = bodies[Math.floor(Math.random() * bodies.length)]
  const tag = shortTopic.replace(/\s+/g, '')

  return body + `\n\n#${tag} #DigitalEmployee #AI #Automation #FutureOfWork`
}
