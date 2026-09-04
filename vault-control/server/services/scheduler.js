import cron from 'node-cron'
import path from 'path'
import { query } from '../database/connection.js'
import { createNotification } from './notificationService.js'
import { sendMessage, getStatus } from './whatsappService.js'

const OWNER_WHATSAPP = process.env.OWNER_PHONE || '923XXXXXXXXX'

// ─── Todo reminders ────────────────────────────────────────────────────────
// Moved to services/dueScheduler.js. This used to be `cron.schedule('* * * * *')`,
// i.e. a DB query every 60 seconds, which alone kept the Neon compute from ever
// scaling to zero. Reminders now fire on an exact-time timer with the same
// latency and near-zero idle cost. Do not add a minute-cron back here.

// ═══════════════════════════════════════════════════════════════════════════
// STRICT DAILY POSTING RULE:
//   - EXACTLY ONE post per day. Not a minimum — a hard ceiling.
//   - That one post is generated ONCE and broadcast to LinkedIn + Facebook +
//     Instagram, so the whole day costs a single research/generation call plus
//     a single image. The old 3-slots x 3-platforms layout burned nine LLM
//     generations a day and is what exhausted the Groq TPM quota.
//   - Because it is the only post of the day it has to earn attention: the
//     generator is asked for an eye-catching hook (see postGenerator.js).
//   - Web research with VERIFIED sources + AI-generated image still required.
//   - One catch-up window only, and it re-checks the same hard ceiling.
// ═══════════════════════════════════════════════════════════════════════════

const DAILY_SLOT = { label: 'daily', hour: 10, cron: '0 10 * * *' }
const POST_PLATFORMS = ['linkedin', 'facebook', 'instagram']

cron.schedule(DAILY_SLOT.cron, async () => {
  console.log('[Scheduler] daily slot — generating the one post for today')
  await generateAndSchedulePost(DAILY_SLOT.label)
})

// Single catch-up, 3h after the slot. Anything more is another Neon query and
// another chance to double-post; the ceiling check below makes it a no-op on a
// normal day anyway.
cron.schedule('0 13 * * *', async () => {
  console.log('[Scheduler] catch-up window — checking if today has a post')
  await generateAndSchedulePost('catch-up')
})

// The hard ceiling. Every path into generation goes through here, so neither the
// slot cron, the catch-up, nor a manual trigger can produce a second day's worth
// of posts. Counts rows rather than trusting an in-memory flag: the process
// restarts (PM2 cron_restart) and an in-memory flag would reset with it.
// Configurable only so an operator can raise it deliberately; the default is the
// rule, and nothing in the codebase writes this value.
const MAX_POSTS_PER_DAY = Math.max(1, parseInt(process.env.MAX_POSTS_PER_DAY || '1', 10) || 1)

