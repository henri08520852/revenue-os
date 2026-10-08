// Email logging shared by the Gmail sync (service role) and the Posteingang actions (user session).
import { CrmIndex, domainOf, matchParticipants, parseAddresses } from './matching'

const BODY_MAX = 50000          // stored in emails.body_text
const ACTIVITY_BODY_MAX = 20000 // copied into activities.extracted_intel.body for the timeline

export type EmailRow = {
  id?: string
  project_id: string
  mailbox_user_id: string | null
  mailbox_email: string | null
  gmail_id: string
  thread_id: string | null
  message_id: string
  subject: string | null
  from_email: string | null
  from_name: string | null
  to_emails: string[]
  cc_emails: string[]
  sent_at: string
  direction: 'inbound' | 'outbound'
  snippet: string | null
  body_text: string | null
  has_attachments: boolean
  labelled: boolean
  status: 'inbox' | 'matched' | 'ignored'
  company_id: string | null
  person_id: string | null
  opportunity_id: string | null
  activity_id: string | null
}

export type Target = { companyId: string | null; personId: string | null; opportunityId: string | null }

// ---------- parsing ----------

function decode(data: string | undefined) {
  if (!data) return ''
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

export function htmlToText(html: string) {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Plain text of a Gmail message payload (text/plain preferred, else stripped HTML)
export function extractBody(payload: any): { text: string | null; hasAttachments: boolean } {
  let plain: string | null = null
  let html: string | null = null
  let hasAttachments = false
  const walk = (part: any) => {
    if (!part) return
    if (part.filename && part.body?.attachmentId) hasAttachments = true
    else if (part.mimeType === 'text/plain' && plain === null && part.body?.data) plain = decode(part.body.data)
    else if (part.mimeType === 'text/html' && html === null && part.body?.data) html = decode(part.body.data)
    for (const p of part.parts || []) walk(p)
  }
  walk(payload)
  const text = (plain ?? (html ? htmlToText(html) : null))?.replace(/\r\n/g, '\n').trim() || null
  return { text: text ? text.slice(0, BODY_MAX) : null, hasAttachments }
}

function displayName(header: string | undefined) {
  if (!header) return null
  const m = header.match(/^\s*"?([^"<]+?)"?\s*</)
  return m ? m[1].trim() : null
}

const AUTOMATED_SENDER = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|newsletter|news|marketing|calendar-notification)([+._-]|@)/i

// Newsletters, notifications, bounces … — never logged unless labelled "Revenue OS"
export function isAutomated(h: Record<string, string>, fromEmail: string | null) {
  if (h['list-unsubscribe'] || h['list-id']) return true
  if (/bulk|list|junk/i.test(h['precedence'] || '')) return true
  if (h['auto-submitted'] && !/^no$/i.test(h['auto-submitted'])) return true
  return !!fromEmail && AUTOMATED_SENDER.test(fromEmail)
}

// Gmail API message (format=full) → email row (status/target decided by the caller)
export function parseMessage(m: any, ctx: { projectId: string; userId: string | null; mailbox: string | null; internalDomain: string; labelled: boolean }) {
  const h: Record<string, string> = {}
  for (const x of m.payload?.headers || []) h[x.name.toLowerCase()] = x.value
  const fromEmail = parseAddresses(h['from'])[0] ?? null
  const to = parseAddresses(h['to'])
  const cc = parseAddresses(h['cc'])
  const { text, hasAttachments } = extractBody(m.payload)
  const row: EmailRow = {
    project_id: ctx.projectId,
    mailbox_user_id: ctx.userId,
    mailbox_email: ctx.mailbox,
    gmail_id: m.id,
    thread_id: m.threadId ?? null,
    message_id: h['message-id'] || `gmail:${m.id}`,
    subject: h['subject'] || null,
    from_email: fromEmail,
    from_name: displayName(h['from']),
    to_emails: to,
    cc_emails: cc,
    sent_at: new Date(Number(m.internalDate)).toISOString(),
    direction: fromEmail && domainOf(fromEmail) === ctx.internalDomain ? 'outbound' : 'inbound',
    snippet: m.snippet ?? null,
    body_text: text,
    has_attachments: hasAttachments,
    labelled: ctx.labelled,
    status: 'inbox',
    company_id: null, person_id: null, opportunity_id: null, activity_id: null,
  }
  const participants = Array.from(new Set([fromEmail, ...to, ...cc].filter(Boolean) as string[]))
  const internalOnly = participants.every(a => domainOf(a) === ctx.internalDomain)
  return { row, headers: h, participants, internalOnly, automated: isAutomated(h, fromEmail) }
}

