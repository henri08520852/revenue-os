'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createMeeting } from '@/app/(dashboard)/calendar/actions'

export type MeetingData = {
  companies: { id: string; name: string }[]
  people: { id: string; company_id: string | null; name: string; email: string | null; job_title: string | null }[]
  deals: { id: string; name: string; company_id: string }[]
  team: { user_id: string; display_name: string; email: string | null }[]
  meId: string | null
  canCreate: boolean          // Google connected with calendar write access
}

export type MeetingPrefill = {
  date?: string               // YYYY-MM-DD
  time?: string               // HH:MM
  companyId?: string | null
  opportunityId?: string | null
  title?: string
  attendeeEmails?: string[]
}

const todayStr = () => new Date().toLocaleDateString('en-CA')
const nextHalfHour = () => {
  const d = new Date(Date.now() + 30 * 60000)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const input = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' as const }

export default function MeetingDialog({ open, onClose, data, prefill }: {
  open: boolean
  onClose: () => void
  data: MeetingData
  prefill?: MeetingPrefill
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState(nextHalfHour())
  const [duration, setDuration] = useState(30)
  const [companyId, setCompanyId] = useState('')
  const [opportunityId, setOpportunityId] = useState('')
  const [emails, setEmails] = useState<string[]>([])
  const [emailDraft, setEmailDraft] = useState('')
  const [description, setDescription] = useState('')
  const [withMeet, setWithMeet] = useState(true)
  const [sendInvites, setSendInvites] = useState(true)
  const [setAsNextStep, setSetAsNextStep] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ meetLink: string | null } | null>(null)
  const [pending, startTransition] = useTransition()

  // Reset form whenever the dialog opens
  useEffect(() => {
    if (!open) return
    const company = data.companies.find(c => c.id === prefill?.companyId)
    setTitle(prefill?.title ?? (company ? `${company.name} × Altoris` : ''))
    setDate(prefill?.date ?? todayStr())
    setTime(prefill?.time ?? nextHalfHour())
    setDuration(30)
    setCompanyId(prefill?.companyId ?? '')
    setOpportunityId(prefill?.opportunityId ?? '')
    setEmails(prefill?.attendeeEmails ?? [])
    setEmailDraft('')
    setDescription('')
    setWithMeet(true)
    setSendInvites(true)
    setSetAsNextStep(true)
    setError(null)
    setDone(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const contacts = useMemo(() => data.people.filter(p => p.email && p.company_id === companyId), [data.people, companyId])
  const deals = useMemo(() => data.deals.filter(d => !companyId || d.company_id === companyId), [data.deals, companyId])
  const colleagues = data.team.filter(m => m.email && m.user_id !== data.meId)

  function toggleEmail(email: string) {
    setEmails(list => list.includes(email) ? list.filter(e => e !== email) : [...list, email])
  }
  function addDraft() {
    const parts = emailDraft.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    if (parts.length) setEmails(list => Array.from(new Set([...list, ...parts])))
    setEmailDraft('')
  }

  // Short cover letter; Google puts the event description into the invitation email
  function insertTemplate() {
    const firstContact = data.people.find(p => p.email && emails.includes(p.email.toLowerCase()) && p.company_id === companyId)
    const firstName = firstContact?.name.split(' ')[0]
    const company = data.companies.find(c => c.id === companyId)?.name
    const me = data.team.find(m => m.user_id === data.meId)?.display_name || ''
    const when = new Date(`${date}T${time}:00`).toLocaleString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    setDescription([
      firstName ? `Hallo ${firstName},` : 'Hallo,',
      '',
      `vielen Dank für Ihr Interesse${company ? ` – ich freue mich auf den Austausch mit ${company}` : ''}. Hiermit lade ich Sie zu unserem Termin am ${when} Uhr ein.`,
      '',
      'Agenda:',
      '– Kurzes Kennenlernen',
      '– Ihre aktuelle Situation und Ziele',
      '– Wie wir unterstützen können & nächste Schritte',
      '',
      withMeet ? 'Den Google-Meet-Link finden Sie in dieser Einladung.' : '',
      '',
      'Viele Grüße',
      me,
      'Altoris',
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'))
  }

  function submit() {
    setError(null)
    const pendingDraft = emailDraft.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    const all = Array.from(new Set([...emails, ...pendingDraft]))
    const personId = data.people.find(p => p.email && all.includes(p.email.toLowerCase()) && p.company_id === companyId)?.id ?? null
    startTransition(async () => {
      const res = await createMeeting({
        title,
        startIso: new Date(`${date}T${time}:00`).toISOString(),
        durationMin: duration,
        attendees: all,
        description: description.trim() || null,
        companyId: companyId || null,
        personId,
        opportunityId: opportunityId || null,
        withMeet,
        sendInvites,
        setAsNextStep,
      })
      if (res.error) setError(res.error)
      else setDone({ meetLink: res.meetLink ?? null })
    })
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>📅 Meeting planen</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>×</button>
        </div>

        {done ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>✅</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Meeting angelegt{sendInvites && emails.length ? ' – Einladungen verschickt' : ''}</p>
            {done.meetLink && (
              <p style={{ fontSize: 13, marginTop: 10 }}>
                <a href={done.meetLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>{done.meetLink}</a>
              </p>
            )}
            <button onClick={onClose} style={{ marginTop: 20, padding: '9px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#111827', color: '#fff', cursor: 'pointer' }}>Schließen</button>
          </div>
        ) : !data.canCreate ? (
          <div style={{ padding: 24 }}>
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
              Um Meetings mit Google-Meet-Link direkt aus Revenue OS zu verschicken, verbinde Google einmal (neu) unter
              Einstellungen – dabei wird das Schreibrecht für deinen Kalender erteilt.
            </p>
            <a href="/settings" style={{ display: 'inline-block', marginTop: 16, padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, background: '#2563eb', color: '#fff', textDecoration: 'none' }}>Zu den Einstellungen</a>
          </div>
        ) : (
          <>
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={label}>Titel</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Demo Revenue OS" style={input} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Datum</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
                </div>
                <div>
                  <label style={label}>Uhrzeit</label>
                  <input type="time" value={time} step={900} onChange={e => setTime(e.target.value)} style={input} />
                </div>
                <div>
                  <label style={label}>Dauer</label>
                  <select value={duration} onChange={e => setDuration(Number(e.target.value))} style={input}>
                    {[15, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m} Min.</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Company</label>
                  <select value={companyId} onChange={e => { setCompanyId(e.target.value); setOpportunityId('') }} style={input}>
                    <option value="">— keine —</option>
                    {data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Deal</label>
                  <select value={opportunityId} onChange={e => setOpportunityId(e.target.value)} style={input} disabled={!deals.length}>
                    <option value="">{deals.length ? '— keiner —' : 'kein offener Deal'}</option>
                    {deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={label}>Teilnehmer</label>
                {contacts.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {contacts.map(p => {
                      const on = emails.includes(p.email!.toLowerCase())
                      return (
                        <button key={p.id} type="button" onClick={() => toggleEmail(p.email!.toLowerCase())}
                          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${on ? '#2563eb' : '#e5e7eb'}`, background: on ? '#eff6ff' : '#fff', color: on ? '#1d4ed8' : '#374151' }}>
                          {on ? '✓ ' : '+ '}{p.name}{p.job_title ? ` · ${p.job_title}` : ''}
                        </button>
                      )
                    })}
                  </div>
                )}
                {colleagues.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {colleagues.map(m => {
                      const on = emails.includes(m.email!.toLowerCase())
                      return (
                        <button key={m.user_id} type="button" onClick={() => toggleEmail(m.email!.toLowerCase())}
                          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${on ? '#7c3aed' : '#e5e7eb'}`, background: on ? '#f5f3ff' : '#fff', color: on ? '#6d28d9' : '#6b7280' }}>
                          {on ? '✓ ' : '+ '}{m.display_name} (Team)
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  {emails.map(e => (
                    <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#f3f4f6', borderRadius: 14, padding: '3px 8px' }}>
                      {e}
                      <button type="button" onClick={() => toggleEmail(e)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}>×</button>
                    </span>
                  ))}
                  <input value={emailDraft} onChange={e => setEmailDraft(e.target.value)}
                    onKeyDown={e => { if (['Enter', ',', ' '].includes(e.key)) { e.preventDefault(); addDraft() } }}
                    onBlur={addDraft}
                    placeholder={emails.length ? 'weitere E-Mail…' : 'E-Mail eingeben + Enter'}
                    style={{ flex: 1, minWidth: 160, border: 'none', outline: 'none', fontSize: 13, padding: '4px' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <label style={label}>Einladungstext an die Teilnehmer</label>
                  <button type="button" onClick={insertTemplate} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✨ Vorlage einfügen</button>
                </div>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={description ? 9 : 4}
                  placeholder={'Kurzes Anschreiben – erscheint in der Einladungs-E-Mail von Google.\nTipp: „Vorlage einfügen“ füllt Vorname, Datum und Agenda vor.'}
                  style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#374151' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={withMeet} onChange={e => setWithMeet(e.target.checked)} /> Google-Meet-Link erstellen
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sendInvites} onChange={e => setSendInvites(e.target.checked)} /> Einladung per E-Mail an Teilnehmer senden
                </label>
                {opportunityId && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={setAsNextStep} onChange={e => setSetAsNextStep(e.target.checked)} /> Als nächsten Schritt im Deal eintragen
                  </label>
                )}
              </div>

              {error && <p style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{error}{error.includes('Einstellungen') && <> – <a href="/settings" style={{ color: '#dc2626' }}>öffnen</a></>}</p>}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: 'white', cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={submit} disabled={pending || !title.trim()} style={{ flex: 2, padding: '9px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: pending || !title.trim() ? '#9ca3af' : '#2563eb', color: '#fff' }}>
                {pending ? 'Wird angelegt…' : sendInvites && (emails.length || emailDraft.trim()) ? 'Meeting anlegen & Einladungen senden' : 'Meeting anlegen'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
