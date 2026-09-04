// ═══════════════════════════════════════════════════════════════════════════
// POST POLICY — the two rules that decide how a post is allowed to look.
//
// 1. IMAGE ROTATION. "Every post must have an image" is itself a pattern, and a
//    perfectly regular feed is one of the cheapest signals an automated account
//    gives off. The owner's cadence — 2 with, 1 without, 1 with, 2 without —
//    breaks that regularity while keeping images in the majority.
//    The counter lives in admin_settings so it survives restarts; a rotation
//    that resets to 0 on every deploy is not a rotation.
//
// 2. HASHTAG CLAMP. When one caption is published to several platforms it must
//    satisfy the strictest of them. Erroring out ("Too many hashtags (8/5)") put
//    the burden on the human for something the machine can simply fix, so the
//    extras are trimmed from the end instead.
// ═══════════════════════════════════════════════════════════════════════════

import { query } from '../database/connection.js'

// true = this slot gets an image. Read it as: image, image, none, image, none, none.
export const IMAGE_PATTERN = [true, true, false, true, false, false]
const ROTATION_KEY = 'image_rotation_index'

export function imageDecisionAt(index) {
  return IMAGE_PATTERN[((index % IMAGE_PATTERN.length) + IMAGE_PATTERN.length) % IMAGE_PATTERN.length]
}

async function readIndex() {
  try {
    const r = await query(`SELECT value FROM admin_settings WHERE key=$1`, [ROTATION_KEY])
    return parseInt(r.rows[0]?.value || '0', 10) || 0
  } catch {
    return 0
  }
}

async function writeIndex(i) {
  try {
    await query(
      `INSERT INTO admin_settings(key, value, last_updated) VALUES($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, last_updated=NOW()`,
      [ROTATION_KEY, String(i)]
    )
  } catch (e) {
    console.warn('[PostPolicy] Could not persist rotation index:', e.message)
  }
}

/**
 * Decide whether the next N posts carry an image, and advance the counter.
 * Returns one boolean per post so a batch stays in phase with the pattern.
 */
export async function nextImageDecisions(count = 1) {
  const start = await readIndex()
  const decisions = []
  for (let i = 0; i < count; i++) decisions.push(imageDecisionAt(start + i))
  await writeIndex((start + count) % (IMAGE_PATTERN.length * 1000))
  console.log(`[PostPolicy] Image rotation from #${start}: ${decisions.map(d => (d ? 'IMG' : '—')).join(' ')}`)
  return decisions
}

/** Where the rotation currently stands, without moving it. */
export async function peekRotation() {
  const i = await readIndex()
  return { index: i, pattern: IMAGE_PATTERN, next: imageDecisionAt(i) }
}

// ─── Hashtags ──────────────────────────────────────────────────────────────

export const PLATFORM_HASHTAG_MAX = {
  linkedin: 5,
  facebook: 5,
  instagram: 15,
  twitter: 3,
}

/** The strictest limit across the platforms this caption will be posted to. */
export function effectiveHashtagMax(platforms) {
  const list = (Array.isArray(platforms) ? platforms : [platforms]).filter(Boolean)
  const limits = list.map(p => PLATFORM_HASHTAG_MAX[String(p).toLowerCase()]).filter(Number.isFinite)
  return limits.length ? Math.min(...limits) : 5
}

/**
 * Trim hashtags down to `max`, keeping the first ones — those are the ones the
 * model chose as most relevant, and trailing tags are usually the filler.
 * Inline hashtags (mid-sentence) are kept and counted; only surplus tags are
 * removed, never the words around them.
 */
export function clampHashtags(content, max) {
  if (!content) return content
  const tags = content.match(/#[\w؀-ۿ]+/g) || []
  if (tags.length <= max) return content

  let seen = 0
  const trimmed = content.replace(/#[\w؀-ۿ]+/g, (tag) => {
    seen += 1
    return seen <= max ? tag : ''
  })
  // Removing trailing tags leaves runs of blank space behind.
  return trimmed.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** Convenience: clamp for a set of platforms in one call. */
export function clampForPlatforms(content, platforms) {
  return clampHashtags(content, effectiveHashtagMax(platforms))
}

export default {
  IMAGE_PATTERN, imageDecisionAt, nextImageDecisions, peekRotation,
  effectiveHashtagMax, clampHashtags, clampForPlatforms,
}
