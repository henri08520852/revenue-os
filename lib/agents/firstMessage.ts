// First-message agent: researches company + contact and drafts a LinkedIn connection note and first message.
// Only drafts – the result waits in the approval queue (automation_items) and is never sent automatically.
import Anthropic from '@anthropic-ai/sdk'
import { fetchHtml, textOf } from '@/lib/discovery/enrich'
import { loadSettings, startRun, finishRun, AgentConfig, AGENCY_RE } from './registry'

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
    message: { type: 'string' },
  },
  required: ['research', 'hook', 'connect_note', 'message'],
  additionalProperties: false,
}

export type Draft = { research: string[]; hook: string; connect_note: string; message: string }
export type Target = { projectId: string; companyId: string; personId?: string | null; leadId?: string | null }

export const apiKey = () => process.env.ANTHROPIC_BRIEFING_API_KEY || process.env.ANTHROPIC_API_KEY

export async function gather(supabase: any, t: Target) {
  const [{ data: company }, { data: person }, { data: cand }, { data: signals }, { data: acts }] = await Promise.all([
    supabase.from('companies').select('name, domain, website_url, industry, city, country, employee_estimate, employee_range').eq('id', t.companyId).single(),
    t.personId ? supabase.from('people').select('full_name, first_name, last_name, job_title').eq('id', t.personId).single() : { data: null },
    supabase.from('candidate_companies').select('hiring, enrichment_data, evidence').eq('existing_company_id', t.companyId).order('updated_at', { ascending: false }).limit(1),
    supabase.from('signals').select('reason, created_at').eq('company_id', t.companyId).order('created_at', { ascending: false }).limit(3),
    supabase.from('activities').select('activity_type, direction, occurred_at, summary, extracted_intel').eq('company_id', t.companyId).order('occurred_at', { ascending: false }).limit(6),
  ])
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
  if (person) lines.push(`Kontakt: ${person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ')}${person.job_title ? ` – ${person.job_title}` : ''}`)
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
  return { text: lines.join('\n'), companyName: company.name as string, personName: (person?.full_name as string) || null, firstName: (person?.first_name as string) || null }
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
1. Anrede mit Vornamen („Hallo …,“ / „Guten Tag Frau/Herr …“ nur wenn Sie und das Geschlecht eindeutig im Titel steht, sonst „Guten Tag Vorname Nachname,“). Ohne bekannten Namen: „Hallo zusammen,“.
2. Der konkrete Anlass, wie wir auf sie gestoßen sind – möglichst die echten offenen Stellen aus den Fakten (z. B. „ihr sucht gerade 4× Projektingenieur:in“), dazu in einem Satz, warum das Zeit bindet.
3. Was HireFlow tut, mit genau einem greifbaren Ergebnis (z. B. aus 20 Bewerbungen die drei relevantesten). Höchstens zwei Sätze. Optional ein Satz zur Gründergeschichte, wenn er natürlich passt.
4. ${cfg.link ? `Der Link ${cfg.link}, ` : ''}${cfg.offer ? `das Angebot „${cfg.offer}“ ` : ''}und eine offene Frage, wie sie das heute lösen.
5. Grußzeile: „Beste Grüße\n${sender}“.

Regeln:
- Deutsch, ${address}. Natürlich und auf Augenhöhe – wie eine Nachricht von Mensch zu Mensch, nicht wie Werbung.
- Keine Floskeln, keine Superlative, keine Emojis, keine Aufzählungen, kein Fachjargon („Evidenz“, „belastbar“, „Pipeline“). Kein „kein Sales Pitch“, keine Terminforderung.
- Erfinde nichts, was nicht in den Fakten steht. Gibt es bereits Kontakt im Verlauf, knüpfe daran an statt dich neu vorzustellen.
- connect_note: Vernetzungsnotiz, höchstens 200 Zeichen (LinkedIn-Limit), ohne Produkt und ohne Link – nur ein persönlicher, konkreter Grund für die Vernetzung.
- hook: der gewählte Anlass in einem Satz.
- research: 3–5 kurze Fakten über die Firma, die für das Gespräch nützlich sind (nur aus den Fakten).${cfg.style ? `\n\nTonalität des Teams:\n${cfg.style}` : ''}${cfg.examples ? `\n\nNachrichten von uns, die gut funktioniert haben – Aufbau, Länge und Ton übernehmen, nicht den Wortlaut:\n${cfg.examples}` : ''}`
}

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
- research: 3–5 kurze Fakten über die Agentur (nur aus den Fakten).${a.examples ? `\n\nNachrichten von uns an Personalvermittlungen – Aufbau, Länge und Ton übernehmen, nicht den Wortlaut:\n${a.examples}` : ''}`
}

