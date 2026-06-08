import cron from 'node-cron'
import { query } from '../database/connection.js'
import { createNotification } from './notificationService.js'
import { sendMessage, getStatus } from './whatsappService.js'

const OWNER_WHATSAPP = process.env.OWNER_PHONE || '923XXXXXXXXX'

cron.schedule('* * * * *', async () => {
  try {
    const result = await query(`
      SELECT * FROM todos 
      WHERE reminder_at <= NOW() 
        AND reminder_at > NOW() - INTERVAL '24 hours'
        AND status = 'pending'
        AND (notification_sent = false OR notification_sent IS NULL)
    `)
    
    for (const todo of result.rows) {
      createNotification(
        'warning',
        `⏰ Reminder: ${todo.title}`,
        todo.description || 'Task due now',
        { todoId: todo.id }
      )
      
      if (getStatus() === 'connected') {
        await sendMessage(OWNER_WHATSAPP,
          `⏰ *Task Reminder*\n\n*${todo.title}*\n${todo.description || ''}\n\nPriority: ${todo.priority.toUpperCase()}`
        ).catch(e => console.error('WA reminder failed:', e.message))
      }
      
      await query(`UPDATE todos SET notification_sent=true WHERE id=$1`, [todo.id])
      
      if (todo.recurrence && todo.recurrence !== 'none') {
        const nextDate = getNextRecurrence(todo.recurrence, new Date(todo.reminder_at))
        await query(
          `UPDATE todos SET reminder_at=$1, notification_sent=false WHERE id=$2`,
          [nextDate, todo.id]
        )
      }
    }
  } catch (e) {
    console.error('[Scheduler] Reminder check error:', e.message)
  }
})

function getNextRecurrence(type, fromDate) {
  const next = new Date(fromDate)
  switch (type) {
    case 'daily':   next.setDate(next.getDate() + 1); break
    case 'weekly':  next.setDate(next.getDate() + 7); break
    case 'monthly': next.setMonth(next.getMonth() + 1); break
  }
  return next
}

// ═══════════════════════════════════════════════════════════════════════════
// STRICT DAILY POSTING RULE:
//   - Minimum 3 posts per day, each at a different time slot
//   - Each slot uses a DIFFERENT topic (no topic repeats within a day)
//   - Each post goes to LinkedIn + Facebook + Instagram
//   - Every post has web research with VERIFIED sources + AI-generated image
//   - Missed slots are caught up by an hourly check
// ═══════════════════════════════════════════════════════════════════════════

const DAILY_SLOTS = [
  { label: 'morning',   hour: 10, cron: '0 10 * * *' },
  { label: 'afternoon', hour: 14, cron: '30 14 * * *' },
  { label: 'evening',   hour: 19, cron: '0 19 * * *' },
]
const POST_PLATFORMS = ['linkedin', 'facebook', 'instagram']

for (const slot of DAILY_SLOTS) {
  cron.schedule(slot.cron, async () => {
    console.log(`[Scheduler] ${slot.label} slot — generating multi-platform posts`)
    await generateAndSchedulePost(slot.label)
  })
}

// Catch-up: every hour at :45, check if any past slot today produced no posts
cron.schedule('45 * * * *', async () => {
  try {
    const nowHour = new Date().getHours()
    for (const slot of DAILY_SLOTS) {
      if (slot.hour > nowHour) continue
      const done = await query(`
        SELECT COUNT(*) FROM scheduled_posts
        WHERE created_at::date = CURRENT_DATE
          AND EXTRACT(HOUR FROM created_at) >= $1
          AND EXTRACT(HOUR FROM created_at) < $1 + 2
      `, [slot.hour]).catch(() => null)
      if (done && parseInt(done.rows[0].count) === 0) {
        console.log(`[Scheduler] Catch-up: ${slot.label} slot missed — generating now`)
        await generateAndSchedulePost(slot.label)
      }
    }
  } catch (e) {
    console.error('[Scheduler] Catch-up check error:', e.message)
  }
})

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
    const topic = await pickFreshTopic()
    console.log(`[Scheduler] [${timeSlot}] Auto-generating posts for topic: ${topic}`)

    const { researchAndGeneratePost } = await import('./postGenerator.js')
    const { generatePostImage } = await import('./imageGenerator.js')

    // Generate ONE image for the topic, shared across platforms
    let imageUrl = null
    try {
      const probe = await researchAndGeneratePost(topic, 'linkedin', 1)
      imageUrl = await generatePostImage(probe.imagePrompt || topic)
      // Insert the LinkedIn post we already generated
      await insertPendingPost(topic, 'linkedin', probe, imageUrl)

      // Then the remaining platforms with platform-tuned copy
      for (const platform of POST_PLATFORMS.slice(1)) {
        const postData = await researchAndGeneratePost(topic, platform, 1)
        await insertPendingPost(topic, platform, postData, imageUrl)
      }
    } catch (genErr) {
      console.error(`[Scheduler] [${timeSlot}] Generation error:`, genErr.message)
      return
    }

    createNotification('info', '📱 Posts Ready for Approval',
      `${POST_PLATFORMS.length} posts (${POST_PLATFORMS.join(', ')}) about "${topic}" need your approval`,
      { topic, platforms: POST_PLATFORMS, timeSlot })

    if (getStatus() === 'connected') {
      await sendMessage(OWNER_WHATSAPP,
        `📱 *New Posts Ready (${timeSlot})*\n\nPlatforms: ${POST_PLATFORMS.map(p => p.toUpperCase()).join(', ')}\nTopic: ${topic}\n\nPlease approve in dashboard.`
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
    `\n\nReply with a number or type your own topic.\nPosts auto-generate at 10 AM, 2:30 PM & 7 PM (LinkedIn + Facebook + Instagram).`

  try {
    await sendMessage(OWNER_WHATSAPP, msg)
    console.log('[Scheduler] Morning WhatsApp notification sent')
  } catch (e) {
    console.error('[Scheduler] Morning WA failed:', e.message)
  }
})

console.log('[Scheduler] All cron jobs started')
export default {}
