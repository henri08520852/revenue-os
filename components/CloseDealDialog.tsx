'use client'

import { useState, useTransition } from 'react'
import { LOST_REASONS, WON_REASONS } from '@/lib/dealMeta'
import { closeDeal } from '@/app/(dashboard)/opportunities/[id]/actions'

const label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const input = { width: '100%', padding: '8px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' as const }

// Asks for the reason when a deal is marked won or lost
export default function CloseDealDialog({ oppId, dealName, stage, onClose, onDone }: {
  oppId: string
  dealName: string
  stage: 'won' | 'lost'
  onClose: () => void
  onDone?: () => void
}) {
  const won = stage === 'won'
  const reasons = won ? WON_REASONS : LOST_REASONS
  const [reason, setReason] = useState('')
  const [competitor, setCompetitor] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await closeDeal(oppId, { stage, reason, competitor: competitor || null, note: note || null })
      if (res.error) setError(res.error)
      else { onDone?.(); onClose() }
    })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: won ? '#15803d' : '#374151' }}>{won ? '🎉 Deal gewonnen' : 'Deal verloren'}</h2>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{dealName}</p>
        </div>
        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>{won ? 'Warum gewonnen?' : 'Warum verloren?'}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {reasons.map(r => (
                <button key={r.key} onClick={() => setReason(r.key)}
                  style={{ padding: '6px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid', borderColor: reason === r.key ? '#111827' : '#e5e7eb', background: reason === r.key ? '#111827' : '#fff', color: reason === r.key ? '#fff' : '#374151' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={label}>Wettbewerber (optional)</label>
            <input value={competitor} onChange={e => setCompetitor(e.target.value)} placeholder={won ? 'Gegen wen haben wir gewonnen?' : 'An wen verloren?'} style={input} />
          </div>
          <div>
            <label style={label}>Learning (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Ein Satz, was wir daraus mitnehmen" style={{ ...input, resize: 'vertical' }} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#dc2626' }}>{error}</p>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: '#fff', cursor: 'pointer' }}>Abbrechen</button>
          <button onClick={submit} disabled={pending || !reason}
            style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: reason ? 'pointer' : 'default', background: !reason || pending ? '#9ca3af' : won ? '#16a34a' : '#374151', color: '#fff' }}>
            {pending ? 'Speichern…' : won ? 'Als gewonnen markieren' : 'Als verloren markieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