export async function draftFirstMessage(supabase: any, t: Target, opts: { runId?: string | null; cfg?: AgentConfig['first_message'] } = {}): Promise<{ draft: Draft; itemId: string; costUsd: number }> {
  const key = apiKey()
  if (!key) throw new Error('KI ist noch nicht eingerichtet (API-Key fehlt).')
  const cfg = opts.cfg ?? (await loadSettings(supabase, t.projectId)).first_message.config
  const [facts, sender] = await Promise.all([gather(supabase, t), senderName(supabase, t)])
  if (!facts) throw new Error('Firma nicht gefunden')
  const segment = segmentOf(facts.text)

  const client = new Anthropic({ apiKey: key })
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: systemPrompt(cfg, sender, segment),
    messages: [{ role: 'user', content: `Fakten:\n${facts.text}\n\nSchreibe Vernetzungsnotiz und erste Nachricht${facts.firstName ? ` an ${facts.personName}` : ' an die zuständige Person (ohne Namen, neutrale Anrede)'}.` }],
  } as any)
  if (res.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.')
  const block = res.content.find(b => b.type === 'text')
  const draft = JSON.parse(block && block.type === 'text' ? block.text : '{}') as Draft
  if (!draft.message) throw new Error('KI-Antwort unvollständig')
  const costUsd = costOf(MODEL, res.usage)

  const row = {
    project_id: t.projectId, agent_key: 'first_message', kind: 'message_draft', channel: 'linkedin', status: 'pending',
    title: `Erstnachricht an ${facts.personName || facts.companyName}${facts.personName ? ` (${facts.companyName})` : ''}`,
    body: draft.message, run_id: opts.runId ?? null,
    data: { connect_note: draft.connect_note?.slice(0, 300), hook: draft.hook, research: draft.research, segment, model: MODEL, cost_usd: costUsd },
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
  return { draft, itemId, costUsd }
}

// Single draft triggered by an event (LinkedIn import, Heiße Firma taken) – logged as its own run
export async function draftOnEvent(supabase: any, t: Target) {
  const settings = await loadSettings(supabase, t.projectId)
  if (!settings.first_message.enabled || !settings.first_message.config.autoDraft) return null
  const runId = await startRun(supabase, t.projectId, 'first_message', 'event')
  try {
    const r = await draftFirstMessage(supabase, t, { runId, cfg: settings.first_message.config })
    await finishRun(supabase, runId, { items: 1, summary: '1 Entwurf erstellt', costUsd: r.costUsd })
    return r
  } catch (e: any) {
    await finishRun(supabase, runId, { error: e?.message || 'Fehler' })
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
  let drafted = 0, cost = 0
  const errors: string[] = []
  try {
    const [{ data: leads }, { data: items }] = await Promise.all([
      supabase.from('leads').select('id, company_id, person_id').eq('project_id', projectId).eq('stage', 'outreach').not('company_id', 'is', null).order('created_at', { ascending: false }).limit(60),
      supabase.from('automation_items').select('lead_id').eq('project_id', projectId).eq('agent_key', 'first_message').not('lead_id', 'is', null),
    ])
    const has = new Set((items || []).map((i: any) => i.lead_id))
    const todo = (leads || []).filter((l: any) => !has.has(l.id)).slice(0, opts.limit ?? 5)
    for (const l of todo) {
      if (Date.now() - started > budget) break
      try {
        const r = await draftFirstMessage(supabase, { projectId, companyId: l.company_id, personId: l.person_id, leadId: l.id }, { runId, cfg: settings.first_message.config })
        drafted++; cost += r.costUsd
      } catch (e: any) { errors.push(e?.message || 'Fehler') }
    }
    const left = todo.length - drafted - errors.length
    await finishRun(supabase, runId, {
      status: errors.length && !drafted ? 'error' : 'ok', items: drafted, costUsd: cost, error: errors[0],
      summary: todo.length ? `${drafted} Entw${drafted === 1 ? 'urf' : 'ürfe'} erstellt${left > 0 ? `, ${left} beim nächsten Lauf` : ''}${errors.length ? `, ${errors.length} Fehler` : ''}` : 'Alle Leads in Ansprache haben einen Entwurf',
    })
    return { drafted }
  } catch (e: any) {
    await finishRun(supabase, runId, { error: e?.message || 'Fehler', items: drafted, costUsd: cost })
    throw e
  }
}
