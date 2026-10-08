'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setFollowUp } from './actions'

type Option = { id: string; label: string }

const KINDS = [
  { key: 'lead',    label: 'Lead',    hint: 'Follow-up-Datum am Lead' },
  { key: 'deal',    label: 'Deal',    hint: 'Nächster Schritt mit Fälligkeit' },
  { key: 'company', label: 'Company', hint: 'Erinnerung an der Company' },
] as const

const label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const input = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' as const }

export default function FollowUpDialog({ open, onClose, date: initialDate, leads, deals, companies }: {
  open: boolean
  onClose: () => void
  date: string
  leads: Option[]
  deals: Option[]
  companies: Option[]
}) {
  const [kind, setKind] = useState<'lead' | 'deal' | 'company'>('deal')
  const [id, setId] = useState('')
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    setKind(deals.length ? 'deal' : leads.length ? 'lead' : 'company')
    setId(''); setDate(initialDate); setTime(''); setNote(''); setError(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = kind === 'lead' ? leads : kind === 'deal' ? deals : companies

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await setFollowUp({ kind, id, date, time: time || null, note: note.trim() || null, tzOffsetMin: new Date(`${date}T12:00:00`).getTimezoneOffset() })
      if (res.error) setError(res.error)
      else { onClose(); router.refresh() }
    })
  }

  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: 440 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>⏰ Follow-up / Deadline setzen</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={label}>Für</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {KINDS.map(k => (
                <button key={k.key} type="button" onClick={() => { setKind(k.key); setId('') }}
                  style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${kind === k.key ? '#2563eb' : '#e5e7eb'}`, background: kind === k.key ? '#eff6ff' : '#fff', color: kind === k.key ? '#1d4ed8' : '#6b7280' }}>
                  {k.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>{KINDS.find(k => k.key === kind)!.hint}</p>
          </div>
          <div>
            <label style={label}>{KINDS.find(k => k.key === kind)!.label} wählen</label>
            <select value={id} onChange={e => setId(e.target.value)} style={input}>
              <option value="">{options.length ? '— wählen —' : 'nichts vorhanden'}</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>Datum</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Uhrzeit (optional)</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={input} />
            </div>
          </div>
          <div>
            <label style={label}>{kind === 'deal' ? 'Nächster Schritt' : 'Notiz'} (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'deal' ? 'z. B. Angebot nachfassen' : 'Worum geht es?'} style={input} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#dc2626' }}>{error}</p>}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: 'white', cursor: 'pointer' }}>Abbrechen</button>
          <button onClick={submit} disabled={pending || !id} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: pending || !id ? '#9ca3af' : '#2563eb', color: '#fff' }}>
            {pending ? 'Speichern…' : 'Setzen'}
          </button>
        </div>
      </div>
    </div>
  )
}
