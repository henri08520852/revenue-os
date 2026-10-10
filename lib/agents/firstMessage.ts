// First-message agent: researches company + contact and drafts a LinkedIn connection note and first message.
// Only drafts – the result waits in the approval queue (automation_items) and is never sent automatically.
import Anthropic from '@anthropic-ai/sdk'
import { fetchHtml, textOf } from '@/lib/discovery/enrich'
import { loadSettings, startRun, finishRun, AgentConfig } from './registry'

const MODEL = process.env.AI_MODEL || 'claude-haiku-5-5'
// USD per million tokens (input, output) for the cost counter
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20],
}
const costOf = (model: string, u: { input_tokens: number; output_tokens: number }) => {
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
type Target = { projectId: string; companyId: string; personId?: string | null; leadId?: string | null }

const apiKey = () => process.env.ANTHROPIC_BRIEFING_API_KEY || process.env.ANTHROPIC_API_KEY

async function gather(supabase: any, t: Target) {
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

function systemPrompt(cfg: AgentConfig['first_message']) {
  return `Du schreibst für das Vertriebsteam von HireFlow Erstansprachen auf LinkedIn an Entscheider in Unternehmen im DACH-Raum.

Produkt: ${cfg.pitch}

Regeln:
- Deutsch, ${cfg.address === 'du' ? 'per Du' : 'per Sie'}, natürlich und konkret – wie ein Mensch, nicht wie Werbung. Keine Floskeln („Ich hoffe, es geht Ihnen gut“), keine Superlative, keine Emojis, keine Links.
- Bezieh dich auf genau einen konkreten Anlass aus den Fakten (z. B. viele offene Stellen, eine Rolle wird mehrfach gesucht, Recruiting wird aufgebaut). Erfinde nichts, was nicht in den Fakten steht.
- connect_note: Vernetzungsnotiz, höchstens 280 Zeichen, ohne Verkauf.
- message: erste Nachricht nach der Vernetzung, 350–650 Zeichen: Anlass → vermutete Herausforderung im Recruiting → ein Satz, wie HireFlow hilft → eine leichte Frage zum Abschluss (kein Terminzwang).
- hook: der gewählte Anlass in einem Satz.
- research: 3–5 kurze Fakten über die Firma, die für das Gespräch nützlich sind (nur aus den Fakten).
- Gibt es bereits Kontakt im Verlauf, knüpfe daran an statt dich neu vorzustellen.${cfg.style ? `\n\nTonalität des Teams:\n${cfg.style}` : ''}${cfg.examples ? `\n\nBeispiele für Nachrichten, die gut funktioniert haben (Stil übernehmen, nicht kopieren):\n${cfg.examples}` : ''}`
}

export async function draftFirstMessage(supabase: any, t: Target, opts: { runId?: string | null; cfg?: AgentConfig['first_message'] } = {}): Promise<{ draft: Draft; itemId: string; costUsd: number }> {
  const key = apiKey()
  if (!key) throw new Error('KI ist noch nicht eingerichtet (API-Key fehlt).')
  const cfg = opts.cfg ?? (await loadSettings(supabase, t.projectId)).first_message.config
  const facts = await gather(supabase, t)
  if (!facts) throw new Error('Firma nicht gefunden')

  const client = new Anthropic({ apiKey: key })
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: systemPrompt(cfg),
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
    data: { connect_note: draft.connect_note, hook: draft.hook, research: draft.research, model: MODEL, cost_usd: costUsd },
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
