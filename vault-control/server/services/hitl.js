// ═══════════════════════════════════════════════════════════════════════════
// HUMAN-IN-THE-LOOP over WhatsApp
//
// The owner's rule: anything that is not social/promo junk must be shown to
// them on WhatsApp and approved from WhatsApp before it goes out. Nothing is
// ever auto-sent to a third party.
//
// Approval reuses the vault, it does not replace it. The orchestrator already
// sends whatever lands in Approved/ and drops whatever lands in Rejected/, so a
// WhatsApp APPROVE is implemented as the same file move the dashboard button
// performs. One execution path, two front-ends.
//
// Owner replies are matched to a request by its short numeric `ref`, so the
// owner types "3 APPROVE" — not a UUID.
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'
import { query } from '../database/connection.js'

// ─── Owner identity ────────────────────────────────────────────────────────
// vault-control/.env carried a placeholder OWNER_PHONE (923001234567), so every
// "urgent email" alert and todo reminder ever sent went to a number that does
// not exist. WHATSAPP_PHONE in the root .env is the real, logged-in number, so
// it is the fallback and the two are always compared digits-only.
export function ownerPhone() {
  const raw = process.env.OWNER_PHONE || process.env.WHATSAPP_PHONE || ''
  const digits = String(raw).replace(/\D/g, '')
  // A placeholder is worse than nothing: it silently swallows every alert.
  if (!digits || digits === '923001234567') {
    return String(process.env.WHATSAPP_PHONE || '').replace(/\D/g, '')
  }
  return digits
}

export function isOwner(waFrom = '') {
  const owner = ownerPhone()
  if (!owner) return false
  return String(waFrom).replace(/\D/g, '').endsWith(owner)
}

// ─── Outbound pacing ───────────────────────────────────────────────────────
// whatsapp-web.js is an unofficial client; bursts get numbers banned. The
// handbook's 60s rule is about broadcasting to many contacts — these messages
// all go to the owner's own chat, so a shorter serialized gap is enough while
// still never firing two sends in the same instant.
const MIN_SEND_GAP_MS = parseInt(process.env.WHATSAPP_MIN_SEND_GAP_MS || '8000', 10)
let sendChain = Promise.resolve()
let lastSentAt = 0

export function sendToOwner(text) {
  sendChain = sendChain.then(async () => {
    const owner = ownerPhone()
    if (!owner) {
      console.warn('[HITL] No owner phone configured — set WHATSAPP_PHONE or OWNER_PHONE')
      return { skipped: 'no-owner-phone' }
    }
    const wa = await import('./whatsappService.js')
    if (wa.getStatus() !== 'connected') {
      console.warn(`[HITL] WhatsApp ${wa.getStatus()} — message queued in DB only`)
      return { skipped: 'not-connected' }
    }
    const wait = MIN_SEND_GAP_MS - (Date.now() - lastSentAt)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastSentAt = Date.now()
    await wa.sendMessage(owner, text)
    return { sent: true }
  }).catch(e => {
    console.error('[HITL] Send to owner failed:', e.message)
    return { error: e.message }
  })
  return sendChain
}

// ─── Requests ──────────────────────────────────────────────────────────────

function vaultDir(name) {
  return path.resolve(process.env.VAULT_PATH || '.', name)
}

async function nextRef() {
  // Short, human-typable, and unique for as long as it matters. Wrapping at
  // 999 keeps the owner typing two or three digits instead of a row id that
  // grows forever.
  const r = await query(`SELECT COALESCE(MAX(id), 0) + 1 AS n FROM hitl_requests`)
  const n = Number(r.rows[0]?.n || 1)
  return String(((n - 1) % 999) + 1)
}

/**
 * Raise an approval request and push it to the owner's WhatsApp.
 * @param {object} req
 * @param {'email'|'whatsapp'|'post'|'task'} req.kind
 * @param {string} req.sourceId   msg_id / file id this came from
 * @param {string} req.title      subject or one-line label
 * @param {string} req.summary    what the sender actually wants (plain words)
 * @param {string} [req.draft]    the reply we propose to send, if any
 * @param {object} [req.payload]  { vaultFile, from, ... } — used to execute
 */
