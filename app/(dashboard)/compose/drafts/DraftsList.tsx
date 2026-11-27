'use client'
// Entwürfe & Verlauf: what was written, by whom, what changed against the AI original, what was sent, who replied.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, CheckCircle2, Clock, CornerDownRight, MessageSquareReply, PenLine, Search, Bot, Palette, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { CHANNELS, OFFERS, RELS, type SalesPayload, type HistoryEvent } from '@/lib/akquise/content'
import { setArchived } from '../actions'
import { cn } from '@/lib/utils'

export type Entry = {
  id: string; source: 'revenue-os' | 'content-studio' | 'agent'; status: string; author: string; title: string
  at: string; createdAt: string; sentAt: string | null; replied: string | null; createdBy: string | null
  personId: string | null; companyId: string | null; payload: SalesPayload | null
  agent?: { body: string | null; original: string | null; note: string | null; channel: string | null; playbook: string | null }
}

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const ACTION: Record<HistoryEvent['action'], string> = {
  created: 'geschrieben', regenerated: 'neu geschrieben', refined: 'überarbeitet', edited: 'von Hand bearbeitet',
  chosen: 'Favorit gewählt', sent: 'als gesendet abgelegt', archived: 'archiviert', restored: 'wiederhergestellt',
}
const SOURCE = { 'revenue-os': { label: 'Schreiben', Icon: PenLine }, 'content-studio': { label: 'Content Studio', Icon: Palette }, agent: { label: 'Agent', Icon: Bot } }
// Workdays since a date (Mon–Fri)
function workdaysSince(iso: string) {
  let n = 0; const d = new Date(iso); const now = new Date()
  while (d < now) { d.setDate(d.getDate() + 1); if (d <= now && d.getDay() % 6 !== 0) n++ }
  return n
}

