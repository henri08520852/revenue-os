// Akquise writer (server only): Simon's prompt logic (voice, rules, channel, relationship, offer, goal, two variants,
// optional two follow-ups) on top of Revenue OS: recipient + facts from the CRM, and for the Hireflow offer the
// existing pain check, playbooks and base texts of the first-message agent.
import { anthropicClient } from '@/lib/ai/client'
import { gather, apiKey, costOf, segmentOf } from '@/lib/agents/firstMessage'
import { loadSettings, startRun, finishRun, type AgentConfig } from '@/lib/agents/registry'
import { personaOf, PERSONAS, type Persona } from '@/lib/outreach/persona'
import { playbookFor, pickVariant } from '@/lib/outreach/playbooks'
import { segmentFor, SEGMENTS, type SegmentKey } from '@/lib/outreach/segments'
import { collectEvidence } from '@/lib/outreach/relevance'
import { PAINS, type PainKey } from '@/lib/outreach/pains'
import {
  CHANNELS, RELS, SALES_GOALS, DIRECTIVES, mergeAkquise,
  type AkquiseConfig, type Author, type Channel, type SalesForm, type SalesText, type Directive, type Address,
} from './content'

export const AKQUISE_MODEL = process.env.AKQUISE_MODEL || 'claude-sonnet-5-5' // Simon's choice for the studio
const REFINE_MODEL = process.env.AI_MODEL || 'claude-haiku-5-5'

export async function loadAkquise(supabase: any, projectId: string): Promise<{ cfg: AkquiseConfig; fm: AgentConfig['first_message'] }> {
  const [{ data }, settings] = await Promise.all([
    supabase.from('automation_settings').select('config').eq('project_id', projectId).eq('agent_key', 'akquise').maybeSingle(),
    loadSettings(supabase, projectId),
  ])
  return { cfg: mergeAkquise(data?.config), fm: settings.first_message.config }
}

// Real messages of the sender: same channel first
export async function fetchSamples(supabase: any, author: Author, channel: Channel, n = 3) {
  const { data } = await supabase.from('sales_voice_samples').select('channel, text').eq('author', author).order('created_at', { ascending: false }).limit(40)
  const all = (data || []) as { channel: string; text: string }[]
  return [...all.filter(x => x.channel === channel), ...all.filter(x => x.channel !== channel)].slice(0, n)
}

function addressSpec(cfg: AkquiseConfig, a: Address) {
  return a === 'sie' ? 'Siezen.' : a === 'du' ? 'Duzen.' : cfg.addressAuto
}

export function buildSystem(cfg: AkquiseConfig, author: Author, samples: { channel: string; text: string }[]) {
  const P = cfg.voices[author] || cfg.voices.henri
  const sampleBlock = samples.length
    ? `\n\nSO SCHREIBT ${P.first.toUpperCase()} WIRKLICH (echte Nachrichten: übernimm Rhythmus, Wortwahl, Satzlänge und Direktheit, nicht den Inhalt):\n` +
      samples.map((s, i) => `--- Beispiel ${i + 1} (${CHANNELS[s.channel as Channel]?.label || s.channel}) ---\n${(s.text || '').slice(0, 900)}`).join('\n\n')
    : ''
  return `${P.voice}\n\nÜBER ALTORIS:\n${cfg.context}\n\n${cfg.rules}${sampleBlock}\n\nSignatur-Daten: ${P.full}, Co-Founder Altoris, ${P.email}, altoris.one`
}

type Facts = NonNullable<Awaited<ReturnType<typeof gather>>>
export type HireflowMeta = { persona: string; playbook: string; pain: string | null; evidence: string | null; baseText: boolean }

