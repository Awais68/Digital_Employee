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
    `The most interesting part of working with ${shortTopic} has been seeing where assumptions break down in practice. What looks good in a demo often needs significant adaptation for real-world constraints like latency, cost, or edge cases.\n\nTeams that invest in evaluation and observability upfront tend to move faster in the long run. It is not the most glamorous work, but it pays off.`,
    `I recently reviewed how different teams approach ${shortTopic}. The biggest difference between ones that ship successfully and ones that stall comes down to how they handle the iteration loop.\n\nThe teams that succeed treat iteration as the core workflow — they ship small, measure what happens, and adjust. The ones that struggle spend too long trying to get it right before shipping anything.`,
    `Something that does not get enough attention with ${shortTopic}: the integration details matter more than the core technology choice. The adapters, the error handling, the data transformations — that is where most of the real work lives.\n\nA clean API matters less than robust error recovery. Choose tools that fail gracefully.`,
  ]

  const body = bodies[Math.floor(Math.random() * bodies.length)]
  const tag = shortTopic.replace(/\s+/g, '')

  return body + `\n\nKey takeaways:\n- Start small, iterate fast\n- Measure what matters\n- Invest in observability early\n\n#${tag} #CloudComputing #DevOps #SoftwareEngineering #TechTrends`
}