export async function createHitlRequest({ kind = 'email', sourceId, title, summary, draft = '', payload = {} }) {
  const ref = await nextRef()
  await query(
    `INSERT INTO hitl_requests (ref, kind, source_id, title, summary, draft, payload, status, sent_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
     ON CONFLICT (ref) DO UPDATE SET
       kind=EXCLUDED.kind, source_id=EXCLUDED.source_id, title=EXCLUDED.title,
       summary=EXCLUDED.summary, draft=EXCLUDED.draft, payload=EXCLUDED.payload,
       status='pending', created_at=NOW(), decided_at=NULL, decided_by=NULL`,
    [ref, kind, sourceId || null, title || '', summary || '', draft || '', JSON.stringify(payload), ownerPhone()]
  )

  const isPost = kind === 'post'
  const lines = isPost
    ? [
        `🔔 *POST APPROVAL*  [#${ref}]`,
        '',
        `*Topic:* ${title || '(none)'}`,
        `*Going to:* ${(payload.platforms || []).join(', ') || 'unknown'}`,
        `*Image:* ${payload.imageUrl ? 'attached to the post' : 'text only'}`,
        '',
        String(draft || summary || '').slice(0, 900),
      ]
    : [
        `🔔 *APPROVAL NEEDED*  [#${ref}]`,
        '',
        `*From:* ${payload.from || 'unknown'}`,
        `*Subject:* ${title || '(none)'}`,
        '',
        `*They want:* ${summary || 'see draft below'}`,
        ...(draft ? ['', '*Our draft reply:*', '```', String(draft).slice(0, 700), '```'] : []),
      ]
  lines.push(
    '',
    'Reply with:',
    `*${ref} APPROVE* — ${isPost ? 'publish it' : 'send it'}`,
    `*${ref} REJECT* — drop it`,
    `*${ref} EDIT <your text>* — ${isPost ? 'publish your version' : 'send your version instead'}`,
  )
  await sendToOwner(lines.join('\n'))
  console.log(`[HITL] Request #${ref} raised (${kind}): ${title}`)
  return ref
}

export async function listPending(limit = 10) {
  const r = await query(
    `SELECT ref, kind, title, summary, created_at FROM hitl_requests
     WHERE status='pending' ORDER BY id DESC LIMIT $1`, [limit]
  )
  return r.rows
}

// ─── Executing a decision ──────────────────────────────────────────────────
// Approve/reject are file moves because the orchestrator's send loop watches
// those folders. Doing the send here instead would give the system two
// independent senders and, eventually, two copies of the same email.

function moveVaultFile(fileName, toFolder) {
  if (!fileName) return { moved: false, reason: 'no vault file attached' }
  const src = path.join(vaultDir('Pending_Approval'), fileName)
  if (!fs.existsSync(src)) return { moved: false, reason: `not in Pending_Approval: ${fileName}` }
  const destDir = vaultDir(toFolder)
  fs.mkdirSync(destDir, { recursive: true })
  fs.renameSync(src, path.join(destDir, fileName))
  return { moved: true, to: toFolder }
}

