// Letter agent: fills the team's letter template for one company (address from the Impressum,
// addressed to the management) and writes the company-specific paragraph. Result is a printable
// DIN 5008 letter in the approval queue – printing and posting stays manual.
import Anthropic from '@anthropic-ai/sdk'
import { readCompany } from '@/lib/discovery/enrich'
import { gather, apiKey, costOf, MODEL, Target } from './firstMessage'
import { loadSettings, startRun, finishRun, LetterConfig } from './registry'

const SCHEMA = {
  type: 'object',
  properties: { anlass: { type: 'string' }, absatz: { type: 'string' } },
  required: ['anlass', 'absatz'],
  additionalProperties: false,
}
const LEADER = /geschäftsf|geschaeftsf|inhaber|ceo|vorstand|managing director|gründer|founder|owner/i

export const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k.toLowerCase()] ?? '').replace(/\n{3,}/g, '\n\n').trim()

export type LetterData = {
  subject: string; date: string; sender: string; closing: string; signer: string; signerTitle: string; contact: string
  recipient: { name: string | null; title: string | null; company: string; street: string | null; zip: string | null; city: string | null; country: string | null }
  anlass?: string; research?: string[]; cost_usd?: number; model?: string
}

export async function draftLetter(supabase: any, t: Target, opts: { runId?: string | null } = {}) {
  const key = apiKey()
  if (!key) throw new Error('KI ist noch nicht eingerichtet (API-Key fehlt).')
  const settings = await loadSettings(supabase, t.projectId)
  const cfg: LetterConfig = settings.letter.config
  const [facts, { data: company }, { data: people }, { data: cand }] = await Promise.all([
    gather(supabase, t),
    supabase.from('companies').select('name, domain, website_url, country').eq('id', t.companyId).single(),
    supabase.from('people').select('id, full_name, first_name, last_name, job_title, is_decision_maker').eq('company_id', t.companyId),
    supabase.from('candidate_companies').select('id, hiring, enrichment_data').eq('existing_company_id', t.companyId).order('updated_at', { ascending: false }).limit(1),
  ])
  if (!facts || !company) throw new Error('Firma nicht gefunden')

  // Letters go to the management; fall back to the lead contact, else "Geschäftsführung"
  const list = people || []
  const boss = list.find((p: any) => LEADER.test(p.job_title || '')) || list.find((p: any) => p.is_decision_maker) || list.find((p: any) => p.id === t.personId) || null
  const name = boss ? (boss.full_name || [boss.first_name, boss.last_name].filter(Boolean).join(' ')) : null

  // Address: stored Impressum, else read it now
  const c = cand?.[0]
  let address = c?.enrichment_data?.impressum?.address ?? null
  if (!address) {
    const site = company.website_url || (company.domain ? `https://${company.domain}` : null) || c?.enrichment_data?.impressum?.website || null
    if (site) {
      const info = await readCompany(company.name, company.country, null, site).catch(() => null)
      address = info?.address ?? null
      if (info && c) await supabase.from('candidate_companies').update({ enrichment_data: { ...(c.enrichment_data || {}), impressum: { ...(c.enrichment_data?.impressum || {}), address } } }).eq('id', c.id)
    }
  }

  const client = new Anthropic({ apiKey: key })
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: `Du schreibst für HireFlow die firmenspezifischen Teile eines Geschäftsbriefs an die Geschäftsführung eines Unternehmens im DACH-Raum. Der Rest des Briefs kommt aus einer festen Vorlage.

Produkt: ${settings.first_message.config.pitch}

Regeln:
- Deutsch, per Sie, sachlich-freundlich, wie ein persönlicher Brief – keine Werbesprache, keine Superlative, keine Aufzählungszeichen.
- anlass: 1–2 Sätze, warum wir gerade jetzt schreiben – konkret aus den Fakten (z. B. Zahl und Art der offenen Stellen, mehrfach gesuchte Rollen). Nichts erfinden.
- absatz: 2–4 Sätze: die vermutete Herausforderung im Recruiting bei genau dieser Firma und wie HireFlow dabei konkret hilft.
- Keine Anrede, keine Grußformel, kein Terminvorschlag – das steht in der Vorlage.

Die Vorlage, in die beides eingesetzt wird:
${cfg.template}`,
    messages: [{ role: 'user', content: `Fakten:\n${facts.text}` }],
  } as any)
  if (res.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.')
  const block = res.content.find(b => b.type === 'text')
  const ai = JSON.parse(block && block.type === 'text' ? block.text : '{}') as { anlass: string; absatz: string }
  if (!ai.absatz) throw new Error('KI-Antwort unvollständig')
  const costUsd = costOf(MODEL, res.usage)

  const h = c?.hiring
  const vars: Record<string, string> = {
    firma: company.name, anrede: name ? `Guten Tag ${name}` : 'Sehr geehrte Damen und Herren',
    vorname: boss?.first_name || '', nachname: boss?.last_name || '', name: name || '',
    anlass: ai.anlass, absatz: ai.absatz, stellen: h?.open ? String(h.open) : '',
    rollen: (h?.repeated || []).slice(0, 2).map((r: any) => r.role).join(', '), ort: address?.city || '',
  }
  const data: LetterData = {
    subject: fill(cfg.subject, vars), date: new Date().toISOString().slice(0, 10),
    sender: cfg.sender, closing: cfg.closing, signer: cfg.signer, signerTitle: cfg.signerTitle, contact: cfg.contact,
    recipient: { name, title: boss?.job_title || (name ? null : 'Geschäftsführung'), company: company.name, street: address?.street ?? null, zip: address?.zip ?? null, city: address?.city ?? null, country: address?.country ?? null },
    anlass: ai.anlass, cost_usd: costUsd, model: MODEL,
  }
  const row = {
    project_id: t.projectId, agent_key: 'letter', kind: 'letter', channel: 'post', status: 'pending', run_id: opts.runId ?? null,
    title: `Brief an ${name || 'die Geschäftsführung'} (${company.name})`, body: fill(cfg.template, vars), data,
    company_id: t.companyId, person_id: boss?.id ?? null, lead_id: t.leadId ?? null,
  }
  // One open letter per company: rewriting replaces it
  const { data: existing } = await supabase.from('automation_items').select('id').eq('agent_key', 'letter').eq('status', 'pending').eq('company_id', t.companyId).limit(1)
  let itemId: string
  if (existing?.length) {
    itemId = existing[0].id
    await supabase.from('automation_items').update({ ...row, created_at: new Date().toISOString() }).eq('id', itemId)
  } else {
    const { data: ins, error } = await supabase.from('automation_items').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    itemId = ins.id
  }
  return { itemId, costUsd, missingAddress: !address }
}

