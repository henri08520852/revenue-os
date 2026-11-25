'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Briefcase, Building2, Check, ExternalLink, Globe, Loader2, MapPin, RefreshCw, Search, UserRound, Users, X } from 'lucide-react'
import { contactSearchLinks } from '@/lib/outreach/linkedin'
import { enrichMissing, painsFor, rejectCandidate, searchNow, setCandidateSize, takeCandidate } from './actions'
import type { CandidatePain } from '@/lib/outreach/pains'
import { draftForLead } from '../agents/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Evidence = { title?: string; link?: string | null; source?: string }
type Hiring = {
  hrRoles?: string[]
  industry?: { key: string; label: string } | null
  officeShare?: number | null
  sourceCount?: number
  open: number; new14: number; repeated: { role: string; count: number }[]; volumeRoles: number
  ats: string[]; locations: string[]; countries: string[]; sources: string[]; updatedAt: string
  pain?: CandidatePain | null
}
type Candidate = {
  id: string; name: string; source_type: string; signal_hint: string | null; confidence: number | null; score: number | null
  hiring: Hiring | null; evidence: Evidence[] | null; existing_company_id: string | null; updated_at: string | null; created_at: string
  aliases?: string[]
  enrichment_data?: {
    v?: number
    sizeManual?: SizeKey | null
    northdata?: { employees?: number | null; signals?: string[] }
    hrContact?: { name: string | null; title: string | null; email: string | null; phone: string | null; job: string | null; source: string } | null
    impressum?: { website: string | null; domain: string | null; managers: string[]; register: string | null; email: string | null; phone: string | null; employees: number | null; checkedAt: string; note?: string; address?: { street: string; zip: string; city: string } | null }
  } | null
}
export type SourceStatus = { name: string; area: string; active: boolean; note: string; postings: number | null; lastAt: string | null }

const ENRICH_VERSION = 2 // keep in sync with lib/discovery/enrich.ts
const NEWS_LABEL: Record<string, string> = { news_funding: 'Funding', news_expansion: 'Expansion', news_leadership: 'Leadership' }
const SOURCE_LABEL: Record<string, string> = { ba: 'BA-Jobbörse', google_jobs: 'Google Jobs', eures: 'EURES', personio: 'Personio', softgarden: 'softgarden', join: 'JOIN', onlyfy: 'onlyfy', dvinci: 'd.vinci', rexx: 'rexx', concludis: 'concludis', recruitee: 'Recruitee', greenhouse: 'Greenhouse', lever: 'Lever', workable: 'Workable', smartrecruiters: 'SmartRecruiters' }

// Size classes. Known = employee count from website/Impressum, BA job ad or Northdata, or set by hand.
// No guessing from the number of open jobs: in our data the same 4 open jobs belong to firms with 30 and with 100,000 people.
type SizeKey = 'small' | 'mid' | 'large' | 'enterprise'
const SIZES: { key: SizeKey; label: string; min: number; max: number }[] = [
  { key: 'small', label: 'Klein · 1–49', min: 1, max: 49 },
  { key: 'mid', label: 'Mittel · 50–249', min: 50, max: 249 },
  { key: 'large', label: 'Groß · 250–999', min: 250, max: 999 },
  { key: 'enterprise', label: 'Enterprise · ab 1.000', min: 1000, max: Infinity },
]
type Size = { n: number | null; key: SizeKey | null; manual: boolean }
function sizeOf(c: Candidate): Size {
  const n = c.enrichment_data?.impressum?.employees ?? c.enrichment_data?.northdata?.employees ?? null
  if (n != null && n > 0) return { n, key: SIZES.find(x => n <= x.max)!.key, manual: false }
  const m = c.enrichment_data?.sizeManual
  return { n: null, key: m && SIZES.some(x => x.key === m) ? m : null, manual: !!m }
}
// Own range: known count must lie inside; a size set by hand counts when its whole class lies inside
function inRange(s: Size, min: number | null, max: number | null) {
  const lo = min ?? 0, hi = max ?? Infinity
  if (s.n != null) return s.n >= lo && s.n <= hi
  const b = SIZES.find(x => x.key === s.key)
  return !!b && b.min >= lo && b.max <= hi
}

function scoreTone(s: number) {
  return s >= 70 ? 'bg-red-50 text-red-700 ring-red-200' : s >= 45 ? 'bg-orange-50 text-orange-700 ring-orange-200' : 'bg-muted text-muted-foreground ring-border'
}

