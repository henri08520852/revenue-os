'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

type EvidenceItem = { title?: string; link?: string; source?: string }
type Candidate = { id: string; name: string; signal_hint: string | null; confidence: number | null; evidence: EvidenceItem[] | null }
type FilterKey = 'all' | 'funding' | 'expansion' | 'leadership'

const SIGNAL_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  news_funding:    { label: 'Funding',    bg: '#eff6ff', color: '#1d4ed8' },
  news_expansion:  { label: 'Expansion',  bg: '#f0fdf4', color: '#15803d' },
  news_leadership: { label: 'Leadership', bg: '#faf5ff', color: '#7e22ce' },
}
function signalBadge(hint: string | null) {
  if (!hint) return { label: 'Signal', bg: '#f3f4f6', color: '#6b7280' }
  return SIGNAL_BADGE[hint] ?? { label: hint.replace('news_', ''), bg: '#f3f4f6', color: '#6b7280' }
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'funding', label: 'Funding' },
  { key: 'expansion', label: 'Expansion' },
  { key: 'leadership', label: 'Leadership' },
]

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [actioning, setActioning] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase.from('candidate_companies').select('id, name, signal_hint, confidence, evidence').eq('status', 'pending').eq('project_id', PROJECT_ID).order('confidence', { ascending: false })
      .then(({ data, error }) => { if (!error && data) setCandidates(data as Candidate[]); setLoading(false) })
  }, [])

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActioning(prev => ({ ...prev, [id]: true }))
    try {
      await fetch(`/api/candidates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      setCandidates(prev => prev.filter(c => c.id !== id))
    } catch { setActioning(prev => ({ ...prev, [id]: false })) }
  }

  const visible = candidates.filter(c => filter === 'all' || c.signal_hint === `news_${filter}`)

  if (loading) return <div style={{ padding: '40px', color: '#9ca3af', fontSize: 14 }}>Lade Kandidaten…</div>

  return (
    <div style={{ padding: '32px', maxWidth: 780 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Candidates</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{candidates.length} ausstehend</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {FILTERS.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, border: filter === key ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb', background: filter === key ? '#eff6ff' : '#fff', color: filter === key ? '#1d4ed8' : '#6b7280', cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
      {candidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#6b7280', fontSize: 16 }}>🎉 Alle Kandidaten reviewed!</div>
      ) : visible.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 14, padding: '32px 0' }}>Keine Kandidaten für diesen Filter.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(c => {
            const badge = signalBadge(c.signal_hint)
            const evidence = Array.isArray(c.evidence) ? c.evidence.slice(0, 3) : []
            const busy = actioning[c.id]
            return (
              <div key={c.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{c.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: badge.bg, color: badge.color }}>{badge.label}</span>
                  {c.confidence != null && <span style={{ fontSize: 12, color: '#9ca3af' }}>{c.confidence}% confidence</span>}
                </div>
                {evidence.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Evidence</p>
                    {evidence.map((ev, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: '#d1d5db' }}>•</span>
                        {ev.link ? <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>{ev.title || ev.link}</a> : <span style={{ fontWeight: 500, color: '#374151' }}>{ev.title || '—'}</span>}
                        {ev.source && <span style={{ color: '#9ca3af', fontSize: 11 }}>— {ev.source}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => handleAction(c.id, 'reject')} disabled={busy} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid #e5e7eb', background: '#f3f4f6', color: '#6b7280', cursor: busy ? 'not-allowed' : 'pointer' }}>✗ Skip</button>
                  <button onClick={() => handleAction(c.id, 'approve')} disabled={busy} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid #16a34a', background: '#22c55e', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer' }}>✓ Approve</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
