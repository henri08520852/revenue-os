'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Sparkles, UserPlus, Search, X, CheckCircle2, Clock, Settings2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PERSONAS, personaOf, type Persona } from '@/lib/outreach/persona'
import { SEGMENTS, type SegmentKey } from '@/lib/outreach/segments'
import { DraftCard, QueueItem } from '../agents/AgentsBoard'
import { composeMessage, loadItem } from './actions'
import { PAINS, PAIN_CHIPS, GOALS, type PainKey, type Goal } from '@/lib/outreach/pains'
import { cn } from '@/lib/utils'

export type ContactOption = { id: string; name: string; title: string | null; company: string | null; persona: string | null; linkedin: string | null }
export type SentRow = {
  id: string; title: string; body: string | null; data: any; decided_at: string | null; person_id: string | null; lead_id: string | null
  leads: { stage: string; replied_at: string | null } | null
}

const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''

export default function Composer({ contacts, sent, preselect, baseTexts, industries }: {
  contacts: ContactOption[]; sent: SentRow[]; preselect: string | null
  baseTexts: Record<SegmentKey, string> | null; industries: { key: string; label: string }[]
}) {
  const [mode, setMode] = useState<'pick' | 'new'>(preselect || contacts.length ? 'pick' : 'new')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<ContactOption | null>(contacts.find(c => c.id === preselect) ?? null)
  const [f, setF] = useState({ first: '', last: '', title: '', company: '', linkedinUrl: '' })
  const [notes, setNotes] = useState('')
  const [profile, setProfile] = useState('')
  const [address, setAddress] = useState<'auto' | 'du' | 'Sie'>('auto')
  const [persona, setPersona] = useState<Persona | 'auto'>('auto')
  const [segment, setSegment] = useState<SegmentKey | 'auto'>('auto')
  const [industry, setIndustry] = useState('auto')
  const [pains, setPains] = useState<PainKey[]>([])
  const [goal, setGoal] = useState<Goal>('first')
  const [channel, setChannel] = useState<'linkedin' | 'email'>('linkedin')
  const [role, setRole] = useState('')
  const [draftText, setDraftText] = useState('')
  const [noReason, setNoReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [item, setItem] = useState<QueueItem | null>(null)
  const [version, setVersion] = useState(0)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts.slice(0, 8)
    return contacts.filter(c => `${c.name} ${c.company ?? ''} ${c.title ?? ''}`.toLowerCase().includes(q)).slice(0, 8)
  }, [query, contacts])

  const title = mode === 'pick' ? picked?.title ?? '' : f.title
  const detected = personaOf(title, null, false)
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }))
  const canGo = mode === 'pick' ? !!picked : !!f.company.trim() && !!(f.first.trim() || f.last.trim())

  const generate = async (anyway = false) => {
    setBusy(true); setNoReason(null)
    const r = await composeMessage({
      ...(mode === 'pick' ? { personId: picked!.id } : f),
      notes, profile, address, persona, segment, industry, pains, goal, channel, role, draftText, anyway,
    })
    setBusy(false)
    if (r.noReason) return setNoReason(r.error)
    if (r.error) return toast.error(r.error)
    setItem(r.item); setVersion(v => v + 1)
  }
  const reload = async (kind: string) => {
    if (kind === 'redraft' && item) { const fresh = await loadItem(item.id); if (fresh) { setItem(fresh); setVersion(v => v + 1) } }
    else { setItem(null); setNotes(''); setProfile(''); setDraftText('') }
  }

  const replied = sent.filter(s => s.leads?.replied_at).length

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nachricht schreiben</h1>
          <p className="mt-1 text-sm text-muted-foreground">Person wählen, Pain und Ziel antippen, optional ergänzen, was du weißt oder schon geschrieben hast – daraus entsteht die Nachricht. Kopieren, senden, als gesendet markieren.</p>
        </div>
        <Link href="/agents" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><Settings2 className="size-4" /> Basistext &amp; Playbooks</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="space-y-4">
          <Card className="space-y-4 p-5">
            <div className="flex gap-1 rounded-md bg-muted p-1 text-[13px]">
              {(['pick', 'new'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={cn('flex-1 rounded px-3 py-1.5 font-medium', mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                  {m === 'pick' ? 'Kontakt aus dem CRM' : 'Neue Person'}
                </button>
              ))}
            </div>

            {mode === 'pick' ? (
              picked ? (
                <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-medium">{picked.name}</div>
                    <div className="truncate text-[13px] text-muted-foreground">{[picked.title, picked.company].filter(Boolean).join(' · ') || 'Keine Position hinterlegt'}</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Andere Person" onClick={() => setPicked(null)}><X /></Button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input autoFocus className="pl-8" placeholder="Name, Firma oder Position" value={query} onChange={e => setQuery(e.target.value)} />
                  </div>
                  <div className="mt-2 divide-y divide-border rounded-md border border-border">
                    {matches.length === 0 && <div className="px-3 py-3 text-[13px] text-muted-foreground">Niemand gefunden. <button type="button" className="underline" onClick={() => setMode('new')}>Neu eingeben</button></div>}
                    {matches.map(c => (
                      <button key={c.id} type="button" onClick={() => setPicked(c)} className="block w-full px-3 py-2 text-left hover:bg-accent">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="truncate text-[12px] text-muted-foreground">{[c.title, c.company].filter(Boolean).join(' · ')}</div>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-muted-foreground">Tipp: Profile speicherst du am schnellsten mit der LinkedIn-Erweiterung.</p>
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <L label="Vorname"><Input value={f.first} onChange={e => set({ first: e.target.value })} /></L>
                <L label="Nachname"><Input value={f.last} onChange={e => set({ last: e.target.value })} /></L>
                <L label="Position" className="col-span-2"><Input value={f.title} placeholder="z. B. Geschäftsführer, Head of HR" onChange={e => set({ title: e.target.value })} /></L>
                <L label="Firma" className="col-span-2"><Input value={f.company} onChange={e => set({ company: e.target.value })} /></L>
                <L label="LinkedIn-Profil (optional)" className="col-span-2"><Input value={f.linkedinUrl} placeholder="linkedin.com/in/…" onChange={e => set({ linkedinUrl: e.target.value })} /></L>
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground">Welcher Pain? (bis zu 3, der erste ist der Hauptpunkt)</span>
                {pains.length > 0 && <button type="button" className="text-[12px] text-muted-foreground underline" onClick={() => setPains([])}>zurücksetzen</button>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PAIN_CHIPS.map(k => {
                  const i = pains.indexOf(k)
                  return (
                    <button key={k} type="button" title={PAINS[k].pain}
                      onClick={() => setPains(p => i >= 0 ? p.filter(x => x !== k) : p.length >= 3 ? p : [...p, k])}
                      className={cn('rounded-full border px-2.5 py-1 text-[12.5px] transition-colors', i >= 0 ? 'border-violet-300 bg-violet-50 font-medium text-violet-900' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
                      {i >= 0 && <span className="mr-1 tabular">{i + 1}.</span>}{PAINS[k].label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{pains.length ? PAINS[pains[0]].pain : 'Nichts gewählt: der Pain wird aus den offenen Stellen der Firma abgeleitet.'}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <L label="Ziel der Nachricht">
                <Select value={goal} onChange={e => setGoal(e.target.value as Goal)}>
                  {(Object.keys(GOALS) as Goal[]).map(g => <option key={g} value={g}>{GOALS[g].label}</option>)}
                </Select>
              </L>
              <L label="Kanal">
                <Select value={channel} onChange={e => setChannel(e.target.value as any)}>
                  <option value="linkedin">LinkedIn</option><option value="email">E-Mail</option>
                </Select>
              </L>
              <L label="Um welche Stelle geht es? (optional)">
                <Input value={role} placeholder="z. B. Mechatroniker:in, Pflegefachkraft" onChange={e => setRole(e.target.value)} />
              </L>
              <L label="Anrede">
                <Select value={address} onChange={e => setAddress(e.target.value as any)}>
                  <option value="auto">Standard (du)</option><option value="du">du</option><option value="Sie">Sie</option>
                </Select>
              </L>
            </div>

            <L label="Was weißt du über die Person oder Firma? (optional, macht die Nachricht persönlich)">
              <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="z. B. hat gestern über Fachkräftemangel gepostet · wir kennen uns von der Messe · sucht 3 Pflegekräfte · gleiche Uni" />
            </L>
            <L label="Deine Nachricht oder Stichpunkte (optional – der Agent übernimmt den Inhalt und formuliert aus)">
              <Textarea rows={4} value={draftText} onChange={e => setDraftText(e.target.value)}
                placeholder="z. B. Hallo Anna, habe gesehen, dass ihr 5 Pflegekräfte sucht … / oder nur Stichpunkte" />
            </L>

            <details className="text-[13px]">
              <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Weitere Einstellungen (Persona, Firmentyp, Branche, Profiltext)</summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <L label="Persona">
                    <Select value={persona} onChange={e => setPersona(e.target.value as any)}>
                      <option value="auto">Automatisch{title ? ` (${PERSONAS[mode === 'pick' && picked?.persona ? picked.persona as Persona : detected]})` : ''}</option>
                      {(Object.keys(PERSONAS) as Persona[]).map(p => <option key={p} value={p}>{PERSONAS[p]}</option>)}
                    </Select>
                  </L>
                  <L label="Firmentyp / Größe">
                    <Select value={segment} onChange={e => setSegment(e.target.value as any)}>
                      <option value="auto">Automatisch</option>
                      {(Object.keys(SEGMENTS) as SegmentKey[]).map(k => <option key={k} value={k}>{SEGMENTS[k]}</option>)}
                    </Select>
                  </L>
                  <L label="Branche" className="col-span-2">
                    <Select value={industry} onChange={e => setIndustry(e.target.value)}>
                      <option value="auto">Automatisch</option>
                      {industries.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                    </Select>
                  </L>
                </div>
                <L label="LinkedIn-Profiltext (Info, Headline, letzter Post)">
                  <Textarea rows={4} value={profile} onChange={e => setProfile(e.target.value)} placeholder="Text aus dem Profil hier hineinkopieren – der Agent nutzt nur Fakten daraus." />
                </L>
              </div>
            </details>

            <Button className="w-full" onClick={() => generate()} disabled={!canGo || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? 'Schreibt … (ca. 10–20 s)' : 'Nachricht erzeugen'}
            </Button>
            {noReason && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                <div>{noReason}</div>
                <Button size="sm" variant="outline" onClick={() => generate(true)} disabled={busy}>Trotzdem schreiben</Button>
              </div>
            )}
            {mode === 'new' && <p className="text-[12px] text-muted-foreground"><UserPlus className="mr-1 inline size-3.5" />Kontakt und Firma werden angelegt, die Firma landet als Prospect in der Pipeline.</p>}
          </Card>

          {baseTexts && (
            <details className="rounded-md border border-border bg-card px-4 py-3 text-[13px]">
              <summary className="cursor-pointer select-none font-medium">Basistext {segment === 'auto' ? '(wird nach Firmentyp gewählt)' : `– ${SEGMENTS[segment]}`}</summary>
              {(segment === 'auto' ? (Object.keys(SEGMENTS) as SegmentKey[]) : [segment]).map(k => (
                <div key={k} className="mt-3">
                  {segment === 'auto' && <div className="text-[12px] font-medium">{SEGMENTS[k]}</div>}
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-muted-foreground">{baseTexts[k]}</pre>
                </div>
              ))}
            </details>
          )}
        </section>

        <section className="space-y-6">
          {item ? (
            <DraftCard key={`${item.id}-${version}`} item={item} onDone={reload} />
          ) : (
            <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <Sparkles className="size-6" />
              Hier erscheint die Nachricht mit Vernetzungsnotiz zum Kopieren.
            </Card>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Zuletzt gesendet</h2>
              {sent.length > 0 && <span className="text-[13px] text-muted-foreground">{replied} von {sent.length} geantwortet</span>}
            </div>
            <Card className="divide-y divide-border text-[13px]">
              {sent.length === 0 && <div className="px-4 py-6 text-center text-muted-foreground">Noch nichts als gesendet markiert.</div>}
              {sent.map(s => (
                <details key={s.id} className="px-4 py-2.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{s.title.replace(/^Erstnachricht an /, '')}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {s.data?.variant && <Badge tone="outline">{s.data.playbook_name ?? s.data.playbook} · {s.data.variant}</Badge>}
                      {s.leads?.replied_at
                        ? <Badge tone="success"><CheckCircle2 /> Antwort</Badge>
                        : <Badge tone="neutral"><Clock /> {day(s.decided_at)}</Badge>}
                    </span>
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{s.body}</div>
                  {s.data?.original && s.data.original !== s.body && (
                    <details className="mt-2"><summary className="cursor-pointer text-[12px] text-muted-foreground">Originalentwurf des Agents</summary>
                      <div className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{s.data.original}</div></details>
                  )}
                </details>
              ))}
            </Card>
          </div>
        </section>
      </div>
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
