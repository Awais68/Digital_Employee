export async function generatePostImage(topic, style = 'professional') {
  const prompt = encodeURIComponent(
    `${topic}, professional social media image, modern design, ` +
    `clean background, high quality, 4K, no text, no watermark, ${style}`
  )
  const seed  = Math.floor(Math.random() * 99999)
  const url   = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&seed=${seed}&nologo=true`

  console.log('[ImageGen] Generated Pollinations URL:', url.substring(0, 100))

  try {
    const fetch = (await import('node-fetch')).default
    const check = await fetch(url, { method: 'HEAD', timeout: 10000 })
    if (!check.ok) throw new Error(`Status ${check.status}`)
    console.log('[ImageGen] URL verified OK')
  } catch (e) {
    console.warn('[ImageGen] URL check failed:', e.message, '(will try anyway)')
  }

  return url
}

export async function generateImage(prompt) {
  return generatePostImage(prompt)
}
