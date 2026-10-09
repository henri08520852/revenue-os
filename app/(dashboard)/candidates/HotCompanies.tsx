'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { enrichMissing, rejectCandidate, searchNow, takeCandidate } from './actions'

type Evidence = { title?: string; link?: string | null; source?: string }
type Hiring = {
  hrRoles?: string[]
  industry?: { key: string; label: string } | null
  officeShare?: number | null
  sourceCount?: number
  open: number; new14: number; repeated: { role: string; count: number }[]; volumeRoles: number
  ats: string[]; locations: string[]; countries: string[]; sources: string[]; updatedAt: string
}
type Candidate = {
  id: string; name: string; source_type: string; signal_hint: string | null; confidence: number | null; score: number | null
  hiring: Hiring | null; evidence: Evidence[] | null; existing_company_id: string | null; updated_at: string | null; created_at: string
  enrichment_data?: {
    v?: number
    northdata?: { employees?: number | null; signals?: string[] }
    hrContact?: { name: string | null; title: string | null; email: string | null; phone: string | null; job: string | null; source: string } | null
    impressum?: { website: string | null; domain: string | null; managers: string[]; register: string | null; email: string | null; phone: string | null; employees: number | null; checkedAt: string; note?: string }
  } | null
}
export type SourceStatus = { name: string; area: string; active: boolean; note: string; postings: number | null; lastAt: string | null }

const ENRICH_VERSION = 2 // keep in sync with lib/discovery/enrich.ts
const NEWS_LABEL: Record<string, string> = { news_funding: 'Funding', news_expansion: 'Expansion', news_leadership: 'Leadership' }
const SOURCE_LABEL: Record<string, string> = { ba: 'BA-Jobbörse', google_jobs: 'Google Jobs', eures: 'EURES', personio: 'Personio', softgarden: 'softgarden', join: 'JOIN', onlyfy: 'onlyfy', dvinci: 'd.vinci', rexx: 'rexx', concludis: 'concludis', recruitee: 'Recruitee', greenhouse: 'Greenhouse', lever: 'Lever', workable: 'Workable', smartrecruiters: 'SmartRecruiters' }

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
const chip = (bg: string, color: string) => ({ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 12, background: bg, color } as const)
const btn = (primary = false) => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  border: primary ? '1px solid #2563eb' : '1px solid #e5e7eb', background: primary ? '#2563eb' : '#fff', color: primary ? '#fff' : '#374151',
} as const)

function scoreColor(s: number) {
  return s >= 70 ? { bg: '#fee2e2', color: '#b91c1c' } : s >= 45 ? { bg: '#ffedd5', color: '#c2410c' } : { bg: '#f3f4f6', color: '#4b5563' }
}