export default function DraftsList({ entries, openId, missing }: { entries: Entry[]; openId: string | null; missing: boolean }) {
  const router = useRouter()
  const [status, setStatus] = useState<'all' | 'draft' | 'published' | 'archived' | 'due'>('all')
  const [author, setAuthor] = useState('all')
  const [source, setSource] = useState('all')
  const [q, setQ] = useState('')

  const dueOf = (e: Entry) => e.status === 'published' && !e.replied && e.sentAt && e.payload?.form?.channel !== 'connect' ? workdaysSince(e.sentAt) >= 4 : false
  const list = useMemo(() => entries
    .filter(e => status === 'all' ? e.status !== 'archived' : status === 'due' ? dueOf(e) : e.status === status)
    .filter(e => author === 'all' || e.author === author)
    .filter(e => source === 'all' || e.source === source)
    .filter(e => !q.trim() || `${e.title} ${e.payload?.form?.context ?? ''} ${e.payload?.variants?.map(v => v.text).join(' ') ?? e.agent?.body ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.sentAt || b.at).localeCompare(a.sentAt || a.at)), [entries, status, author, source, q])

  const sent = entries.filter(e => e.status === 'published')
  const replied = sent.filter(e => e.replied).length
  const kpis = [
    { label: 'Offene Entwürfe', value: entries.filter(e => e.status === 'draft').length },
    { label: 'Gesendet', value: sent.length },
    { label: 'Antworten', value: `${replied}${sent.length ? ` · ${Math.round(replied / sent.length * 100)} %` : ''}` },
    { label: 'Follow-up fällig', value: entries.filter(dueOf).length },
  ]

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Entwürfe &amp; Verlauf</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alle Akquise-Nachrichten an einem Ort: aus „Schreiben“, aus dem Content Studio und vom Erstnachricht-Agent. Pro Nachricht siehst du, wer was geschrieben und geändert hat, was rausging und ob eine Antwort kam.</p>
      </div>
      {missing && <Card className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Die Entwürfe-Tabelle (content_drafts) ist nicht erreichbar. Sie ist nur für @altoris.one-Konten freigegeben.</Card>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(k => <Card key={k.label} className="px-4 py-3"><div className="text-[12px] text-muted-foreground">{k.label}</div><div className="text-xl font-semibold tabular">{k.value}</div></Card>)}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md bg-muted p-1 text-[13px]">
          {([['all', 'Alle'], ['draft', 'Entwürfe'], ['published', 'Gesendet'], ['due', 'Follow-up fällig'], ['archived', 'Archiv']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setStatus(v)} className={cn('rounded px-3 py-1 font-medium', status === v ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
        <Select className="h-8 w-auto text-[13px]" value={author} onChange={e => setAuthor(e.target.value)}>
          <option value="all">Alle Absender</option><option value="henri">Henri</option><option value="simon">Simon</option>
        </Select>
        <Select className="h-8 w-auto text-[13px]" value={source} onChange={e => setSource(e.target.value)}>
          <option value="all">Alle Quellen</option><option value="revenue-os">Schreiben</option><option value="content-studio">Content Studio</option><option value="agent">Agent</option>
        </Select>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 w-60 pl-8 text-[13px]" placeholder="Suchen" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="divide-y divide-border">
        {list.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nichts gefunden. <Link href="/compose" className="underline">Neue Nachricht schreiben</Link></div>}
        {list.map(e => <Row key={e.id} e={e} open={e.id === openId} due={dueOf(e)} onChanged={() => router.refresh()} />)}
      </Card>
    </div>
  )
}

function Row({ e, open, due, onChanged }: { e: Entry; open: boolean; due: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const p = e.payload
  const S = SOURCE[e.source]
  const archive = async (v: boolean) => {
    setBusy(true)
    const r = await setArchived(e.id, v)
    setBusy(false)
    if (r.error !== null) return toast.error(r.error)
    onChanged()
  }
  const sentIdx = p?.sent?.variant ?? null
  const changed = (a?: string, b?: string) => !!a && !!b && a.trim() !== b.trim()

  return (
    <details open={open} className="group px-4 py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
        <S.Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title.replace(/^Erstnachricht an /, '')}</span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {e.author && <Badge tone="outline">{e.author === 'simon' ? 'Simon' : 'Henri'}</Badge>}
          {p?.form?.offer && <Badge tone="outline">{OFFERS[p.form.offer]?.label}</Badge>}
          {e.agent?.playbook && <Badge tone="outline">{e.agent.playbook}</Badge>}
          {e.replied ? <Badge tone="success"><MessageSquareReply /> Antwort {when(e.replied).slice(0, 8)}</Badge>
            : due ? <Badge tone="warning"><AlertCircle /> Follow-up fällig</Badge>
            : e.status === 'published' ? <Badge tone="sky"><CheckCircle2 /> Gesendet {when(e.sentAt).slice(0, 8)}</Badge>
            : e.status === 'archived' ? <Badge tone="neutral"><Archive /> Archiv</Badge>
            : <Badge tone="neutral"><Clock /> Entwurf {when(e.at).slice(0, 8)}</Badge>}
        </span>
      </summary>

      <div className="mt-3 grid gap-4 pl-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-3 text-[13px]">
          {p ? (
            <>
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                {[CHANNELS[p.form.channel]?.label, RELS[p.form.rel]?.label, p.form.role, p.form.company].filter(Boolean).map(b => <Badge key={b as string} tone="neutral">{b}</Badge>)}
                {p.extra?.hireflow?.playbook && <Badge tone="violet">{[p.extra.hireflow.playbook, p.extra.hireflow.pain].filter(Boolean).join(' · ')}</Badge>}
              </div>
              {p.form.context && <div className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground"><span className="font-medium text-foreground">Kontext:</span> {p.form.context}</div>}
              {(p.variants || []).map((v, i) => (
                <div key={i} className={cn('rounded-md border px-3 py-2', sentIdx === i ? 'border-emerald-300 bg-emerald-50/50' : 'border-border')}>
                  <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted-foreground">
                    <span>Variante {v.label}{p.chosen === i ? ' · Favorit' : ''}</span>{sentIdx === i && <span className="text-emerald-700">gesendet</span>}
                  </div>
                  {v.subject && <div className="mb-1 font-medium">Betreff: {v.subject}</div>}
                  <div className="whitespace-pre-wrap">{v.text}</div>
                  {changed(p.original?.variants?.[i]?.text, v.text) && (
                    <details className="mt-1.5"><summary className="cursor-pointer text-[12px] text-muted-foreground">Original der KI</summary>
                      <div className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{p.original!.variants[i].text}</div></details>
                  )}
                </div>
              ))}
              {(p.followups || []).map((v, i) => (
                <div key={'f' + i} className={cn('rounded-md border px-3 py-2', sentIdx === -1 - i ? 'border-emerald-300 bg-emerald-50/50' : 'border-dashed border-border')}>
                  <div className="mb-1 text-[12px] font-medium text-muted-foreground">{v.label}{sentIdx === -1 - i ? ' · gesendet' : ''}</div>
                  <div className="whitespace-pre-wrap">{v.text}</div>
                </div>
              ))}
              {p.rationale && <div className="text-muted-foreground"><span className="font-medium text-foreground">Warum so:</span> {p.rationale}</div>}
            </>
          ) : e.agent && (
            <>
              {e.agent.note && <div className="rounded-md border border-border px-3 py-2"><div className="mb-1 text-[12px] font-medium text-muted-foreground">{e.agent.channel === 'email' ? 'Betreff' : 'Vernetzungsnotiz'}</div>{e.agent.note}</div>}
              <div className="whitespace-pre-wrap rounded-md border border-emerald-300 bg-emerald-50/50 px-3 py-2">{e.agent.body}</div>
              {changed(e.agent.original ?? undefined, e.agent.body ?? undefined) && (
                <details><summary className="cursor-pointer text-[12px] text-muted-foreground">Original des Agents</summary>
                  <div className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{e.agent.original}</div></details>
              )}
            </>
          )}
        </div>

        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            {e.source !== 'agent' && e.status !== 'published' && <Link href={`/compose?draft=${e.id}`}><Button size="sm"><PenLine /> Weiter bearbeiten</Button></Link>}
            {e.source !== 'agent' && e.status === 'published' && p?.form?.channel !== 'followup' && <Link href={`/compose?followup=${e.id}`}><Button size="sm" variant={due ? 'default' : 'outline'}><CornerDownRight /> Follow-up schreiben</Button></Link>}
            {e.source !== 'agent' && (e.status === 'archived'
              ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => archive(false)}><ArchiveRestore /> Wiederherstellen</Button>
              : <Button size="sm" variant="ghost" disabled={busy} onClick={() => archive(true)}><Archive /> Archivieren</Button>)}
          </div>
          <div className="space-y-1 text-muted-foreground">
            {e.personId && <div>Kontakt: <Link href={`/contacts/${e.personId}`} className="text-foreground underline">im CRM öffnen</Link></div>}
            {e.companyId && <div>Firma: <Link href={`/companies/${e.companyId}`} className="text-foreground underline">im CRM öffnen</Link></div>}
            {!e.personId && !e.companyId && <div>Nicht mit dem CRM verknüpft{p?.crm?.create ? ' (wird beim Senden angelegt)' : ''}.</div>}
            {p?.model && <div>KI: {p.model}{p.cost_usd ? ` · ${p.cost_usd.toFixed(3).replace('.', ',')} $` : ''}</div>}
          </div>
          <div>
            <div className="mb-1.5 font-medium">Verlauf</div>
            <ol className="space-y-1.5 border-l border-border pl-3">
              {e.replied && <li className="relative text-[12.5px]"><span className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">{when(e.replied)}</span> · <span className="font-medium">Antwort</span> erhalten</li>}
              {(p?.history?.length ? p.history : [
                { at: e.createdAt, by: e.createdBy || (e.source === 'agent' ? 'Agent' : '–'), action: 'created' as const },
                ...(e.sentAt ? [{ at: e.sentAt, by: '', action: 'sent' as const }] : []),
              ]).slice().reverse().map((h, i) => (
                <li key={i} className="relative text-[12.5px]">
                  <span className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-muted-foreground/40" />
                  <span className="text-muted-foreground">{when(h.at)}</span> · <span className="font-medium">{h.by || 'Team'}</span> {ACTION[h.action] ?? h.action}{h.detail ? <span className="text-muted-foreground"> · {h.detail}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </details>
  )
}