async function postsCreatedToday() {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM scheduled_posts WHERE created_at::date = CURRENT_DATE`
  )
  return r.rows[0].n
}

// Pick a topic not yet used today (strict different-topic rule)
async function pickFreshTopic() {
  const { DEFAULT_TOPICS } = await import('./postGenerator.js')
  let usedToday = []
  try {
    const r = await query(
      `SELECT DISTINCT topic FROM scheduled_posts WHERE created_at::date = CURRENT_DATE`
    )
    usedToday = r.rows.map(x => (x.topic || '').toLowerCase())
  } catch {}

  const fresh = DEFAULT_TOPICS.filter(t => !usedToday.includes(t.toLowerCase()))
  const pool = fresh.length > 0 ? fresh : DEFAULT_TOPICS
  return pool[Math.floor(Math.random() * pool.length)]
}

async function generateAndSchedulePost(timeSlot) {
  try {
    // Hard ceiling first, before any LLM or image call is made.
    let already
    try {
      already = await postsCreatedToday()
    } catch (e) {
      // Can't prove the day is empty => don't post. Failing closed costs one
      // skipped day; failing open costs quota and a duplicate feed.
      console.error(`[Scheduler] [${timeSlot}] Could not verify daily count (${e.message}) — skipping to stay under the 1/day rule`)
      return
    }
    // One DB row per platform, so the day's single post counts as POST_PLATFORMS.length.
    if (already >= MAX_POSTS_PER_DAY * POST_PLATFORMS.length) {
      console.log(`[Scheduler] [${timeSlot}] Skipped — ${already} row(s) already created today (limit is ${MAX_POSTS_PER_DAY} post/day)`)
      return
    }

    const topic = await pickFreshTopic()
    console.log(`[Scheduler] [${timeSlot}] Generating today's single post — topic: ${topic}`)

    const { researchAndGeneratePost } = await import('./postGenerator.js')
    const { generatePostImage } = await import('./imageGenerator.js')

    // ONE research/generation call and ONE image for the whole day. The copy is
    // reused across platforms instead of regenerating per platform — that per-
    // platform loop was 3x the token spend for near-identical text.
    let postData, imageUrl = null
    try {
      postData = await researchAndGeneratePost(topic, 'linkedin', 1, { soloDaily: true })
      imageUrl = await generatePostImage(postData.imagePrompt || topic)
    } catch (genErr) {
      console.error(`[Scheduler] [${timeSlot}] Generation error:`, genErr.message)
      return
    }

    for (const platform of POST_PLATFORMS) {
      try {
        await insertPendingPost(topic, platform, postData, imageUrl)
      } catch (insErr) {
        console.error(`[Scheduler] [${timeSlot}] Insert failed for ${platform}:`, insErr.message)
      }
    }

    createNotification('info', '📱 Today\'s Post Ready for Approval',
      `Your 1 post for today (${POST_PLATFORMS.join(', ')}) about "${topic}" needs approval`,
      { topic, platforms: POST_PLATFORMS, timeSlot })

    if (getStatus() === 'connected') {
      await sendMessage(OWNER_WHATSAPP,
        `📱 *Today's Post Ready (${timeSlot})*\n\nPlatforms: ${POST_PLATFORMS.map(p => p.toUpperCase()).join(', ')}\nTopic: ${topic}\n\nPlease approve in dashboard.`
      ).catch(() => {})
    }
  } catch (e) {
    console.error('[Scheduler] Auto-post error:', e.message)
  }
}

async function insertPendingPost(topic, platform, postData, imageUrl) {
  await query(`
    INSERT INTO scheduled_posts(topic, platform, content, image_url, scheduled_for, status, hashtags, mentions)
    VALUES($1,$2,$3,$4,$5,'pending_approval',$6,$7)
  `, [
    topic, platform, postData.content, imageUrl, new Date(),
    JSON.stringify(postData.hashtags || []),
    JSON.stringify(postData.mentions || []),
  ])
  console.log(`[Scheduler] ${platform} post queued (verified sources: ${postData.verifiedSourceCount ?? 0})`)
}

cron.schedule('0 10 * * *', async () => {
  if (getStatus() !== 'connected') return

  const { DEFAULT_TOPICS } = await import('./postGenerator.js')
  const shuffled = [...DEFAULT_TOPICS].sort(() => Math.random() - 0.5)
  const todayTopics = shuffled.slice(0, 3)
  const msg = `🌅 *Good Morning!*\n\n*Digital FTE — Daily Topics*\n\n` +
    todayTopics.map((t, i) => `${i + 1}. ${t}`).join('\n') +
    `\n\nReply with a number or type your own topic.\nOne post per day, auto-generated at 10 AM (LinkedIn + Facebook + Instagram).`

  try {
    await sendMessage(OWNER_WHATSAPP, msg)
    console.log('[Scheduler] Morning WhatsApp notification sent')
  } catch (e) {
    console.error('[Scheduler] Morning WA failed:', e.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY CEO BRIEFING — Every Monday at 10:00
// ═══════════════════════════════════════════════════════════════════════════
cron.schedule('0 10 * * 1', async () => {
  console.log('[Scheduler] Weekly CEO Briefing — generating and sending...')
  try {
    const { execSync } = await import('child_process')
    const scriptPath = process.env.VAULT_PATH
      ? path.join(process.env.VAULT_PATH, 'weekly_ceo_briefing.py')
      : path.join(process.cwd(), '..', 'weekly_ceo_briefing.py')
    execSync(`python3 "${scriptPath}"`, {
      timeout: 180000,
      env: { ...process.env, DRY_RUN: process.env.DRY_RUN || 'false' },
    })
    console.log('[Scheduler] Weekly CEO Briefing sent')
  } catch (e) {
    console.error('[Scheduler] CEO Briefing error:', e.message)
  }
})

console.log('[Scheduler] All cron jobs started')
export default {}
