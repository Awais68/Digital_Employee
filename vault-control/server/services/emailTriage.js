// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TRIAGE — one verdict per email, decided before anything is written.
//
// WHY THIS EXISTS: the filter that used to live inline in index.js keyed on
// `noreply@` and a handful of promo words. `posts-recap@mail.instagram.com`
// ("artificialintelligence.co shared something new") matched neither, so the
// pipeline drafted a job-application reply to an Instagram digest. Meanwhile a
// real inbound lead ("We ARe looking for FDE engineer") produced a task file and
// then nothing, because the only WhatsApp escalation was gated on
// priority === 'high'.
//
// Three verdicts, and every downstream branch keys off exactly one of them:
//   junk       → never a reply, never a task file, never a ping. DB row only.
//   actionable → real human wants something. Task file + HITL approval on
//                WhatsApp. THIS is the only verdict that may produce a reply.
//   info       → real mail, nothing to answer. Task file, no reply, no ping.
//
// Deterministic rules decide first because they are auditable and free; the LLM
// is consulted only for what the rules leave open, and can never turn a junk
// verdict back into an actionable one.
// ═══════════════════════════════════════════════════════════════════════════

// Domains that only ever send machine digests, notifications and marketing.
// Matched on the sender's domain, so `posts-recap@mail.instagram.com` and
// `notify@linkedin.com` are both caught without listing every local-part.
const SOCIAL_NOTIFICATION_DOMAINS = [
  'instagram.com', 'mail.instagram.com',
  'facebookmail.com', 'facebook.com', 'meta.com',
  'linkedin.com', 'e.linkedin.com', 'bounce.linkedin.com',
  'twitter.com', 'x.com', 'e.x.com',
  'tiktok.com', 'account.tiktok.com',
  'youtube.com', 'ytnotifications.com',
  'pinterest.com', 'reddit.com', 'redditmail.com',
  'quora.com', 'medium.com', 'substack.com',
  'snapchat.com', 'threads.net', 'discord.com',
  'slack.com', 'notion.so', 'figma.com',
  'mailchimp.com', 'sendgrid.net', 'hubspot.com',
  'news.google.com', 'googlealerts.com',
]

// Local-parts that never belong to a person who wants an answer.
const NO_REPLY_LOCALPARTS = [
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply', 'do_not_reply',
  'notification', 'notifications', 'notify', 'alert', 'alerts', 'updates',
  'mailer-daemon', 'postmaster', 'bounce', 'bounces', 'newsletter', 'news',
  'digest', 'noreply-', 'automated', 'auto-confirm', 'invitations',
  'posts-recap', 'recap', 'feedback-noreply', 'marketing', 'promo', 'promotions',
]

// Subject/body phrasing that marks a broadcast rather than a message to us.
const BROADCAST_PHRASES = [
  'unsubscribe', 'view in browser', 'view this email in your browser',
  'shared something new', 'posted a new', 'new post from', 'started following',
  'liked your', 'commented on', 'mentioned you in', 'tagged you in',
  'people you may know', 'suggested for you', 'recommended for you',
  'trending now', 'top stories', 'weekly digest', 'monthly digest',
  'your daily digest', 'newsletter', 'special offer', 'limited time',
  'flash sale', 'coupon', 'discount code', 'black friday',
  'you have new notifications', 'see what you missed', "here's what you missed",
  'invitation to connect', 'is on instagram', 'is on facebook',
]

// Real mail that needs no answer — receipts, OTPs, security notices.
const TRANSACTIONAL_PHRASES = [
  'verification code', 'one-time pin', 'one time password', 'otp:', 'your code is',
  '2fa', 'two-factor', 'password changed', 'password reset', 'sign-in attempt',
  'new sign-in', 'security alert', 'receipt', 'order confirmation',
  'payment received', 'subscription confirmed', 'your statement',
  'delivery update', 'shipped', 'out for delivery',
]

// Signals that a human wants something from us. These are what must never be
// silently dropped — they are the whole reason the inbox is watched.
const ACTIONABLE_PHRASES = [
  'looking for', 'we are looking', 'we need', 'do you have', 'are you available',
  'quote', 'quotation', 'proposal', 'rfp', 'rfq', 'budget',
  'hiring', 'job opening', 'position', 'vacancy', 'engineer', 'developer',
  'contract', 'agreement', 'invoice', 'payment due', 'purchase order',
  'can you', 'could you', 'please send', 'please share', 'please review',
  'kindly', 'requirement', 'required', 'interested in', 'enquiry', 'inquiry',
  'meeting', 'call', 'schedule', 'demo', 'onboarding', 'collaborate',
  'partnership', 'opportunity', 'deadline', 'asap', 'urgent', 'follow up',
]

