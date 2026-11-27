'use client'
// Nachrichten → Schreiben: Simon's Akquise mode (sender voice, channel, relationship, offer, goal, two variants,
// optional follow-ups, quality check, refine chips) with recipients from the CRM. Every result is saved as a draft.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Sparkles, Search, X, Copy, Check, Send, Star, RefreshCw, History, Lightbulb, Database, UserPlus, CheckCircle2, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  CHANNELS, RELS, OFFERS, SALES_GOALS, DIRECTIVES, lint,
  type Author, type Channel, type Rel, type Offer, type SalesGoal, type Address, type SalesForm, type SalesText, type Directive, type SalesPayload,
} from '@/lib/akquise/content'
import { PAINS, PAIN_CHIPS, type PainKey } from '@/lib/outreach/pains'
import { generateDraft, saveDraft, refineText, markSent, type DraftRow } from './actions'
import { cn } from '@/lib/utils'

export type ContactOption = { id: string; name: string; title: string | null; company: string | null; linkedin: string | null }
export type PastItem = { id: string; personId: string; kind: 'draft' | 'agent'; status: string; at: string; title: string; text: string }

const EMPTY: SalesForm = { offer: 'deepcheck', channel: 'connect', rel: 'cold', address: 'auto', goal: 'call', name: '', role: '', company: '', context: '', prev: '', sequence: false }
const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Writer({ contacts, past, preselect, initial, seed, defaultAuthor, senders, sampleCounts, floskeln, baseTextOn }: {
  contacts: ContactOption[]; past: PastItem[]; preselect: string | null; initial: DraftRow | null
  seed?: { author: Author; personId: string | null; form: SalesForm } | null
  defaultAuthor: Author; senders: Record<Author, string>; sampleCounts: Record<Author, number>; floskeln: string[]; baseTextOn: boolean
}) {
  const router = useRouter()
  const ip = initial?.payload ?? (seed ? { author: seed.author, form: seed.form, crm: { person_id: seed.personId, company_id: null, lead_id: null } } as Partial<SalesPayload> : undefined)
  const pre = contacts.find(c => c.id === (ip?.crm?.person_id ?? preselect)) ?? null
  const [author, setAuthor] = useState<Author>(ip?.author ?? defaultAuthor)
  const [mode, setMode] = useState<'crm' | 'free'>(pre || (!ip && contacts.length) ? 'crm' : 'free')
  const [picked, setPicked] = useState<ContactOption | null>(pre)
  const [query, setQuery] = useState('')
  const [f, setF] = useState<SalesForm>(ip?.form ?? (pre ? { ...EMPTY, name: pre.name, role: pre.title ?? '', company: pre.company ?? '' } : EMPTY))
  const [useCrm, setUseCrm] = useState(ip?.extra?.useCrm ?? true)
  const [createInCrm, setCreateInCrm] = useState(ip?.crm?.create ?? true)
  const [pains, setPains] = useState<PainKey[]>((ip?.extra?.pains as PainKey[]) ?? [])
  const [draftText, setDraftText] = useState(ip?.extra?.draftText ?? '')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<DraftRow | null>(initial)
  const set = (patch: Partial<SalesForm>) => setF(x => ({ ...x, ...patch }))

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? contacts.filter(c => `${c.name} ${c.company ?? ''} ${c.title ?? ''}`.toLowerCase().includes(q)) : contacts
    return list.slice(0, 8)
  }, [query, contacts])
  const pick = (c: ContactOption | null) => {
    setPicked(c)
    if (c) set({ name: c.name, role: c.title ?? '', company: c.company ?? '' })
  }
  const personPast = picked ? past.filter(p => p.personId === picked.id).sort((a, b) => b.at.localeCompare(a.at)) : []
  const lastSent = personPast.find(p => p.status === 'published')

  const generate = async (again = false) => {
    setBusy(true)
    const r = await generateDraft({
      draftId: again && draft && draft.status !== 'published' ? draft.id : null, author, form: f,
      personId: mode === 'crm' ? picked?.id ?? null : null, createInCrm: mode === 'free' && createInCrm, useCrm, pains: f.offer === 'hireflow' ? pains : [], draftText,
    })
    setBusy(false)
    if (r.error !== null) return toast.error(r.error)
    setDraft(r.draft)
    window.history.replaceState(null, '', `/compose?draft=${r.draft.id}`)
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nachricht schreiben</h1>
        <p className="mt-1 text-sm text-muted-foreground">Empfänger aus dem CRM wählen oder frei eintragen, Kanal, Beziehung und Thema setzen. Du bekommst zwei Varianten in deiner Stimme, jede wird als Entwurf gespeichert und ist unter „Entwürfe &amp; Verlauf“ nachvollziehbar.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="space-y-4">
          <Card className="space-y-4 p-5">
            <L label="Absender">
              <Seg value={author} onChange={v => setAuthor(v as Author)} options={(['henri', 'simon'] as Author[]).map(a => ({ value: a, label: senders[a] }))} />
            </L>

            <div>
              <Seg value={mode} onChange={v => setMode(v as any)} options={[{ value: 'crm', label: 'Kontakt aus dem CRM' }, { value: 'free', label: 'Frei eingeben' }]} />
              {mode === 'crm' && (picked ? (
                <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <Link href={`/contacts/${picked.id}`} className="truncate font-medium hover:underline">{picked.name}</Link>
                    <div className="truncate text-[13px] text-muted-foreground">{[picked.title, picked.company].filter(Boolean).join(' · ') || 'Keine Position hinterlegt'}</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Andere Person" onClick={() => pick(null)}><X /></Button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Name, Firma oder Position" value={query} onChange={e => setQuery(e.target.value)} />
                  </div>
                  <div className="mt-2 divide-y divide-border rounded-md border border-border">
                    {matches.length === 0 && <div className="px-3 py-3 text-[13px] text-muted-foreground">Niemand gefunden. <button type="button" className="underline" onClick={() => setMode('free')}>Frei eingeben</button></div>}
                    {matches.map(c => (
                      <button key={c.id} type="button" onClick={() => pick(c)} className="block w-full px-3 py-2 text-left hover:bg-accent">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="truncate text-[12px] text-muted-foreground">{[c.title, c.company].filter(Boolean).join(' · ')}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <L label="Name" className="col-span-2"><Input value={f.name} placeholder="z. B. Dr. Anna Berger" onChange={e => set({ name: e.target.value })} /></L>
                <L label="Rolle"><Input value={f.role} placeholder="z. B. CFO" onChange={e => set({ role: e.target.value })} /></L>
                <L label="Firma"><Input value={f.company} onChange={e => set({ company: e.target.value })} /></L>
              </div>
              {mode === 'crm' && picked && (
                <label className="mt-3 flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-[13px]">
                  <span className="flex items-start gap-2"><Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>CRM-Wissen nutzen<span className="block text-[12px] text-muted-foreground">Firma, offene Stellen, Website, bisheriger Kontakt</span></span></span>
                  <Switch checked={useCrm} onChange={setUseCrm} />
                </label>
              )}
              {mode === 'free' && (
                <label className="mt-3 flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-[13px]">
                  <span className="flex items-start gap-2"><UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>Beim Senden im CRM anlegen<span className="block text-[12px] text-muted-foreground">Kontakt und Firma, die Nachricht landet im Verlauf</span></span></span>
                  <Switch checked={createInCrm} onChange={setCreateInCrm} />
                </label>
              )}
            </div>

            <L label="Was weißt du über Person oder Firma?">
              <Textarea rows={4} value={f.context} onChange={e => set({ context: e.target.value })}
                placeholder="Profil-Ausschnitt, aktueller Post, News, Anlass, gemeinsamer Kontakt, woher ihr euch kennt … Nur das hier (und das CRM-Wissen) wird als Fakt verwendet." />
            </L>

            <div className="grid grid-cols-2 gap-3">
              <L label="Kanal">
                <Select value={f.channel} onChange={e => set({ channel: e.target.value as Channel })}>
                  {(Object.keys(CHANNELS) as Channel[]).map(k => <option key={k} value={k}>{CHANNELS[k].label}</option>)}
                </Select>
              </L>
              <L label="Beziehung">
                <Select value={f.rel} onChange={e => set({ rel: e.target.value as Rel })}>
                  {(Object.keys(RELS) as Rel[]).map(k => <option key={k} value={k}>{RELS[k].label} · {RELS[k].hint}</option>)}
                </Select>
              </L>
              {f.channel === 'followup' && (
                <L label="Unsere frühere Nachricht (optional)" className="col-span-2">
                  <Textarea rows={3} value={f.prev} onChange={e => set({ prev: e.target.value })} placeholder="Die Nachricht, auf die noch keine Antwort kam" />
                  {lastSent && !f.prev && <button type="button" className="mt-1 text-[12px] text-brand underline" onClick={() => set({ prev: lastSent.text })}>Letzte gesendete Nachricht übernehmen ({when(lastSent.at)})</button>}
                </L>
              )}
              <L label="Thema">
                <Select value={f.offer} onChange={e => set({ offer: e.target.value as Offer })}>
                  {(Object.keys(OFFERS) as Offer[]).map(k => <option key={k} value={k}>{OFFERS[k].label}</option>)}
                </Select>
              </L>
              <L label="Ziel">
                <Select value={f.goal} disabled={f.channel === 'connect'} onChange={e => set({ goal: e.target.value as SalesGoal })}>
                  {(Object.keys(SALES_GOALS) as SalesGoal[]).map(k => <option key={k} value={k}>{SALES_GOALS[k].label}</option>)}
                </Select>
              </L>
              <L label="Anrede">
                <Select value={f.address} onChange={e => set({ address: e.target.value as Address })}>
                  <option value="auto">Auto (Standard du)</option><option value="du">Du</option><option value="sie">Sie</option>
                </Select>
              </L>
              <L label="Follow-ups">
                <button type="button" disabled={f.channel === 'followup'} onClick={() => set({ sequence: !f.sequence })}
                  className={cn('flex h-9 w-full items-center justify-center rounded-md border text-[13px] font-medium disabled:opacity-50', f.sequence ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {f.sequence ? '✓ 2 Follow-ups mitschreiben' : '+ 2 Follow-ups mitschreiben'}
                </button>
              </L>
            </div>

            {f.offer === 'hireflow' && (
              <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Welcher Pain? (optional, bis zu 3)</span>
                  {pains.length > 0 && <button type="button" className="text-[12px] text-muted-foreground underline" onClick={() => setPains([])}>zurücksetzen</button>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PAIN_CHIPS.map(k => {
                    const i = pains.indexOf(k)
                    return (
                      <button key={k} type="button" title={PAINS[k].pain} onClick={() => setPains(p => i >= 0 ? p.filter(x => x !== k) : p.length >= 3 ? p : [...p, k])}
                        className={cn('rounded-full border px-2.5 py-1 text-[12.5px]', i >= 0 ? 'border-violet-300 bg-violet-100 font-medium text-violet-900' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
                        {i >= 0 && <span className="mr-1">{i + 1}.</span>}{PAINS[k].label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">Playbook nach Persona, Pain aus den offenen Stellen{baseTextOn ? ' und Basistext nach Firmentyp (Variante A)' : ''} greifen automatisch. <Link href="/compose/settings#hireflow" className="underline">Anpassen</Link></p>
              </div>
            )}

            <details className="text-[13px]" open={!!draftText}>
              <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Eigener Entwurf oder Stichpunkte (optional)</summary>
              <Textarea className="mt-2" rows={4} value={draftText} onChange={e => setDraftText(e.target.value)} placeholder="Der Agent übernimmt Inhalt und Kernaussagen und formuliert nach den Regeln aus." />
            </details>

            <Button className="w-full" onClick={() => generate(false)} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? 'Schreibt … (ca. 15–30 s)' : 'Nachrichten schreiben'}
            </Button>
          </Card>

          {picked && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold"><History className="size-4" /> Bisher mit {picked.name.split(' ')[0]}</h2>
              <Card className="divide-y divide-border text-[13px]">
                {personPast.length === 0 && <div className="px-4 py-4 text-center text-muted-foreground">Noch keine Nachricht an diese Person.</div>}
                {personPast.slice(0, 8).map(p => (
                  <details key={p.id} className="px-4 py-2.5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{p.title}</span>
                      {p.status === 'published' ? <Badge tone="success"><CheckCircle2 /> Gesendet {when(p.at)}</Badge> : <Badge tone="neutral"><Clock /> Entwurf {when(p.at)}</Badge>}
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{p.text}</div>
                    {p.kind === 'draft' && <Link href={`/compose?draft=${p.id}`} className="mt-1 inline-block text-[12px] text-brand underline">Öffnen</Link>}
                  </details>
                ))}
              </Card>
            </div>
          )}
        </section>

        <section>
          {draft ? (
            <Result key={draft.id + draft.updated_at} draft={draft} floskeln={floskeln} sampleCount={sampleCounts[draft.payload.author] ?? 0}
              sender={senders[draft.payload.author]} busy={busy} onRegenerate={() => generate(true)} onChange={setDraft} />
          ) : (
            <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-muted-foreground">
              <Sparkles className="size-6" />
              <div className="font-medium text-foreground">Persönlich statt Massenmail.</div>
              Links Empfänger und Kontext eintragen, Kanal wählen und auf „Nachrichten schreiben“ klicken. Du bekommst zwei Varianten zur Auswahl.
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

function Result({ draft, floskeln, sampleCount, sender, busy, onRegenerate, onChange }: {
  draft: DraftRow; floskeln: string[]; sampleCount: number; sender: string; busy: boolean
  onRegenerate: () => void; onChange: (d: DraftRow) => void
}) {
  const router = useRouter()
  const p = draft.payload
  const [variants, setVariants] = useState<SalesText[]>(p.variants || [])
  const [followups, setFollowups] = useState<SalesText[]>(p.followups || [])
  const [chosen, setChosen] = useState(p.chosen || 0)
  const [state, setState] = useState(`Gespeichert ${when(draft.updated_at)}`)
  const [sending, setSending] = useState<string | null>(null)
  const timer = useRef<any>(null)
  const sent = draft.status === 'published'

  const persist = (v: SalesText[], fu: SalesText[]) => {
    setState('Ungespeicherte Änderungen …')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await saveDraft(draft.id, { variants: v, followups: fu })
      setState(r.error !== null ? `Speichern fehlgeschlagen: ${r.error}` : `Gespeichert ${when(r.updated_at)}`)
    }, 1200)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const edit = (key: string, patch: Partial<SalesText>) => {
    const i = parseInt(key.slice(1), 10)
    if (key[0] === 'v') { const v = variants.map((x, j) => j === i ? { ...x, ...patch } : x); setVariants(v); persist(v, followups) }
    else { const fu = followups.map((x, j) => j === i ? { ...x, ...patch } : x); setFollowups(fu); persist(variants, fu) }
  }
  const choose = async (i: number) => { setChosen(i); await saveDraft(draft.id, { chosen: i }) }
  const send = async (key: string) => {
    setSending(key)
    clearTimeout(timer.current)
    await saveDraft(draft.id, { variants, followups })
    const i = parseInt(key.slice(1), 10)
    const r = await markSent(draft.id, key[0] === 'v' ? i : chosen, key[0] === 'f' ? i : null)
    setSending(null)
    if (r.error !== null) return toast.error(r.error)
    toast.success(p.crm?.person_id || p.crm?.company_id || p.crm?.create ? 'Als gesendet abgelegt und im CRM geloggt' : 'Als gesendet abgelegt')
    onChange({ ...draft, status: 'published', published_at: new Date().toISOString(), payload: { ...p, variants, followups } })
    router.refresh()
  }

  const f = p.form
  const badges = [CHANNELS[f.channel]?.label, RELS[f.rel]?.label, OFFERS[f.offer]?.label, `als ${sender}`]
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[15px] font-semibold">{[f.name, f.role, f.company].filter(Boolean).join(' · ') || 'Empfänger'}</div>
          <span className="text-[12px] text-muted-foreground">{sent ? `Gesendet ${when(draft.published_at || draft.updated_at)}` : state}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">{badges.map(b => <Badge key={b} tone="outline">{b}</Badge>)}
          {p.extra?.hireflow && <Badge tone="violet">{[p.extra.hireflow.playbook, p.extra.hireflow.pain, p.extra.hireflow.baseText ? 'Basistext' : null].filter(Boolean).join(' · ')}</Badge>}
        </div>
        {!sampleCount && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <Lightbulb className="mt-0.5 size-4 shrink-0" />
            <span>Noch keine echten Nachrichten von {sender} hinterlegt. Unter <Link href="/compose/settings#stimme" className="underline">Stimmen</Link> ein paar eigene Nachrichten einfügen, dann klingt es deutlich mehr nach euch.</span>
          </div>
        )}
      </div>

      {variants.map((v, i) => (
        <TextCard key={'v' + i} k={'v' + i} label={`Variante ${v.label}`} it={v} channel={f.channel} email={f.channel === 'email'} floskeln={floskeln} draftId={draft.id}
          favorite={variants.length > 1 ? { on: chosen === i, set: () => choose(i) } : null} sent={sent} sending={sending} onEdit={edit} onSend={send} />
      ))}
      {followups.length > 0 && <div className="pt-1 text-[13px] font-semibold text-muted-foreground">Follow-ups (zu Variante A)</div>}
      {followups.map((x, i) => (
        <TextCard key={'f' + i} k={'f' + i} label={x.label} it={x} channel="followup" email={false} floskeln={floskeln} draftId={draft.id}
          favorite={null} sent={false} sending={sending} onEdit={edit} onSend={send} />
      ))}
      {p.rationale && <div className="rounded-md bg-muted/60 px-3 py-2 text-[13px]"><span className="font-medium">Warum so:</span> {p.rationale}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={onRegenerate} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {sent ? 'Neue Version schreiben' : 'Neu schreiben'}</Button>
        <Link href={`/compose/drafts?open=${draft.id}`} className="text-[13px] text-muted-foreground underline hover:text-foreground">Verlauf dieses Entwurfs</Link>
      </div>
    </div>
  )
}

function TextCard({ k, label, it, channel, email, floskeln, draftId, favorite, sent, sending, onEdit, onSend }: {
  k: string; label: string; it: SalesText; channel: Channel; email: boolean; floskeln: string[]; draftId: string
  favorite: { on: boolean; set: () => void } | null; sent: boolean; sending: string | null
  onEdit: (k: string, p: Partial<SalesText>) => void; onSend: (k: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [custom, setCustom] = useState('')
  const chips = lint(it.text, channel, email ? it.subject : null, floskeln)
  const copy = async () => {
    try { await navigator.clipboard.writeText((it.subject ? `Betreff: ${it.subject}\n\n` : '') + it.text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { toast.error('Kopieren nicht möglich') }
  }
  const refine = async (d: Directive | null, c: string | null) => {
    setBusy(true)
    const r = await refineText(draftId, k, d, c)
    setBusy(false)
    if (r.error !== null) return toast.error(r.error)
    onEdit(k, { text: r.text }); setCustom('')
  }
  return (
    <Card className={cn('space-y-2.5 p-4', favorite?.on && 'ring-2 ring-violet-300', busy && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">{label}</span>
        {favorite && (
          <button type="button" onClick={favorite.set} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]', favorite.on ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-border text-muted-foreground')}>
            <Star className={cn('size-3', favorite.on && 'fill-current')} /> {favorite.on ? 'Favorit' : 'Als Favorit'}
          </button>
        )}
      </div>
      {email && <Input value={it.subject} placeholder="Betreff" onChange={e => onEdit(k, { subject: e.target.value })} />}
      <Textarea rows={channel === 'connect' ? 4 : 8} value={it.text} onChange={e => onEdit(k, { text: e.target.value })} />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c, i) => <Badge key={i} tone={c.tone === 'ok' ? 'success' : c.tone === 'warn' ? 'warning' : 'danger'}>{c.text}</Badge>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(DIRECTIVES) as Directive[]).map(d => (
          <Button key={d} size="sm" variant="outline" className="h-7 px-2 text-[12px]" disabled={busy} onClick={() => refine(d, null)}>{DIRECTIVES[d].label}</Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input className="h-8 text-[13px]" value={custom} placeholder='Eigene Anweisung, z. B. "erwähne den gemeinsamen Kontakt früher"' onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) refine(null, custom) }} />
        <Button size="sm" variant="outline" disabled={busy || !custom.trim()} onClick={() => refine(null, custom)}>{busy ? <Loader2 className="animate-spin" /> : '→'}</Button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? 'Kopiert' : 'Kopieren'}</Button>
        <Button size="sm" variant={sent ? 'outline' : 'default'} onClick={() => onSend(k)} disabled={!!sending || !it.text.trim()}>
          {sending === k ? <Loader2 className="animate-spin" /> : <Send />} {sent ? 'Nochmal als gesendet' : 'Gesendet, ablegen'}
        </Button>
      </div>
    </Card>
  )
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex gap-1 rounded-md bg-muted p-1 text-[13px]">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn('flex-1 rounded px-3 py-1.5 font-medium', value === o.value ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{o.label}</button>
      ))}
    </div>
  )
}

function L({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
