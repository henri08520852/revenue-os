'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Bot, Workflow, Play, Settings2, Loader2, Copy, Check, RefreshCw, X, Send, Sparkles, ExternalLink,
  CheckCircle2, AlertCircle, MinusCircle, Inbox, ListChecks, Activity, Coins, Plus, Trash2, Printer, Mail,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { AGENTS, AgentKey, AgentSettings, SequenceStep } from '@/lib/agents/registry'
import { cn } from '@/lib/utils'
import { runAgent, setAgentEnabled, saveAgentConfig, saveItem, saveLetter, approveItem, dismissItem, redraftItem } from './actions'

export type QueueItem = {
  id: string; agent_key: string; kind: string; channel: string | null; title: string; body: string | null; data: any; created_at: string
  company_id: string | null; person_id: string | null; lead_id: string | null
  companies: { name: string } | null; people: { full_name: string | null; job_title: string | null; linkedin_url: string | null } | null
}
export type RunRow = {
  id: string; agent_key: string; trigger: 'manual' | 'cron' | 'event'; status: 'running' | 'ok' | 'error' | 'skipped'; items: number
  summary: string | null; error: string | null; cost_usd: number; started_at: string; finished_at: string | null; created_by: string | null; by?: string | null
}

const label = (key: string) => AGENTS.find(a => a.key === key)?.label ?? key
const usd = (n: number) => `${n < 0.01 && n > 0 ? '< 0,01' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'gerade eben'
  if (m < 60) return `vor ${m} Min.`
  const h = Math.round(m / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.round(h / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}
const TRIGGER: Record<RunRow['trigger'], string> = { manual: 'manuell', cron: 'automatisch', event: 'Ereignis' }

export default function AgentsBoard({ missing, settings, items, runs, lastRun, stats }: {
  missing: boolean; settings: AgentSettings; items: QueueItem[]; runs: RunRow[]
  lastRun: Record<string, RunRow | null>; stats: { pending: number; runs7: number; costUsd: number; activeSequences: number }
}) {
  const [editing, setEditing] = useState<AgentKey | null>(null)

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agents &amp; Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">Wiederkehrende Arbeit läuft automatisch – alles, was nach außen geht, wartet hier auf eure Freigabe.</p>
      </div>

      {missing && (
        <Card className="mb-6 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Die Datenbank-Erweiterung für Agents (Migration 029) ist noch nicht eingespielt. Sobald sie läuft, erscheinen hier Freigaben und Protokoll.
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Inbox} label="Offene Freigaben" value={String(stats.pending)} tone="text-blue-600 bg-blue-50" />
        <Kpi icon={ListChecks} label="Aktive Abfolgen" value={String(stats.activeSequences)} tone="text-violet-600 bg-violet-50" />
        <Kpi icon={Activity} label="Läufe (7 Tage)" value={String(stats.runs7)} tone="text-emerald-600 bg-emerald-50" />
        <Kpi icon={Coins} label="KI-Kosten diesen Monat" value={usd(stats.costUsd)} tone="text-amber-600 bg-amber-50" />
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {AGENTS.map(a => (
          <AgentCard key={a.key} agent={a} enabled={settings[a.key].enabled} last={lastRun[a.key]} disabled={missing} onSettings={() => setEditing(a.key)} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">Freigaben</h2>
            {items.length > 0 && <Badge tone="brand">{items.length}</Badge>}
          </div>
          {items.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <Inbox className="size-6" />
              Keine offenen Entwürfe. Neue Leads aus LinkedIn oder den Heißen Firmen bekommen automatisch einen.
            </Card>
          ) : (
            <div className="space-y-4">{items.map(i => i.kind === 'letter' ? <LetterCard key={i.id} item={i} /> : <DraftCard key={i.id} item={i} />)}</div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Protokoll</h2>
          <Card className="divide-y divide-border">
            {runs.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Noch keine Läufe</div>}
            {runs.map(r => <RunLine key={r.id} run={r} />)}
          </Card>
        </section>
      </div>

      {editing && <SettingsSheet agentKey={editing} settings={settings} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn('grid size-8 place-items-center rounded-md', tone)}><Icon className="size-4" /></span>
      </div>
      <div className="tabular mt-2 text-2xl font-semibold">{value}</div>
    </Card>
  )
}

function StatusIcon({ status }: { status: RunRow['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
  if (status === 'error') return <AlertCircle className="size-4 shrink-0 text-red-600" />
  if (status === 'running') return <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" />
  return <MinusCircle className="size-4 shrink-0 text-muted-foreground" />
}

function AgentCard({ agent, enabled, last, disabled, onSettings }: {
  agent: (typeof AGENTS)[number]; enabled: boolean; last: RunRow | null; disabled: boolean; onSettings: () => void
}) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [running, start] = useTransition()
  const Icon = agent.kind === 'agent' ? Bot : Workflow

  const toggle = async (v: boolean) => {
    setOn(v)
    const r = await setAgentEnabled(agent.key, v)
    if (r.error) { setOn(!v); toast.error(r.error) } else toast.success(`${agent.label} ${v ? 'eingeschaltet' : 'ausgeschaltet'}`)
  }
  const run = () => start(async () => {
    const r = await runAgent(agent.key)
    if (r.error) toast.error(r.error)
    else toast.success(`${agent.label}: ${r.summary}`)
    router.refresh()
  })

  return (
    <Card className={cn('flex flex-col p-5', !on && 'opacity-75')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', agent.kind === 'agent' ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600')}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{agent.label}</div>
          <Badge tone={agent.kind === 'agent' ? 'violet' : 'sky'} className="mt-1">{agent.kind === 'agent' ? 'KI-Agent' : 'Workflow'}</Badge>
        </div>
        <Switch checked={on} onChange={toggle} disabled={disabled} label={`${agent.label} an/aus`} />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{agent.description}</p>
      <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Wann:</span> {agent.when}</p>
      <div className="mt-3 flex min-h-[20px] items-start gap-1.5 text-xs text-muted-foreground">
        {last ? (<><StatusIcon status={last.status} /><span className="line-clamp-2">{ago(last.started_at)} · {last.error || last.summary || '—'}</span></>) : 'Noch nicht gelaufen'}
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <Button size="sm" onClick={run} disabled={running || disabled}>
          {running ? <Loader2 className="animate-spin" /> : <Play />} Jetzt ausführen
        </Button>
        <Button size="sm" variant="outline" onClick={onSettings} disabled={disabled}><Settings2 /> Einstellungen</Button>
      </div>
    </Card>
  )
}

function DraftCard({ item }: { item: QueueItem }) {
  const router = useRouter()
  const [note, setNote] = useState<string>(item.data?.connect_note ?? '')
  const [body, setBody] = useState<string>(item.body ?? '')
  const [saved, setSaved] = useState({ note, body })
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const person = item.people?.full_name
  const research: string[] = Array.isArray(item.data?.research) ? item.data.research : []

  const persist = async () => {
    if (note === saved.note && body === saved.body) return
    const r = await saveItem(item.id, body, note || null)
    if (r.error) toast.error(r.error); else setSaved({ note, body })
  }
  const copy = async (what: 'note' | 'body') => {
    try { await navigator.clipboard.writeText(what === 'note' ? note : body); setCopied(what); setTimeout(() => setCopied(null), 1500) }
    catch { toast.error('Kopieren nicht möglich') }
  }
  const act = async (kind: 'approve' | 'dismiss' | 'redraft') => {
    setBusy(kind)
    const r = kind === 'approve' ? await approveItem(item.id, body, note || null) : kind === 'dismiss' ? await dismissItem(item.id) : await redraftItem(item.id)
    setBusy(null)
    if (r.error) return toast.error(r.error)
    toast.success(kind === 'approve' ? 'Als gesendet markiert – im Verlauf geloggt' : kind === 'dismiss' ? 'Entwurf verworfen' : 'Neu geschrieben')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="items-start pb-2">
        <div className="min-w-0">
          <CardTitle className="truncate">
            {person && item.person_id ? <Link href={`/contacts/${item.person_id}`} className="hover:underline">{person}</Link> : item.title}
          </CardTitle>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            {item.people?.job_title && <span>{item.people.job_title}</span>}
            {item.people?.job_title && item.companies && <span>·</span>}
            {item.companies && item.company_id && <Link href={`/companies/${item.company_id}`} className="hover:underline">{item.companies.name}</Link>}
            <span>· {ago(item.created_at)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {item.people?.linkedin_url && (
            <a href={item.people.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn-Profil öffnen"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ExternalLink className="size-4" /></a>
          )}
          <Badge tone="sky">{item.channel === 'linkedin' ? 'LinkedIn' : item.channel ?? 'Entwurf'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.data?.hook && (
          <div className="flex items-start gap-2 rounded-md bg-violet-50 px-3 py-2 text-[13px] text-violet-900">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" /><span><span className="font-medium">Anlass:</span> {item.data.hook}</span>
          </div>
        )}
        {research.length > 0 && (
          <details className="group text-[13px]">
            <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Recherche ({research.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{research.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </details>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Vernetzungsnotiz</span>
            <span className={cn('tabular', note.length > 200 && 'text-red-600')}>{note.length}/200</span>
          </div>
          <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} onBlur={persist} />
          <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => copy('note')}>
            {copied === 'note' ? <Check /> : <Copy />} {copied === 'note' ? 'Kopiert' : 'Notiz kopieren'}
          </Button>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Erste Nachricht</div>
          <Textarea rows={7} value={body} onChange={e => setBody(e.target.value)} onBlur={persist} />
          <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => copy('body')}>
            {copied === 'body' ? <Check /> : <Copy />} {copied === 'body' ? 'Kopiert' : 'Nachricht kopieren'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => act('redraft')} disabled={!!busy}>
              {busy === 'redraft' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Neu schreiben
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act('dismiss')} disabled={!!busy}><X /> Verwerfen</Button>
          </div>
          <Button size="sm" onClick={() => act('approve')} disabled={!!busy || !body.trim()}>
            {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Send />} Als gesendet markieren
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LetterCard({ item }: { item: QueueItem }) {
  const router = useRouter()
  const d = item.data || {}
  const [body, setBody] = useState<string>(item.body ?? '')
  const [subject, setSubject] = useState<string>(d.subject ?? '')
  const [rcp, setRcp] = useState({ name: d.recipient?.name ?? '', street: d.recipient?.street ?? '', zip: d.recipient?.zip ?? '', city: d.recipient?.city ?? '' })
  const [busy, setBusy] = useState<string | null>(null)
  const missing = !rcp.street || !rcp.zip || !rcp.city

  const persist = async () => {
    const r = await saveLetter(item.id, body, { subject, recipient: { ...d.recipient, name: rcp.name || null, street: rcp.street || null, zip: rcp.zip || null, city: rcp.city || null } })
    if (r.error) toast.error(r.error)
    return !r.error
  }
  const print = async () => { if (await persist()) window.open(`/letters/${item.id}`, '_blank') }
  const act = async (kind: 'approve' | 'dismiss' | 'redraft') => {
    setBusy(kind)
    if (kind === 'approve') await persist()
    const r = kind === 'approve' ? await approveItem(item.id, body, null) : kind === 'dismiss' ? await dismissItem(item.id) : await redraftItem(item.id)
    setBusy(null)
    if (r.error) return toast.error(r.error)
    toast.success(kind === 'approve' ? 'Als verschickt markiert – im Verlauf geloggt' : kind === 'dismiss' ? 'Brief verworfen' : 'Neu geschrieben')
    router.refresh()
  }
  const f = (k: keyof typeof rcp, placeholder: string, cls = '') => (
    <Input value={rcp[k]} placeholder={placeholder} onChange={e => setRcp(v => ({ ...v, [k]: e.target.value }))} onBlur={persist} className={cn('h-8', cls)} />
  )

  return (
    <Card>
      <CardHeader className="items-start pb-2">
        <div className="min-w-0">
          <CardTitle className="truncate">{item.title}</CardTitle>
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {item.companies && item.company_id && <Link href={`/companies/${item.company_id}`} className="hover:underline">{item.companies.name}</Link>} · {ago(item.created_at)}
          </div>
        </div>
        <Badge tone="warning"><Mail /> Brief</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {d.anlass && (
          <div className="flex items-start gap-2 rounded-md bg-violet-50 px-3 py-2 text-[13px] text-violet-900">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" /><span><span className="font-medium">Anlass:</span> {d.anlass}</span>
          </div>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Empfänger</span>{missing && <span className="text-amber-700">Anschrift unvollständig</span>}
          </div>
          <div className="grid gap-2 rounded-md border border-border p-2.5">
            <div className="text-sm font-medium">{d.recipient?.company}</div>
            {f('name', 'Ansprechpartner (leer = Geschäftsführung)')}
            {f('street', 'Straße Hausnummer')}
            <div className="flex gap-2">{f('zip', 'PLZ', 'w-24')}{f('city', 'Ort', 'flex-1')}</div>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Betreff</div>
          <Input value={subject} onChange={e => setSubject(e.target.value)} onBlur={persist} />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Brieftext</div>
          <Textarea rows={12} value={body} onChange={e => setBody(e.target.value)} onBlur={persist} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => act('redraft')} disabled={!!busy}>
              {busy === 'redraft' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Neu schreiben
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act('dismiss')} disabled={!!busy}><X /> Verwerfen</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={print}><Printer /> Drucken / PDF</Button>
            <Button size="sm" onClick={() => act('approve')} disabled={!!busy || !body.trim()}>
              {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Send />} Als verschickt markieren
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RunLine({ run }: { run: RunRow }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 text-[13px]">
      <StatusIcon status={run.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{label(run.agent_key)}</span>
          <span className="text-xs text-muted-foreground">· {TRIGGER[run.trigger]}{run.by ? ` (${run.by})` : ''}</span>
        </div>
        <div className={cn('mt-0.5 line-clamp-2', run.error ? 'text-red-700' : 'text-muted-foreground')}>{run.error || run.summary || '—'}</div>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <div>{ago(run.started_at)}</div>
        {Number(run.cost_usd) > 0 && <div className="tabular">{usd(Number(run.cost_usd))}</div>}
      </div>
    </div>
  )
}

// ---------- settings ----------

function SettingsSheet({ agentKey, settings, onClose }: { agentKey: AgentKey; settings: AgentSettings; onClose: () => void }) {
  const router = useRouter()
  const agent = AGENTS.find(a => a.key === agentKey)!
  const [cfg, setCfg] = useState<any>(settings[agentKey].config)
  const [saving, setSaving] = useState(false)
  const set = (patch: any) => setCfg((c: any) => ({ ...c, ...patch }))

  const save = async () => {
    setSaving(true)
    const r = await saveAgentConfig(agentKey, cfg)
    setSaving(false)
    if (r.error) return toast.error(r.error)
    toast.success('Einstellungen gespeichert')
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-[520px] flex-col bg-card shadow-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-xs text-muted-foreground">Einstellungen</div>
            <div className="text-lg font-semibold">{agent.label}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Schließen"><X /></Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {agentKey === 'first_message' && (
            <>
              <Field label="Was ist HireFlow? (Grundlage für jede Nachricht)">
                <Textarea rows={4} value={cfg.pitch} onChange={e => set({ pitch: e.target.value })} />
              </Field>
              <Field label="Anrede">
                <Select value={cfg.address} onChange={e => set({ address: e.target.value })}>
                  <option value="auto">Automatisch (du bei Start-ups/Tech, Sie im Mittelstand)</option><option value="du">immer du</option><option value="Sie">immer Sie</option>
                </Select>
              </Field>
              <Field label="Link in der Nachricht (optional)">
                <Input value={cfg.link} onChange={e => set({ link: e.target.value })} placeholder="hireflow.one/business" />
              </Field>
              <Field label="Einstieg, den wir anbieten" hint="Optional, z. B. „einen kostenlosen Kurz-Check eurer Stellenanzeigen“. Leer = Link + offene Frage.">
                <Textarea rows={2} value={cfg.offer} onChange={e => set({ offer: e.target.value })} />
              </Field>
              <Field label="Tonalität (optional)" hint="z. B. „locker, kurz, ohne Fachbegriffe; wir sind ein junges Team aus …“">
                <Textarea rows={3} value={cfg.style} onChange={e => set({ style: e.target.value })} />
              </Field>
              <Field label="Beispiel-Nachrichten, die gut funktioniert haben (optional)" hint="Der Agent übernimmt den Stil, nicht den Wortlaut.">
                <Textarea rows={6} value={cfg.examples} onChange={e => set({ examples: e.target.value })} />
              </Field>
              <label className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5 text-sm">
                <span>Automatisch Entwürfe für neue Leads schreiben<span className="block text-xs text-muted-foreground">Sonst nur auf Knopfdruck</span></span>
                <Switch checked={!!cfg.autoDraft} onChange={v => set({ autoDraft: v })} />
              </label>
            </>
          )}
          {agentKey === 'letter' && (
            <>
              <Field label="Absender (Briefkopf, eine Angabe pro Zeile)" hint="Erste Zeile = Firmenname, darunter Anschrift.">
                <Textarea rows={4} value={cfg.sender} onChange={e => set({ sender: e.target.value })} />
              </Field>
              <Field label="Betreff">
                <Input value={cfg.subject} onChange={e => set({ subject: e.target.value })} />
              </Field>
              <Field label="Vorlage für den Brieftext"
                hint="Platzhalter: {{anrede}} {{firma}} {{anlass}} {{absatz}} {{stellen}} {{rollen}} {{ort}} {{name}} – {{anlass}} und {{absatz}} schreibt der Agent passend zur Firma, der Rest kommt wörtlich aus eurer Vorlage.">
                <Textarea rows={12} value={cfg.template} onChange={e => set({ template: e.target.value })} className="font-mono text-[13px]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Grußformel"><Input value={cfg.closing} onChange={e => set({ closing: e.target.value })} /></Field>
                <Field label="Unterschrift (Name)"><Input value={cfg.signer} onChange={e => set({ signer: e.target.value })} /></Field>
                <Field label="Position"><Input value={cfg.signerTitle} onChange={e => set({ signerTitle: e.target.value })} /></Field>
                <Field label="Kontakt unter der Unterschrift"><Input value={cfg.contact} placeholder="Tel. · E-Mail" onChange={e => set({ contact: e.target.value })} /></Field>
              </div>
            </>
          )}
          {agentKey === 'sequence' && <StepsEditor steps={cfg.steps} onChange={steps => set({ steps })} />}
          {agentKey === 'follow_up_guard' && (
            <Field label="Nachfassen nach wie vielen Tagen ohne Aktivität?" hint="Zählt E-Mails, Meetings, Notizen, LinkedIn-Nachrichten und erledigte Aufgaben.">
              <Input type="number" min={2} max={60} value={cfg.days} onChange={e => set({ days: e.target.value })} className="w-28" />
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Speichern</Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

const STEP_TYPES: { value: SequenceStep['type']; label: string }[] = [
  { value: 'todo', label: 'Aufgabe' }, { value: 'call', label: 'Anruf' }, { value: 'letter' as any, label: 'Brief' }, { value: 'email', label: 'E-Mail' }, { value: 'follow_up', label: 'Follow-up' },
]

function StepsEditor({ steps, onChange }: { steps: SequenceStep[]; onChange: (s: SequenceStep[]) => void }) {
  const update = (i: number, patch: Partial<SequenceStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">Jeder Schritt wird als Aufgabe angelegt, sobald der vorige erledigt ist. „Tag“ ist der Abstand ab Start der Abfolge.</p>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              Tag <Input type="number" min={0} max={90} value={s.day} onChange={e => update(i, { day: Number(e.target.value) })} className="h-8 w-14 px-2" />
            </div>
            <Input value={s.title} onChange={e => update(i, { title: e.target.value })} className="h-8 flex-1" />
            <Select value={s.letter ? 'letter' : s.type} onChange={e => update(i, e.target.value === 'letter' ? { type: 'todo', letter: true } : { type: e.target.value as SequenceStep['type'], letter: undefined })} className="h-8 w-[130px] shrink-0">
              {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => onChange(steps.filter((_, j) => j !== i))} disabled={steps.length <= 1} aria-label="Schritt entfernen">
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-3" disabled={steps.length >= 10}
        onClick={() => onChange([...steps, { day: (steps[steps.length - 1]?.day ?? 0) + 3, title: 'Nachfassen', type: 'follow_up' }])}>
        <Plus /> Schritt hinzufügen
      </Button>
    </div>
  )
}
