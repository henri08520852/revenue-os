'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/google/oauth'
import { loadCrmIndex } from '@/lib/google/matching'
import { EmailRow, assignStored, rematchInbox } from '@/lib/google/emails'

type Result = { error: string | null; matched?: number }

// The email itself, or every waiting email of its thread in the same mailbox
async function emailsFor(supabase: any, emailId: string, wholeThread: boolean, statuses = ['inbox']): Promise<EmailRow[]> {
  const { data: e, error } = await supabase.from('emails').select('*').eq('id', emailId).single()
  if (error || !e) return []
  if (!wholeThread || !e.thread_id) return [e]
  let q = supabase.from('emails').select('*').eq('thread_id', e.thread_id).in('status', statuses)
  q = e.mailbox_user_id ? q.eq('mailbox_user_id', e.mailbox_user_id) : q.is('mailbox_user_id', null)
  const { data } = await q
  return data?.length ? data : [e]
}

async function rematch(supabase: any, projectId: string) {
  const index = await loadCrmIndex(supabase, projectId, ALLOWED_EMAIL_DOMAIN)
  return rematchInbox(supabase, projectId, index)
}

function done(target: { companyId?: string | null; personId?: string | null; opportunityId?: string | null }) {
  revalidatePath('/inbox')
  if (target.companyId) revalidatePath(`/companies/${target.companyId}`)
  if (target.personId) revalidatePath(`/contacts/${target.personId}`)
  if (target.opportunityId) revalidatePath(`/opportunities/${target.opportunityId}`)
}

// Logs an email (or its whole thread) on a company and optionally a contact / deal
export async function assignEmail(input: { emailId: string; wholeThread: boolean; companyId: string; personId: string | null; opportunityId: string | null }): Promise<Result> {
  if (!input.companyId) return { error: 'Bitte eine Company wählen' }
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const emails = await emailsFor(supabase, input.emailId, input.wholeThread, ['inbox', 'ignored'])
  if (!emails.length) return { error: 'E-Mail nicht gefunden' }
  try {
    const target = { companyId: input.companyId, personId: input.personId || null, opportunityId: input.opportunityId || null }
    const n = await assignStored(supabase, emails, () => target, user?.id ?? null)
    done(target)
    return { error: null, matched: n }
  } catch (err: any) {
    return { error: err?.message || 'Zuordnen fehlgeschlagen' }
  }
}

// Creates the contact (and if needed the company) from an email, then logs the email/thread.
// Other waiting emails from this address / domain are matched right away.
export async function createContactFromEmail(input: {
  emailId: string
  wholeThread: boolean
  firstName: string
  lastName: string
  email: string
  jobTitle: string | null
  companyId: string | null
  newCompany: { name: string; domain: string | null } | null
}): Promise<Result> {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const { data: source } = await supabase.from('emails').select('project_id').eq('id', input.emailId).single()
  if (!source) return { error: 'E-Mail nicht gefunden' }
  const projectId = source.project_id
  const email = input.email.trim().toLowerCase()
  if (!input.firstName.trim() && !input.lastName.trim()) return { error: 'Bitte einen Namen eingeben' }

  let companyId = input.companyId
  if (!companyId) {
    const name = input.newCompany?.name.trim()
    if (!name) return { error: 'Bitte eine Company wählen oder anlegen' }
    const domain = input.newCompany?.domain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null
    const { data: c, error } = await supabase.from('companies')
      .insert({ project_id: projectId, name, domain, account_status: 'target' }).select('id').single()
    if (error) return { error: error.message }
    companyId = c.id
  }

  // Re-use an existing contact with this email
  const { data: existing } = await supabase.from('people').select('id, company_id').eq('project_id', projectId).ilike('email', email).maybeSingle()
  let personId: string
  if (existing) {
    personId = existing.id
    if (!existing.company_id) await supabase.from('people').update({ company_id: companyId }).eq('id', personId)
  } else {
    const first = input.firstName.trim(), last = input.lastName.trim()
    const { data: p, error } = await supabase.from('people').insert({
      project_id: projectId, company_id: companyId, first_name: first || null, last_name: last || null,
      full_name: [first, last].filter(Boolean).join(' '), job_title: input.jobTitle || null, email, source: 'gmail',
    }).select('id').single()
    if (error) return { error: error.message }
    personId = p.id
  }

  try {
    const { data: deal } = await supabase.from('opportunities').select('id').eq('company_id', companyId)
      .not('stage', 'in', '(won,lost)').order('created_at', { ascending: false }).limit(1).maybeSingle()
    const target = { companyId, personId, opportunityId: deal?.id ?? null }
    const emails = await emailsFor(supabase, input.emailId, input.wholeThread, ['inbox', 'ignored'])
    let n = await assignStored(supabase, emails, () => target, user?.id ?? null)
    n += await rematch(supabase, projectId)
    done(target)
    revalidatePath('/contacts')
    revalidatePath('/companies')
    return { error: null, matched: n }
  } catch (err: any) {
    return { error: err?.message || 'Zuordnen fehlgeschlagen' }
  }
}

// Dismisses an email / thread, or every waiting email from the same sender
export async function ignoreEmail(input: { emailId: string; scope: 'email' | 'thread' | 'sender' }): Promise<Result> {
  const supabase = createClient() as any
  let ids: string[] = []
  if (input.scope === 'sender') {
    const { data: e } = await supabase.from('emails').select('project_id, from_email').eq('id', input.emailId).single()
    if (!e?.from_email) return { error: 'E-Mail nicht gefunden' }
    const { data } = await supabase.from('emails').select('id').eq('project_id', e.project_id).eq('from_email', e.from_email).eq('status', 'inbox')
    ids = (data || []).map((x: any) => x.id)
  } else {
    ids = (await emailsFor(supabase, input.emailId, input.scope === 'thread')).map(e => e.id!)
  }
  if (!ids.length) return { error: null }
  const { error } = await supabase.from('emails').update({ status: 'ignored' }).in('id', ids)
  if (error) return { error: error.message }
  revalidatePath('/inbox')
  return { error: null }
}

// Brings ignored emails back into the Posteingang
export async function restoreEmail(emailId: string): Promise<Result> {
  const supabase = createClient() as any
  const ids = (await emailsFor(supabase, emailId, true, ['ignored'])).map(e => e.id!)
  const { error } = await supabase.from('emails').update({ status: 'inbox' }).in('id', ids)
  if (error) return { error: error.message }
  revalidatePath('/inbox')
  return { error: null }
}

// Full messages of a thread for the detail pane (bodies are not sent with the list)
export async function getThread(emailId: string): Promise<{ error: string | null; emails: any[] }> {
  const supabase = createClient() as any
  const { data: e } = await supabase.from('emails').select('id, thread_id, mailbox_user_id, status').eq('id', emailId).single()
  if (!e) return { error: 'E-Mail nicht gefunden', emails: [] }
  let q = supabase.from('emails')
    .select('id, subject, from_email, from_name, to_emails, cc_emails, sent_at, direction, body_text, snippet, has_attachments, status, mailbox_email')
    .order('sent_at', { ascending: true })
  q = e.thread_id ? q.eq('thread_id', e.thread_id).eq('status', e.status) : q.eq('id', e.id)
  if (e.mailbox_user_id) q = q.eq('mailbox_user_id', e.mailbox_user_id)
  const { data, error } = await q
  return { error: error?.message ?? null, emails: data || [] }
}
