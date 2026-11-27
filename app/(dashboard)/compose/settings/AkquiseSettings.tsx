'use client'
// Nachrichten → Einstellungen: everything the writer uses, in one place.
// Stimmen + Regeln + Angebote = Simon's Akquise logic (agent_key 'akquise'); Hireflow = the first-message agent's
// base texts, playbooks and industries (agent_key 'first_message'), so the agent and "Schreiben" share them.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save, Trash2, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { AKQUISE_DEFAULTS, CHANNELS, OFFERS, type AkquiseConfig, type Author, type Offer } from '@/lib/akquise/content'
import type { AgentConfig } from '@/lib/agents/registry'
import { saveAkquiseSettings, addVoiceSample, deleteVoiceSample } from '../actions'
import { saveAgentConfig } from '../../agents/actions'
import { BaseTextsEditor, PlaybooksEditor, IndustriesEditor } from '../../agents/AgentsBoard'

type Sample = { id: string; author: string; channel: string; text: string; created_by: string | null; created_at: string }

const NAV = [['stimme', 'Stimmen'], ['beispiele', 'Echte Nachrichten'], ['regeln', 'Kontext & Regeln'], ['angebote', 'Angebote'], ['hireflow', 'Hireflow: Basistexte & Playbooks']]

export default function AkquiseSettings({ cfg: initial, fm: initialFm, samples }: { cfg: AkquiseConfig; fm: AgentConfig['first_message']; samples: Sample[] }) {
  const router = useRouter()
  const [cfg, setCfg] = useState(initial)
  const [fm, setFm] = useState(initialFm)
  const [saving, setSaving] = useState<string | null>(null)
  const set = (patch: Partial<AkquiseConfig>) => setCfg(c => ({ ...c, ...patch }))
  const setVoice = (a: Author, patch: Partial<AkquiseConfig['voices'][Author]>) => setCfg(c => ({ ...c, voices: { ...c.voices, [a]: { ...c.voices[a], ...patch } } }))

  const saveA = async () => {
    setSaving('a'); const r = await saveAkquiseSettings(cfg); setSaving(null)
    if (r.error !== null) return toast.error(r.error)
    toast.success('Gespeichert'); router.refresh()
  }
  const saveH = async () => {
    setSaving('h')
    const r = await saveAgentConfig('first_message', { pitch: fm.pitch, link: fm.link, useBaseText: fm.useBaseText, baseTexts: fm.baseTexts, playbooks: fm.playbooks, industries: fm.industries })
    setSaving(null)
    if (r.error) return toast.error(r.error)
    toast.success('Gespeichert, gilt auch für den Erstnachricht-Agent'); router.refresh()
  }
  const SaveA = () => <Button onClick={saveA} disabled={!!saving}>{saving === 'a' ? <Loader2 className="animate-spin" /> : <Save />} Speichern</Button>

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Vorlagen &amp; Stimmen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Hier stellt ihr ein, wie „Schreiben“ klingt und was es weiß. Vorbelegt mit Simons Akquise-Logik aus dem Content Studio; Basistexte und Playbooks teilt sich der Bereich mit dem Erstnachricht-Agent.</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <div className="sticky top-16 space-y-1 text-[13px]">
            {NAV.map(([id, l]) => <a key={id} href={`#${id}`} className="block rounded px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">{l}</a>)}
          </div>
        </nav>
        <div className="space-y-8">
          <Section id="stimme" title="Stimmen" sub="Wer schreibt, und wie. Die Stimme steht im System-Prompt vor allen Regeln.">
            {(['henri', 'simon'] as Author[]).map(a => (
              <Card key={a} className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-3">
                  <F label="Name"><Input value={cfg.voices[a].full} onChange={e => setVoice(a, { full: e.target.value })} /></F>
                  <F label="Vorname (Gruß)"><Input value={cfg.voices[a].first} onChange={e => setVoice(a, { first: e.target.value })} /></F>
                  <F label="E-Mail (Signatur)"><Input value={cfg.voices[a].email} onChange={e => setVoice(a, { email: e.target.value })} /></F>
                </div>
                <F label={`Stimmprofil ${cfg.voices[a].first}`}><Textarea rows={7} value={cfg.voices[a].voice} onChange={e => setVoice(a, { voice: e.target.value })} /></F>
                <Reset onClick={() => setVoice(a, AKQUISE_DEFAULTS.voices[a])} />
              </Card>
            ))}
            <SaveA />
          </Section>

          <Section id="beispiele" title="Echte Nachrichten (Akquise-Stimme)" sub="Nachrichten, die ihr selbst geschrieben habt und mit denen ihr zufrieden wart. Daraus übernimmt der Writer Rhythmus, Wortwahl und Direktheit, nicht den Inhalt. Drei bis fünf pro Person reichen, gern aus verschiedenen Kanälen. Geteilt mit dem Content Studio.">
            <SampleForm onAdded={() => router.refresh()} />
            <Card className="divide-y divide-border">
              {samples.length === 0 && <div className="px-4 py-5 text-center text-[13px] text-muted-foreground">Noch keine Beispielnachrichten hinterlegt.</div>}
              {samples.map(s => (
                <div key={s.id} className="flex items-start gap-3 px-4 py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 font-medium">{s.author === 'simon' ? 'Simon' : 'Henri'} <span className="font-normal text-muted-foreground">· {CHANNELS[s.channel as keyof typeof CHANNELS]?.label ?? s.channel}</span></div>
                    <div className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{s.text}</div>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Entfernen" onClick={async () => { const r = await deleteVoiceSample(s.id); if (r.error !== null) toast.error(r.error); else router.refresh() }}><Trash2 /></Button>
                </div>
              ))}
            </Card>
          </Section>

          <Section id="regeln" title="Kontext & Regeln" sub="Gilt für jede Nachricht, egal von wem.">
            <F label="Über Altoris (Firmenkontext)"><Textarea rows={7} value={cfg.context} onChange={e => set({ context: e.target.value })} /></F>
            <F label="Regeln für jede Nachricht"><Textarea rows={14} value={cfg.rules} onChange={e => set({ rules: e.target.value })} /></F>
            <F label="Anrede bei „Auto“"><Textarea rows={2} value={cfg.addressAuto} onChange={e => set({ addressAuto: e.target.value })} /></F>
            <F label="Floskeln, die der Qualitäts-Check markiert (kommagetrennt)">
              <Textarea rows={2} value={cfg.floskeln.join(', ')} onChange={e => set({ floskeln: e.target.value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean) })} />
            </F>
            <div className="flex items-center gap-3"><SaveA /><Reset onClick={() => set({ context: AKQUISE_DEFAULTS.context, rules: AKQUISE_DEFAULTS.rules, addressAuto: AKQUISE_DEFAULTS.addressAuto, floskeln: AKQUISE_DEFAULTS.floskeln })} /></div>
          </Section>

          <Section id="angebote" title="Angebote (Thema im Hintergrund)" sub="Was zum jeweiligen Thema gesagt werden darf. Steht im Prompt als „Thema im Hintergrund“.">
            {(Object.keys(OFFERS) as Offer[]).map(k => (
              <F key={k} label={OFFERS[k].label}><Textarea rows={3} value={cfg.offers[k]} onChange={e => set({ offers: { ...cfg.offers, [k]: e.target.value } })} /></F>
            ))}
            <div className="flex items-center gap-3"><SaveA /><Reset onClick={() => set({ offers: AKQUISE_DEFAULTS.offers })} /></div>
          </Section>

          <Section id="hireflow" title="Hireflow: Basistexte & Playbooks" sub="Greift beim Thema „Hireflow“: Persona aus der Rolle → Playbook, Pain aus den offenen Stellen, Basistext nach Firmentyp für Variante A. Dieselben Einstellungen nutzt der Erstnachricht-Agent.">
            <F label="Was ist Hireflow? (Grundlage)"><Textarea rows={4} value={fm.pitch} onChange={e => setFm({ ...fm, pitch: e.target.value })} /></F>
            <F label="Link, den wir nennen dürfen"><Input value={fm.link} onChange={e => setFm({ ...fm, link: e.target.value })} /></F>
            <Card className="space-y-3 p-4">
              <label className="flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold">Basistext verwenden<span className="block text-xs font-normal text-muted-foreground">Variante A übernimmt die festen Sätze, der Agent füllt nur die {'{{…}}'}-Lücken. Variante B bleibt frei.</span></span>
                <Switch checked={fm.useBaseText !== false} onChange={v => setFm({ ...fm, useBaseText: v })} />
              </label>
              <BaseTextsEditor texts={fm.baseTexts || {}} onChange={baseTexts => setFm({ ...fm, baseTexts })} />
            </Card>
            <PlaybooksEditor playbooks={fm.playbooks || []} onChange={playbooks => setFm({ ...fm, playbooks })} />
            <IndustriesEditor industries={fm.industries || []} onChange={industries => setFm({ ...fm, industries })} />
            <Button onClick={saveH} disabled={!!saving}>{saving === 'h' ? <Loader2 className="animate-spin" /> : <Save />} Hireflow-Einstellungen speichern</Button>
          </Section>
        </div>
      </div>
    </div>
  )
}