function splitAddress(from = '') {
  const m = String(from).match(/<([^>]+)>/)
  const addr = (m ? m[1] : String(from)).trim().toLowerCase()
  const at = addr.lastIndexOf('@')
  return {
    address: addr,
    localPart: at === -1 ? addr : addr.slice(0, at),
    domain: at === -1 ? '' : addr.slice(at + 1),
  }
}

// `mail.instagram.com` must match the `instagram.com` entry, but `notinstagram.com`
// must not — hence the dot-boundary check rather than a substring test.
function domainMatches(domain, listed) {
  return domain === listed || domain.endsWith(`.${listed}`)
}

/**
 * Rules-only pass. Returns a verdict or null when the rules have no opinion.
 * @returns {{verdict:string, reason:string, category:string}|null}
 */
export function triageByRules({ from = '', subject = '', body = '' }) {
  const { address, localPart, domain } = splitAddress(from)
  const subj = String(subject).toLowerCase()
  const text = `${subj}\n${String(body).toLowerCase()}`

  if (SOCIAL_NOTIFICATION_DOMAINS.some(d => domainMatches(domain, d))) {
    return { verdict: 'junk', reason: `social/notification domain (${domain})`, category: 'social' }
  }
  if (NO_REPLY_LOCALPARTS.some(p => localPart.includes(p))) {
    return { verdict: 'junk', reason: `no-reply sender (${address})`, category: 'automated' }
  }
  const broadcast = BROADCAST_PHRASES.find(p => text.includes(p))
  if (broadcast) {
    return { verdict: 'junk', reason: `broadcast phrasing ("${broadcast}")`, category: 'promotional' }
  }
  const transactional = TRANSACTIONAL_PHRASES.find(p => text.includes(p))
  if (transactional) {
    return { verdict: 'info', reason: `transactional notice ("${transactional}")`, category: 'transactional' }
  }
  const actionable = ACTIONABLE_PHRASES.find(p => text.includes(p))
  if (actionable) {
    return { verdict: 'actionable', reason: `request signal ("${actionable}")`, category: 'request' }
  }
  return null
}

/**
 * Full triage: deterministic rules first, LLM only for the undecided middle.
 *
 * The LLM is deliberately never allowed to overturn a junk verdict — a model
 * that hallucinates "this Instagram digest is a client enquiry" costs a real
 * email to a real stranger, and that is not recoverable.
 *
 * @returns {Promise<{verdict:'junk'|'actionable'|'info', reason:string,
 *                    category:string, priority:string, decidedBy:string}>}
 */
export async function triageEmail({ from = '', subject = '', body = '', priority = 'normal' }) {
  const ruled = triageByRules({ from, subject, body })
  if (ruled) {
    return { ...ruled, priority: normalisePriority(priority, ruled.verdict), decidedBy: 'rules' }
  }

  try {
    const { callAI } = await import('./aiProvider.js')
    const raw = await callAI(
      'You triage a business inbox. Answer with raw JSON only — no prose, no code fences.',
      `Decide what this email is.

From: ${from}
Subject: ${subject}
Body: ${String(body).slice(0, 1200)}

"actionable" = a real person or company wants something from us: a question, an
offer, a job, a quote, a meeting, an invoice, a complaint, a follow-up.
"info" = real mail, but nothing is being asked of us.
"junk" = social network notification, newsletter, marketing blast, automated digest.

{"verdict":"actionable|info|junk","category":"<2-3 words>","reason":"<one sentence>","priority":"high|medium|low"}`,
      250
    )
    const parsed = JSON.parse(String(raw).replace(/```json|```/g, '').trim())
    const verdict = ['actionable', 'info', 'junk'].includes(parsed.verdict) ? parsed.verdict : 'info'
    return {
      verdict,
      reason: parsed.reason || 'model verdict',
      category: parsed.category || 'general',
      priority: normalisePriority(parsed.priority || priority, verdict),
      decidedBy: 'model',
    }
  } catch (e) {
    // A triage failure must not become a silent drop: unclassified mail from an
    // unknown human is escalated, not archived. A false escalation costs the
    // owner one WhatsApp message; a false drop costs a lead.
    console.warn('[Triage] Model triage failed, defaulting to actionable:', e.message)
    return {
      verdict: 'actionable',
      reason: `triage unavailable (${e.message}) — escalating rather than dropping`,
      category: 'unclassified',
      priority: normalisePriority(priority, 'actionable'),
      decidedBy: 'fallback',
    }
  }
}

function normalisePriority(raw, verdict) {
  const p = String(raw || '').toLowerCase()
  if (['high', 'urgent', 'immediate'].includes(p)) return 'high'
  if (['low', 'normal'].includes(p)) return verdict === 'actionable' ? 'medium' : 'low'
  if (p === 'medium') return 'medium'
  return verdict === 'actionable' ? 'medium' : 'low'
}

export default { triageEmail, triageByRules }