function Sources({ sources }: { sources: SourceStatus[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginBottom: 18 }}>
      {sources.map(s => (
        <div key={s.name} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#111827' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: s.active ? '#22c55e' : '#d1d5db' }} />{s.name}
          </div>
          <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{s.area}</div>
          <div style={{ fontSize: 11.5, color: s.active ? '#374151' : '#b45309', marginTop: 4 }}>
            {s.postings != null && s.active ? `${s.postings.toLocaleString('de-DE')} Stellen · ` : ''}{s.note}
            {s.lastAt ? ` · ${new Date(s.lastAt).toLocaleDateString('de-DE')}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function HotCompanies({ hiring, news, sources }: { hiring: Candidate[]; news: Candidate[]; sources: SourceStatus[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'hiring' | 'news'>('hiring')
  const [country, setCountry] = useState('all')
  const [industry, setIndustry] = useState('all')
  const [officeOnly, setOfficeOnly] = useState(false)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  // Website & Impressum load by themselves: the top cards still missing them are read in small batches
  const [reading, setReading] = useState<Set<string>>(new Set())
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const missing = hiring.filter(c => (c.enrichment_data?.v ?? 0) < ENRICH_VERSION).slice(0, 24).map(c => c.id)
    if (!missing.length) return
    setReading(new Set(missing))
    ;(async () => {
      for (let i = 0; i < missing.length; i += 6) {
        const batch = missing.slice(i, i + 6)
        await enrichMissing(batch).catch(() => null)
        setReading(prev => { const n = new Set(prev); batch.forEach(id => n.delete(id)); return n })
        router.refresh()
      }
    })()
  }, [hiring, router])

  const list = (tab === 'hiring' ? hiring : news)
    .filter(c => !gone.has(c.id))
    .filter(c => tab !== 'hiring' || country === 'all' || c.hiring?.countries?.includes(country))
    .filter(c => tab !== 'hiring' || industry === 'all' || (industry === 'none' ? !c.hiring?.industry : c.hiring?.industry?.key === industry))
    .filter(c => tab !== 'hiring' || !officeOnly || (c.hiring?.officeShare ?? 0) >= 50)
  const countries = Array.from(new Set(hiring.flatMap(c => c.hiring?.countries || [])))
  const industries = Array.from(hiring.reduce((m, c) => {
    const ind = c.hiring?.industry
    if (ind) m.set(ind.key, { label: ind.label, n: (m.get(ind.key)?.n || 0) + 1 })
    return m
  }, new Map<string, { label: string; n: number }>()).entries()).sort((a, b) => b[1].n - a[1].n)

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
      setMsg(res.error ? `Fehler bei der Suche: ${res.error}` : `Suche fertig – ${res.summary}`)
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

      <Sources sources={sources} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {([['hiring', `Einstellungsdruck (${hiring.length})`], ['news', `News (${news.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: tab === key ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb', background: tab === key ? '#eff6ff' : '#fff', color: tab === key ? '#1d4ed8' : '#6b7280' }}>{label}</button>
        ))}
        {tab === 'hiring' && industries.length > 0 && (
          <>
            <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
              <option value="all">Alle Branchen</option>
              {industries.map(([key, v]) => <option key={key} value={key}>{v.label} ({v.n})</option>)}
              <option value="none">Branche unklar</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={officeOnly} onChange={e => setOfficeOnly(e.target.checked)} /> vor allem Bürojobs
            </label>
          </>
        )}
        {tab === 'hiring' && countries.length > 1 && (
          <select value={country} onChange={e => setCountry(e.target.value)} style={{ marginLeft: industries.length ? 0 : 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
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
                  {c.enrichment_data?.impressum?.employees != null && (
                    <span style={c.enrichment_data.impressum.employees > 250 ? chip('#fef2f2', '#b91c1c') : chip('#f0fdf4', '#15803d')}>
                      ~{c.enrichment_data.impressum.employees.toLocaleString('de-DE')} Mitarbeitende{c.enrichment_data.impressum.employees > 250 ? ' – größer als Zielgruppe' : ''}
                    </span>
                  )}
                  {c.enrichment_data?.northdata?.employees != null && (
                    <span style={c.enrichment_data.northdata.employees > 250 ? chip('#fef2f2', '#b91c1c') : chip('#f0fdf4', '#15803d')}>
                      ~{c.enrichment_data.northdata.employees} Mitarbeitende{c.enrichment_data.northdata.employees > 250 ? ' – größer als Zielgruppe' : ''}
                    </span>
                  )}
                </div>

                {h && (
                  <>
                    <div style={{ fontSize: 14, color: '#111827', marginBottom: 8 }}>
                      <b>{h.open} offene Stellen</b>
                      {h.new14 > 0 && <> · {h.new14} neu in 14 Tagen</>}
                      {h.volumeRoles > 0 && <> · {h.volumeRoles} bewerberstarke Rollen</>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {h.industry && <span style={chip('#e0f2fe', '#0369a1')}>{h.industry.label}</span>}
                      {h.officeShare != null && <span title="Anteil Büro-/Wissensjobs an den offenen Stellen" style={h.officeShare >= 60 ? chip('#dcfce7', '#15803d') : h.officeShare <= 25 ? chip('#fef2f2', '#b91c1c') : chip('#f3f4f6', '#4b5563')}>{h.officeShare} % Bürojobs</span>}
                      {(h.sourceCount ?? 0) >= 2 && <span title={h.sources.join(', ')} style={chip('#ecfdf5', '#047857')}>✓ in {h.sourceCount} Quellen</span>}
                      {!!h.hrRoles?.length && <span title={h.hrRoles.join(' · ')} style={chip('#ede9fe', '#6d28d9')}>👥 baut Recruiting auf ({h.hrRoles.length} HR-Stelle{h.hrRoles.length > 1 ? 'n' : ''})</span>}
                      {h.repeated.slice(0, 3).map(r => <span key={r.role} style={chip('#fef3c7', '#92400e')}>{r.count}× {r.role}</span>)}
                      <span style={h.ats.length ? chip('#f3f4f6', '#374151') : chip('#dcfce7', '#15803d')}>{h.ats.length ? `ATS: ${h.ats.join(', ')}` : 'Kein ATS erkannt'}</span>
                      {h.locations.slice(0, 3).map(l => <span key={l} style={chip('#f9fafb', '#6b7280')}>📍 {l}</span>)}
                    </div>
                  </>
                )}

                {h && (() => {
                  const imp = c.enrichment_data?.impressum
                  if (!imp || reading.has(c.id)) return (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                      {reading.has(c.id) ? '⏳ Website, Impressum & Ansprechpartner werden gelesen …' : 'Website & Impressum folgen beim nächsten Abgleich.'}
                    </div>
                  )
                  return (
                    <div style={{ fontSize: 12.5, color: '#374151', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 8, padding: '8px 10px', marginBottom: 10, lineHeight: 1.6 }}>
                      {imp.website ? <a href={imp.website} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>🌐 {imp.domain}</a> : <span style={{ color: '#9ca3af' }}>{imp.note || 'Keine Website gefunden'}</span>}
                      {imp.managers.length > 0 && <> · <b>Geschäftsführung:</b> {imp.managers.join(', ')}</>}
                      {imp.register && <> · {imp.register}</>}
                      {(imp.email || imp.phone) && <div style={{ color: '#6b7280' }}>{[imp.email, imp.phone].filter(Boolean).join(' · ')}</div>}
                      {c.enrichment_data?.hrContact && (() => {
                        const hr = c.enrichment_data!.hrContact!
                        if (!hr.name) return null
                        return <div><b>HR-Kontakt:</b> {[hr.name, hr.title].filter(Boolean).join(', ')}{hr.email ? <> · <a href={`mailto:${hr.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{hr.email}</a></> : ''}{hr.phone ? ` · ${hr.phone}` : ''}<span style={{ color: '#9ca3af' }}> ({hr.source})</span></div>
                      })()}
                      {imp.website && imp.note && <div style={{ color: '#9ca3af' }}>{imp.note}</div>}
                    </div>
                  )
                })()}

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