function SampleForm({ onAdded }: { onAdded: () => void }) {
  const [author, setAuthor] = useState<Author>('henri')
  const [channel, setChannel] = useState('dm')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true); const r = await addVoiceSample(author, channel, text); setBusy(false)
    if (r.error !== null) return toast.error(r.error)
    setText(''); toast.success('Beispielnachricht gespeichert'); onAdded()
  }
  return (
    <Card className="space-y-3 p-4">
      <div className="flex gap-3">
        <Select className="w-auto" value={author} onChange={e => setAuthor(e.target.value as Author)}><option value="henri">Henri</option><option value="simon">Simon</option></Select>
        <Select className="w-auto" value={channel} onChange={e => setChannel(e.target.value)}>
          {Object.entries(CHANNELS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </Select>
      </div>
      <Textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="Nachricht hier einfügen (Namen von Empfängern gern vorher entfernen)" />
      <Button onClick={add} disabled={busy || text.trim().length < 20}>{busy && <Loader2 className="animate-spin" />} Hinzufügen</Button>
    </Card>
  )
}

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 space-y-3">
      <div><h2 className="text-[16px] font-semibold">{title}</h2><p className="text-[13px] text-muted-foreground">{sub}</p></div>
      {children}
    </section>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>
}
function Reset({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground underline hover:text-foreground"><RotateCcw className="size-3" /> Simons Fassung wiederherstellen</button>
}
