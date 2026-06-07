import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = path.resolve(__dirname, '../../public/generated')

function getOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
  )
}

// ─── Wikipedia image — primary (topic-relevant, free, no API key) ──────────
async function generateViaWikipedia(topic, width = 1080, height = 1350) {
  // Step 1: Search Wikipedia for the topic
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3`;
  const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
  if (!searchResp.ok) throw new Error(`Wikipedia search: ${searchResp.status}`);
  const searchData = await searchResp.json();
  const firstTitle = searchData?.query?.search?.[0]?.title;
  if (!firstTitle) throw new Error('No Wikipedia results');

  // Step 2: Get page summary with thumbnail
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;
  const summaryResp = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
  if (!summaryResp.ok) throw new Error(`Wikipedia summary: ${summaryResp.status}`);
  const summaryData = await summaryResp.json();

  // Step 3: Get the thumbnail URL
  const thumbUrl = summaryData?.thumbnail?.source || summaryData?.originalimage?.source;
  if (!thumbUrl) throw new Error('No Wikipedia image available');

  // Step 4: Download and resize
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const imgResp = await fetch(thumbUrl, { signal: AbortSignal.timeout(10000) });
  if (!imgResp.ok) throw new Error(`Wikipedia image download: ${imgResp.status}`);
  const imgBuf = Buffer.from(await imgResp.arrayBuffer());

  const filename = `wiki_${Date.now()}.jpg`;
  const destPath = path.join(GENERATED_DIR, filename);
  fs.writeFileSync(destPath, imgBuf);

  const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
  const url = `${base}/generated/${filename}`;
  console.log(`[ImageGen] Wikipedia image saved: ${filename} (from "${firstTitle}")`);
  return url;
}

// ─── Generate SVG-based social media image (always works, no API key) ──────
function generateSVGImage(topic, width = 1080, height = 1350) {
  const seed = Math.abs(topic.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
  const color1 = `hsl(${seed % 360}, 70%, 55%)`
  const color2 = `hsl(${(seed + 40) % 360}, 80%, 35%)`
  const accent = `hsl(${(seed + 180) % 360}, 80%, 60%)`
  const lines = topic.split(/\s+/).reduce((acc, word) => {
    const last = acc[acc.length - 1]
    if (!last || (last + ' ' + word).length > 30) { acc.push(word) }
    else { acc[acc.length - 1] = last + ' ' + word }
    return acc
  }, [])

  const fontSize = Math.min(72, Math.floor(900 / (lines.reduce((a, l) => Math.max(a, l.length), 0) + 1)))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color2}" />
      <stop offset="100%" stop-color="#0a0a1a" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color1}" stop-opacity="0.3" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <circle cx="${width * 0.15}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.35}" fill="url(#accent)" />
  <circle cx="${width * 0.85}" cy="${height * 0.7}" r="${Math.min(width, height) * 0.25}" fill="url(#accent)" />
  <g stroke="${color1}" stroke-opacity="0.08" stroke-width="1">
    ${[0.25, 0.5, 0.75, 1].map(r => `<line x1="0" y1="${height * r}" x2="${width}" y2="${height * r}" />`).join('')}
    ${[0.25, 0.5, 0.75, 1].map(r => `<line x1="${width * r}" y1="0" x2="${width * r}" y2="${height}" />`).join('')}
  </g>
  <rect x="80" y="160" width="120" height="6" rx="3" fill="${color1}" />
  <rect x="80" y="176" width="80" height="4" rx="2" fill="${accent}" />
  <g filter="url(#glow)">
    ${lines.map((l, i) =>
      `<text x="80" y="${480 + i * (fontSize * 1.3)}" fill="white" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="-0.5">${escapeXml(l)}</text>`
    ).join('')}
  </g>
  ${[0, 1, 2].map(i =>
    `<circle cx="${width - 120 + i * 20}" cy="${height - 120}" r="${3 - i}" fill="${accent}" opacity="${0.6 + i * 0.2}" />`
  ).join('')}
  <text x="80" y="${height - 80}" fill="${color1}" font-family="system-ui, sans-serif" font-size="18" opacity="0.7" letter-spacing="2">DIGITAL FTE</text>
</svg>`

  fs.mkdirSync(GENERATED_DIR, { recursive: true })
  const svgPath = path.join(GENERATED_DIR, `svg_img_${Date.now()}.svg`)
  fs.writeFileSync(svgPath, svg, 'utf-8')

  // Try converting SVG to PNG via sharp
  const pngPath = svgPath.replace('.svg', '.png')
  try {
    const sharpPath = path.resolve(__dirname, '../../../../../.agents/skills/social-media-image-sizes/node_modules/sharp')
    const sharp = require(sharpPath)
    const pngBuf = sharp(svgPath).resize(width, height).png().toBuffer()
    fs.writeFileSync(pngPath, pngBuf)
    fs.unlinkSync(svgPath)
  } catch (e) {
    // Keep SVG if sharp not available
  }

  const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
  const finalPath = fs.existsSync(pngPath) ? pngPath : svgPath
  const filename = path.basename(finalPath)
  const url = `${base}/generated/${filename}`
  console.log('[ImageGen] SVG image created:', filename)
  return url
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function generatePostImage(topic, style = 'professional', aspectRatio = '4:5') {
  // 1. Try Wikipedia image (topic-relevant, free)
  try {
    return await generateViaWikipedia(topic)
  } catch (e) {
    console.warn('[ImageGen] Wikipedia failed:', e.message)
  }

  // 2. Try OpenRouter Gemini image (if key has credits)
  try {
    const key = getOpenRouterKey()
    if (key) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://digitalfte.online',
          'X-Title': 'Digital FTE',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image',
          max_tokens: 500,
          messages: [{ role: 'user', content: `${topic}, professional social media image, premium quality, ${style}` }],
          modalities: ['image', 'text'],
          image_config: { aspect_ratio: aspectRatio },
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(`OpenRouter ${data.error.code}: ${data.error.message}`)
      const msg = data.choices?.[0]?.message
      let imageUrl = null
      if (msg?.images?.[0]) {
        imageUrl = msg.images[0].image_url?.url || msg.images[0].imageUrl?.url || (typeof msg.images[0].image_url === 'string' ? msg.images[0].image_url : null)
      }
      if (!imageUrl && Array.isArray(msg?.content)) {
        for (const part of msg.content) {
          if (part?.type === 'image_url') { imageUrl = part.image_url?.url || (typeof part.image_url === 'string' ? part.image_url : null); if (imageUrl) break }
        }
      }
      if (imageUrl) {
        fs.mkdirSync(GENERATED_DIR, { recursive: true })
        const filename = `or_img_${Date.now()}.png`
        const destPath = path.join(GENERATED_DIR, filename)
        if (imageUrl.startsWith('data:')) {
          fs.writeFileSync(destPath, Buffer.from(imageUrl.split(',')[1], 'base64'))
        } else {
          const img = await fetch(imageUrl)
          if (!img.ok) throw new Error(`Download failed: ${img.status}`)
          fs.writeFileSync(destPath, Buffer.from(await img.arrayBuffer()))
        }
        const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
        console.log('[ImageGen] OpenRouter image saved:', filename)
        return `${base}/generated/${filename}`
      }
    }
  } catch (e) {
    console.warn('[ImageGen] OpenRouter failed:', e.message)
  }

  // 3. SVG fallback (always works)
  return generateSVGImage(topic)
}

export async function generateImage(prompt) {
  return generatePostImage(prompt)
}