// Hireflow offer: persona → playbook, job-posting evidence → pain, base text per company type (all editable in settings)
async function hireflowBrief(supabase: any, projectId: string, fm: AgentConfig['first_message'], f: SalesForm, facts: Facts | null, companyId: string | null, pains: PainKey[], ownDraft: boolean, sender: string) {
  const agency = facts ? segmentOf(facts.text) === 'agency' : false
  const p = facts?.person as any
  const persona: Persona = p?.persona_source === 'manual' && p?.persona ? p.persona : personaOf(f.role || facts?.jobTitle, facts?.size, agency)
  const pb = playbookFor(fm.playbooks, persona)
  const variant = pickVariant(pb, {})
  let evidence: { key: PainKey; fact: string } | null = null
  let jobAd = ''
  if (facts && companyId) {
    const rel = await collectEvidence(supabase, { projectId, companyId, companyName: facts.companyName, hiringKey: facts.hiringKey, hiring: facts.hiring, isTeam: facts.isTeam }).catch(() => null)
    if (rel) {
      evidence = (pains[0] ? rel.evidence.find(e => e.key === pains[0]) : rel.evidence[0]) ?? null
      if (rel.jobAd) jobAd = `Auszug aus der Stellenanzeige „${rel.jobAd.title}“:\n${rel.jobAd.text.slice(0, 1500)}`
    }
  }
  const painKey = pains[0] ?? evidence?.key ?? null
  const pain = painKey ? PAINS[painKey] : null
  const seg: SegmentKey = segmentFor(agency, facts?.size, facts?.openJobs)
  const industry = facts?.industryKey ? fm.industries.find(i => i.key === facts.industryKey && i.active) : null
  const baseText = fm.useBaseText && !ownDraft && f.channel !== 'connect' ? fm.baseTexts?.[seg]?.trim() : ''
  const lines = [
    `HIREFLOW-VORGABEN (aus unseren Playbooks):`,
    `Produkt: ${fm.pitch}`,
    fm.link ? `Link, den wir nennen dürfen: ${fm.link}` : '',
    `Zielperson: ${PERSONAS[persona]} · Firmentyp: ${SEGMENTS[seg]}${industry ? ` · Branche: ${industry.label}, typisches Problem dort: ${industry.pain}` : ''}`,
    `Playbook „${pb.name}“${variant.angle ? `, Winkel: ${variant.angle}` : ''}`,
    pain
      ? `Vermuteter Pain (als Frage oder Vermutung, nie als Behauptung): ${pain.pain}\nDas eine Ergebnis, das wir nennen: ${pain.angle}\nFrage in diese Richtung: ${pain.question}`
      : `Typischer Schmerz dieser Zielperson: ${pb.pain}\nDas eine Ergebnis, das wir nennen: ${pb.outcome}\nFrage in diese Richtung: ${pb.question}`,
    evidence?.fact ? `Beleg aus den offenen Stellen (als Anlass nutzbar): ${evidence.fact}` : '',
    pains.length > 1 ? `Weitere vermutete Pains (höchstens einen in einem Halbsatz): ${pains.slice(1).map(k => PAINS[k].label).join(', ')}` : '',
    jobAd,
    baseText ? `BASISTEXT für „${SEGMENTS[seg]}“: Variante A hält sich an diesen Basistext. Aufbau und feste Sätze wörtlich übernehmen, nur die {{…}}-Stellen passend ausformulieren ({{absender}} = ${sender}). Variante B ist frei nach den Regeln.\n---\n${baseText}\n---` : '',
  ].filter(Boolean)
  const meta: HireflowMeta = { persona: PERSONAS[persona], playbook: pb.name, pain: pain?.label ?? null, evidence: evidence?.fact ?? null, baseText: !!baseText }
  return { text: lines.join('\n'), meta }
}