export function participantsOf(e: Pick<EmailRow, 'from_email' | 'to_emails' | 'cc_emails'>) {
  return Array.from(new Set([e.from_email, ...(e.to_emails || []), ...(e.cc_emails || [])].filter(Boolean) as string[]))
}

export function matchEmail(index: CrmIndex, e: Pick<EmailRow, 'from_email' | 'to_emails' | 'cc_emails'>): Target | null {
  const m = matchParticipants(index, participantsOf(e))
  if (!m?.companyId) return null
  return { companyId: m.companyId, personId: m.personId, opportunityId: index.openDealByCompany.get(m.companyId) ?? null }
}

// ---------- logging ----------

function activityFor(e: EmailRow, t: Target) {
  return {
    project_id: e.project_id,
    company_id: t.companyId,
    person_id: t.personId,
    opportunity_id: t.opportunityId,
    activity_type: 'email',
    direction: e.direction,
    channel: 'email',
    occurred_at: e.sent_at,
    summary: e.subject || '(kein Betreff)',
    raw_reference: e.message_id,
    extracted_intel: {
      snippet: e.snippet,
      body: e.body_text ? e.body_text.slice(0, ACTIVITY_BODY_MAX) : null,
      from: e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email,
      to: [...e.to_emails, ...e.cc_emails].join(', ') || null,
      mailbox: e.mailbox_email,
      attachments: e.has_attachments || undefined,
    },
    source: 'gmail',
    created_by: e.mailbox_email,
  }
}

// Logs emails as activities (re-using an existing activity with the same Message-ID) and
// returns message_id → activity id. Works with the service client and the user client.
export async function logActivities(db: any, items: { email: EmailRow; target: Target }[]) {
  const ids = new Map<string, string>()
  if (!items.length) return ids
  const projectId = items[0].email.project_id
  const refs = Array.from(new Set(items.map(i => i.email.message_id)))
  for (let i = 0; i < refs.length; i += 40) {
    const { data } = await db.from('activities').select('id, raw_reference')
      .eq('project_id', projectId).eq('source', 'gmail').in('raw_reference', refs.slice(i, i + 40))
    for (const a of data || []) ids.set(a.raw_reference, a.id)
  }
  const fresh = items.filter(i => !ids.has(i.email.message_id))
  const seen = new Set<string>()
  const rows = fresh.filter(i => !seen.has(i.email.message_id) && !!seen.add(i.email.message_id)).map(i => activityFor(i.email, i.target))
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error } = await db.from('activities').insert(rows.slice(i, i + 50)).select('id, raw_reference')
    if (error && error.code !== '23505') throw new Error(error.message)
    for (const a of data || []) ids.set(a.raw_reference, a.id)
  }
  return ids
}

// Bumps people.last_interaction_at to the newest logged email
export async function touchPeople(db: any, items: { email: EmailRow; target: Target }[]) {
  const latest = new Map<string, string>()
  for (const { email, target } of items) {
    if (target.personId && (latest.get(target.personId) ?? '') < email.sent_at) latest.set(target.personId, email.sent_at)
  }
  await Promise.all(Array.from(latest.entries()).map(([personId, at]) =>
    db.from('people').update({ last_interaction_at: at }).eq('id', personId)
      .or(`last_interaction_at.is.null,last_interaction_at.lt."${at}"`)))
}

// Marks stored emails as matched and logs them on the target record
export async function assignStored(db: any, emails: EmailRow[], targetOf: (e: EmailRow) => Target | null, assignedBy: string | null = null) {
  const items = emails.map(email => ({ email, target: targetOf(email) })).filter(i => i.target?.companyId) as { email: EmailRow; target: Target }[]
  if (!items.length) return 0
  const activityIds = await logActivities(db, items)
  const now = new Date().toISOString()
  await Promise.all(items.map(({ email, target }) =>
    db.from('emails').update({
      status: 'matched', company_id: target.companyId, person_id: target.personId, opportunity_id: target.opportunityId,
      activity_id: activityIds.get(email.message_id) ?? null, assigned_by: assignedBy, assigned_at: now,
    }).eq('id', email.id)))
  await touchPeople(db, items)
  return items.length
}

// Re-checks the Posteingang against the CRM (e.g. after a contact or company was added)
export async function rematchInbox(db: any, projectId: string, index: CrmIndex) {
  const { data } = await db.from('emails').select('*').eq('project_id', projectId).eq('status', 'inbox')
    .order('sent_at', { ascending: false }).limit(500)
  return assignStored(db, (data || []) as EmailRow[], e => matchEmail(index, e))
}
