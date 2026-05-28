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

cron.schedule('0 10 * * *', async () => {
  console.log('[Scheduler] 10 AM — Generating morning social post')
  await generateAndSchedulePost('morning')
})

cron.schedule('0 19 * * *', async () => {
  console.log('[Scheduler] 7 PM — Generating evening social post')
  await generateAndSchedulePost('evening')
})

const TOPICS = [
  'Software Engineering best practices 2025',
  'Agentic AI and Automation trends',
  'Web Development with modern frameworks',
  'Large Language Models practical applications',
  'Latest AI tools for developers'
]
let topicIndex = 0

async function generateAndSchedulePost(timeSlot) {
  try {
    const topic = TOPICS[topicIndex % TOPICS.length]
    topicIndex++

    console.log(`[Scheduler] Auto-generating post for topic: ${topic}`)

    const platforms = ['linkedin', 'facebook']
    const platform = platforms[Math.floor(Math.random() * platforms.length)]

    const { researchAndGeneratePost } = await import('./postGenerator.js')
    const postData = await researchAndGeneratePost(topic, platform, 1)

    await query(`
      INSERT INTO scheduled_posts(topic, platform, content, scheduled_for, status, hashtags)
      VALUES($1,$2,$3,$4,'pending_approval',$5)
    `, [topic, platform, postData.content, new Date(), JSON.stringify(postData.hashtags)])

    createNotification('info', '📱 Post Ready for Approval',
      `${platform} post about "${topic}" needs your approval`, { topic, platform })

    if (getStatus() === 'connected') {
      await sendMessage(OWNER_WHATSAPP,
        `📱 *New Post Ready*\n\nPlatform: ${platform.toUpperCase()}\nTopic: ${topic}\n\nPlease approve in dashboard.`
      ).catch(() => {})
    }
  } catch (e) {
    console.error('[Scheduler] Auto-post error:', e.message)
  }
}

cron.schedule('0 10 * * *', async () => {
  if (getStatus() !== 'connected') return

  const todayTopics = TOPICS.slice(0, 3)
  const msg = `🌅 *Good Morning!*\n\n*Digital FTE — Daily Topics*\n\n` +
    todayTopics.map((t, i) => `${i + 1}. ${t}`).join('\n') +
    `\n\nReply with a number or type your own topic.\nPosts will auto-generate at 10 AM & 7 PM.`

  try {
    await sendMessage(OWNER_WHATSAPP, msg)
    console.log('[Scheduler] Morning WhatsApp notification sent')
  } catch (e) {
    console.error('[Scheduler] Morning WA failed:', e.message)
  }
})

console.log('[Scheduler] All cron jobs started')
export default {}
