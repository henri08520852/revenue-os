'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TaskPickData } from '@/components/TaskDialog'
import { assignEmail, createContactFromEmail, getThread, ignoreEmail, restoreEmail } from './actions'

export type Thread = {
  key: string
  emailId: string          // newest email of the conversation
  subject: string
  snippet: string | null
  at: string
  count: number
  labelled: boolean
  attachments: boolean
  direction: 'inbound' | 'outbound'
  participants: string[]   // external addresses
  name: string | null      // display name of the external sender, if any
  mailbox: string | null
}

const TZ = 'Europe/Berlin'
const label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 }
const input = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' as const }
const btn = (primary = false) => ({ padding: '8px 14px', border: primary ? 'none' : '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: primary ? '#2563eb' : '#fff', color: primary ? '#fff' : '#374151' })

function when(iso: string) {
  const d = new Date(iso)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return d.toLocaleDateString('en-CA', { timeZone: TZ }) === today
    ? d.toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit' })
}

// "Anna Müller" → ["Anna", "Müller"]; "anna.mueller@x.de" → ["Anna", "Mueller"]
function guessName(name: string | null, email: string) {
  if (name && !name.includes('@')) {
    const clean = name.replace(/\s*\(.*\)$/, '').trim()
    if (clean.includes(',')) { const [l, f] = clean.split(',').map(s => s.trim()); return [f || '', l || ''] }
    const parts = clean.split(/\s+/)
    return [parts.slice(0, -1).join(' ') || parts[0], parts.length > 1 ? parts[parts.length - 1] : '']
  }
  const local = email.split('@')[0].split(/[._-]/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1))
  return [local[0] || '', local.slice(1).join(' ')]
}

function companyFromDomain(domain: string) {
  const base = domain.split('.').slice(-2, -1)[0] || domain
  return base.charAt(0).toUpperCase() + base.slice(1)
}

function Message({ m }: { m: any }) {
  const [open, setOpen] = useState(false)
  const body: string = m.body_text || m.snippet || ''
  const long = body.length > 900
  return (
    <div style={{ border: '1px solid #f3f4f6', borderRadius: 10, padding: '12px 14px', marginBottom: 10, background: m.direction === 'outbound' ? '#f9fafb' : '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: '#111827' }}>{m.from_name || m.from_email} <span style={{ fontWeight: 400, color: '#9ca3af' }}>{m.from_name ? `<${m.from_email}>` : ''}</span></span>
        <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{new Date(m.sent_at).toLocaleString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>an {[...(m.to_emails || []), ...(m.cc_emails || [])].join(', ')}{m.has_attachments ? ' · 📎 Anhang' : ''}</p>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 10, whiteSpace: 'pre-wrap', lineHeight: 1.55, wordBreak: 'break-word' }}>
        {open || !long ? body : body.slice(0, 900) + ' …'}
      </div>
      {long && <button onClick={() => setOpen(!open)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, padding: 0, marginTop: 6 }}>{open ? 'weniger' : 'ganze E-Mail anzeigen'}</button>}
    </div>
  )
}

function AssignPanel({ thread, data, freeMail, onDone }: { thread: Thread; data: TaskPickData; freeMail: Set<string>; onDone: (msg: string) => void }) {
  const counterpart = thread.participants[0] ?? ''
  const domain = counterpart.split('@')[1] ?? ''
  const isFree = freeMail.has(domain)
  const [mode, setMode] = useState<'contact' | 'assign'>('contact')
  const [wholeThread, setWholeThread] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // new contact
  const [g1, g2] = guessName(thread.name, counterpart)
  const [first, setFirst] = useState(g1)
  const [last, setLast] = useState(g2)
  const [email, setEmail] = useState(counterpart)
  const [jobTitle, setJobTitle] = useState('')
  const [companyChoice, setCompanyChoice] = useState<string>('new')
  const [newName, setNewName] = useState(isFree ? '' : companyFromDomain(domain))
  const [newDomain, setNewDomain] = useState(isFree ? '' : domain)

  // assign to existing
  const [filter, setFilter] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [personId, setPersonId] = useState('')
  const [dealId, setDealId] = useState('')
  const companies = useMemo(() => data.companies.filter(c => c.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 200), [data.companies, filter])
  const people = data.people.filter(p => p.company_id === companyId)
  const deals = data.deals.filter(d => d.company_id === companyId)

  useEffect(() => { setPersonId(''); setDealId(data.deals.find(d => d.company_id === companyId)?.id ?? '') }, [companyId, data.deals])

  function run(fn: () => Promise<{ error: string | null; matched?: number }>, msg: (n: number) => string) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else onDone(msg(res.matched ?? 0))
    })
  }

  const createContact = () => run(() => createContactFromEmail({
    emailId: thread.emailId, wholeThread, firstName: first, lastName: last, email, jobTitle: jobTitle || null,
    companyId: companyChoice && companyChoice !== 'new' ? companyChoice : null,
    newCompany: companyChoice === 'new' ? { name: newName, domain: newDomain || null } : null,
  }), n => `Kontakt angelegt · ${n} E-Mail${n === 1 ? '' : 's'} im CRM`)

  const assign = () => run(() => assignEmail({ emailId: thread.emailId, wholeThread, companyId, personId: personId || null, opportunityId: dealId || null }),
    n => `${n} E-Mail${n === 1 ? '' : 's'} zugeordnet`)

  const tab = (active: boolean) => ({ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? '#111827' : '#6b7280', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' })

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2, marginBottom: 14 }}>
        <button onClick={() => setMode('contact')} style={tab(mode === 'contact')}>➕ Neuer Kontakt</button>
        <button onClick={() => setMode('assign')} style={tab(mode === 'assign')}>🔗 Zuordnen</button>
      </div>

      {mode === 'contact' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={label}>Vorname</label><input value={first} onChange={e => setFirst(e.target.value)} style={input} /></div>
            <div><label style={label}>Nachname</label><input value={last} onChange={e => setLast(e.target.value)} style={input} /></div>
          </div>
          <div><label style={label}>E-Mail</label>
            {thread.participants.length > 1
              ? <select value={email} onChange={e => setEmail(e.target.value)} style={input}>{thread.participants.map(a => <option key={a} value={a}>{a}</option>)}</select>
              : <input value={email} onChange={e => setEmail(e.target.value)} style={input} />}
          </div>
          <div><label style={label}>Position (optional)</label><input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="z. B. Head of People" style={input} /></div>
          <div><label style={label}>Company</label>
            <select value={companyChoice} onChange={e => setCompanyChoice(e.target.value)} style={input}>
              <option value="new">+ Neue Company anlegen</option>
              <option value="" disabled>──────────</option>
              {data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {companyChoice === 'new' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={label}>Name</label><input value={newName} onChange={e => setNewName(e.target.value)} style={input} /></div>
              <div><label style={label}>Domain</label><input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder={isFree ? 'privat – leer lassen' : ''} style={input} /></div>
            </div>
          )}
          <p style={{ fontSize: 11, color: '#9ca3af' }}>Künftige E-Mails von {isFree ? 'dieser Adresse' : `@${domain}`} werden automatisch zugeordnet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><label style={label}>Company</label>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Suchen …" style={{ ...input, marginBottom: 6 }} />
            <select value={companyId} onChange={e => setCompanyId(e.target.value)} size={Math.min(6, Math.max(2, companies.length))} style={{ ...input, padding: 4 }}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={label}>Kontakt</label>
              <select value={personId} onChange={e => setPersonId(e.target.value)} disabled={!companyId} style={input}>
                <option value="">— keiner —</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label style={label}>Deal</label>
              <select value={dealId} onChange={e => setDealId(e.target.value)} disabled={!companyId} style={input}>
                <option value="">— keiner —</option>
                {deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {thread.count > 1 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#374151', marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={wholeThread} onChange={e => setWholeThread(e.target.checked)} /> Ganzen Verlauf zuordnen ({thread.count} E-Mails)
        </label>
      )}
      {error && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 10 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {mode === 'contact'
          ? <button onClick={createContact} disabled={pending || !email} style={{ ...btn(true), flex: 1, opacity: pending ? 0.6 : 1 }}>{pending ? 'Speichern…' : 'Kontakt anlegen & zuordnen'}</button>
          : <button onClick={assign} disabled={pending || !companyId} style={{ ...btn(true), flex: 1, opacity: pending || !companyId ? 0.6 : 1 }}>{pending ? 'Speichern…' : 'Zuordnen'}</button>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => run(() => ignoreEmail({ emailId: thread.emailId, scope: 'thread' }), () => 'Ignoriert')} disabled={pending} style={{ ...btn(), flex: 1, fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Ignorieren</button>
        <button onClick={() => run(() => ignoreEmail({ emailId: thread.emailId, scope: 'sender' }), () => 'Absender ignoriert')} disabled={pending} title="Alle wartenden E-Mails dieses Absenders ignorieren" style={{ ...btn(), flex: 1, fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Absender ignorieren</button>
      </div>
    </div>
  )
}

export default function InboxView({ threads, data, status, internalDomain, freeMail }: {
  threads: Thread[]
  data: TaskPickData
  status: 'inbox' | 'ignored'
  internalDomain: string
  freeMail: string[]
}) {
  const router = useRouter()
  const [list, setList] = useState(threads)
  const [selected, setSelected] = useState<string | null>(threads[0]?.key ?? null)
  const [messages, setMessages] = useState<any[] | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const free = useMemo(() => new Set(freeMail), [freeMail])

  useEffect(() => { setList(threads); setSelected(s => threads.some(t => t.key === s) ? s : threads[0]?.key ?? null) }, [threads])
  const thread = list.find(t => t.key === selected) ?? null

  useEffect(() => {
    if (!thread) { setMessages(null); return }
    let cancelled = false
    setMessages(null)
    getThread(thread.emailId).then(r => { if (!cancelled) setMessages(r.emails) }).catch(() => { if (!cancelled) setMessages([]) })
    return () => { cancelled = true }
  }, [thread?.emailId])

  function removeCurrent(msg: string) {
    const idx = list.findIndex(t => t.key === selected)
    const next = list.filter(t => t.key !== selected)
    setList(next)
    setSelected(next[Math.min(idx, next.length - 1)]?.key ?? null)
    setFlash(msg)
    setTimeout(() => setFlash(null), 3500)
    router.refresh()
  }

  if (!list.length) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '56px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 32 }}>📭</p>
        <p style={{ fontWeight: 600, color: '#111827', marginTop: 8 }}>{status === 'inbox' ? 'Alles zugeordnet' : 'Nichts ignoriert'}</p>
        <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{status === 'inbox' ? 'Neue geschäftliche E-Mails ohne Zuordnung erscheinen hier nach dem nächsten Gmail-Sync.' : ''}</p>
        {flash && <p style={{ fontSize: 13, color: '#16a34a', marginTop: 12 }}>✓ {flash}</p>}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', maxHeight: 'calc(100vh - 190px)', overflowY: 'auto' }}>
        {list.map(t => {
          const active = t.key === selected
          const who = t.name || t.participants[0] || '—'
          return (
            <button key={t.key} onClick={() => setSelected(t.key)} style={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', cursor: 'pointer', padding: '11px 14px', borderBottom: '1px solid #f3f4f6', background: active ? '#eff6ff' : '#fff', borderLeft: `3px solid ${active ? '#2563eb' : 'transparent'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.direction === 'outbound' && !t.name ? '→ ' : ''}{who}{t.count > 1 ? <span style={{ color: '#9ca3af', fontWeight: 500 }}> ({t.count})</span> : null}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>{when(t.at)}</span>
              </div>
              <p style={{ fontSize: 12.5, color: '#374151', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.labelled ? '🏷 ' : ''}{t.attachments ? '📎 ' : ''}{t.subject}</p>
              <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.snippet}</p>
              {data.team.length > 1 && t.mailbox && <p style={{ fontSize: 10, color: '#c4c4c4', marginTop: 3 }}>Postfach {t.mailbox}</p>}
            </button>
          )
        })}
      </div>

      {thread && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{thread.subject}</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>{thread.participants.join(', ')}</p>
            {messages === null ? <p style={{ fontSize: 13, color: '#9ca3af' }}>Lädt …</p> : messages.map(m => <Message key={m.id} m={m} />)}
          </div>
          <div style={{ position: 'sticky', top: 0 }}>
            {flash && <p style={{ fontSize: 12, color: '#16a34a', marginBottom: 8 }}>✓ {flash}</p>}
            {status === 'inbox'
              ? <AssignPanel key={thread.key} thread={thread} data={data} freeMail={free} onDone={removeCurrent} />
              : (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                  <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Diese Unterhaltung wurde ignoriert.</p>
                  <button disabled={pending} onClick={() => startTransition(async () => { const r = await restoreEmail(thread.emailId); if (!r.error) removeCurrent('Zurück im Posteingang') })} style={{ ...btn(true), width: '100%' }}>Zurück in den Posteingang</button>
                </div>
              )}
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.5 }}>
              Zugeordnete E-Mails erscheinen mit vollem Text in der Timeline von Company, Kontakt und Deal. Interne Mails (@{internalDomain}) und Newsletter werden nie übernommen.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
