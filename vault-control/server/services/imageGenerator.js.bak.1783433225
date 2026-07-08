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

// ─── Canva-Style Image with Post Content ──────────────────────────────────
async function generateCanvaStyleImage(topic, postContent = '', width = 1080, height = 1350) {
  const LINKEDIN_BLUE = '#0A66C2'
  const ELECTRIC_TEAL = '#00C9A7'
  const DARK_NAVY = '#0D1B2A'
  const DARKER = '#061220'
  const WHITE = '#FFFFFF'
  const LIGHT = 'rgba(255,255,255,0.75)'
  const DIM = 'rgba(255,255,255,0.4)'

  // Extract key points from content
  const lines = postContent.split('\n').filter(l => l.trim())
  const bulletPoints = lines.filter(l => l.match(/^[→✅📊💡🔥⚡1-9️⃣]|^- /)).slice(0, 5)
  const hashtags = (postContent.match(/#\w+/g) || []).slice(0, 4)
  const mentions = (postContent.match(/@\w+/g) || []).slice(0, 3)

  // Get hook (first meaningful line)
  const hook = lines.find(l => l.length > 20 && !l.startsWith('#') && !l.startsWith('@')) || topic
  const hookLines = hook.match(/.{1,25}/g) || [hook.substring(0, 25)]

  // Stats from content
  const stats = postContent.match(/\d+[%x$]|\d+\s*(million|billion|trillion)/gi) || []

  // Build SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${DARK_NAVY}"/>
      <stop offset="50%" stop-color="#0C2340"/>
      <stop offset="100%" stop-color="${DARKER}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="30%" cy="30%">
      <stop offset="0%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="70%" cy="70%">
      <stop offset="0%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${ELECTRIC_TEAL}"/>
      <stop offset="100%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="blueLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${LINKEDIN_BLUE}"/>
      <stop offset="100%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow1)"/>
  <rect width="${width}" height="${height}" fill="url(#glow2)"/>

  <!-- Top bar -->
  <rect x="0" y="0" width="${width}" height="6" fill="${LINKEDIN_BLUE}"/>
  
  <!-- Logo area -->
  <rect x="80" y="50" width="40" height="40" rx="8" fill="${ELECTRIC_TEAL}"/>
  <text x="100" y="78" fill="${DARK_NAVY}" font-family="'Poppins',sans-serif" font-size="20" font-weight="700" text-anchor="middle">D</text>
  <text x="135" y="78" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="16" font-weight="600">Digital FTE</text>
  <text x="${width - 80}" y="78" fill="${DIM}" font-family="'Inter',sans-serif" font-size="12" text-anchor="end">Professional Insights</text>

  <!-- Accent line -->
  <rect x="80" y="110" width="200" height="2" rx="1" fill="url(#accent)"/>

  <!-- Hook / Headline -->
  <g filter="url(#glow)">
    ${hookLines.map((line, i) =>
      `<text x="80" y="${170 + i * 55}" fill="${WHITE}" font-family="'Poppins','Inter',sans-serif" font-size="42" font-weight="700" letter-spacing="-0.5">${escapeXml(line.trim())}</text>`
    ).join('\n    ')}
  </g>

  <!-- Content bullets -->
  ${bulletPoints.map((point, i) => {
    const y = 170 + hookLines.length * 55 + 40 + i * 52
    const cleanPoint = point.replace(/^[→✅📊💡🔥⚡1-9️⃣]\s*/, '').replace(/^-\s*/, '')
    return `<text x="100" y="${y}" fill="${ELECTRIC_TEAL}" font-family="sans-serif" font-size="18">▸</text>
    <text x="130" y="${y}" fill="${LIGHT}" font-family="'Inter',sans-serif" font-size="22" font-weight="400">${escapeXml(cleanPoint.substring(0, 55))}</text>`
  }).join('\n    ')}

  <!-- Stats highlight -->
  ${stats.length > 0 ? `
  <rect x="80" y="${height - 350}" width="${width - 160}" height="80" rx="12" fill="${LINKEDIN_BLUE}" fill-opacity="0.15"/>
  <rect x="80" y="${height - 350}" width="${width - 160}" height="80" rx="12" stroke="${LINKEDIN_BLUE}" stroke-width="1" fill="none" stroke-opacity="0.3"/>
  <text x="${width/2}" y="${height - 300}" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="28" font-weight="700" text-anchor="middle">${escapeXml(stats[0])}</text>
  <text x="${width/2}" y="${height - 275}" fill="${DIM}" font-family="'Inter',sans-serif" font-size="14" text-anchor="middle">Key Metric</text>
  ` : ''}

  <!-- Hashtags -->
  <text x="80" y="${height - 180}" fill="${ELECTRIC_TEAL}" font-family="'Inter',sans-serif" font-size="16" font-weight="500">${hashtags.map(h => escapeXml(h)).join('  ')}</text>

  <!-- Mentions -->
  <text x="80" y="${height - 150}" fill="${LINKEDIN_BLUE}" font-family="'Inter',sans-serif" font-size="15">${mentions.map(m => escapeXml(m)).join('  ')}</text>

  <!-- Bottom bar -->
  <rect x="0" y="${height - 100}" width="${width}" height="100" fill="${DARKER}" fill-opacity="0.5"/>
  <rect x="80" y="${height - 95}" width="150" height="3" rx="1.5" fill="url(#accent)"/>
  <text x="80" y="${height - 55}" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="18" font-weight="600">Follow for more insights</text>
  <text x="80" y="${height - 35}" fill="${DIM}" font-family="'Inter',sans-serif" font-size="13">Digital Transformation • AI • Innovation</text>

  <!-- Corner brackets -->
  <g stroke="${ELECTRIC_TEAL}" stroke-width="1.5" fill="none" opacity="0.3">
    <path d="M 50 50 L 50 80 M 50 50 L 80 50"/>
    <path d="M ${width-50} 50 L ${width-50} 80 M ${width-50} 50 L ${width-80} 50"/>
    <path d="M 50 ${height-50} L 50 ${height-80} M 50 ${height-50} L 80 ${height-50}"/>
    <path d="M ${width-50} ${height-50} L ${width-50} ${height-80} M ${width-50} ${height-50} L ${width-80} ${height-50}"/>
  </g>
</svg>`

  fs.mkdirSync(GENERATED_DIR, { recursive: true })
  const filename = `canva_${Date.now()}.png`
  const destPath = path.join(GENERATED_DIR, filename)

  try {
    const { default: sharp } = await import('sharp')
    await sharp(Buffer.from(svg))
      .resize(width, height, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .png({ quality: 98 })
      .toFile(destPath)
    console.log(`[ImageGen] Canva-style image: ${filename}`)
  } catch (e) {
    const svgPath = path.join(GENERATED_DIR, `canva_${Date.now()}.svg`)
    fs.writeFileSync(svgPath, svg, 'utf-8')
    const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
    return `${base}/generated/${path.basename(svgPath)}`
  }

  const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
  return `${base}/generated/${filename}`
}

// ─── Premium LinkedIn Design System Image (Gemini-style) ──────────────────
async function generatePremiumDesignImage(topic, width = 1080, height = 1350) {
  // Design System Colors
  const LINKEDIN_BLUE = '#0A66C2'
  const ELECTRIC_TEAL = '#00C9A7'
  const DARK_NAVY = '#0D1B2A'
  const DARKER_NAVY = '#061220'
  const PURE_WHITE = '#FFFFFF'
  const LIGHT_GRAY = 'rgba(255,255,255,0.7)'
  const WATERMARK = 'rgba(255,255,255,0.35)'

  // Smart text splitting
  const words = topic.split(/\s+/)
  const mid = Math.ceil(words.length / 2)
  const headlineWords = words.slice(0, mid)
  const subtextWords = words.slice(mid)

  // Word wrap functions
  const wrapLine = (wordsArr, maxLen) => wordsArr.reduce((acc, word) => {
    const last = acc[acc.length - 1]
    if (!last || (last + ' ' + word).length > maxLen) acc.push(word)
    else acc[acc.length - 1] = last + ' ' + word
    return acc
  }, [])

  const headlineLines = wrapLine(headlineWords, 18)
  const subtextLines = wrapLine(subtextWords, 28)

  // Dynamic sizing
  const maxLen = Math.max(...headlineLines.map(l => l.length))
  const hFont = Math.min(64, Math.max(48, Math.floor(800 / (maxLen + 1))))
  const sFont = 26
  const totalH = (headlineLines.length * hFont * 1.25) + 40 + (subtextLines.length * sFont * 1.5)
  const startY = (height - totalH) / 2 + 20

  // Generate decorative elements based on topic
  const seed = Math.abs(topic.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
  const orbX1 = 150 + (seed % 200)
  const orbY1 = 300 + (seed % 150)
  const orbX2 = width - 200 - (seed % 180)
  const orbY2 = height - 400 + (seed % 200)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${DARK_NAVY}"/>
      <stop offset="40%" stop-color="#0F2847"/>
      <stop offset="100%" stop-color="${DARKER_NAVY}"/>
    </linearGradient>
    <radialGradient id="orb1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0.25"/>
      <stop offset="60%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0.2"/>
      <stop offset="60%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${ELECTRIC_TEAL}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="blueLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="0.8" fill="${ELECTRIC_TEAL}" opacity="0.12"/>
    </pattern>
    <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#dots)"/>

  <!-- Ambient orbs -->
  <ellipse cx="${orbX1}" cy="${orbY1}" rx="350" ry="280" fill="url(#orb1)"/>
  <ellipse cx="${orbX2}" cy="${orbY2}" rx="280" ry="220" fill="url(#orb2)"/>

  <!-- Top decorative line -->
  <rect x="${width/2 - 200}" y="90" width="400" height="2" rx="1" fill="url(#blueLine)"/>
  <circle cx="${width/2 - 80}" cy="91" r="3" fill="${ELECTRIC_TEAL}" opacity="0.5"/>
  <circle cx="${width/2}" cy="91" r="4" fill="${ELECTRIC_TEAL}" opacity="0.7"/>
  <circle cx="${width/2 + 80}" cy="91" r="3" fill="${ELECTRIC_TEAL}" opacity="0.5"/>

  <!-- Headline -->
  <g filter="url(#glow)">
    ${headlineLines.map((line, i) =>
      `<text x="${width/2}" y="${startY + i * (hFont * 1.25)}" fill="${PURE_WHITE}" font-family="'Poppins','Inter',system-ui,sans-serif" font-size="${hFont}" font-weight="700" letter-spacing="-1" text-anchor="middle">${escapeXml(line)}</text>`
    ).join('\n    ')}
  </g>

  <!-- Teal accent divider -->
  <rect x="${width/2 - 50}" y="${startY + headlineLines.length * (hFont * 1.25) + 15}" width="100" height="3" rx="1.5" fill="url(#lineGrad)"/>

  <!-- Subtext -->
  <g filter="url(#soft)">
    ${subtextLines.map((line, i) =>
      `<text x="${width/2}" y="${startY + headlineLines.length * (hFont * 1.25) + 60 + i * (sFont * 1.5)}" fill="${LIGHT_GRAY}" font-family="'Inter','Poppins',system-ui,sans-serif" font-size="${sFont}" font-weight="400" letter-spacing="0.5" text-anchor="middle">${escapeXml(line)}</text>`
    ).join('\n    ')}
  </g>

  <!-- Bottom accent -->
  <rect x="${width/2 - 200}" y="${height - 150}" width="400" height="2" rx="1" fill="url(#blueLine)"/>

  <!-- Watermark -->
  <text x="${width/2}" y="${height - 100}" fill="${WATERMARK}" font-family="'Inter','Poppins',system-ui,sans-serif" font-size="14" font-weight="300" letter-spacing="6" text-anchor="middle">DIGITAL FTE</text>

  <!-- Corner brackets -->
  <g stroke="${ELECTRIC_TEAL}" stroke-width="1.5" fill="none" opacity="0.35">
    <path d="M 70 70 L 70 110 M 70 70 L 110 70"/>
    <path d="M ${width-70} 70 L ${width-70} 110 M ${width-70} 70 L ${width-110} 70"/>
    <path d="M 70 ${height-70} L 70 ${height-110} M 70 ${height-70} L 110 ${height-70}"/>
    <path d="M ${width-70} ${height-70} L ${width-70} ${height-110} M ${width-70} ${height-70} L ${width-110} ${height-70}"/>
  </g>

  <!-- Side accent lines -->
  <line x1="40" y1="${height/2 - 100}" x2="40" y2="${height/2 + 100}" stroke="${LINKEDIN_BLUE}" stroke-width="2" opacity="0.2"/>
  <line x1="${width-40}" y1="${height/2 - 100}" x2="${width-40}" y2="${height/2 + 100}" stroke="${LINKEDIN_BLUE}" stroke-width="2" opacity="0.2"/>
</svg>`

  fs.mkdirSync(GENERATED_DIR, { recursive: true })

  // Convert SVG to high-quality PNG
  const filename = `design_${Date.now()}.png`
  const destPath = path.join(GENERATED_DIR, filename)

  try {
    const { default: sharp } = await import('sharp')
    const svgBuf = Buffer.from(svg)
    await sharp(svgBuf)
      .resize(width, height, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .png({ quality: 98 })
      .toFile(destPath)
    console.log(`[ImageGen] Premium design PNG: ${filename}`)
  } catch (e) {
    // Fallback to SVG
    const svgPath = path.join(GENERATED_DIR, `design_${Date.now()}.svg`)
    fs.writeFileSync(svgPath, svg, 'utf-8')
    console.log(`[ImageGen] Premium design SVG: ${path.basename(svgPath)}`)
    const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
    return `${base}/generated/${path.basename(svgPath)}`
  }

  const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
  return `${base}/generated/${filename}`
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Generate AI image via Pollinations + Upscale to HD ─────────────────────
async function generateViaPollinations(topic, width = 1080, height = 1350) {
  // Create cinematic, photorealistic prompt
  const prompt = `Professional photograph of ${topic}, cinematic lighting, shallow depth of field, bokeh background, photorealistic, award winning photography, 8k resolution, ultra detailed, shot on Canon EOS R5, natural colors, editorial quality`
  const encodedPrompt = encodeURIComponent(prompt)
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&enhance=true&safe=false&seed=${Date.now()}`

  console.log(`[ImageGen] Pollinations: Generating cinematic image...`)
  const imgResp = await fetch(pollinationsUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(90000) // 90s timeout
  })

  if (!imgResp.ok) throw new Error(`Pollinations: ${imgResp.status}`)

  const imgBuf = Buffer.from(await imgResp.arrayBuffer())
  if (imgBuf.length < 5000) throw new Error('Pollinations: Image too small')

  fs.mkdirSync(GENERATED_DIR, { recursive: true })

  // Upscale to target resolution with sharp
  const filename = `ai_${Date.now()}.jpg`
  const destPath = path.join(GENERATED_DIR, filename)

  try {
    const { default: sharp } = await import('sharp')

    // Upscale + enhance quality
    await sharp(imgBuf)
      .resize(width, height, {
        fit: 'cover',
        position: 'centre',
        kernel: sharp.kernel.lanczos3
      })
      .sharpen({ sigma: 0.8 })
      .modulate({ brightness: 1.05, contrast: 1.1 })
      .jpeg({ quality: 95, mozjpeg: true })
      .toFile(destPath)

    console.log(`[ImageGen] Upscaled to ${width}x${height}`)
  } catch (e) {
    // Fallback: save original
    fs.writeFileSync(destPath, imgBuf)
    console.log(`[ImageGen] Saved original (sharp failed: ${e.message})`)
  }

  const base = process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
  console.log(`[ImageGen] AI image saved: ${filename} (${(fs.statSync(destPath).size/1024).toFixed(0)}KB)`)
  return `${base}/generated/${filename}`
}

export async function generatePostImage(topic, style = 'professional', aspectRatio = '4:5', postContent = '') {
  // 1. Canva-style with post content (best - shows actual content)
  if (postContent) {
    try {
      return await generateCanvaStyleImage(topic, postContent)
    } catch (e) {
      console.warn('[ImageGen] Canva-style failed:', e.message)
    }
  }

  // 2. Premium LinkedIn Design (no content, just topic)
  try {
    return await generatePremiumDesignImage(topic)
  } catch (e) {
    console.warn('[ImageGen] Premium design failed:', e.message)
  }

  // 3. Pollinations AI - topic-relevant images
  try {
    return await generateViaPollinations(topic)
  } catch (e) {
    console.warn('[ImageGen] Pollinations failed:', e.message)
  }

  // 4. Try Wikipedia image (topic-relevant, free)
  try {
    return await generateViaWikipedia(topic)
  } catch (e) {
    console.warn('[ImageGen] Wikipedia failed:', e.message)
  }

  // 5. Try OpenRouter Gemini image (if key has credits)
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

  // 6. Basic SVG fallback
  return generateSVGImage(topic)
}

export async function generateImage(prompt) {
  return generatePostImage(prompt)
}