export function buildUser(f: SalesForm, extra: { crmFacts?: string; hireflow?: string; draftText?: string }) {
  const ch = CHANNELS[f.channel] || CHANNELS.connect
  const rel = RELS[f.rel] || RELS.cold
  const goal = f.channel === 'connect' ? 'Bei einer Vernetzungsanfrage ist das einzige Ziel, dass sie angenommen wird.' : (SALES_GOALS[f.goal] || SALES_GOALS.call).spec
  const isEmail = f.channel === 'email'
  const seq = f.sequence && f.channel !== 'followup'
  return `EMPFÄNGER
Name: ${f.name || 'unbekannt (nutze „[Name]" als Platzhalter)'}
Rolle: ${f.role || 'unbekannt'}
Firma: ${f.company || 'unbekannt'}
Was wir über ihn oder die Firma wissen (einzige erlaubte Faktenbasis):
${f.context || (extra.crmFacts ? 'Siehe CRM-Wissen unten.' : 'Nichts weiter. Behaupte also nichts Persönliches, sondern knüpfe an Rolle und Firma an.')}${extra.crmFacts ? `\n\nCRM-WISSEN AUS REVENUE OS (ebenfalls verlässliche Fakten; nur Passendes nutzen, nicht alles aufzählen):\n${extra.crmFacts}` : ''}

SITUATION
Kanal: ${ch.spec}
Beziehung: ${rel.spec}
Anrede: {{ADDRESS}}
Thema im Hintergrund: {{OFFER}}
Ziel: ${goal}${f.channel === 'followup' && f.prev ? `\n\nUNSERE FRÜHERE NACHRICHT:\n${f.prev}` : ''}${extra.hireflow ? `\n\n${extra.hireflow}` : ''}${extra.draftText ? `\n\nENTWURF / STICHPUNKTE VOM ABSENDER (Inhalt und Kernaussagen übernehmen, nach den Regeln ausformulieren; ist er schon gut, nur leicht glätten):\n---\n${extra.draftText}\n---` : ''}

AUFGABE
Schreibe zwei klar unterschiedliche Varianten:
Variante A „Direkt": sagt offen und knapp, warum du schreibst.
Variante B „Beobachtung": beginnt mit einer konkreten Beobachtung oder Frage zur Situation des Empfängers und kommt erst danach zu uns.${seq ? `
Schreibe außerdem zwei Follow-ups zu Variante A für den Fall, dass keine Antwort kommt: Follow-up 1 nach etwa 4 bis 5 Werktagen, Follow-up 2 nach etwa 10 Werktagen. Jedes bringt einen neuen Gedanken oder Nutzen, kein bloßes Nachhaken, kein Vorwurf. Follow-up 2 darf freundlich abschließen. Jeweils 200 bis 450 Zeichen.` : `
Follow-ups bleiben leer.`}
${isEmail ? 'Bei E-Mail jeweils einen Betreff (subject) mitliefern.' : 'subject bleibt leer.'}
rationale: 1 bis 2 Sätze, welcher Anknüpfungspunkt genutzt wurde und warum dieser Abschluss.`
}

const TEXT = { type: 'object', properties: { subject: { type: 'string' }, text: { type: 'string' } }, required: ['subject', 'text'], additionalProperties: false }
const SCHEMA = {
  type: 'object',
  properties: { variant_a: TEXT, variant_b: TEXT, followup_1: TEXT, followup_2: TEXT, rationale: { type: 'string' } },
  required: ['variant_a', 'variant_b', 'followup_1', 'followup_2', 'rationale'],
  additionalProperties: false,
}

export type WriteInput = {
  author: Author; form: SalesForm; personId?: string | null; companyId?: string | null; leadId?: string | null
  useCrm?: boolean; pains?: PainKey[]; draftText?: string
}
export type WriteResult = {
  variants: SalesText[]; followups: SalesText[]; rationale: string; sampleCount: number
  model: string; costUsd: number; hireflow: HireflowMeta | null
}

