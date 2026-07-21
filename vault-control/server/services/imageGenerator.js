import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { callAI } from './aiProvider.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = path.resolve(__dirname, '../../public/generated')

// ─── Brand logo — embedded once as base64 for the header lockup ───────────
// The ASNEXA brand mark sits on the right of the header. A generic file
// loader is used so any image (png/jpeg) can be embedded as a data URI.
const LOGO_PATH = path.resolve(__dirname, '../../public/uploads/logoBig.png')
const BRAND_LOGO_PATH = path.resolve(__dirname, '../../public/uploads/logoAsNexa.jpeg')

const _logoCache = {} // path -> dataUri | '' (attempted & failed)
function loadImageDataUri(filePath) {
  if (filePath in _logoCache) return _logoCache[filePath] || null
  try {
    const buf = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'image/png'
    _logoCache[filePath] = `data:${mime};base64,${buf.toString('base64')}`
    console.log(`[ImageGen] Logo loaded: ${path.basename(filePath)} (${(buf.length / 1024).toFixed(0)}KB)`)
  } catch (e) {
    console.warn(`[ImageGen] Logo not found at ${filePath}: ${e.message}`)
    _logoCache[filePath] = ''
  }
  return _logoCache[filePath] || null
}
function getLogoDataUri() {
  return loadImageDataUri(LOGO_PATH)
}
function getBrandLogoDataUri() {
  return loadImageDataUri(BRAND_LOGO_PATH)
}

// ─── Emoji stripping — librsvg has no color-emoji fallback in many deploy ─
// environments and renders emoji as tofu (□) boxes. All text overlays are
// stripped and stat icons are drawn as vectors, so glyph coverage never
// affects the exported image.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{2049}\u{203C}]/gu
function stripEmoji(s) {
  return typeof s === 'string' ? s.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim() : s
}

// One-time observability: log whether a color-emoji font is present on the
// host. Purely informational — rendering does not depend on it.
let _emojiFontLogged = false
function logEmojiFontStatus() {
  if (_emojiFontLogged) return
  _emojiFontLogged = true
  try {
    const out = spawnSync('fc-list', [':charset=1f600'], { encoding: 'utf-8', timeout: 3000 })
    const has = !!(out.stdout && out.stdout.trim().length > 0)
    console.log(`[ImageGen] Color-emoji font on host: ${has ? 'yes' : 'NO'} (emoji stripped from render regardless)`)
  } catch { /* fc-list unavailable — irrelevant since emoji are stripped */ }
}

// ─── Validation constants ──────────────────────────────────────────────
const FORBIDDEN_FRAGMENTS = [
  'visual for:', 'editorial style', '(like Forbes', 'TechCrunch,', 'HBR covers',
  'Requirements:', 'Core message:', 'Key data/stats to visually emphasize',
  'Professional marketing visual', '1080x1350', 'NO human faces', 'NO text',
  'Style keywords:', 'markdown', '```json', '```',
  'Resolution:', 'production quality', 'premium, editorial',
]
const MAX_HEADLINE_CHARS = 65
const MAX_BULLET_CHARS = 95
const MAX_CTA_CHARS = 80
const MAX_STAT_LABEL_CHARS = 28
const TEMPLATE_SYNTAX_RE = /\$\{.*?\}/

function getOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null)
  )
}

// ─── Content Validation ──────────────────────────────────────────────────
function validateStructuredContent(content) {
  if (!content || typeof content !== 'object') {
    return { valid: false, error: 'Content is not an object', content }
  }
  if (typeof content.headline !== 'string' || content.headline.length === 0) {
    return { valid: false, error: 'Headline missing or empty', content }
  }
  if (content.headline.length > MAX_HEADLINE_CHARS) {
    console.warn(`[ImageGen] Headline truncated from ${content.headline.length} to ${MAX_HEADLINE_CHARS} chars`)
    content.headline = content.headline.substring(0, MAX_HEADLINE_CHARS)
  }
  if (!Array.isArray(content.bullets)) {
    content.bullets = []
  }
  if (!Array.isArray(content.stats)) {
    content.stats = []
  }
  if (typeof content.cta !== 'string') {
    content.cta = ''
  }

  const allText = JSON.stringify(content).toLowerCase()
  for (const frag of FORBIDDEN_FRAGMENTS) {
    if (allText.includes(frag.toLowerCase())) {
      return { valid: false, error: `Forbidden fragment detected: "${frag}"`, content }
    }
  }
  if (TEMPLATE_SYNTAX_RE.test(allText)) {
    return { valid: false, error: 'Unresolved template syntax detected', content }
  }
  return { valid: true, content }
}

