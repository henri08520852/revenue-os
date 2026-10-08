'use client'

import { useEffect, useState, useTransition } from 'react'
import { createTask, updateTask } from '@/app/(dashboard)/tasks/actions'

export type TaskPickData = {
  team: { user_id: string; display_name: string }[]
  meId: string | null
  companies: { id: string; name: string }[]
  people: { id: string; company_id: string | null; name: string }[]
  deals: { id: string; name: string; company_id: string }[]
  leads: { id: string; label: string }[]
}

export type TaskLink = { companyId?: string | null; personId?: string | null; opportunityId?: string | null; leadId?: string | null }

export type EditableTask = {
  id: string
  title: string
  notes: string | null
  task_type: string
  due_at: string | null
  has_time: boolean
  owner_id: string | null
}

export const TASK_TYPES = [
  { key: 'todo', label: 'To-do', icon: '☑️' },
  { key: 'call', label: 'Anruf', icon: '📞' },
  { key: 'email', label: 'E-Mail', icon: '✉️' },
  { key: 'follow_up', label: 'Follow-up', icon: '🔁' },
  { key: 'meeting', label: 'Meeting', icon: '📅' },
]

const TZ = 'Europe/Berlin'
const label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const input = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' as const }

const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dayKey(d) }
const nextWorkday = () => { const d = new Date(); do { d.setDate(d.getDate() + 1) } while ([0, 6].includes(d.getDay())); return dayKey(d) }

// Date-only tasks are stored at 10:00 UTC (same calendar day in Berlin all year)
export function dueToIso(date: string, time: string | null) {
  if (!date) return null
  return time ? new Date(`${date}T${time}:00`).toISOString() : `${date}T10:00:00.000Z`
}

export default function TaskDialog({ open, onClose, data, link, task, defaultDate }: {
  open: boolean
  onClose: () => void
  data: TaskPickData
  link?: TaskLink              // fixed context (record page); without it the user picks one
  task?: EditableTask | null   // edit mode
  defaultDate?: string
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('todo')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [notes, setNotes] = useState('')
  const [linkKind, setLinkKind] = useState<'company' | 'deal' | 'lead' | 'person'>('deal')
  const [linkId, setLinkId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fixed = !!link && !!(link.companyId || link.personId || link.opportunityId || link.leadId)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (task) {
      setTitle(task.title); setType(task.task_type); setNotes(task.notes ?? ''); setOwnerId(task.owner_id ?? '')
      setDate(task.due_at ? dayKey(new Date(task.due_at)) : '')
      setTime(task.due_at && task.has_time ? new Date(task.due_at).toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '')
    } else {
      setTitle(''); setType('todo'); setNotes(''); setOwnerId(data.meId ?? '')
      setDate(defaultDate ?? nextWorkday()); setTime('')
      setLinkKind(data.deals.length ? 'deal' : 'company'); setLinkId('')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickOptions = linkKind === 'company' ? data.companies.map(c => ({ id: c.id, label: c.name }))
    : linkKind === 'deal' ? data.deals.map(d => ({ id: d.id, label: d.name }))
    : linkKind === 'lead' ? data.leads
    : data.people.map(p => ({ id: p.id, label: p.name }))

  function submit() {
    setError(null)
    const dueIso = dueToIso(date, time || null)
    startTransition(async () => {
      let res
      if (task) {
        res = await updateTask(task.id, { title, taskType: type, dueIso, hasTime: !!time, ownerId: ownerId || null, notes })
      } else {
        const l: TaskLink = fixed ? link! : {
          companyId: linkKind === 'company' ? linkId || null : null,
          opportunityId: linkKind === 'deal' ? linkId || null : null,
          leadId: linkKind === 'lead' ? linkId || null : null,
          personId: linkKind === 'person' ? linkId || null : null,
        }
        res = await createTask({
          title, taskType: type, dueIso, hasTime: !!time, ownerId: ownerId || null, notes,
          companyId: l.companyId ?? null, personId: l.personId ?? null, opportunityId: l.opportunityId ?? null, leadId: l.leadId ?? null,
        })
      }
      if (res.error) setError(res.error)
      else onClose()
    })
  }

  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{task ? 'Aufgabe bearbeiten' : '☑️ Neue Aufgabe'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>Aufgabe</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && title.trim()) submit() }}
              placeholder="z. B. Angebot nachfassen" style={input} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TASK_TYPES.map(t => (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${type === t.key ? '#2563eb' : '#e5e7eb'}`, background: type === t.key ? '#eff6ff' : '#fff', color: type === t.key ? '#1d4ed8' : '#4b5563' }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div>
            <label style={label}>Fällig</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {[{ l: 'Heute', d: addDays(0) }, { l: 'Morgen', d: addDays(1) }, { l: 'In 3 Tagen', d: addDays(3) }, { l: 'In 1 Woche', d: addDays(7) }].map(q => (
                <button key={q.l} type="button" onClick={() => setDate(q.d)} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 14, border: '1px solid #e5e7eb', background: date === q.d ? '#111827' : '#fff', color: date === q.d ? '#fff' : '#4b5563', cursor: 'pointer' }}>{q.l}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={input} title="Uhrzeit (optional)" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: fixed || task ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>Zuständig</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)} style={input}>
                <option value="">— niemand —</option>
                {data.team.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}{m.user_id === data.meId ? ' (du)' : ''}</option>)}
              </select>
            </div>
            {!fixed && !task && (
              <div>
                <label style={label}>Verknüpft mit</label>
                <select value={linkKind} onChange={e => { setLinkKind(e.target.value as any); setLinkId('') }} style={input}>
                  <option value="deal">Deal</option>
                  <option value="lead">Lead</option>
                  <option value="company">Company</option>
                  <option value="person">Kontakt</option>
                </select>
              </div>
            )}
          </div>
          {!fixed && !task && (
            <select value={linkId} onChange={e => setLinkId(e.target.value)} style={input}>
              <option value="">{pickOptions.length ? '— optional wählen —' : 'nichts vorhanden'}</option>
              {pickOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <div>
            <label style={label}>Notiz (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#dc2626' }}>{error}</p>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: '#fff', cursor: 'pointer' }}>Abbrechen</button>
          <button onClick={submit} disabled={pending || !title.trim()} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, background: pending || !title.trim() ? '#9ca3af' : '#2563eb', color: '#fff', cursor: 'pointer' }}>
            {pending ? 'Speichern…' : task ? 'Speichern' : 'Aufgabe anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
