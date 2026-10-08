import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMeetingData } from '@/lib/meetingData'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/google/oauth'
import { FREE_MAIL } from '@/lib/google/matching'
import InboxView, { Thread } from './InboxView'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export default async function InboxPage({ searchParams }: { searchParams: { status?: string; mailbox?: string } }) {
  const supabase = createClient() as any
  const data = await getMeetingData()
  const status = searchParams.status === 'ignored' ? 'ignored' : 'inbox'
  const mineOnly = searchParams.mailbox === 'me' && !!data.meId

  let q = supabase.from('emails')
    .select('id, mailbox_user_id, mailbox_email, thread_id, subject, from_email, from_name, to_emails, cc_emails, sent_at, direction, snippet, has_attachments, labelled')
    .eq('project_id', PROJECT_ID).eq('status', status)
    .order('sent_at', { ascending: false }).limit(500)
  if (mineOnly) q = q.eq('mailbox_user_id', data.meId)
  const [{ data: emails, error }, { count: inboxCount }] = await Promise.all([
    q,
    supabase.from('emails').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT_ID).eq('status', 'inbox'),
  ])

  // One entry per conversation (thread within one mailbox), newest first
  const internal = ALLOWED_EMAIL_DOMAIN
  const threads = new Map<string, Thread>()
  for (const e of emails || []) {
    const key = `${e.mailbox_user_id}|${e.thread_id || e.id}`
    const external = [e.from_email, ...(e.to_emails || []), ...(e.cc_emails || [])].filter((a: string) => a && !a.endsWith('@' + internal))
    const t = threads.get(key)
    if (t) {
      t.count++
      t.labelled ||= e.labelled
      t.subject = e.subject || t.subject          // rows come newest first → ends with the first subject
      for (const a of external) if (!t.participants.includes(a)) t.participants.push(a)
      if (!t.name && e.direction === 'inbound' && e.from_name) t.name = e.from_name
      continue
    }
    threads.set(key, {
      key, emailId: e.id, subject: e.subject || '(kein Betreff)', snippet: e.snippet, at: e.sent_at, count: 1,
      labelled: e.labelled, attachments: e.has_attachments, direction: e.direction,
      participants: external, name: e.direction === 'inbound' ? e.from_name : null,
      mailbox: data.team.find(m => m.user_id === e.mailbox_user_id)?.display_name ?? e.mailbox_email,
    })
  }

  const tab = (active: boolean) => ({ fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 6, textDecoration: 'none', background: active ? '#fff' : 'transparent', color: active ? '#111827' : '#6b7280', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' })
  const link = (p: { status?: string; mailbox?: string }) => {
    const s = p.status ?? (status === 'ignored' ? 'ignored' : undefined)
    const m = p.mailbox ?? (mineOnly ? 'me' : undefined)
    const qs = [s && s !== 'inbox' ? `status=${s}` : null, m && m !== 'all' ? `mailbox=${m}` : null].filter(Boolean).join('&')
    return `/inbox${qs ? '?' + qs : ''}`
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Posteingang</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, maxWidth: 720 }}>
            Geschäftliche E-Mails, die noch keinem Kontakt zugeordnet sind. E-Mails von bekannten Kontakten oder Company-Domains landen automatisch im CRM.
            Tipp: In Gmail das Label <b>„Revenue OS“</b> vergeben, um jede beliebige Mail hierher zu holen.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
            <Link href={link({ status: 'inbox' })} style={tab(status === 'inbox')}>Offen{inboxCount ? ` (${inboxCount})` : ''}</Link>
            <Link href={link({ status: 'ignored' })} style={tab(status === 'ignored')}>Ignoriert</Link>
          </div>
          {data.team.length > 1 && (
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
              <Link href={link({ mailbox: 'all' })} style={tab(!mineOnly)}>Alle Postfächer</Link>
              <Link href={link({ mailbox: 'me' })} style={tab(mineOnly)}>Mein Postfach</Link>
            </div>
          )}
        </div>
      </div>
      {error
        ? <p style={{ fontSize: 13, color: '#b91c1c' }}>Posteingang noch nicht eingerichtet (Migration 023 fehlt): {error.message}</p>
        : <InboxView threads={Array.from(threads.values())} data={data} status={status} internalDomain={internal} freeMail={Array.from(FREE_MAIL)} />}
    </div>
  )
}