export async function writeAkquise(supabase: any, projectId: string, input: WriteInput): Promise<WriteResult> {
  const key = apiKey()
  if (!key) throw new Error('KI ist noch nicht eingerichtet (API-Key fehlt).')
  const { cfg, fm } = await loadAkquise(supabase, projectId)
  const f = input.form
  const runId = await startRun(supabase, projectId, 'akquise' as any, 'manual').catch(() => null)
  try {
    const facts = input.useCrm !== false && input.companyId
      ? await gather(supabase, { projectId, companyId: input.companyId, personId: input.personId ?? null, leadId: input.leadId ?? null }).catch(() => null)
      : null
    const sender = cfg.voices[input.author]?.first || 'Henri'
    const [samples, hf] = await Promise.all([
      fetchSamples(supabase, input.author, f.channel, 3).catch(() => []),
      f.offer === 'hireflow' ? hireflowBrief(supabase, projectId, fm, f, facts, input.companyId ?? null, input.pains || [], !!input.draftText?.trim(), sender) : Promise.resolve(null),
    ])
    const user = buildUser(f, { crmFacts: facts?.text?.slice(0, 6000), hireflow: hf?.text, draftText: input.draftText?.trim() })
      .replace('{{ADDRESS}}', addressSpec(cfg, f.address)).replace('{{OFFER}}', cfg.offers[f.offer] || cfg.offers.deepcheck)
    const res = await anthropicClient(key).messages.create({
      model: AKQUISE_MODEL,
      max_tokens: f.sequence ? 5000 : 3500,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: buildSystem(cfg, input.author, samples),
      messages: [{ role: 'user', content: user }],
    } as any)
    if (res.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.')
    const block = res.content.find((b: any) => b.type === 'text') as any
    const out = JSON.parse(block?.text || '{}')
    const t = (x: any, label: string): SalesText => ({ label, subject: String(x?.subject || '').trim(), text: String(x?.text || '').trim() })
    const variants = [t(out.variant_a, 'A · Direkt'), t(out.variant_b, 'B · Beobachtung')].filter(v => v.text)
    const followups = f.sequence && f.channel !== 'followup'
      ? [t(out.followup_1, 'Follow-up 1 · nach 4 bis 5 Werktagen'), t(out.followup_2, 'Follow-up 2 · nach ca. 10 Werktagen')].filter(v => v.text)
      : []
    if (!variants.length) throw new Error('Keine Nachricht im Ergebnis gefunden. Bitte erneut versuchen.')
    const costUsd = costOf(AKQUISE_MODEL, res.usage)
    await finishRun(supabase, runId, { items: 1, summary: `Akquise: ${f.name || f.company || 'Nachricht'} (${CHANNELS[f.channel].label})`, costUsd })
    return { variants, followups, rationale: String(out.rationale || '').trim(), sampleCount: samples.length, model: AKQUISE_MODEL, costUsd, hireflow: hf?.meta ?? null }
  } catch (e: any) {
    await finishRun(supabase, runId, { error: e?.message || 'Fehler' })
    throw e
  }
}

export async function refineAkquise(supabase: any, projectId: string, a: { author: Author; form: SalesForm; text: string; channel: Channel; directive?: Directive | null; custom?: string | null }) {
  const key = apiKey()
  if (!key) throw new Error('KI ist noch nicht eingerichtet (API-Key fehlt).')
  const { cfg } = await loadAkquise(supabase, projectId)
  const samples = await fetchSamples(supabase, a.author, a.form.channel, 2).catch(() => [])
  const instr = a.custom?.trim() || (a.directive ? DIRECTIVES[a.directive]?.spec : '') || DIRECTIVES.shorter.spec
  const f = a.form
  const res = await anthropicClient(key).messages.create({
    model: REFINE_MODEL,
    max_tokens: 1400,
    system: buildSystem(cfg, a.author, samples),
    messages: [{ role: 'user', content: `Kontext zum Empfänger: ${[f.name, f.role, f.company].filter(Boolean).join(', ') || 'unbekannt'}\n${f.context || ''}\n\nKanal: ${CHANNELS[a.channel]?.spec}\n\nNACHRICHT:\n${a.text}\n\nAUFGABE: ${instr}\nHalte alle Regeln ein. Antworte NUR mit dem überarbeiteten Nachrichtentext, ohne Betreff, ohne Erklärung.` }],
  } as any)
  const block = res.content.find((b: any) => b.type === 'text') as any
  const clean = String(block?.text || '').trim().replace(/^TEXT:\s*/, '').replace(/^["„]|["“]$/g, '').trim()
  if (clean.length <= 15) throw new Error('Keine brauchbare Überarbeitung, bitte erneut versuchen.')
  return { text: clean, instr }
}