// ─── Rule-based content extraction from actual post text ──────────────
function extractContentFromPost(postContent, topic) {
  const lines = postContent.split('\n').filter(l => l.trim())
  const headline = (
    lines.find(l => l.length > 10 && l.length < MAX_HEADLINE_CHARS
      && !l.startsWith('#') && !l.startsWith('@') && !l.startsWith('http')
      && !l.startsWith('```') && !l.match(/^\d+\.\s/))
    || topic
  ).replace(/^[🚀💡🔥⚡🎯📊💪🌟✅📈]\s*/, '').trim()

  const statLines = lines.filter(l => /\d+%/.test(l) || /\$\d/.test(l))
  const iconPool = ['📈', '💰', '⚡', '🎯', '📊', '🌟', '🔥', '💡']
  const usedIcons = []
  const stats = statLines.slice(0, 4).map(l => {
    const num = l.match(/([\d,.]+%|\$[\d,.]+[^\s]*)/)?.[1] || l.match(/([\d,.]+%|\$[\d,.]+[^\s]*)/)?.[0] || ''
    const label = l.replace(num, '').replace(/^[→✅📊💡🔥⚡\s]*/, '').replace(/[^\w\s-]/g, '').trim().substring(0, MAX_STAT_LABEL_CHARS) || 'Key metric'
    const icon = iconPool.find(i => !usedIcons.includes(i)) || iconPool[0]
    usedIcons.push(icon)
    return { icon, value: num, label }
  })

  if (stats.length === 0) {
    const numbers = postContent.match(/\d+%|\$[\d,.]+[kKmMbBtT]?|\b\d+[xX]\b(?!\d+)/g) || []
    const cleanNumbers = numbers.filter(n => !/^\d+x\d+$/i.test(n))
    if (cleanNumbers.length > 0) {
      stats.push({ icon: '📊', value: cleanNumbers[0].trim(), label: 'Impact metric' })
    }
  }

  const bullets = lines
    .filter(l => l.match(/^[→✅📊💡🔥⚡\d️⃣]|^- /))
    .slice(0, 4)
    .map(l => l.replace(/^[→✅📊💡🔥⚡\d️⃣\-]+/, '').replace(/^\s+/, '').trim())
    .filter(l => l.length > 5)
    .map(l => {
      if (l.length <= MAX_BULLET_CHARS) return l
      // Truncate long bullets at the last word boundary instead of dropping them
      const clipped = l.substring(0, MAX_BULLET_CHARS)
      const lastSpace = clipped.lastIndexOf(' ')
      const base = lastSpace > 0 ? clipped.substring(0, lastSpace) : clipped
      return base + '…'
    })

  const cta = (
    lines.find(l => l.includes('?') || l.includes('👇') || l.includes('↓')
      || /share|comment|thoughts?|think|discuss|drop|join/i.test(l))
    || 'What are your thoughts? 👇'
  ).replace(/^[🚀💡🔥⚡🎯📊💪🌟✅📈]\s*/, '').trim().substring(0, MAX_CTA_CHARS)

  return { headline, bullets, stats, cta }
}

