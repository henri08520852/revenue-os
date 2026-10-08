// API for the Gmail add-on (gmail-addon/ in this repo). One POST endpoint, { action, ... }.
// Auth: Google ID token of an @altoris.one team member, see lib/addon/auth.ts.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { AddonAuthError, AddonUser, authenticateAddon } from '@/lib/addon/auth'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/google/oauth'
import { FREE_MAIL, domainOf, loadCrmIndex, matchParticipants } from '@/lib/google/matching'
import { EmailRow, Target, assignStored, rematchInbox } from '@/lib/google/emails'
import { OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://revenue-os-chi.vercel.app').replace(/\/$/, '')
const INTERNAL = ALLOWED_EMAIL_DOMAIN

type Msg = {
  gmailId: string; threadId: string | null; messageId: string | null; subject: string | null
  fromEmail: string | null; fromName: string | null; to: string[]; cc: string[]
  date: string; body: string | null; hasAttachments?: boolean
}

const personName = (p: any) => p ? (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Kontakt') : null
const lower = (a: unknown) => String(a || '').trim().toLowerCase()
const external = (addrs: string[]) => addrs.map(lower).filter(a => a.includes('@') && domainOf(a) !== INTERNAL)

function guessName(name: string | null, email: string) {
  if (name && !name.includes('@')) {
    const clean = name.replace(/\s*\(.*\)$/, '').replace(/"/g, '').trim()
    if (clean.includes(',')) { const [l, f] = clean.split(',').map(s => s.trim()); return { firstName: f || '', lastName: l || '' } }
    const parts = clean.split(/\s+/)
    return { firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : '' }
  }
  const local = email.split('@')[0].split(/[._-]/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1))
  return { firstName: local[0] || '', lastName: local.slice(1).join(' ') }
}

function toRow(m: Msg, user: AddonUser): EmailRow {
  const fromEmail = lower(m.fromEmail) || null
  return {
    project_id: PROJECT_ID, mailbox_user_id: user.userId, mailbox_email: user.email,
    gmail_id: m.gmailId, thread_id: m.threadId, message_id: m.messageId || `gmail:${m.gmailId}`,
    subject: m.subject || null, from_email: fromEmail, from_name: m.fromName || null,
    to_emails: (m.to || []).map(lower).filter(Boolean), cc_emails: (m.cc || []).map(lower).filter(Boolean),
    sent_at: new Date(m.date || Date.now()).toISOString(),
    direction: fromEmail && domainOf(fromEmail) === INTERNAL ? 'outbound' : 'inbound',
    snippet: (m.body || '').replace(/\s+/g, ' ').slice(0, 200) || null,
    body_text: m.body ? m.body.slice(0, 50000) : null,
    has_attachments: !!m.hasAttachments, labelled: false, status: 'inbox',
    company_id: null, person_id: null, opportunity_id: null, activity_id: null,
  }
}

// Stores the messages (if new) and logs them on the target
async function logMessages(svc: any, user: AddonUser, messages: Msg[], target: Target) {
  if (!target.companyId) throw new Error('Bitte eine Company wählen')
  const rows = messages.slice(0, 30).map(m => toRow(m, user))
  if (!rows.length) return 0
  const { error } = await svc.from('emails').upsert(rows, { onConflict: 'project_id,message_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  const { data: stored } = await svc.from('emails').select('*').eq('project_id', PROJECT_ID).in('message_id', rows.map(r => r.message_id))
  return assignStored(svc, (stored || []) as EmailRow[], () => target, user.userId)
}

async function openDeal(svc: any, companyId: string) {
  const { data } = await svc.from('opportunities').select('id').eq('company_id', companyId)
    .not('stage', 'in', '(won,lost)').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function context(svc: any, body: any) {
  const participants: string[] = external([body.fromEmail, ...(body.to || []), ...(body.cc || [])])
  const messageIds: string[] = (body.messageIds || []).filter(Boolean)
  const index = await loadCrmIndex(svc, PROJECT_ID, INTERNAL)
  const match = matchParticipants(index, participants)

  const [{ data: person }, { data: company }, { data: logged }, { data: companies }] = await Promise.all([
    match?.personId ? svc.from('people').select('id, full_name, first_name, last_name, job_title, email, company_id').eq('id', match.personId).single() : Promise.resolve({ data: null }),
    match?.companyId ? svc.from('companies').select('id, name, domain, account_status').eq('id', match.companyId).single() : Promise.resolve({ data: null }),
    messageIds.length ? svc.from('emails').select('message_id, status').eq('project_id', PROJECT_ID).in('message_id', messageIds) : Promise.resolve({ data: [] }),
    svc.from('companies').select('id, name').eq('project_id', PROJECT_ID).order('name').limit(500),
  ])

  let deals: any[] = [], tasks: any[] = [], activities: any[] = [], people: any[] = []
  if (company) {
    const [d, t, a, p] = await Promise.all([
      svc.from('opportunities').select('id, name, stage, value_eur').eq('company_id', company.id).order('created_at', { ascending: false }).limit(10),
      svc.from('tasks').select('id, title, due_at').eq('company_id', company.id).eq('status', 'open').order('due_at', { ascending: true, nullsFirst: false }).limit(5),
      svc.from('activities').select('activity_type, summary, occurred_at').eq('company_id', company.id).order('occurred_at', { ascending: false }).limit(5),
      svc.from('people').select('id, full_name, first_name, last_name, email').eq('company_id', company.id).order('last_name').limit(100),
    ])
    deals = (d.data || []).map((x: any) => ({ id: x.id, name: x.name, stage: (OPPORTUNITY_STAGE_LABELS as Record<string, string>)[x.stage] ?? x.stage, open: !['won', 'lost'].includes(x.stage), value: x.value_eur }))
    tasks = (t.data || []).map((x: any) => ({ id: x.id, title: x.title, due: x.due_at }))
    activities = (a.data || []).map((x: any) => ({ type: x.activity_type, title: x.summary, at: x.occurred_at }))
    people = (p.data || []).map((x: any) => ({ id: x.id, name: personName(x) }))
  }

  const counterpart = participants[0] ?? ''
  const domain = domainOf(counterpart)
  const isFree = FREE_MAIL.has(domain)
  const base = domain.split('.').slice(-2, -1)[0] || ''
  const loggedSet = new Set((logged || []).filter((e: any) => e.status === 'matched').map((e: any) => e.message_id))

  return {
    appUrl: APP_URL,
    person: person ? { id: person.id, name: personName(person), jobTitle: person.job_title, email: person.email, url: `${APP_URL}/contacts/${person.id}` } : null,
    company: company ? { id: company.id, name: company.name, domain: company.domain, status: company.account_status, url: `${APP_URL}/companies/${company.id}` } : null,
    deals, tasks, activities, people,
    logged: messageIds.length > 0 && messageIds.every(id => loggedSet.has(id)),
    companies: companies || [],
    suggestion: counterpart ? {
      email: counterpart, ...guessName(counterpart === lower(body.fromEmail) ? body.fromName : null, counterpart),
      companyName: isFree ? '' : base.charAt(0).toUpperCase() + base.slice(1), domain: isFree ? '' : domain,
    } : null,
    participants,
  }
}

async function createContact(svc: any, user: AddonUser, body: any) {
  const email = lower(body.email)
  if (!email.includes('@')) throw new Error('Bitte eine E-Mail-Adresse angeben')
  let companyId: string | null = body.companyId || null
  if (!companyId) {
    const name = String(body.newCompanyName || '').trim()
    if (!name) throw new Error('Bitte eine Company wählen oder einen Namen eingeben')
    const domain = lower(body.newCompanyDomain).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null
    const { data: existing } = domain ? await svc.from('companies').select('id').eq('project_id', PROJECT_ID).eq('domain', domain).maybeSingle() : { data: null }
    if (existing) companyId = existing.id
    else {
      const { data, error } = await svc.from('companies').insert({ project_id: PROJECT_ID, name, domain, account_status: 'target' }).select('id').single()
      if (error) throw new Error(error.message)
      companyId = data.id
    }
  }
  const { data: existing } = await svc.from('people').select('id').eq('project_id', PROJECT_ID).ilike('email', email).maybeSingle()
  let personId = existing?.id
  if (!personId) {
    const first = String(body.firstName || '').trim(), last = String(body.lastName || '').trim()
    const { data, error } = await svc.from('people').insert({
      project_id: PROJECT_ID, company_id: companyId, first_name: first || null, last_name: last || null,
      full_name: [first, last].filter(Boolean).join(' ') || email, job_title: String(body.jobTitle || '').trim() || null, email, source: 'gmail',
    }).select('id').single()
    if (error) throw new Error(error.message)
    personId = data.id
  }
  const target = { companyId: companyId!, personId, opportunityId: await openDeal(svc, companyId!) }
  const logged = body.messages?.length ? await logMessages(svc, user, body.messages, target) : 0
  const index = await loadCrmIndex(svc, PROJECT_ID, INTERNAL)
  const rematched = await rematchInbox(svc, PROJECT_ID, index)
  return { personId, companyId, logged: logged + rematched }
}

export async function POST(req: Request) {
  let svc: any
  try { svc = createServiceClient() } catch { return NextResponse.json({ error: 'Server nicht konfiguriert' }, { status: 500 }) }
  try {
    const user = await authenticateAddon(req, svc, PROJECT_ID)
    const body = await req.json().catch(() => ({}))
    switch (body.action) {
      case 'context':
        return NextResponse.json(await context(svc, body))
      case 'log': {
        const companyId = body.companyId || null
        const target: Target = { companyId, personId: body.personId || null, opportunityId: body.opportunityId || (companyId ? await openDeal(svc, companyId) : null) }
        return NextResponse.json({ logged: await logMessages(svc, user, body.messages || [], target) })
      }
      case 'createContact':
        return NextResponse.json(await createContact(svc, user, body))
      case 'task': {
        const title = String(body.title || '').trim()
        if (!title) throw new Error('Bitte einen Titel eingeben')
        const { error } = await svc.from('tasks').insert({
          project_id: PROJECT_ID, title, task_type: body.taskType || 'follow_up',
          due_at: /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || '') ? `${body.dueDate}T10:00:00.000Z` : null, has_time: false,
          owner_id: user.userId, created_by: user.userId,
          company_id: body.companyId || null, person_id: body.personId || null, opportunity_id: body.opportunityId || null,
        })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
    }
  } catch (err: any) {
    const status = err instanceof AddonAuthError ? err.status : 400
    return NextResponse.json({ error: err?.message || 'Fehler' }, { status })
  }
}