// Single letter on demand (company page) – logged as its own run
export async function letterNow(supabase: any, t: Target) {
  const runId = await startRun(supabase, t.projectId, 'letter', 'manual')
  try {
    const r = await draftLetter(supabase, t, { runId })
    await finishRun(supabase, runId, { items: 1, costUsd: r.costUsd, summary: r.missingAddress ? '1 Brief erstellt – Anschrift fehlt, bitte ergänzen' : '1 Brief erstellt' })
    return r
  } catch (e: any) {
    await finishRun(supabase, runId, { error: e?.message || 'Fehler' })
    throw e
  }
}

// Letters for leads whose outreach sequence has reached a "letter" step
export async function draftLettersDue(supabase: any, projectId: string, trigger: 'manual' | 'cron', opts: { limit?: number; budgetMs?: number } = {}) {
  const settings = await loadSettings(supabase, projectId)
  if (trigger === 'cron' && !settings.letter.enabled) return { drafted: 0 }
  const steps = settings.sequence.config.steps
  const letterSteps = new Set(steps.map((s, i) => (s.letter ? i : -1)).filter(i => i >= 0))
  const runId = await startRun(supabase, projectId, 'letter', trigger)
  const started = Date.now()
  let drafted = 0, cost = 0
  const errors: string[] = []
  try {
    const { data: rows } = await supabase.from('sequence_enrollments').select('lead_id, person_id, company_id, step, started_at')
      .eq('project_id', projectId).eq('status', 'active').limit(300)
    const due = (rows || []).filter((r: any) => letterSteps.has(r.step) && r.company_id)
    const { data: items } = due.length
      ? await supabase.from('automation_items').select('lead_id, company_id, created_at').eq('agent_key', 'letter').in('company_id', due.map((r: any) => r.company_id))
      : { data: [] }
    const todo = due.filter((r: any) => !(items || []).some((i: any) => i.company_id === r.company_id && i.created_at >= r.started_at)).slice(0, opts.limit ?? 4)
    for (const r of todo) {
      if (Date.now() - started > (opts.budgetMs ?? 40_000)) break
      try {
        const out = await draftLetter(supabase, { projectId, companyId: r.company_id, personId: r.person_id, leadId: r.lead_id }, { runId })
        drafted++; cost += out.costUsd
      } catch (e: any) { errors.push(e?.message || 'Fehler') }
    }
    await finishRun(supabase, runId, {
      status: errors.length && !drafted ? 'error' : 'ok', items: drafted, costUsd: cost, error: errors[0],
      summary: todo.length ? `${drafted} Brief${drafted === 1 ? '' : 'e'} erstellt${errors.length ? `, ${errors.length} Fehler` : ''}` : 'Kein Lead steht gerade beim Brief-Schritt',
    })
    return { drafted }
  } catch (e: any) {
    await finishRun(supabase, runId, { error: e?.message || 'Fehler', items: drafted, costUsd: cost })
    throw e
  }
}
