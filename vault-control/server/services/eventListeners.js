import { bus, EVENTS } from './eventBus.js'
import { notify }      from './notificationService.js'
import { query }       from '../database/connection.js'
import path            from 'path'
import fs              from 'fs'

const VAULT_PATH = process.env.VAULT_PATH || process.cwd()
const OWNER_PHONE = process.env.OWNER_PHONE || ''

export function startEventListeners() {
  console.log('[EventListeners] Starting...')

  bus.on(EVENTS.EMAIL_NEW, async (email) => {
    console.log('[EventListeners] New email:', email.subject)

    notify(
      email.priority === 'high' ? 'urgent' : 'info',
      `${email.priority === 'high' ? 'URGENT ' : ''}Email: ${email.subject?.substring(0,50)}`,
      `From: ${email.sender}`,
      { source: 'email', emailId: email.id, priority: email.priority }
    )

    if (email.priority === 'high' && OWNER_PHONE) {
      try {
        const { sendMessage, getStatus } = await import('./whatsappService.js')
        if (getStatus() === 'connected') {
          await sendMessage(OWNER_PHONE,
            `URGENT EMAIL\n\nFrom: ${email.sender}\nSubject: ${email.subject}\n\nCheck dashboard for action.`
          )
          console.log('[EventListeners] WhatsApp notification sent for urgent email')
        }
      } catch (e) {
        console.warn('[EventListeners] WA notification failed:', e.message)
      }
    }

    if (email.requires_action) {
      try {
        await query(
          `INSERT INTO todos(title, description, source, source_id, priority)
           VALUES($1,$2,'email',$3,$4)
           ON CONFLICT DO NOTHING`,
          [
            `Reply: ${email.subject?.substring(0,80)}`,
            `From: ${email.sender}\n\n${email.body?.substring(0,300)}`,
            email.id,
            email.priority === 'high' ? 'high' : 'medium'
          ]
        )
        bus.emit(EVENTS.TODO_CREATED, {
          title:  `Reply: ${email.subject}`,
          source: 'email'
        })
        notify('info', 'Task Created', `Reply to: ${email.subject?.substring(0,50)}`)
      } catch (e) {
        console.warn('[EventListeners] Todo creation failed:', e.message)
      }
    }

    if (email.priority === 'high' && email.draft_reply) {
      try {
        const filename = `EMAIL_REPLY_${Date.now()}.md`
        const filePath = path.join(VAULT_PATH, 'Pending_Approval', filename)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, `---
type: email_reply
to: ${email.sender}
subject: Re: ${email.subject}
priority: high
status: pending_approval
action: send_email
created: ${new Date().toISOString()}
---

## Proposed Reply

${email.draft_reply}

---
Move to /Approved/ to send.
`)
        notify('warning', 'Approval Needed', `Reply draft ready for: ${email.subject?.substring(0,50)}`)
        global.wsBroadcast?.({
          type:    'approval:new',
          title:   `Email reply: ${email.subject}`,
          file:    filename,
        })
      } catch (e) {
        console.warn('[EventListeners] Draft creation failed:', e.message)
      }
    }
  })

  bus.on(EVENTS.WA_MESSAGE, async (msg) => {
    const KEYWORDS = ['urgent', 'asap', 'invoice', 'payment', 'help', 'required', 'meeting']
    const isImportant = KEYWORDS.some(k => msg.body?.toLowerCase().includes(k))

    if (isImportant) {
      try {
        await query(
          `INSERT INTO todos(title, description, source, source_id, priority)
           VALUES($1,$2,'whatsapp',$3,$4)`,
          [
            `WhatsApp: ${msg.body?.substring(0,60)}`,
            `From: ${msg.contact}\n${msg.body}`,
            msg.id,
            msg.body?.toLowerCase().includes('urgent') ? 'high' : 'medium'
          ]
        )
        bus.emit(EVENTS.TODO_CREATED, {
          title:  `WhatsApp: ${msg.body?.substring(0,40)}`,
          source: 'whatsapp'
        })
        notify('warning', 'Task from WhatsApp', msg.body?.substring(0,80))
      } catch (e) {
        console.warn('[EventListeners] WA todo creation failed:', e.message)
      }
    }
  })

  bus.on(EVENTS.TODO_CREATED, (todo) => {
    global.wsBroadcast?.({ type: 'todo:new', todo })
  })

  bus.on(EVENTS.POST_PUBLISHED, (post) => {
    notify('success',
      `Posted on ${post.platform?.toUpperCase()}!`,
      post.url ? `View: ${post.url}` : 'Post published successfully',
      { platform: post.platform, url: post.url }
    )
  })

  bus.on(EVENTS.POST_FAILED, (post) => {
    notify('error',
      `Post Failed on ${post.platform?.toUpperCase()}`,
      post.error || 'Unknown error',
      { platform: post.platform, error: post.error }
    )
  })

  console.log('[EventListeners] All listeners active')
}