// ─── AI-based content extraction with JSON schema + retry ─────────────
async function extractContentViaAI(postContent, topic) {
  const systemPrompt = 'You extract structured image-overlay content from marketing posts. Return ONLY valid JSON — no markdown, no code fences.'

  const prompt = `Extract image overlay content from the marketing post below for a branded social media image.

Return ONLY valid JSON (no markdown, no code fences) with this exact schema:
{
  "headline": "Short compelling headline (MAX 6 WORDS, attention-grabbing, no quotes)",
  "bullets": ["3-4 key takeaways from the post's bullet list, each under 50 chars"],
  "stats": [
    {"icon": "📊", "value": "exact number like 78%", "label": "short label under 25 chars"}
  ],
  "cta": "Short call to action (max 5 words)"
}

STRICT RULES:
- Headline: max 6 words, must be compelling, no instruction text
- Stats: extract real numbers/percentages from the post content. Max 4.
  If the post has no clear numbers, use an empty array [].
- Bullets: concrete takeaways from the post content.
- CTA: short action prompt from the post end.
- NEVER include instruction text, prompt text, or meta commentary.
- The content is for a SOCIAL MEDIA IMAGE overlay — make it punchy.

MARKETING POST:
${postContent.substring(0, 1500)}`

  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAI(systemPrompt, prompt, 800)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      const validation = validateStructuredContent(parsed)
      if (validation.valid) {
        console.log(`[ImageGen] AI content extraction succeeded (attempt ${attempt + 1})`)
        return validation.content
      }
      lastError = validation.error
      console.warn(`[ImageGen] AI extraction attempt ${attempt + 1} validation failed:`,
        lastError, '- raw:', raw.substring(0, 120))
    } catch (e) {
      lastError = e.message
      console.warn(`[ImageGen] AI extraction attempt ${attempt + 1} parse failed:`, e.message)
    }
  }
  throw new Error(`AI content extraction failed after 2 attempts: ${lastError}`)
}

// ─── Combined extraction: AI first, rule-based fallback ───────────────
async function extractImageContent(postContent, topic) {
  if (!postContent || postContent.trim().length === 0) {
    console.warn('[ImageGen] No post content — extracting from topic only')
    const content = extractContentFromPost(topic || 'Insights', topic)
    const validation = validateStructuredContent(content)
    if (validation.valid) return validation.content
    return { headline: topic || 'Insights', bullets: [], stats: [], cta: '' }
  }
  const ruleContent = extractContentFromPost(postContent, topic)
  const ruleValidation = validateStructuredContent(ruleContent)
  if (ruleValidation.valid) {
    return ruleValidation.content
  }
  try {
    console.warn('[ImageGen] Rule-based extraction insufficient — trying AI extraction')
    const cleaned = postContent.replace(/```[\s\S]*?```/g, '').trim()
    const aiContent = await extractContentViaAI(cleaned, topic)
    return aiContent
  } catch (e) {
    console.warn('[ImageGen] AI extraction failed too, using rule-based result:', e.message)
    return ruleContent
  }
}