// A post approval is not a file move. The drafted rows already live in
// scheduled_posts, so approving means publishing them and recording where they
// landed; rejecting means marking them so no later sweep picks them back up.
async function decidePostRequest(payload, decision, opts) {
  const ids = (Array.isArray(payload.postIds) ? payload.postIds : []).map(Number).filter(Boolean)
  if (!ids.length) return { moved: false, reason: 'no draft posts attached' }

  if (decision === 'reject') {
    await query(`UPDATE scheduled_posts SET status='rejected' WHERE id = ANY($1)`, [ids])
    return { moved: true, to: 'rejected', detail: `${ids.length} draft(s) dropped — nothing was published.` }
  }

  if (decision === 'edit' && opts.editedDraft) {
    // Clamp here too: the owner's text goes out verbatim otherwise, and a
    // hashtag overflow would fail the publish at the platform instead.
    const { clampForPlatforms } = await import('./postPolicy.js')
    for (const id of ids) {
      const row = (await query(`SELECT platform FROM scheduled_posts WHERE id=$1`, [id])).rows[0]
      if (!row) continue
      await query(`UPDATE scheduled_posts SET content=$2 WHERE id=$1`,
        [id, clampForPlatforms(opts.editedDraft, [row.platform])])
    }
  }

  const { publishPost } = await import('./socialMediaService.js')
  const lines = []
  for (const id of ids) {
    const row = (await query(`SELECT * FROM scheduled_posts WHERE id=$1`, [id])).rows[0]
    if (!row) continue
    try {
      const r = await publishPost(row)
      const url = r?.url || r?.postUrl || r?.permalink || r?.id || null
      await query(`UPDATE scheduled_posts SET status='published', published_at=NOW(), post_url=$2 WHERE id=$1`,
        [id, url ? String(url) : null])
      lines.push(`✅ ${row.platform}${url ? ` — ${url}` : ''}`)
    } catch (e) {
      await query(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, [id])
      lines.push(`❌ ${row.platform} — ${e.message}`)
      console.warn(`[HITL] Publish failed for post ${id} (${row.platform}):`, e.message)
    }
  }
  return { moved: true, to: 'published', detail: lines.join('\n') }
}

/**
 * Apply a decision to a request. Safe to call from WhatsApp or from the UI.
 * @param {string} ref
 * @param {'approve'|'reject'|'edit'} decision
 * @param {{note?:string, editedDraft?:string, by?:string}} opts
 */
