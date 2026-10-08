'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QUALI_CRITERIA, Qualification, QualiKey, QualiStatus, qualiScore } from '@/lib/dealMeta'
import { saveQualification } from '@/app/(dashboard)/records/qualification'
import { convertLeadAtStage } from '@/app/(dashboard)/leads/actions'

const STATES: { key: QualiStatus; icon: string; title: string; on: { bg: string; fg: string; border: string } }[] = [
  { key: 'yes', icon: '✓', title: 'Bestätigt', on: { bg: '#dcfce7', fg: '#15803d', border: '#86efac' } },
  { key: 'unknown', icon: '?', title: 'Unklar', on: { bg: '#fef9c3', fg: '#a16207', border: '#fde047' } },
  { key: 'no', icon: '✕', title: 'Nein', on: { bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5' } },
]

// Slim qualification checklist (5 criteria) for a lead or a deal
export default function QualificationCard(props: { kind: 'lead' | 'deal'; id: string; initial: Qualification | null; readOnly?: boolean }) {
  return props.readOnly ? <QualificationSummary q={props.initial || {}} /> : <QualificationEditor {...props} />
}

function QualificationEditor({ kind, id, initial }: { kind: 'lead' | 'deal'; id: string; initial: Qualification | null }) {
  const router = useRouter()
  const [q, setQ] = useState<Qualification>(initial || {})
  const [dirty, setDirty] = useState(false)
  const [fromAi, setFromAi] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [pending, startTransition] = useTransition()
  const score = qualiScore(q)

  function set(key: QualiKey, patch: { status?: QualiStatus; note?: string }) {
    setQ(prev => {
      const cur = prev[key] ?? { status: 'unknown' as QualiStatus, note: '' }
      const status = patch.status && patch.status === cur.status && patch.note === undefined ? undefined : (patch.status ?? cur.status)
      const next = { ...prev }
      if (!status) delete next[key]
      else next[key] = { status, note: patch.note ?? cur.note ?? '' }
      return next
    })
    setDirty(true)
  }

  async function suggest() {
    setError(null); setAiBusy(true)
    try {
      const res = await fetch('/api/ai/qualify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id }) })
      const json = await res.json()
      if (!res.ok) setError(json.error || 'KI-Fehler')
      else {
        // Keep what was set by hand; fill the rest from the suggestion
        setQ(prev => {
          const next: Qualification = { ...json.qualification }
          for (const c of QUALI_CRITERIA) if (prev[c.key]?.status && prev[c.key]?.status !== 'unknown') next[c.key] = prev[c.key]
          return next
        })
        setDirty(true); setFromAi(true)
      }
    } catch { setError('KI nicht erreichbar') }
    setAiBusy(false)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await saveQualification(kind, id, q)
      if (res.error) setError(res.error)
      else { setDirty(false); setFromAi(false); router.refresh() }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: score >= 4 ? '#15803d' : score >= 2 ? '#a16207' : '#6b7280' }}>{score}/5 bestätigt</span>
          <span style={{ display: 'flex', gap: 3 }}>
            {QUALI_CRITERIA.map(c => <span key={c.key} style={{ width: 14, height: 5, borderRadius: 3, background: q[c.key]?.status === 'yes' ? '#22c55e' : q[c.key]?.status === 'no' ? '#f87171' : '#e5e7eb' }} />)}
          </span>
        </div>
        <button onClick={suggest} disabled={aiBusy} title="Vorschlag aus E-Mails, Notizen und Buying Center"
          style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 7, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#6d28d9', cursor: aiBusy ? 'default' : 'pointer' }}>
          {aiBusy ? 'Liest Verlauf…' : '✨ Aus E-Mails ausfüllen'}
        </button>
      </div>
      {fromAi && <p style={{ fontSize: 11, color: '#6d28d9', background: '#f5f3ff', borderRadius: 6, padding: '5px 8px', marginBottom: 8 }}>KI-Vorschlag – bitte prüfen und speichern.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {QUALI_CRITERIA.map(c => {
          const cur = q[c.key]
          return (
            <div key={c.key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span title={c.hint} style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>{c.label}</span>
                <span style={{ display: 'flex', gap: 3 }}>
                  {STATES.map(s => {
                    const on = cur?.status === s.key
                    return (
                      <button key={s.key} title={s.title} onClick={() => set(c.key, { status: s.key })}
                        style={{ width: 24, height: 22, fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: `1px solid ${on ? s.on.border : '#e5e7eb'}`, background: on ? s.on.bg : '#fff', color: on ? s.on.fg : '#9ca3af' }}>
                        {s.icon}
                      </button>
                    )
                  })}
                </span>
              </div>
              {cur && (
                <input value={cur.note ?? ''} onChange={e => set(c.key, { note: e.target.value })} placeholder={c.hint}
                  style={{ width: '100%', marginTop: 4, padding: '4px 8px', fontSize: 11.5, border: '1px solid #f3f4f6', borderRadius: 6, color: '#4b5563', background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
              )}
            </div>
          )
        })}
      </div>

      {error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 8 }}>{error}</p>}
      {kind === 'lead' && !dirty && score === QUALI_CRITERIA.length && (
        <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Alle Kriterien erfüllt – bereit für einen Deal.</p>
          <button onClick={() => startTransition(async () => {
              const res = await convertLeadAtStage(id, 'discovery')
              if (res.error) setError(res.error)
              else if (res.oppId) router.push(`/opportunities/${res.oppId}`)
            })} disabled={pending}
            style={{ width: '100%', marginTop: 6, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 7, background: '#16a34a', color: '#fff', cursor: 'pointer' }}>
            {pending ? 'Wird umgewandelt…' : '💼 In Deal umwandeln'}
          </button>
        </div>
      )}
      {dirty && (
        <button onClick={save} disabled={pending}
          style={{ width: '100%', marginTop: 10, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: pending ? '#9ca3af' : '#111827', color: '#fff', cursor: 'pointer' }}>
          {pending ? 'Speichern…' : 'Qualifizierung speichern'}
        </button>
      )}
    </div>
  )
}

// Read-only view on the deal: what was clarified while it was a lead
function QualificationSummary({ q }: { q: Qualification }) {
  const rows = QUALI_CRITERIA.filter(c => q[c.key])
  if (!rows.length) return <p style={{ fontSize: 12, color: '#9ca3af' }}>Beim Lead nicht erfasst.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(c => {
        const v = q[c.key]!
        const st = STATES.find(s => s.key === v.status)!
        return (
          <div key={c.key} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: st.on.bg, color: st.on.fg }}>{st.icon}</span>
            <span><b style={{ color: '#374151' }}>{c.label}</b>{v.note ? <span style={{ color: '#6b7280' }}> – {v.note}</span> : null}</span>
          </div>
        )
      })}
    </div>
  )
}