function Sources({ sources }: { sources: SourceStatus[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      {sources.map(s => (
        <div key={s.name} className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-card">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span className={cn('size-1.5 rounded-full', s.active ? 'bg-emerald-500' : 'bg-slate-300')} />{s.name}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{s.area}</p>
          <p className={cn('mt-1 text-[11.5px]', s.active ? 'text-foreground/80' : 'text-amber-700')}>
            {s.postings != null && s.active ? <span className="tabular font-medium">{s.postings.toLocaleString('de-DE')} Stellen · </span> : ''}{s.note}
          </p>
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
  const [size, setSize] = useState('all')
  const [range, setRange] = useState<{ min: string; max: string }>({ min: '', max: '' })
  const [manualSize, setManualSize] = useState<Record<string, SizeKey | null>>({})
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  // Website & Impressum load by themselves: the top cards still missing them are read in small batches
  const [reading, setReading] = useState<Set<string>>(new Set())
  const started = useRef(false)
  // Pain per company: stored ones (< 1 day old) right away, the rest is checked in the background
  const fresh = (p?: CandidatePain | null) => !!p && Date.now() - Date.parse(p.at) < 86400000
  const [pains, setPains] = useState<Record<string, CandidatePain | null>>(() =>
    Object.fromEntries(hiring.filter(c => fresh(c.hiring?.pain)).map(c => [c.id, c.hiring!.pain!])))
  const [sort, setSort] = useState<'score' | 'pain'>('pain')
  const painsStarted = useRef(false)
  useEffect(() => {
    if (painsStarted.current) return
    painsStarted.current = true
    const missing = hiring.filter(c => !fresh(c.hiring?.pain)).map(c => c.id)
    ;(async () => {
      for (let i = 0; i < missing.length; i += 40) {
        const r = await painsFor(missing.slice(i, i + 40)).catch(() => null)
        if (r?.pains) setPains(prev => ({ ...prev, ...r.pains }))
      }
    })()
  }, [hiring])
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

  const sizeFor = (c: Candidate) => c.id in manualSize ? sizeOf({ ...c, enrichment_data: { ...(c.enrichment_data || {}), sizeManual: manualSize[c.id] } }) : sizeOf(c)
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(+v) ? null : +v)
  const matchesSize = (c: Candidate) => {
    if (size === 'all') return true
    const s = sizeFor(c)
    if (size === 'unknown') return s.key == null
    if (size === 'range') return inRange(s, num(range.min), num(range.max))
    return s.key === size
  }
  const list = (tab === 'hiring' ? hiring : news)
    .filter(c => !gone.has(c.id))
    .filter(c => tab !== 'hiring' || country === 'all' || c.hiring?.countries?.includes(country))
    .filter(c => tab !== 'hiring' || matchesSize(c))
    .filter(c => tab !== 'hiring' || industry === 'all' || (industry === 'none' ? !c.hiring?.industry : c.hiring?.industry?.key === industry))
    .sort((a, b) => tab !== 'hiring' || sort === 'score' ? 0 : (pains[b.id]?.strength ?? -1) - (pains[a.id]?.strength ?? -1) || (b.score ?? 0) - (a.score ?? 0))
  const sizeCounts = hiring.filter(c => !gone.has(c.id)).reduce((m, c) => { const k = sizeFor(c).key ?? 'unknown'; m[k] = (m[k] || 0) + 1; return m }, {} as Record<string, number>)
  async function saveSize(c: Candidate, key: SizeKey | null) {
    setManualSize(prev => ({ ...prev, [c.id]: key }))
    const r = await setCandidateSize(c.id, key)
    if (r.error) toast.error(r.error)
  }
  const countries = Array.from(new Set(hiring.flatMap(c => c.hiring?.countries || [])))
  const industries = Array.from(hiring.reduce((m, c) => {
    const ind = c.hiring?.industry
    if (ind) m.set(ind.key, { label: ind.label, n: (m.get(ind.key)?.n || 0) + 1 })
    return m
  }, new Map<string, { label: string; n: number }>()).entries()).sort((a, b) => b[1].n - a[1].n)

  async function act(c: Candidate, what: 'lead' | 'company' | 'reject') {
    setBusy(c.id)
    const res = await (what === 'reject' ? rejectCandidate(c.id) : takeCandidate(c.id, what === 'lead'))
      .catch((e: any) => ({ error: `Nicht gespeichert: ${e?.message || 'Verbindung'} – Seite neu laden und nochmal versuchen` }))
    setBusy(null)
    if (res.error) { toast.error(res.error); return }
    setGone(prev => new Set(prev).add(c.id))
    const href = 'href' in res ? res.href : undefined
    if (what === 'reject') toast(`${c.name} verworfen`)
    else toast.success(what === 'lead' ? `${c.name} ist als Lead in Outreach` : `${c.name} ist jetzt im CRM`, {
      description: what === 'lead' ? 'Aufgaben angelegt – der Agent schreibt jetzt die Erstnachricht.' : undefined,
      action: href ? { label: 'Öffnen', onClick: () => router.push(href) } : undefined,
    })
    // First-message agent drafts in the background; the draft waits under Agents → Freigaben
    const leadId = 'leadId' in res ? res.leadId : undefined
    if (what === 'lead' && leadId) draftForLead(leadId).then(r => {
      if (r.summary) toast.success(`Entwurf für ${c.name} ist fertig`, { action: { label: 'Ansehen', onClick: () => router.push('/agents') } })
      else if (r.error) toast.error(`Entwurf: ${r.error}`)
    })
  }

  function runSearch() {
    startSearch(async () => {
      const res = await searchNow()
      if (res.error) toast.error('Suche fehlgeschlagen', { description: res.error })
      else toast.success('Suche fertig', { description: res.summary })
      router.refresh()
    })
  }

  const tabs = [['hiring', 'Einstellungsdruck', hiring.length], ['news', 'News', news.length]] as const

  return (
    <div className="mx-auto max-w-[1000px] px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Heiße Firmen</h1>
          <p className="mt-1 max-w-[620px] text-sm text-muted-foreground">
            Firmen in DACH mit vielen offenen Stellen – täglich aus Jobbörsen und Karriereseiten gesammelt. Personaldienstleister, Behörden und Konzerne sind ausgefiltert.
          </p>
        </div>
        <Button variant="outline" onClick={runSearch} disabled={searching}>
          {searching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {searching ? 'Sucht …' : 'Jetzt suchen'}
        </Button>
      </div>

      <Sources sources={sources} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {tabs.map(([key, label, n]) => (
            <button key={key} onClick={() => setTab(key)} className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {label} <span className="tabular ml-1 text-muted-foreground">{n}</span>
            </button>
          ))}
        </div>
        {tab === 'hiring' && (
          <div className="ml-auto flex gap-2">
            <Select value={sort} onChange={e => setSort(e.target.value as any)} className="h-8 text-[13px]">
              <option value="pain">Stärkster Pain zuerst</option>
              <option value="score">Höchster Score zuerst</option>
            </Select>
            <Select value={size} onChange={e => setSize(e.target.value)} className="h-8 text-[13px]" title="Größe nach Mitarbeitenden (aus Website/Impressum, Stellenanzeige oder von Hand eingetragen)">
              <option value="all">Alle Größen</option>
              {SIZES.map(x => <option key={x.key} value={x.key}>{x.label} ({sizeCounts[x.key] || 0})</option>)}
              <option value="unknown">Größe unbekannt ({sizeCounts.unknown || 0})</option>
              <option value="range">Eigene Spanne …</option>
            </Select>
            {size === 'range' && (
              <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                <Input type="number" min={0} inputMode="numeric" placeholder="von" value={range.min} onChange={e => setRange(r => ({ ...r, min: e.target.value }))} className="h-8 w-20 px-2 text-[13px]" />
                –
                <Input type="number" min={0} inputMode="numeric" placeholder="bis" value={range.max} onChange={e => setRange(r => ({ ...r, max: e.target.value }))} className="h-8 w-20 px-2 text-[13px]" />
                <span>MA</span>
              </div>
            )}
            {industries.length > 0 && (
              <Select value={industry} onChange={e => setIndustry(e.target.value)} className="h-8 text-[13px]">
                <option value="all">Alle Branchen</option>
                {industries.map(([key, v]) => <option key={key} value={key}>{v.label} ({v.n})</option>)}
                <option value="none">Branche unklar</option>
              </Select>
            )}
            {countries.length > 1 && (
              <Select value={country} onChange={e => setCountry(e.target.value)} className="h-8 text-[13px]">
                <option value="all">Alle Länder</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
          </div>
        )}
      </div>

      {!list.length ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          {tab === 'hiring' ? 'Keine Firmen für diese Auswahl. Die Suche läuft jeden Morgen automatisch – oder oben „Jetzt suchen“.' : 'Keine News-Kandidaten offen.'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(c => {
            const h = c.hiring
            const s = c.score ?? c.confidence ?? 0
            const jobs = Array.isArray(c.evidence) ? c.evidence : []
            const imp = c.enrichment_data?.impressum
            const hr = c.enrichment_data?.hrContact?.name ? c.enrichment_data.hrContact : null
            const sz = sizeFor(c)
            return (
              <article key={c.id} className={cn('rounded-lg border border-border bg-card shadow-card transition-opacity', busy === c.id && 'opacity-60')}>
                <div className="flex gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-semibold tracking-tight">{c.name}</h3>
                      {!!c.aliases?.length && <span className="text-xs text-muted-foreground" title="Gleiche Website – als eine Firma zusammengefasst">auch als {c.aliases.join(', ')}</span>}
                      {!h && <Badge tone="brand">{NEWS_LABEL[c.signal_hint || ''] ?? 'News'}</Badge>}
                      {c.existing_company_id && <Badge tone="violet"><Building2 />Im CRM</Badge>}
                      {h && (sz.n != null ? (
                        <Badge tone={sz.n > 250 ? 'danger' : 'success'}><Users />~{sz.n.toLocaleString('de-DE')} MA · {SIZES.find(x => x.key === sz.key)!.label.split(' ·')[0]}{sz.n > 250 ? ' · größer als Zielgruppe' : ''}</Badge>
                      ) : (
                        <Select value={sz.key ?? ''} onChange={e => saveSize(c, (e.target.value || null) as SizeKey | null)} title="Keine Mitarbeiterzahl gefunden. Größe z. B. von LinkedIn hier eintragen."
                          className={cn('h-6 rounded-full py-0 pl-2 pr-6 text-[11.5px] shadow-none', sz.key ? 'border-border text-foreground' : 'border-dashed text-muted-foreground')}>
                          <option value="">Größe unbekannt</option>
                          {SIZES.map(x => <option key={x.key} value={x.key}>{x.label} (von Hand)</option>)}
                        </Select>
                      ))}
                    </div>

                    {h && (
                      <>
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{h.open} offene Stellen</span>
                          {h.new14 > 0 && <> · {h.new14} neu in 14 Tagen</>}
                          {h.volumeRoles > 0 && <> · {h.volumeRoles} bewerberstarke Rollen</>}
                        </p>
                        {pains[c.id] === undefined ? (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Pain wird aus den Stellen geprüft …</p>
                        ) : pains[c.id]?.key ? (
                          <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-[13px] text-violet-950">
                            <div className="font-semibold">🎯 {pains[c.id]!.label}</div>
                            <div className="mt-0.5">{pains[c.id]!.fact}</div>
                            {pains[c.id]!.more.length > 0 && (
                              <div className="mt-1 text-[12px] text-violet-900/75" title={pains[c.id]!.more.map(m => m.fact).join('\n')}>Außerdem: {pains[c.id]!.more.map(m => m.label).join(' · ')}</div>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[12px] text-violet-900/75"><Search className="size-3.5" />Person auf LinkedIn finden:</span>
                              {contactSearchLinks(c.name, [...(hr?.name ? [{ name: hr.name, title: hr.title }] : []), ...(imp?.managers || []).slice(0, 2).map((m: string) => ({ name: m, title: 'Geschäftsführung' }))]).map(l => (
                                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" title={l.hint}
                                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-card px-2 py-0.5 text-xs hover:bg-accent">
                                  {l.label} <ExternalLink className="size-3 text-muted-foreground" />
                                </a>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Kein klarer Pain aus den Stellen erkennbar – eher nicht anschreiben.</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {h.industry && <Badge tone="sky">{h.industry.label}</Badge>}
                          {h.officeShare != null && <Badge title="Anteil kaufmännischer, IT- und Fachrollen an den offenen Stellen" tone={h.officeShare >= 60 ? 'success' : h.officeShare <= 25 ? 'danger' : 'neutral'}>Office-Anteil {h.officeShare} %</Badge>}
                          {!!h.hrRoles?.length && <Badge tone="violet" title={h.hrRoles.join(' · ')}><UserRound />Baut Recruiting auf</Badge>}
                          {(h.sourceCount ?? 0) >= 2 && <Badge tone="success" title={h.sources.join(', ')}><Check />{h.sourceCount} Quellen</Badge>}
                          {h.repeated.slice(0, 3).map(r => <Badge key={r.role} tone="warning">{r.count}× {r.role}</Badge>)}
                          <Badge tone={h.ats.length ? 'outline' : 'success'}>{h.ats.length ? `ATS: ${h.ats.join(', ')}` : 'Kein ATS erkannt'}</Badge>
                          {h.locations.slice(0, 3).map(l => <Badge key={l} tone="outline"><MapPin />{l}</Badge>)}
                        </div>
                      </>
                    )}

                    {h && (!imp || reading.has(c.id)) && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {reading.has(c.id) ? <><Loader2 className="size-3.5 animate-spin" />Website, Impressum & Ansprechpartner werden gelesen …</> : 'Website & Impressum folgen beim nächsten Abgleich.'}
                      </p>
                    )}
                    {h && imp && !reading.has(c.id) && (
                      <div className="mt-3 grid gap-x-6 gap-y-1.5 rounded-md bg-muted/60 px-3 py-2.5 text-[13px] sm:grid-cols-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                          {imp.website ? <a href={imp.website} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-brand hover:underline">{imp.domain}</a> : <span className="text-muted-foreground">{imp.note || 'Keine Website gefunden'}</span>}
                          {imp.register && <span className="truncate text-muted-foreground">· {imp.register}</span>}
                        </div>
                        {imp.managers.length > 0 && <div className="truncate"><span className="text-muted-foreground">Geschäftsführung </span>{imp.managers.join(', ')}</div>}
                        {hr && (
                          <div className="flex min-w-0 items-center gap-1.5 sm:col-span-2">
                            <UserRound className="size-3.5 shrink-0 text-violet-600" />
                            <span className="truncate"><span className="font-medium">{hr.name}</span>{hr.title ? `, ${hr.title}` : ''}</span>
                            {hr.email && <a href={`mailto:${hr.email}`} className="truncate text-brand hover:underline">{hr.email}</a>}
                            {hr.phone && <span className="text-muted-foreground">{hr.phone}</span>}
                          </div>
                        )}
                        {(imp.email || imp.phone || imp.address) && <div className="truncate text-muted-foreground sm:col-span-2">{[imp.address ? `${imp.address.street}, ${imp.address.zip} ${imp.address.city}` : null, imp.phone].filter(Boolean).join(' · ')}</div>}
                        {!pains[c.id]?.key && <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:col-span-2">
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><Search className="size-3.5" />LinkedIn:</span>
                          {contactSearchLinks(c.name, [...(hr?.name ? [{ name: hr.name, title: hr.title }] : []), ...imp.managers.slice(0, 2).map((m: string) => ({ name: m, title: 'Geschäftsführung' }))]).map(l => (
                            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" title={l.hint}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs hover:bg-accent">
                              {l.label} <ExternalLink className="size-3 text-muted-foreground" />
                            </a>
                          ))}
                        </div>}
                      </div>
                    )}

                    {jobs.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {jobs.slice(0, 4).map((j, i) => (
                          <li key={i} className="flex min-w-0 items-center gap-2 text-[13px]">
                            <Briefcase className="size-3.5 shrink-0 text-muted-foreground" />
                            {j.link ? <a href={j.link} target="_blank" rel="noopener noreferrer" className="truncate text-foreground hover:text-brand hover:underline">{j.title || j.link}</a> : <span className="truncate">{j.title}</span>}
                            {j.source && <span className="shrink-0 text-xs text-muted-foreground">{j.source}</span>}
                          </li>
                        ))}
                        {h && h.open > jobs.length && <li className="pl-5 text-xs text-muted-foreground">+ {h.open - Math.min(jobs.length, 4)} weitere</li>}
                      </ul>
                    )}
                  </div>

                  {h && (
                    <div className={cn('flex size-14 shrink-0 flex-col items-center justify-center rounded-xl ring-1 ring-inset', scoreTone(s))} title="Score: Stellen, Wiederholungen, neue Stellen, Recruiting-Aufbau, Branche & Office-Anteil">
                      <span className="tabular text-xl font-semibold leading-none">{s}</span>
                      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide opacity-70">Score</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-border px-5 py-3">
                  <span className="mr-auto truncate text-xs text-muted-foreground">
                    {h ? `${h.sources.map(x => SOURCE_LABEL[x] ?? x).join(', ')} · Stand ${new Date(h.updatedAt).toLocaleDateString('de-DE')}` : `Gefunden ${new Date(c.created_at).toLocaleDateString('de-DE')}`}
                  </span>
                  <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => act(c, 'reject')}><X />Verwerfen</Button>
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act(c, 'company')}>Nur als Company</Button>
                  <Button size="sm" disabled={!!busy} onClick={() => act(c, 'lead')}>Als Lead übernehmen</Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