// ─── Pre-render sanitization: returns { safe, reason } ────────────────
function isContentSafeForRendering(content) {
  const allText = (content.headline + ' ' + content.cta + ' ' +
    content.bullets.join(' ') + ' ' + JSON.stringify(content.stats)).toLowerCase()

  for (const frag of FORBIDDEN_FRAGMENTS) {
    if (allText.includes(frag.toLowerCase())) {
      return { safe: false, reason: `Forbidden content: "${frag}"` }
    }
  }
  if (TEMPLATE_SYNTAX_RE.test(allText)) {
    return { safe: false, reason: 'Unresolved template syntax' }
  }
  if (!content.headline || content.headline.trim().length === 0) {
    return { safe: false, reason: 'Empty headline' }
  }
  return { safe: true }
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

// ─── Branded Template Image with Structured Content ──────────────────────
async function generateCanvaStyleImage(topic, postContent = '', width = 1080, height = 1350) {
  const LINKEDIN_BLUE = '#0A66C2'
  const ELECTRIC_TEAL = '#00C9A7'
  const DARK_NAVY = '#0D1B2A'
  const DARKER = '#061220'
  const WHITE = '#FFFFFF'
  const LIGHT = 'rgba(255,255,255,0.75)'
  const DIM = 'rgba(255,255,255,0.4)'
  const CARD_BG = 'rgba(10,102,194,0.12)'
  const CARD_BORDER = 'rgba(10,102,194,0.25)'

  // ── Step 1: Extract structured content from post body ────────────────
  let content
  if (typeof postContent === 'object' && postContent !== null && postContent.headline) {
    content = postContent
  } else if (typeof postContent === 'string') {
    const cleanBody = postContent.replace(/```[\s\S]*?```/g, '').trim()
    content = await extractImageContent(cleanBody, topic)
  } else {
    content = { headline: topic, bullets: [], stats: [], cta: '' }
  }

  // ── Step 2: Pre-render validation ────────────────────────────────────
  const validation = validateStructuredContent(content)
  if (!validation.valid) {
    console.warn(`[ImageGen] Content validation failed: ${validation.error} — falling back to Pollinations`)
    throw new Error(`Content validation: ${validation.error}`)
  }

  const safety = isContentSafeForRendering(content)
  if (!safety.safe) {
    console.warn(`[ImageGen] Content unsafe for rendering: ${safety.reason} — falling back to Pollinations`)
    throw new Error(`Content safety: ${safety.reason}`)
  }

  // ── Step 3: Build branded template SVG v2 (redesigned for Phase 4) ──
  logEmojiFontStatus()
  const headline = stripEmoji(content.headline) || topic
  const cta = stripEmoji(content.cta || '')
  const bullets = (content.bullets || []).map(b => stripEmoji(b)).filter(Boolean)
  const stats = (content.stats || [])
    .map(s => ({ value: stripEmoji(s.value || ''), label: stripEmoji(s.label || '') }))
    .filter(s => s.value)
  const logoUri = getLogoDataUri()
  const brandLogoUri = getBrandLogoDataUri()

  // Derive a topic category badge text from the content
  const KICKER_LABELS = ['TECH INSIGHT', 'AI TRENDS', 'INNOVATION', 'DEEP DIVE', 'ANALYSIS', 'PERSPECTIVE']
  const topicLower = topic.toLowerCase()
  const kicker = topicLower.includes('ai') ? 'AI TRENDS'
    : topicLower.includes('tech') || topicLower.includes('digital') ? 'TECH INSIGHT'
    : topicLower.includes('data') ? 'DATA DEEP DIVE'
    : topicLower.includes('automation') ? 'AUTOMATION'
    : topicLower.includes('agent') ? 'AI AGENTS'
    : topicLower.includes('build') || topicLower.includes('dev') ? 'BUILDERS'
    : KICKER_LABELS[Math.abs(topic.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % KICKER_LABELS.length]

  // Layout bounds
  const HEADER_BOTTOM = 155
  const FOOTER_TOP = height - 130
  const AVAILABLE = FOOTER_TOP - HEADER_BOTTOM
  const BLOCK_GAP = 28

  // ── Headline (40-50% larger) ──────────────────────────────────────────
  const H_PAD = 60
  const H_USABLE = width - 2 * H_PAD
  const hFontSize = Math.min(76, Math.max(48, Math.floor(720 / Math.sqrt(headline.length + 1)) + 10))
  const H_CHAR_W = hFontSize * 0.56
  const hMaxChars = Math.max(8, Math.floor(H_USABLE / H_CHAR_W))
  const hLines = []
  {
    let line = ''
    for (const w of headline.split(/\s+/)) {
      const candidate = line ? `${line} ${w}` : w
      if (candidate.length > hMaxChars && line) { hLines.push(line); line = w }
      else line = candidate
    }
    if (line) hLines.push(line)
  }
  const H_LINE_H = Math.floor(hFontSize * 1.18)
  const headlineH = hLines.length * H_LINE_H + 18

  const cx = width / 2

  // ── Text wrapping helpers ────────────────────────────────────────────
  function wrapText(text, maxChars) {
    const words = text.split(/\s+/)
    const lines = []
    let line = ''
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (candidate.length > maxChars && line) { lines.push(line); line = w }
      else line = candidate
    }
    if (line) lines.push(line)
    return lines
  }

  // ── Body block (KEY POINTS) — 2× bullet font, box auto-fits content ──
  const bodyBullets = bullets.slice(0, 3)
  const BODY_BULLET_FONT = 38            // 2× the previous 19
  const BODY_PAD_X = 40                  // left/right inner padding
  const BODY_BULLET_PAD_LEFT = 56        // bullet dot + gutter before text
  const BODY_CHAR_W = BODY_BULLET_FONT * 0.56
  // Max text width available if the box spanned the full usable width
  const BODY_MAX_BOX_WIDTH = Math.min(width - 2 * H_PAD, 960)
  const BODY_TEXT_MAX_AVAIL = BODY_MAX_BOX_WIDTH - BODY_PAD_X - BODY_BULLET_PAD_LEFT
  const BODY_MAX_CHARS = Math.max(10, Math.floor(BODY_TEXT_MAX_AVAIL / BODY_CHAR_W))
  const bodyBulletLines = bodyBullets.map(p => wrapText(p, BODY_MAX_CHARS))
  const bodyTotalLines = bodyBulletLines.reduce((a, l) => a + l.length, 0)
  // Snugly fit box WIDTH to the widest rendered line
  const bodyWidestChars = bodyBulletLines.reduce((m, l) => Math.max(m, ...l.map(s => s.length)), 0)
  const BODY_BOX_WIDTH = bodyBullets.length
    ? Math.min(BODY_MAX_BOX_WIDTH, Math.max(360, Math.ceil(bodyWidestChars * BODY_CHAR_W) + BODY_PAD_X + BODY_BULLET_PAD_LEFT))
    : 0
  const BODY_BOX_X = cx - BODY_BOX_WIDTH / 2
  const BODY_BULLET_LINE_H = Math.round(BODY_BULLET_FONT * 1.32)  // line height for 38px text
  const BODY_LABEL_H = 46                 // "KEY POINTS" label band
  const BODY_PAD_Y = 32                   // top + bottom inner padding
  // Snugly fit box HEIGHT: label + all lines (with inter-bullet gap) + padding
  const bodyBulletGaps = Math.max(0, bodyBullets.length - 1)
  const bodyBulletH = bodyBullets.length
    ? BODY_LABEL_H + bodyTotalLines * BODY_BULLET_LINE_H + bodyBulletGaps * 12 + BODY_PAD_Y
    : 0

  // ── Stats grid ────────────────────────────────────────────────────────
  const statCardW = 280, statCardH = 120, statGap = 24
  const statCols = Math.max(1, Math.min(stats.length, 3))
  const statRows = stats.length ? Math.ceil(stats.length / statCols) : 0
  const statTotalW = statCols * statCardW + (statCols - 1) * statGap
  const statStartX = (width - statTotalW) / 2
  const statsH = statRows ? statRows * statCardH + (statRows - 1) * statGap : 0

  // ── CTA / question pill ─────────────────────────────────────────────
  const CTA_FONT = 18
  const CTA_CHAR_W = CTA_FONT * 0.56
  const CTA_PILL_PAD_X = 40
  const CTA_MARGIN_TOP = 16              // extra breathing room above the pill
  const CTA_MAX_PILL_W = Math.min(width - 2 * H_PAD, 760)
  const CTA_MAX_CHARS = Math.max(14, Math.floor((CTA_MAX_PILL_W - 2 * CTA_PILL_PAD_X) / CTA_CHAR_W))
  const ctaLines = cta ? wrapText(cta, CTA_MAX_CHARS) : []
  const ctaLineH = 28
  const CTA_PILL_PAD_Y = 30
  const ctaPillH = ctaLines.length ? ctaLines.length * ctaLineH + CTA_PILL_PAD_Y : 0
  const ctaH = cta ? ctaPillH + CTA_MARGIN_TOP : 0

  // ── ASNEXA brand block (small, subtle, below CTA) ────────────────────
  const asnexaH = 40

  // ── Big Digital FTE logo (inserted below kicker, above headline) ─────
  const BIGLOGO_W = Math.round(Math.min(H_USABLE, 300))
  const BIGLOGO_H = Math.round(BIGLOGO_W * 0.5)
  const HEADLINE_SHIFT_UP = 64 // pull the heading block tight under the logo

  // ── Assemble block order ──────────────────────────────────────────────
  const blocks = []
  blocks.push({ kind: 'kicker', h: 30 })
  if (logoUri) blocks.push({ kind: 'biglogo', h: BIGLOGO_H, gapAfter: BLOCK_GAP - HEADLINE_SHIFT_UP })
  blocks.push({ kind: 'headline', h: headlineH })
  if (bodyBulletH) blocks.push({ kind: 'body', h: bodyBulletH })
  if (statsH) blocks.push({ kind: 'stats', h: statsH })
  if (ctaH) blocks.push({ kind: 'cta', h: ctaH })
  blocks.push({ kind: 'asnexa', h: asnexaH })

  const totalH = blocks.reduce((a, b) => a + b.h, 0)
    + blocks.slice(0, -1).reduce((a, b) => a + (b.gapAfter != null ? b.gapAfter : BLOCK_GAP), 0)
  let cursorY = HEADER_BOTTOM + Math.max(0, (AVAILABLE - totalH) / 2)

  // ── Render blocks ─────────────────────────────────────────────────────
  const parts = []
  for (const block of blocks) {
    if (block.kind === 'kicker') {
      parts.push(`<rect x="${cx - 60}" y="${cursorY}" width="120" height="24" rx="12" fill="${ELECTRIC_TEAL}" opacity="0.9"/>
    <text x="${cx}" y="${cursorY + 17}" fill="${DARK_NAVY}" font-family="'Poppins',sans-serif" font-size="11" font-weight="700" letter-spacing="1.5" text-anchor="middle">${kicker}</text>`)
    } else if (block.kind === 'biglogo') {
      parts.push(`<image href="${logoUri}" xlink:href="${logoUri}" x="${cx - BIGLOGO_W / 2}" y="${cursorY}" width="${BIGLOGO_W}" height="${BIGLOGO_H}" preserveAspectRatio="xMidYMid meet"/>`)
    } else if (block.kind === 'headline') {
      const lines = hLines.map((ln, i) =>
        `<text x="${cx}" y="${cursorY + hFontSize + i * H_LINE_H}" fill="${WHITE}" font-family="'Poppins','Inter',sans-serif" font-size="${hFontSize}" font-weight="700" letter-spacing="-0.5" text-anchor="middle">${escapeXml(ln)}</text>`
      ).join('\n    ')
      parts.push(`<g filter="url(#glow)">
    ${lines}
  </g>`)
    } else if (block.kind === 'body') {
      parts.push(`<rect x="${BODY_BOX_X}" y="${cursorY}" width="${BODY_BOX_WIDTH}" height="${bodyBulletH}" rx="18" fill="rgba(255,255,255,0.04)" stroke="rgba(0,201,167,0.15)" stroke-width="1"/>
    <text x="${BODY_BOX_X + BODY_PAD_X}" y="${cursorY + 34}" fill="${ELECTRIC_TEAL}" font-family="'Poppins',sans-serif" font-size="16" font-weight="700" letter-spacing="1.4">KEY POINTS</text>`)
      // baseline of the first bullet line, below the label band
      let runY = cursorY + BODY_LABEL_H + Math.round(BODY_BULLET_FONT * 0.82)
      bodyBulletLines.forEach((lines, bi) => {
        lines.forEach((ln, li) => {
          if (li === 0) {
            parts.push(`<circle cx="${BODY_BOX_X + BODY_PAD_X + 8}" cy="${runY - Math.round(BODY_BULLET_FONT * 0.32)}" r="8" fill="${LINKEDIN_BLUE}"/>`)
          }
          const indent = BODY_BOX_X + BODY_PAD_X + BODY_BULLET_PAD_LEFT - (li === 0 ? 0 : 0)
          parts.push(`<text x="${indent}" y="${runY}" fill="${LIGHT}" font-family="'Inter',sans-serif" font-size="${BODY_BULLET_FONT}" font-weight="500">${escapeXml(ln)}</text>`)
          runY += BODY_BULLET_LINE_H
        })
        if (bi < bodyBulletLines.length - 1) runY += 12
      })
    } else if (block.kind === 'stats') {
      parts.push(stats.map((stat, i) => {
        const col = i % statCols, row = Math.floor(i / statCols)
        const sx = statStartX + col * (statCardW + statGap)
        const sy = cursorY + row * (statCardH + statGap)
        return `<g filter="url(#cardShadow)">
      <rect x="${sx}" y="${sy}" width="${statCardW}" height="${statCardH}" rx="14" fill="url(#metricFill)"/>
      <rect x="${sx}" y="${sy}" width="${statCardW}" height="${statCardH}" rx="14" stroke="${ELECTRIC_TEAL}" stroke-width="1.5" stroke-opacity="0.4" fill="none"/>
      <rect x="${sx}" y="${sy}" width="5" height="${statCardH}" rx="2.5" fill="${ELECTRIC_TEAL}"/>
      <text x="${sx + statCardW / 2}" y="${sy + 50}" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="32" font-weight="700" text-anchor="middle">${escapeXml(stat.value || '—')}</text>
      <text x="${sx + statCardW / 2}" y="${sy + 86}" fill="${DIM}" font-family="'Inter',sans-serif" font-size="14" letter-spacing="0.3" text-anchor="middle">${escapeXml(stat.label || '')}</text>
    </g>`
      }).join('\n    '))
    } else if (block.kind === 'cta') {
      const pillY = cursorY + CTA_MARGIN_TOP   // 16px margin-top above the pill
      const widestCta = ctaLines.reduce((m, l) => Math.max(m, l.length), 0)
      const pillW = Math.min(CTA_MAX_PILL_W, Math.max(320, Math.ceil(widestCta * CTA_CHAR_W) + 2 * CTA_PILL_PAD_X))
      const pillX = cx - pillW / 2
      // Solid dark-navy pill, teal border + soft drop shadow for strong contrast
      parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${ctaPillH}" rx="${ctaPillH / 2}" fill="#08233D" stroke="${ELECTRIC_TEAL}" stroke-width="2" filter="url(#ctaGlow)"/>`)
      const firstBaseline = pillY + CTA_PILL_PAD_Y / 2 + CTA_FONT
      ctaLines.forEach((ln, i) => {
        const lineY = firstBaseline + i * ctaLineH
        parts.push(`<text x="${cx}" y="${lineY}" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="${CTA_FONT}" font-weight="700" text-anchor="middle">${escapeXml(ln)}</text>`)
      })
    } else if (block.kind === 'asnexa') {
      if (brandLogoUri) {
        parts.push(`<image href="${brandLogoUri}" xlink:href="${brandLogoUri}" x="${cx - 60}" y="${cursorY}" width="120" height="${asnexaH - 4}" preserveAspectRatio="xMidYMid meet" opacity="0.5"/>`)
      } else {
        parts.push(`<text x="${cx}" y="${cursorY + 16}" fill="${DIM}" font-family="'Poppins',sans-serif" font-size="12" font-weight="500" text-anchor="middle" letter-spacing="3" opacity="0.5">ASNEXA</text>`)
      }
    }
    cursorY += block.h + (block.gapAfter != null ? block.gapAfter : BLOCK_GAP)
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${DARK_NAVY}"/>
      <stop offset="40%" stop-color="#0F2440"/>
      <stop offset="100%" stop-color="${DARKER}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="30%" cy="25%">
      <stop offset="0%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${LINKEDIN_BLUE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="70%" cy="70%">
      <stop offset="0%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${ELECTRIC_TEAL}"/>
      <stop offset="100%" stop-color="${ELECTRIC_TEAL}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0066FF"/>
      <stop offset="50%" stop-color="#00E5A0"/>
      <stop offset="100%" stop-color="#7C4DFF"/>
    </linearGradient>
    <linearGradient id="metricFill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(10,102,194,0.25)"/>
      <stop offset="100%" stop-color="rgba(0,201,167,0.12)"/>
    </linearGradient>
    <filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="${DARKER}" flood-opacity="0.6"/></filter>
    <filter id="cardShadow"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="${DARKER}" flood-opacity="0.45"/></filter>
    <filter id="ctaGlow"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.3"/></filter>
    <!-- Circuit/network pattern overlay -->
    <pattern id="circuitGrid" width="120" height="120" patternUnits="userSpaceOnUse">
      <rect width="120" height="120" fill="none"/>
      <path d="M 0 60 L 30 60 L 50 40 L 70 60 L 120 60" stroke="rgba(0,201,167,0.06)" stroke-width="0.5" fill="none"/>
      <path d="M 60 0 L 60 30 L 40 50 L 60 70 L 60 120" stroke="rgba(10,102,194,0.06)" stroke-width="0.5" fill="none"/>
      <circle cx="50" cy="40" r="2" fill="rgba(0,201,167,0.1)"/>
      <circle cx="70" cy="60" r="3" fill="rgba(10,102,194,0.08)"/>
      <circle cx="40" cy="50" r="1.5" fill="rgba(0,201,167,0.08)"/>
      <circle cx="60" cy="30" r="1.5" fill="rgba(10,102,194,0.08)"/>
      <circle cx="30" cy="60" r="2" fill="rgba(0,201,167,0.06)"/>
    </pattern>
  </defs>

  <!-- Background layers -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#circuitGrid)"/>
  <rect width="${width}" height="${height}" fill="url(#glow1)"/>
  <rect width="${width}" height="${height}" fill="url(#glow2)"/>

  <!-- Top bar — wider, bolder gradient accent -->
  <rect x="0" y="0" width="${width}" height="8" fill="url(#topbar)"/>

  <!-- Header row — all elements aligned on the same horizontal band (moved 10px down) ── -->
  <rect x="50" y="32" width="46" height="46" rx="12" fill="${ELECTRIC_TEAL}"/>
  <text x="73" y="62" fill="${DARK_NAVY}" font-family="'Poppins',sans-serif" font-size="26" font-weight="700" text-anchor="middle">D</text>
  <text x="110" y="62" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="22" font-weight="700" letter-spacing="-0.3">Digital FTE</text>

  <!-- AI TRENDS badge (top right) ──────────────────────────────────── -->
  <rect x="${width - 180}" y="26" width="130" height="38" rx="19" fill="rgba(0,201,167,0.12)" stroke="${ELECTRIC_TEAL}" stroke-width="1.5"/>
  <circle cx="${width - 168}" cy="45" r="4" fill="#00E5A0"/>
  <text x="${width - 157}" y="50" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="12" font-weight="700" letter-spacing="1.5">AI TRENDS</text>

  <!-- ASNEXA brand logo (top right, left of AI TRENDS badge) — moved 10px down + ~35% larger ── -->
  ${brandLogoUri
    ? `<image href="${brandLogoUri}" xlink:href="${brandLogoUri}" x="${width - 360}" y="30" width="160" height="48" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${width - 200}" y="62" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="24" font-weight="700" letter-spacing="2" text-anchor="end">ASNEXA</text>`}

  <!-- Flowing content -->
  ${parts.join('\n  ')}

  <!-- Bottom bar - rebalanced spacing (content shifted UP 10px, larger fonts) -->
  <rect x="0" y="${height - 110}" width="${width}" height="110" fill="${DARKER}" fill-opacity="0.6"/>
  <rect x="50" y="${height - 112}" width="160" height="3" rx="1.5" fill="url(#accent)"/>
  <text x="50" y="${height - 70}" fill="${WHITE}" font-family="'Poppins',sans-serif" font-size="21" font-weight="600">Follow for more</text>
  <text x="50" y="${height - 44}" fill="${DIM}" font-family="'Inter',sans-serif" font-size="16">Digital Transformation  ·  AI  ·  Innovation</text>
  <text x="${width - 50}" y="${height - 70}" fill="${DIM}" font-family="'Inter',sans-serif" font-size="15" text-anchor="end" letter-spacing="0.5">Digital FTE Insights</text>
  <text x="${width - 50}" y="${height - 44}" fill="${DIM}" font-family="'Inter',sans-serif" font-size="13" text-anchor="end" opacity="0.6">Follow for daily tech insights</text>

  <!-- Corner brackets (slightly stronger) -->
  <g stroke="${ELECTRIC_TEAL}" stroke-width="1.5" fill="none" opacity="0.3">
    <path d="M 30 30 L 30 60 M 30 30 L 60 30"/>
    <path d="M ${width-30} 30 L ${width-30} 60 M ${width-30} 30 L ${width-60} 30"/>
    <path d="M 30 ${height-30} L 30 ${height-60} M 30 ${height-30} L 60 ${height-30}"/>
    <path d="M ${width-30} ${height-30} L ${width-30} ${height-60} M ${width-30} ${height-30} L ${width-60} ${height-30}"/>
  </g>
</svg>`

  fs.mkdirSync(GENERATED_DIR, { recursive: true })
  const filename = `branded_${Date.now()}.png`
  const destPath = path.join(GENERATED_DIR, filename)

  try {
    const { default: sharp } = await import('sharp')
    await sharp(Buffer.from(svg))
      .resize(width, height, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .png({ quality: 98 })
      .toFile(destPath)
    console.log(`[ImageGen] Branded template image: ${filename}`)
  } catch (e) {
    const svgPath = path.join(GENERATED_DIR, `branded_${Date.now()}.svg`)
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
  // 1. Branded template with structured content from post body
  if (postContent) {
    try {
      return await generateCanvaStyleImage(topic, postContent)
    } catch (e) {
      console.warn(`[ImageGen] Branded template skipped: ${e.message} — falling through to photo modes`)
    }
  }

  // 2. Premium LinkedIn Design (no content, just topic)
  try {
    return await generatePremiumDesignImage(topic)
  } catch (e) {
    console.warn('[ImageGen] Premium design failed:', e.message)
  }

  // 3. Pollinations AI — topic-relevant photo images
  try {
    console.log('[ImageGen] Falling back to Pollinations AI photo mode')
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
