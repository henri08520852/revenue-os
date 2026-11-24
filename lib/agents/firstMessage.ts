// First-message agent: researches company + contact and drafts a LinkedIn connection note and first message.
// Only drafts – the result waits in the approval queue (automation_items) and is never sent automatically.
import Anthropic from '@anthropic-ai/sdk'
import { anthropicClient } from '@/lib/ai/client'
import { fetchHtml, textOf } from '@/lib/discovery/enrich'
import { loadSettings, startRun, finishRun, AgentConfig, AGENCY_RE } from './registry'
import { personaOf, roleCategoryOf, PERSONAS, type Persona } from '@/lib/outreach/persona'
import { segmentFor, SEGMENTS, type SegmentKey } from '@/lib/outreach/segments'
import { classify } from '@/lib/discovery/industry'
import { playbookFor, pickVariant, pickSignal, personalizationScore, SIGNALS, type SignalKey } from '@/lib/outreach/playbooks'
import { collectEvidence, PAINS, NoReasonError, type PainKey } from '@/lib/outreach/relevance'
import { GOALS, type Goal } from '@/lib/outreach/pains'

export const MODEL = process.env.AI_MODEL || 'claude-haiku-5-5'
// USD per million tokens (input, output) for the cost counter
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20],
}
export const costOf = (model: string, u: { input_tokens: number; output_tokens: number }) => {
  const [i, o] = PRICES[model] ?? PRICES['claude-haiku-5-5']
  return (u.input_tokens * i + u.output_tokens * o) / 1_000_000
}

