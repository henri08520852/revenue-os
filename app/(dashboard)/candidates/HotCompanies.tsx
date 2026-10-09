'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rejectCandidate, searchNow, takeCandidate } from './actions'

type Evidence = { title?: string; link?: string | null; source?: string }
type Hiring = {
  open: number; new14: number; repeated: { role: string; count: number }[]; volumeRoles: number
  ats: string[]; locations: string[]; countries: string[]; sources: string[]; updatedAt: string
}
type Candidate = {
  id: string; name: string; source_type: string; signal_hint: string | null; confidence: number | null; score: number | null
  hiring: Hiring | null; evidence: Evidence[] | null; existing_company_id: string | null; updated_at: string | null; created_at: string
}

const NEWS_LABEL: Record<string, string> = { news_funding: 'Funding', news_expansion: 'Expansion', news_leadership: 'Leadership' }
const SOURCE_LABEL: Record<string, string> = { ba: 'BA-Jobbörse', google_jobs: 'Google Jobs' }

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
const chip = (bg: string, color: string) => ({ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 12, background: bg, color } as const)
const btn = (primary = false) => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  border: primary ? '1px solid #2563eb' : '1px solid #e5e7eb', background: primary ? '#2563eb' : '#fff', color: primary ? '#fff' : '#374151',
} as const)

function scoreColor(s: number) {
  return s >= 70 ? { bg: '#fee2e2', color: '#b91c1c' } : s >= 45 ? { bg: '#ffedd5', color: '#c2410c' } : { bg: '#f3f4f6', color: '#4b5563' }
}

export default function HotCompanies({ hiring, news }: { hiring: Candidate[]; news: Candidate[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'hiring' | 'news'>('hiring')
  const [country, setCountry] = useState('all')
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()

  const list = (tab === 'hiring' ? hiring : news)
    .filter(c => !gone.has(c.id))
    .filter(c => tab !== 'hiring' || country === 'all' || c.hiring?.countries?.includes(country))
  const countries = Array.from(new Set(hiring.flatMap(c => c.hiring?.countries || [])))

  async function act(c: Candidate, what: 'lead' | 'company' | 'reject') {
    setBusy(c.id); setMsg(null)
    const res = what === 'reject' ? await rejectCandidate(c.id) : await takeCandidate(c.id, what === 'lead')
    setBusy(null)
    if (res.error) { setMsg(`Fehler: ${res.error}`); return }
    setGone(prev => new Set(prev).add(c.id))
    if (what !== 'reject') setMsg(`${c.name} ${what === 'lead' ? 'ist als Lead in Outreach – Aufgabe „Erstansprache“ für morgen angelegt.' : 'ist jetzt als Company im CRM.'}`)
    if ('href' in res && res.href && what === 'lead') router.prefetch(res.href)
  }

  function runSearch() {
    setMsg(null)
    startSearch(async () => {
      const res = await searchNow()
      setMsg(res.error ? `Suche: ${res.error}` : `Suche fertig – ${res.summary}`)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Heiße Firmen</h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            Firmen in DACH mit vielen offenen Stellen – täglich aus Jobbörsen gesammelt. Personaldienstleister, Behörden und Konzerne sind ausgefiltert.
          </p>
        </div>
        <button onClick={runSearch} disabled={searching} style={{ ...btn(), whiteSpace: 'nowrap', opacity: searching ? 0.6 : 1 }}>
          {searching ? 'Sucht … (bis 1 Min.)' : '↻ Jetzt suchen'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {([['hiring', `Einstellungsdruck (${hiring.length})`], ['news', `News (${news.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: tab === key ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb', background: tab === key ? '#eff6ff' : '#fff', color: tab === key ? '#1d4ed8' : '#6b7280' }}>{label}</button>
        ))}
        {tab === 'hiring' && countries.length > 1 && (
          <select value={country} onChange={e => setCountry(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
            <option value="all">Alle Länder</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {msg && <div style={{ background: msg.startsWith('Fehler') ? '#fef2f2' : '#f0fdf4', color: msg.startsWith('Fehler') ? '#b91c1c' : '#15803d', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 16 }}>{msg}</div>}

      {!list.length ? (
        <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 14 }}>
          {tab === 'hiring' ? 'Noch keine Firmen mit Einstellungsdruck. Die Suche läuft jeden Morgen automatisch – oder oben „Jetzt suchen“.' : 'Keine News-Kandidaten offen.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(c => {
            const h = c.hiring
            const s = c.score ?? c.confidence ?? 0
            const sc = scoreColor(s)
            const jobs = Array.isArray(c.evidence) ? c.evidence : []
            return (
              <div key={c.id} style={{ ...card, opacity: busy === c.id ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{c.name}</span>
                  {h ? <span style={chip(sc.bg, sc.color)}>Score {s}</span> : <span style={chip('#eff6ff', '#1d4ed8')}>{NEWS_LABEL[c.signal_hint || ''] ?? 'News'}</span>}
                  {c.existing_company_id && <span style={chip('#e0e7ff', '#4338ca')}>Schon im CRM</span>}
                </div>

                {h && (
                  <>
                    <div style={{ fontSize: 14, color: '#111827', marginBottom: 8 }}>
                      <b>{h.open} offene Stellen</b>
                      {h.new14 > 0 && <> · {h.new14} neu in 14 Tagen</>}
                      {h.volumeRoles > 0 && <> · {h.volumeRoles} bewerberstarke Rollen</>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {h.repeated.slice(0, 3).map(r => <span key={r.role} style={chip('#fef3c7', '#92400e')}>{r.count}× {r.role}</span>)}
                      <span style={h.ats.length ? chip('#f3f4f6', '#374151') : chip('#dcfce7', '#15803d')}>{h.ats.length ? `ATS: ${h.ats.join(', ')}` : 'Kein ATS erkannt'}</span>
                      {h.locations.slice(0, 3).map(l => <span key={l} style={chip('#f9fafb', '#6b7280')}>📍 {l}</span>)}
                    </div>
                  </>
                )}

                {jobs.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {jobs.slice(0, 4).map((j, i) => (
                      <div key={i} style={{ fontSize: 12.5, color: '#6b7280', display: 'flex', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: '#d1d5db' }}>•</span>
                        {j.link ? <a href={j.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>{j.title || j.link}</a> : <span>{j.title}</span>}
                        {j.source && <span style={{ color: '#9ca3af' }}>— {j.source}</span>}
                      </div>
                    ))}
                    {h && h.open > jobs.length && <div style={{ fontSize: 12, color: '#9ca3af', marginLeft: 14 }}>+ {h.open - Math.min(jobs.length, 4)} weitere</div>}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: '#9ca3af', marginRight: 'auto' }}>
                    {h ? `Quelle: ${h.sources.map(x => SOURCE_LABEL[x] ?? x).join(', ')} · Stand ${new Date(h.updatedAt).toLocaleDateString('de-DE')}` : `Gefunden ${new Date(c.created_at).toLocaleDateString('de-DE')}`}
                  </span>
                  <button disabled={!!busy} onClick={() => act(c, 'reject')} style={btn()}>Verwerfen</button>
                  <button disabled={!!busy} onClick={() => act(c, 'company')} style={btn()}>Nur als Company</button>
                  <button disabled={!!busy} onClick={() => act(c, 'lead')} style={btn(true)}>Als Lead übernehmen</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
