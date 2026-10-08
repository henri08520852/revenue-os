'use client'

import { useState, useTransition } from 'react'
import { logActivity, LogInput } from '@/app/(dashboard)/records/actions'
import MeetingDialog, { MeetingData, MeetingPrefill } from '@/components/MeetingDialog'
import TaskDialog, { TaskLink, TaskPickData } from '@/components/TaskDialog'

type Opt = { id: string; label: string }

const ACTIONS: { type: LogInput['type']; label: string; icon: string }[] = [
  { type: 'note', label: 'Notiz', icon: '📝' },
  { type: 'call', label: 'Anruf', icon: '📞' },
  { type: 'email', label: 'E-Mail', icon: '✉️' },
  { type: 'linkedin_message', label: 'LinkedIn', icon: '💼' },
]

const label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const input = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' as const }

// HubSpot-style action row: log note / call / email / LinkedIn, or plan a meeting
export default function QuickActions({ target, contacts = [], deals = [], meeting, meetingPrefill, taskData, taskLink }: {
  target: { companyId: string | null; personId: string | null; opportunityId: string | null }
  contacts?: Opt[]            // pick a contact when logging on a company / deal
  deals?: Opt[]               // pick a deal when logging on a company / contact
  meeting?: MeetingData
  meetingPrefill?: MeetingPrefill
  taskData?: TaskPickData
  taskLink?: TaskLink
}) {
  const [type, setType] = useState<LogInput['type'] | null>(null)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {ACTIONS.map(a => (
          <button key={a.type} onClick={() => setType(a.type)} title={`${a.label} loggen`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 11, color: '#374151' }}>
            <span style={{ fontSize: 16 }}>{a.icon}</span>{a.label}
          </button>
        ))}
        <button onClick={() => setMeetingOpen(true)} disabled={!meeting} title="Meeting planen"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', border: '1px solid #bfdbfe', borderRadius: 10, background: '#eff6ff', cursor: 'pointer', fontSize: 11, color: '#1d4ed8' }}>
          <span style={{ fontSize: 16 }}>📅</span>Meeting
        </button>
        <button onClick={() => setTaskOpen(true)} disabled={!taskData} title="Aufgabe anlegen"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', border: '1px solid #bbf7d0', borderRadius: 10, background: '#f0fdf4', cursor: 'pointer', fontSize: 11, color: '#15803d' }}>
          <span style={{ fontSize: 16 }}>☑️</span>Aufgabe
        </button>
      </div>
      {type && <LogDialog type={type} onType={setType} onClose={() => setType(null)} target={target} contacts={contacts} deals={deals} />}
      {meeting && <MeetingDialog open={meetingOpen} onClose={() => setMeetingOpen(false)} data={meeting} prefill={meetingPrefill} />}
      {taskData && <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} data={taskData} link={taskLink} />}
    </>
  )
}

function LogDialog({ type, onType, onClose, target, contacts, deals }: {
  type: LogInput['type']
  onType: (t: LogInput['type']) => void
  onClose: () => void
  target: { companyId: string | null; personId: string | null; opportunityId: string | null }
  contacts: Opt[]
  deals: Opt[]
}) {
  const now = new Date()
  const [summary, setSummary] = useState('')
  const [outcome, setOutcome] = useState('')
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [date, setDate] = useState(now.toLocaleDateString('en-CA'))
  const [time, setTime] = useState(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
  const [personId, setPersonId] = useState(target.personId ?? '')
  const [opportunityId, setOpportunityId] = useState(target.opportunityId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const isNote = type === 'note'

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await logActivity({
        type,
        companyId: target.companyId,
        personId: personId || null,
        opportunityId: opportunityId || null,
        summary,
        outcome: isNote ? null : outcome,
        direction: isNote ? null : direction,
        occurredAt: new Date(`${date}T${time}:00`).toISOString(),
      })
      if (res.error) setError(res.error)
      else onClose()
    })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 6 }}>
          {ACTIONS.map(a => (
            <button key={a.type} onClick={() => onType(a.type)} style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', border: 'none', background: type === a.type ? '#111827' : '#f3f4f6', color: type === a.type ? '#fff' : '#374151' }}>
              {a.icon} {a.label}
            </button>
          ))}
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>{isNote ? 'Notiz' : 'Worum ging es?'}</label>
            <textarea autoFocus value={summary} onChange={e => setSummary(e.target.value)} rows={isNote ? 5 : 3}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
              placeholder={isNote ? 'Einwände, Budget, Timing, Eindrücke …' : 'z. B. Erstgespräch zu Recruiting-Volumen'} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          {!isNote && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={label}>Ergebnis</label>
                <input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="z. B. Demo vereinbart" style={input} />
              </div>
              <div>
                <label style={label}>Richtung</label>
                <select value={direction} onChange={e => setDirection(e.target.value as any)} style={input}>
                  <option value="outbound">Ausgehend (wir)</option>
                  <option value="inbound">Eingehend (Kunde)</option>
                </select>
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: contacts.length || deals.length ? '1fr 1fr' : '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>Datum</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Uhrzeit</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={input} />
            </div>
          </div>
          {(contacts.length > 0 || deals.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {contacts.length > 0 && (
                <div>
                  <label style={label}>Kontakt</label>
                  <select value={personId} onChange={e => setPersonId(e.target.value)} style={input}>
                    <option value="">— keiner —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {deals.length > 0 && (
                <div>
                  <label style={label}>Deal</label>
                  <select value={opportunityId} onChange={e => setOpportunityId(e.target.value)} style={input}>
                    <option value="">— keiner —</option>
                    {deals.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          {error && <p style={{ fontSize: 12, color: '#dc2626' }}>{error}</p>}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>⌘/Strg + Enter</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', padding: '9px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: '#fff', cursor: 'pointer' }}>Abbrechen</button>
          <button onClick={submit} disabled={pending || !summary.trim()} style={{ padding: '9px 18px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: pending || !summary.trim() ? '#9ca3af' : '#2563eb', color: '#fff' }}>
            {pending ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