const SCHEMA = {
  type: 'object',
  properties: {
    research: { type: 'array', items: { type: 'string' } },
    hook: { type: 'string' },
    connect_note: { type: 'string' },
    relevance: { type: 'integer' },
    urgency: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    pain: { type: 'string' },
    evidence: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['research', 'hook', 'connect_note', 'message', 'relevance', 'urgency', 'pain', 'evidence'],
  additionalProperties: false,
}

export type Draft = { research: string[]; hook: string; connect_note: string; message: string; relevance?: number; urgency?: 'hoch' | 'mittel' | 'niedrig'; pain?: string; evidence?: string }
export type Target = { projectId: string; companyId: string; personId?: string | null; leadId?: string | null }

export const apiKey = () => process.env.ANTHROPIC_BRIEFING_API_KEY || process.env.ANTHROPIC_API_KEY

export async function gather(supabase: any, t: Target) {
  const [{ data: company }, { data: person }, { data: cand }, { data: signals }, { data: allActs }, { data: members }] = await Promise.all([
    supabase.from('companies').select('name, domain, website_url, industry, city, country, employee_estimate, employee_range').eq('id', t.companyId).single(),
    t.personId ? supabase.from('people').select('full_name, first_name, last_name, job_title, persona, persona_source, role_category').eq('id', t.personId).single() : { data: null },
    supabase.from('candidate_companies').select('hiring, enrichment_data, evidence').eq('existing_company_id', t.companyId).order('updated_at', { ascending: false }).limit(1),
    supabase.from('signals').select('reason, created_at, signal_type').eq('company_id', t.companyId).order('created_at', { ascending: false }).limit(3),
    supabase.from('activities').select('activity_type, direction, occurred_at, summary, extracted_intel, person_id, people(full_name, email)').eq('company_id', t.companyId).order('occurred_at', { ascending: false }).limit(20),
    supabase.from('project_members').select('display_name, email').eq('project_id', t.projectId),
  ])
  // History: only contact with the recipient counts. Activities of our own team (e.g. synced calendar meetings)
  // or of other people at the company must not read as "we already spoke".
  // Team members show up with other addresses too (henri.steckhan@… at another domain) → compare the part before the @
  const local = (e: unknown) => String(e || '').toLowerCase().split('@')[0]
  const teamLocals = new Set((members || []).map((m: any) => local(m.email)).filter(Boolean))
  const internal = (a: any) => teamLocals.has(local(a.people?.email))
  const external = (allActs || []).filter((a: any) => !internal(a))
  const acts = t.personId ? external.filter((a: any) => a.person_id === t.personId).slice(0, 6) : external.slice(0, 6)
  if (!company) return null
  const c = cand?.[0]
  const site = company.website_url || (company.domain ? `https://${company.domain}` : null) || c?.enrichment_data?.impressum?.website || null
  let website = ''
  if (site) {
    const page = await fetchHtml(site, 6000)
    if (page) website = textOf(page.html).slice(0, 3500)
  }
  const lines: string[] = [`Firma: ${company.name}`]
  const industry = company.industry || c?.hiring?.industry?.label
  if (industry) lines.push(`Branche: ${industry}`)
  if (c?.hiring?.officeShare != null) lines.push(`Anteil Büro-/Wissensjobs unter den Stellen: ${c.hiring.officeShare} %`)
  if (company.city || company.country) lines.push(`Ort: ${[company.city, company.country].filter(Boolean).join(', ')}`)
  const size = company.employee_estimate || company.employee_range || c?.enrichment_data?.impressum?.employees
  if (size) lines.push(`Größe: ${size} Mitarbeitende`)
  // A "job title" that is just the company name (LinkedIn headline "Firma | …") says nothing about the role
  const norm = (x: unknown) => String(x || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
  const roleTitle = person?.job_title && norm(person.job_title) !== norm(company.name) && !norm(company.name).startsWith(norm(person.job_title)) ? person.job_title as string : null
  if (person) lines.push(`Kontakt: ${person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ')}${roleTitle ? ` – ${roleTitle}` : ' (Rolle unbekannt)'}`)
  const last = String(person?.last_name || '').trim()
  if (last.length >= 3 && norm(company.name).includes(norm(last))) lines.push(`Der Nachname steckt im Firmennamen – wahrscheinlich Inhaber:in bzw. Gründer:in.`)
  const h = c?.hiring
  if (h) {
    lines.push(`Offene Stellen: ${h.open}${h.new14 ? ` (davon ${h.new14} neu in 14 Tagen)` : ''}`)
    if (h.repeated?.length) lines.push(`Mehrfach gesuchte Rollen: ${h.repeated.slice(0, 3).map((r: any) => `${r.count}× ${r.role}`).join(', ')}`)
    if (h.hrRoles?.length) lines.push(`Sucht selbst HR/Recruiting: ${h.hrRoles.slice(0, 2).join(', ')}`)
    if (h.locations?.length) lines.push(`Standorte der Stellen: ${h.locations.slice(0, 4).join(', ')}`)
  }
  const jobs = (c?.evidence || []).map((e: any) => e?.title).filter(Boolean).slice(0, 8)
  if (jobs.length) lines.push(`Beispiel-Stellen: ${jobs.join(' · ')}`)
  for (const s of signals || []) if (s.reason) lines.push(`Signal: ${s.reason}`)
  const history = (acts || []).map((a: any) => `- ${a.occurred_at?.slice(0, 10)} ${a.activity_type} ${a.direction || ''}: ${String(a.extracted_intel?.body || a.summary || '').slice(0, 300)}`)
  if (history.length) lines.push(`Bisheriger Kontakt:\n${history.join('\n')}`)
  if (website) lines.push(`Auszug Website:\n${website}`)
  const evidence = (c?.evidence || []) as any[]
  return {
    text: lines.join('\n'), companyName: company.name as string, personName: (person?.full_name as string) || null, firstName: (person?.first_name as string) || null,
    jobTitle: roleTitle, size: size ?? null, person,
    signalFacts: {
      hiring: h ?? null, jobs: evidence.filter(e => e?.title && (e.published_at || e.first_seen_at)),
      signalReasons: (signals || []).map((s: any) => ({ reason: s.reason, created_at: s.created_at, type: s.signal_type })),
      hasHistory: (acts || []).some((a: any) => a.direction === 'inbound' || a.direction === 'outbound'),
    },
    industryKey: (c?.hiring?.industry?.key as string | undefined) ?? classify(`${company.name} ${company.industry || ''}`, company.domain || null, jobs).industry?.key ?? null,
    openJobs: (h?.open as number | undefined) ?? null,
    hiring: h ?? null, hiringKey: (h?.key as string | undefined) ?? null, isTeam: (e: unknown) => teamLocals.has(local(e)),
    factWords: [...(h?.repeated || []).map((r: any) => r.role), ...(h?.hrRoles || []), ...jobs] as string[],
  }
}

export type Segment = 'company' | 'agency'

// Recruitment agencies get their own message: name, industry and the start of the website decide
export function segmentOf(factsText: string): Segment {
  const head = factsText.split('\nAuszug Website:\n')
  const site = (head[1] || '').slice(0, 1500)
  return AGENCY_RE.test(head[0].split('\n').slice(0, 2).join(' ')) || (site.match(new RegExp(AGENCY_RE.source, 'gi')) || []).length >= 2 ? 'agency' : 'company'
}

function systemPrompt(cfg: AgentConfig['first_message'], sender: string, segment: Segment = 'company') {
  if (segment === 'agency') return agencyPrompt(cfg, sender)
  const address = cfg.address === 'du' ? 'per Du'
    : cfg.address === 'Sie' ? 'per Sie'
    : 'per Du bei Start-ups, Tech, Agenturen, Beratungen und Firmen unter ca. 50 Mitarbeitenden; per Sie bei klassischem Mittelstand (Industrie, Handwerk, Logistik, Gesundheit, Handel) und größeren Firmen'
  return `Du schreibst für ${sender} von HireFlow Erstansprachen auf LinkedIn an HR-Verantwortliche und Geschäftsführungen im DACH-Raum.

Produkt: ${cfg.pitch}

Aufbau der Nachricht (message, 350–550 Zeichen ohne Grußzeile, 3–4 kurze Absätze):
1. Anrede: bei Du „Hallo Vorname,“; bei Sie „Hallo Herr Nachname,“ / „Hallo Frau Nachname,“ (Geschlecht aus dem Vornamen; nur wenn das wirklich unklar ist, „Hallo Vorname,“). Nie Vor- und Nachname zusammen, nie „Guten Tag Vorname Nachname“. Ohne bekannten Namen: „Hallo zusammen,“.
2. Der konkrete Beleg aus den Vorgaben (z. B. „eure Stelle als Mechatroniker:in ist seit 9 Wochen online“) und der vermutete Pain dazu – als Frage oder vorsichtige Vermutung („oft liegt das daran, dass …“), nie als Behauptung, dass sie ein Problem haben.
3. Was HireFlow tut, mit genau einem greifbaren Ergebnis (z. B. aus 20 Bewerbungen die drei relevantesten). Höchstens zwei Sätze. Optional ein Satz zur Gründergeschichte, wenn er natürlich passt.
4. ${cfg.link ? `Der Link ${cfg.link}, ` : ''}${cfg.offer ? `das Angebot „${cfg.offer}“ ` : ''}und eine offene Frage, wie sie das heute lösen.
5. Grußzeile: „Beste Grüße\n${sender}“.

Regeln:
- Deutsch, ${address}. Natürlich und auf Augenhöhe – wie eine Nachricht von Mensch zu Mensch, nicht wie Werbung.
- Keine Floskeln, keine Superlative, keine Emojis, keine Aufzählungen, kein Fachjargon („Evidenz“, „belastbar“, „Pipeline“). Kein „kein Sales Pitch“, keine Terminforderung.
- Erfinde nichts, was nicht in den Fakten steht – auch kein Problem, das die Firma angeblich hat. Gibt es keine offenen Stellen, steig mit etwas Konkretem aus Profil/Info der Person ein; kein konstruierter Einstieg wie „bei X stellt sich die Frage …“. Gibt es bereits Kontakt im Verlauf, knüpfe daran an statt dich neu vorzustellen.
- connect_note: Vernetzungsnotiz, höchstens 200 Zeichen (LinkedIn-Limit), ohne Produkt und ohne Link – nur ein persönlicher, konkreter Grund für die Vernetzung.
- hook: der gewählte Anlass in einem Satz.
- research: 3–5 kurze Fakten über die Firma, die für das Gespräch nützlich sind (nur aus den Fakten).
${RATING}${cfg.style ? `\n\nTonalität des Teams:\n${cfg.style}` : ''}${cfg.examples ? `\n\nNachrichten von uns, die gut funktioniert haben – Aufbau, Länge und Ton übernehmen, nicht den Wortlaut:\n${cfg.examples}` : ''}`
}

const RATING = `- relevance: 1–5, wie relevant HireFlow für diese Firma gerade ist. 5 = klarer Beleg für Recruiting-Druck bei Rollen, bei denen die Vorauswahl Zeit frisst; 3 = Bedarf plausibel, Beleg schwach; 1 = kein Bedarf erkennbar.
- urgency: hoch / mittel / niedrig – wie dringend gerade jetzt (frische oder lange offene Stellen, erneute Ausschreibung, „ab sofort“ = eher hoch).
- pain: das vermutete Problem in einem Satz. evidence: der Beleg dafür in einem Satz, nur aus den Fakten.`

// Messages are signed by the lead owner (else the first team member)
async function senderName(supabase: any, t: Target): Promise<string> {
  const { data: lead } = t.leadId ? await supabase.from('leads').select('owner_id').eq('id', t.leadId).single() : { data: null }
  const { data: members } = await supabase.from('project_members').select('user_id, display_name, email').eq('project_id', t.projectId).order('created_at')
  const m = (members || []).find((x: any) => x.user_id === lead?.owner_id) || members?.[0]
  return (m?.display_name || m?.email?.split('@')[0] || 'Henri').split(' ')[0]
}

function agencyPrompt(cfg: AgentConfig['first_message'], sender: string) {
  const a = cfg.agency
  return `Du schreibst für ${sender} von HireFlow Erstansprachen auf LinkedIn an Inhaber:innen, Geschäftsführungen und Recruiter:innen von Personalvermittlungen und Personalberatungen im DACH-Raum.

Produkt für Personalvermittlungen: ${a.pitch}

Aufbau der Nachricht (message, 350–550 Zeichen ohne Grußzeile, 3–4 kurze Absätze):
1. Anrede per Du mit Vornamen („Hi …,“ oder „Hallo …,“). Ohne bekannten Namen: „Hallo zusammen,“.
2. Ein konkreter Bezug zur Agentur aus den Fakten (Spezialisierung, Branchen, Standorte, was sie vermitteln) und in einem Satz, wo in der Vermittlung Zeit verloren geht (Interviews, Notizen, Kundenvorstellung, Tempo bis zur Shortlist).
3. Was HireFlow für Agenturen tut, mit genau einem greifbaren Ergebnis. Höchstens zwei Sätze.
4. ${a.link ? `Optional der Link ${a.link}, dann ` : ''}eine offene Frage, wie sie das heute machen oder wo es am meisten Zeit kostet.
5. Grußzeile: „Beste Grüße\n${sender}“.

Regeln:
- Deutsch, per Du, auf Augenhöhe – von Recruiting-Leuten für Recruiting-Leute, nicht wie Werbung.
- Keine Floskeln, keine Superlative, keine Emojis, keine Aufzählungen, kein Fachjargon. Nie „kein Sales Pitch“ schreiben, keine Terminforderung („15 Minuten“, „wann passt es dir“).
- Erfinde nichts, was nicht in den Fakten steht. Gibt es bereits Kontakt im Verlauf, knüpfe daran an.
- connect_note: Vernetzungsnotiz, höchstens 200 Zeichen, ohne Produkt und ohne Link – ein persönlicher Grund (z. B. gleiche Branche Recruiting).
- hook: der gewählte Bezug in einem Satz.
- research: 3–5 kurze Fakten über die Agentur (nur aus den Fakten).
${RATING}${a.examples ? `\n\nNachrichten von uns an Personalvermittlungen – Aufbau, Länge und Ton übernehmen, nicht den Wortlaut:\n${a.examples}` : ''}`
}

// notes/profile: what the team knows about the person (composer, extension); address overrides the auto rule
// pain: evidence picked by hand; anyway: write even without any evidence
export type DraftOpts = { runId?: string | null; cfg?: AgentConfig['first_message']; notes?: string | null; profile?: string | null; address?: 'auto' | 'du' | 'Sie'; segment?: SegmentKey | 'auto'; industry?: string | 'auto'; connected?: boolean; pain?: PainKey | 'auto' | null; anyway?: boolean
  // "Nachricht schreiben": pains picked by hand (first = main), goal, channel, the role it is about, the team's own draft
  pains?: PainKey[]; goal?: Goal; channel?: 'linkedin' | 'email'; role?: string | null; draftText?: string | null }

export async function draftFirstMessage(supabase: any, t: Target, opts: DraftOpts = {}): Promise<{ draft: Draft; itemId: string; costUsd: number }> {
  const key = apiKey()
  if (!key) throw new Error('KI ist noch nicht eingerichtet (API-Key fehlt).')
  const cfg = opts.cfg ?? (await loadSettings(supabase, t.projectId)).first_message.config
  const [facts, sender] = await Promise.all([gather(supabase, t), senderName(supabase, t)])
  if (!facts) throw new Error('Firma nicht gefunden')
  // Segment: agency or company size (manual choice wins); industry from name + job titles
  const sizeSeg: SegmentKey = opts.segment && opts.segment !== 'auto' ? opts.segment : segmentFor(segmentOf(facts.text) === 'agency', facts.size, facts.openJobs)
  const segment: Segment = sizeSeg === 'agency' ? 'agency' : 'company'
  const industryKey = opts.industry && opts.industry !== 'auto' ? opts.industry : facts.industryKey
  const industry = cfg.industries.find(i => i.key === industryKey && i.active) ?? null

  // Personalisation: persona (manual wins) → playbook → least used variant → strongest signal
  const p = facts.person as any
  const persona: Persona = p?.persona_source === 'manual' && p?.persona ? p.persona : personaOf(facts.jobTitle, facts.size, segment === 'agency')
  const playbook = playbookFor(cfg.playbooks, persona)
  const { data: usedRows } = await supabase.from('leads').select('variant').eq('project_id', t.projectId).eq('playbook_key', playbook.key).not('variant', 'is', null)
  const used: Record<string, number> = {}
  for (const r of usedRows || []) used[r.variant] = (used[r.variant] ?? 0) + 1
  const variant = pickVariant(playbook, used)
  const notes = (opts.notes || '').trim().slice(0, 1500)
  const profile = (opts.profile || '').trim().slice(0, 2500)
  const signal = pickSignal({ ...facts.signalFacts, personal: notes || null })

  // Relevance check: evidence from the job postings → pain. No evidence and nothing known = no reason to write.
  const rel = await collectEvidence(supabase, { projectId: t.projectId, companyId: t.companyId, companyName: facts.companyName, hiringKey: facts.hiringKey, hiring: facts.hiring, isTeam: facts.isTeam })
  const chosen = (opts.pains?.length ? opts.pains : opts.pain && opts.pain !== 'auto' ? [opts.pain] : []).filter(k => k in PAINS).slice(0, 3) as PainKey[]
  const forced = chosen[0] ?? null
  const ev = forced ? rel.evidence.find(e => e.key === forced) ?? { key: forced, fact: '', strength: 0 } : rel.evidence[0] ?? null
  const draftText = (opts.draftText || '').trim().slice(0, 3000)
  const role = (opts.role || '').trim().slice(0, 160)
  const goal: Goal = opts.goal && opts.goal in GOALS ? opts.goal : 'first'
  const email = opts.channel === 'email'
  if (!ev && !notes && !draftText && !facts.signalFacts.hasHistory && segment !== 'agency' && !opts.anyway) {
    throw new NoReasonError(`Kein Anlass gefunden: ${rel.open ? `${rel.open} offene Stelle${rel.open > 1 ? 'n' : ''}, aber kein Beleg für Recruiting-Druck` : 'keine offenen Stellen bekannt'}. Trag ein, was du über die Person weißt, wähl einen Pain aus oder schreib trotzdem.`)
  }
  const pain = ev ? PAINS[ev.key] : null
  const signalKey: SignalKey = ev ? ev.key : signal.key
  // Default is du; the composer/extension choice wins, then the playbook, then the global setting
  const address: 'du' | 'Sie' = opts.address && opts.address !== 'auto' ? opts.address
    : playbook.address !== 'auto' ? playbook.address : cfg.address !== 'auto' ? cfg.address : 'du'
  const extraFacts = [
    profile ? `LinkedIn-Profil der Person (Info/Headline, nur Fakten daraus nutzen):\n${profile}` : '',
    notes ? `Infos vom Team über Person/Firma (zuverlässig, bevorzugt nutzen):\n${notes}` : '',
  ].filter(Boolean).join('\n\n')
  const team = [
    goal !== 'first' ? `Ziel: ${GOALS[goal].brief}` : '',
    role ? `Es geht um die Stelle/Rolle: ${role}` : '',
    draftText ? `Entwurf vom Team – Inhalt, Kernaussagen und Ton übernehmen und nach den Regeln ausformulieren; wenn er schon gut ist, nur leicht glätten. Hat Vorrang vor Basistext und Aufbau:\n---\n${draftText}\n---` : '',
    email ? 'Kanal: E-Mail statt LinkedIn. connect_note = Betreffzeile (höchstens 70 Zeichen, konkret, kein Clickbait). message = E-Mail-Text mit Anrede und Grußzeile, gern etwas ausführlicher (bis ca. 900 Zeichen).' : '',
  ].filter(Boolean).join('\n\n')
  const adText = rel.jobAd ? `\n\nAuszug aus der Stellenanzeige „${rel.jobAd.title}“ (auf Dringlichkeit achten: „ab sofort“, Schicht, Quereinsteiger, Anforderungen):\n${rel.jobAd.text}` : ''
  const baseText = cfg.baseTexts?.[sizeSeg]?.trim()
  const base = cfg.useBaseText && baseText
    ? `\n\nBasistext für „${SEGMENTS[sizeSeg]}“ – hat Vorrang vor dem allgemeinen Aufbau: Aufbau und alle festen Sätze wörtlich übernehmen, nur die {{…}}-Stellen passend zu dieser Person ausformulieren ({{anrede}} nach den Anrede-Regeln, {{absender}} = ${sender}; {{schmerz}} = der Pain aus den Vorgaben als Frage oder Vermutung, ein Satz – nur ohne Pain das Problem der Branche). Bei Sie die festen Sätze grammatisch auf Sie umstellen. Länge darf vom Basistext abhängen.\n---\n${baseText}\n---`
    : ''
  const brief = [
    `Zielperson: ${PERSONAS[persona]}`,
    `Segment: ${SEGMENTS[sizeSeg]}${sizeSeg === 'large' ? ' – sachlich, strukturiert, Prozess und Vergleichbarkeit über Teams' : sizeSeg === 'small' ? ' – persönlich, von Gründer zu Inhaber, sehr kurz' : sizeSeg === 'agency' ? ' – von Recruiting-Leuten für Recruiting-Leute, Tempo zur Shortlist' : ''}`,
    ...(industry ? [`Branche: ${industry.label} – typisches Problem dort: ${industry.pain}`] : []),
    `Playbook „${playbook.name}“, Variante ${variant.key}${variant.angle ? `: ${variant.angle}` : ''}`,
    ...(pain && ev
      ? [`Pain (aus den Belegen abgeleitet – als Frage oder Vermutung formulieren, nicht behaupten): ${pain.pain}`,
         ...(ev.fact ? [`Beleg dafür (als Anlass nennen): ${ev.fact}`] : [`Beleg: vom Team vermutet, ohne Daten – als Frage oder Erfahrungswert formulieren („oft ist es so, dass …“), nie als Tatsache über diese Firma${rel.evidence[0] ? `; falls passend diesen echten Fakt als Anlass nutzen: ${rel.evidence[0].fact}` : ''}`]),
         ...(chosen.length > 1 ? [`Weitere vermutete Pains (höchstens einen davon in einem Halbsatz anreißen): ${chosen.slice(1).map(k => PAINS[k].label).join(', ')}`] : []),
         `Das eine Ergebnis, das wir nennen: ${pain.angle}`,
         `Offene Frage am Ende in diese Richtung: ${pain.question}`]
      : [`Typischer Schmerz dieser Zielperson: ${playbook.pain}`,
         `Das eine Ergebnis, das wir nennen: ${playbook.outcome}`,
         `Offene Frage am Ende in diese Richtung: ${playbook.question}`]),
    ...(signal.key === 'personal' || signal.key === 'history' || !ev ? [`Aufhänger (warum gerade jetzt): ${signal.text}`] : []),
    ...(rel.evidence.filter(e => e !== ev).length ? [`Weitere Belege (nur zur Einordnung): ${rel.evidence.filter(e => e !== ev).slice(0, 3).map(e => e.fact).join(' ')}`] : []),
  ].join('\n')

  const client = anthropicClient(key)
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: systemPrompt({ ...cfg, address }, sender, segment),
    messages: [{ role: 'user', content: `Fakten:\n${facts.text}${extraFacts ? `\n\n${extraFacts}` : ''}${adText}\n\nVorgaben für diese Nachricht (Beleg als Anlass, Pain als Frage/Vermutung, Ergebnis und Frage hieraus übernehmen):\n${brief}${draftText ? '' : base}${team ? `\n\nVorgaben vom Team:\n${team}` : ''}${opts.connected && !email ? '\n\nIhr seid auf LinkedIn schon vernetzt: connect_note als leeren String zurückgeben, die Nachricht nicht mit einer Vorstellung wie unter Fremden beginnen.' : ''}\n\nSchreibe ${email ? 'Betreff und E-Mail' : opts.connected ? 'die Nachricht' : 'Vernetzungsnotiz und erste Nachricht'}${facts.firstName ? ` an ${facts.personName}` : ' an die zuständige Person (ohne Namen, neutrale Anrede)'}.` }],
  } as any)
  if (res.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.')
  const block = res.content.find(b => b.type === 'text')
  const draft = JSON.parse(block && block.type === 'text' ? block.text : '{}') as Draft
  if (opts.connected && !email) draft.connect_note = ''
  if (!draft.message) throw new Error('KI-Antwort unvollständig')
  const costUsd = costOf(MODEL, res.usage)
  const score = personalizationScore(draft.message, { signal: signalKey, firstName: facts.firstName, facts: [...facts.factWords, ...(ev?.job ? [ev.job.title] : [])] })
  const relevance = Math.max(1, Math.min(5, Math.round(Number(draft.relevance) || 0))) || null

  const row = {
    project_id: t.projectId, agent_key: 'first_message', kind: 'message_draft', channel: email ? 'email' : 'linkedin', status: 'pending',
    title: `Erstnachricht an ${facts.personName || facts.companyName}${facts.personName ? ` (${facts.companyName})` : ''}`,
    body: draft.message, run_id: opts.runId ?? null,
    data: { connect_note: draft.connect_note?.slice(0, 300), hook: draft.hook, research: draft.research, segment, model: MODEL, cost_usd: costUsd, persona, persona_label: PERSONAS[persona], playbook: playbook.key, playbook_name: playbook.name, variant: variant.key, signal: signalKey, signal_label: SIGNALS[signalKey], score, relevance, urgency: draft.urgency ?? null, pain_key: ev?.key ?? null, pain_label: pain?.label ?? null, pain: draft.pain || pain?.pain || null, pain_evidence: draft.evidence || ev?.fact || null, evidence: rel.evidence.slice(0, 5).map(e => ({ key: e.key, fact: e.fact })), job_ad: rel.jobAd?.title ?? null, size_segment: sizeSeg, overrides: { segment: opts.segment ?? 'auto', industry: opts.industry ?? 'auto', pain: forced ?? 'auto', pains: chosen, anyway: !!opts.anyway, goal, channel: email ? 'email' : 'linkedin', role: role || null }, ...(draftText ? { draft_text: draftText } : {}), goal_label: GOALS[goal].label, size_label: SEGMENTS[sizeSeg], industry: industry?.key ?? null, industry_label: industry?.label ?? null, ...(notes ? { notes } : {}), ...(profile ? { profile } : {}), base_text: !!base, address },
    company_id: t.companyId, person_id: t.personId ?? null, lead_id: t.leadId ?? null,
  }
  // One open draft per contact/lead: rewrite replaces it
  let q = supabase.from('automation_items').select('id').eq('agent_key', 'first_message').eq('status', 'pending')
  q = t.personId ? q.eq('person_id', t.personId) : t.leadId ? q.eq('lead_id', t.leadId) : q.eq('company_id', t.companyId).is('person_id', null)
  const { data: existing } = await q.limit(1)
  let itemId: string
  if (existing?.length) {
    itemId = existing[0].id
    await supabase.from('automation_items').update({ ...row, created_at: new Date().toISOString() }).eq('id', itemId)
  } else {
    const { data, error } = await supabase.from('automation_items').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    itemId = data.id
  }
  // Remember what was used: lead (for reply rates) and contact (persona)
  if (t.leadId) await supabase.from('leads').update({ persona, playbook_key: playbook.key, variant: variant.key, signal_used: signalKey, personalization_score: score }).eq('id', t.leadId)
  if (t.personId && p?.persona_source !== 'manual') {
    await supabase.from('people').update({ persona, persona_source: 'rule', ...(p?.role_category ? {} : { role_category: roleCategoryOf(persona) }) }).eq('id', t.personId)
  }
  return { draft, itemId, costUsd }
}

// Single draft triggered by an event (LinkedIn import, Heiße Firma taken) – logged as its own run
export async function draftOnEvent(supabase: any, t: Target, extra: Pick<DraftOpts, 'notes' | 'profile' | 'connected' | 'pain' | 'anyway' | 'pains' | 'goal' | 'channel' | 'role' | 'draftText'> = {}) {
  const settings = await loadSettings(supabase, t.projectId)
  if (!settings.first_message.enabled || !settings.first_message.config.autoDraft) return null
  const runId = await startRun(supabase, t.projectId, 'first_message', 'event')
  try {
    const r = await draftFirstMessage(supabase, t, { runId, cfg: settings.first_message.config, ...extra })
    await finishRun(supabase, runId, { items: 1, summary: '1 Entwurf erstellt', costUsd: r.costUsd })
    return r
  } catch (e: any) {
    if (e instanceof NoReasonError) await finishRun(supabase, runId, { items: 0, summary: e.message })
    else await finishRun(supabase, runId, { error: e?.message || 'Fehler' })
    throw e
  }
}

// Batch: leads in "Ansprache" without any draft yet (newest first), within a time budget
export async function draftMissing(supabase: any, projectId: string, trigger: 'manual' | 'cron', opts: { limit?: number; budgetMs?: number } = {}) {
  const settings = await loadSettings(supabase, projectId)
  const cfg = settings.first_message
  if (trigger === 'cron' && (!cfg.enabled || !cfg.config.autoDraft)) return { drafted: 0 }
  const runId = await startRun(supabase, projectId, 'first_message', trigger)
  const started = Date.now(), budget = opts.budgetMs ?? 40_000
  let drafted = 0, cost = 0, skipped = 0
  const errors: string[] = []
  try {
    const [{ data: leads }, { data: items }] = await Promise.all([
      supabase.from('leads').select('id, company_id, person_id').eq('project_id', projectId).in('stage', ['prospect', 'outreach']).not('company_id', 'is', null).order('created_at', { ascending: false }).limit(60),
      supabase.from('automation_items').select('lead_id').eq('project_id', projectId).eq('agent_key', 'first_message').not('lead_id', 'is', null),
    ])
    const has = new Set((items || []).map((i: any) => i.lead_id))
    const todo = (leads || []).filter((l: any) => !has.has(l.id)).slice(0, opts.limit ?? 5)
    for (const l of todo) {
      if (Date.now() - started > budget) break
      try {
        const r = await draftFirstMessage(supabase, { projectId, companyId: l.company_id, personId: l.person_id, leadId: l.id }, { runId, cfg: settings.first_message.config })
        drafted++; cost += r.costUsd
      } catch (e: any) {
        // No evidence → keep a dismissed item so the lead is not checked again on every run
        if (e instanceof NoReasonError) {
          skipped++
          await supabase.from('automation_items').insert({
            project_id: projectId, agent_key: 'first_message', kind: 'message_draft', channel: 'linkedin', status: 'dismissed', run_id: runId,
            title: 'Kein Anlass für eine Erstnachricht', body: e.message, data: { no_reason: true }, company_id: l.company_id, person_id: l.person_id, lead_id: l.id,
          })
        } else errors.push(e?.message || 'Fehler')
      }
    }
    const left = todo.length - drafted - errors.length - skipped
    await finishRun(supabase, runId, {
      status: errors.length && !drafted ? 'error' : 'ok', items: drafted, costUsd: cost, error: errors[0],
      summary: todo.length ? `${drafted} Entw${drafted === 1 ? 'urf' : 'ürfe'} erstellt${skipped ? `, ${skipped} ohne Anlass` : ''}${left > 0 ? `, ${left} beim nächsten Lauf` : ''}${errors.length ? `, ${errors.length} Fehler` : ''}` : 'Alle Leads in Ansprache haben einen Entwurf',
    })
    return { drafted }
  } catch (e: any) {
    await finishRun(supabase, runId, { error: e?.message || 'Fehler', items: drafted, costUsd: cost })
    throw e
  }
}