export async function decide(ref, decision, opts = {}) {
  const r = await query(`SELECT * FROM hitl_requests WHERE ref=$1`, [String(ref)])
  const reqRow = r.rows[0]
  if (!reqRow) return { ok: false, message: `No request #${ref}.` }
  if (reqRow.status !== 'pending') {
    return { ok: false, message: `#${ref} is already ${reqRow.status}.` }
  }

  const payload = typeof reqRow.payload === 'string' ? JSON.parse(reqRow.payload || '{}') : (reqRow.payload || {})
  const vaultFile = payload.vaultFile
  let result

  if (reqRow.kind === 'post') {
    result = await decidePostRequest(payload, decision, opts)
  } else if (decision === 'reject') {
    result = moveVaultFile(vaultFile, 'Rejected')
  } else {
    if (decision === 'edit' && opts.editedDraft && vaultFile) {
      // Replace the drafted body in place so the orchestrator sends the owner's
      // words, not ours.
      try {
        const p = path.join(vaultDir('Pending_Approval'), vaultFile)
        const body = fs.readFileSync(p, 'utf-8')
        const replaced = body.includes('## Reply')
          ? body.replace(/## Reply[\s\S]*?(?=\n## |$)/, `## Reply\n\n${opts.editedDraft}\n\n`)
          : `${body}\n\n## Reply\n\n${opts.editedDraft}\n`
        fs.writeFileSync(p, replaced, 'utf-8')
      } catch (e) {
        console.warn('[HITL] Could not apply edit to vault file:', e.message)
      }
    }
    result = moveVaultFile(vaultFile, 'Approved')
  }

  const finalStatus = decision === 'reject' ? 'rejected' : 'approved'
  await query(
    `UPDATE hitl_requests SET status=$1, decided_at=NOW(), decided_by=$2, decision_note=$3,
       draft=COALESCE($4, draft) WHERE ref=$5`,
    [finalStatus, opts.by || 'whatsapp', opts.note || result.reason || null,
     decision === 'edit' ? (opts.editedDraft || null) : null, String(ref)]
  )

  console.log(`[HITL] #${ref} ${finalStatus} by ${opts.by || 'whatsapp'} (${result.moved ? result.to : result.reason})`)
  return {
    ok: true,
    status: finalStatus,
    message: result.moved
      ? (result.detail
          ? `#${ref} ${finalStatus}.\n${result.detail}`
          : `✅ #${ref} ${finalStatus}. ${decision === 'reject' ? 'Nothing will be sent.' : 'It will go out on the next cycle.'}`)
      : `⚠️ #${ref} marked ${finalStatus}, but the draft was not found (${result.reason}).`,
  }
}

// ─── WhatsApp command parsing ──────────────────────────────────────────────

const HELP_TEXT = [
  '*Commands*',
  '`LIST` — pending approvals',
  '`<n> APPROVE` — send it',
  '`<n> REJECT [reason]` — drop it',
  '`<n> EDIT <text>` — send your version',
  '`TODO <text>` — add a todo',
  '`TODOS` — open todos',
  '`DONE <id>` — complete a todo',
  '`HELP` — this list',
].join('\n')

/**
 * Interpret a message from the owner. Returns a reply string, or null when the
 * message is not a command (ordinary chat is left alone).
 */
export async function handleOwnerCommand(from, body) {
  if (!isOwner(from)) return null
  const text = String(body || '').trim()
  if (!text) return null

  if (/^help$/i.test(text)) return HELP_TEXT

  if (/^list$/i.test(text)) {
    const rows = await listPending()
    if (!rows.length) return '✅ Nothing waiting for approval.'
    return ['*Pending approvals*', ...rows.map(r => `*#${r.ref}* ${r.title || r.kind} — ${(r.summary || '').slice(0, 70)}`)].join('\n')
  }

  // Todos from WhatsApp: "TODO call the client tomorrow"
  const todoAdd = text.match(/^todos?\s+(.+)$/is)
  if (todoAdd && !/^todos$/i.test(text)) {
    const { createTodoFromText } = await import('./taskCapture.js')
    const t = await createTodoFromText(todoAdd[1], { source: 'whatsapp', sourceId: from })
    return `📝 Todo #${t.id} added: ${t.title}`
  }

  if (/^todos$/i.test(text)) {
    const r = await query(`SELECT id, title, due_date FROM todos WHERE status <> 'completed' ORDER BY id DESC LIMIT 10`)
    if (!r.rows.length) return '✅ No open todos.'
    return ['*Open todos*', ...r.rows.map(t => `*#${t.id}* ${t.title}${t.due_date ? ` (due ${new Date(t.due_date).toLocaleDateString()})` : ''}`)].join('\n')
  }

  const doneCmd = text.match(/^done\s+#?(\d+)$/i)
  if (doneCmd) {
    const { completeTodo } = await import('./taskCapture.js')
    return await completeTodo(Number(doneCmd[1]))
  }

  // "<ref> APPROVE" / "APPROVE <ref>" / bare "APPROVE" when exactly one is open
  const m = text.match(/^#?(\d+)\s*(approve|reject|ok|yes|no|edit)\b\s*(.*)$/is)
    || text.match(/^(approve|reject|ok|yes|no|edit)\s*#?(\d+)\b\s*(.*)$/is)
  let ref, verb, rest
  if (m) {
    if (/^\d/.test(m[1])) { [, ref, verb, rest] = m } else { [, verb, ref, rest] = m }
  } else {
    const bare = text.match(/^(approve|reject|ok|yes|no)$/i)
    if (!bare) return null
    const pending = await listPending(2)
    if (pending.length === 0) return '✅ Nothing waiting for approval.'
    if (pending.length > 1) return `There are ${pending.length} pending. Reply with the number, e.g. *${pending[0].ref} APPROVE*.`
    ref = pending[0].ref
    verb = bare[1]
    rest = ''
  }

  const v = verb.toLowerCase()
  if (v === 'edit') {
    if (!rest?.trim()) return `Send it as *${ref} EDIT <your reply text>*.`
    return (await decide(ref, 'edit', { editedDraft: rest.trim(), by: from })).message
  }
  const decision = ['reject', 'no'].includes(v) ? 'reject' : 'approve'
  return (await decide(ref, decision, { note: rest?.trim() || null, by: from })).message
}

export default { createHitlRequest, decide, listPending, handleOwnerCommand, sendToOwner, ownerPhone, isOwner }
