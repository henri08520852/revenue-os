// Builds the CRM context the AI assistant reads for one contact, company or deal:
// master data, deals / leads / contacts, open and recent tasks, and the timeline
// (emails with full text, notes, calls, meetings, stage changes).
import { createClient } from '@/lib/supabase/server'
import { loadTimeline, TimelineItem } from '@/lib/records'
import { loadTasks } from '@/lib/tasks'
import { OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'
import { QUALI_CRITERIA, closeReasonLabel } from '@/lib/dealMeta'

export type AiTarget = { kind: 'contact' | 'company' | 'deal'; id: string }

const MAX_CHARS = 150_000            // ~40k tokens; newest activity wins when trimming
const MAX_ITEM_CHARS = 6_000
const TZ = 'Europe/Berlin'

const stage = (s: string | null) => (s && (OPPORTUNITY_STAGE_LABELS as Record<string, string>)[s]) || s || '—'
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const name = (p: any) => p ? (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unbenannt') : null
const KIND: Record<TimelineItem['kind'], string> = { email: 'E-Mail', meeting: 'Meeting', note: 'Notiz', call: 'Anruf', linkedin: 'LinkedIn', stage: 'Deal-Stage', other: 'Aktivität' }

// Drop quoted earlier messages from email bodies – they are separate timeline items anyway
export function stripQuoted(body: string) {
  const cut = body.search(/^(Am .{5,120} schrieb|On .{5,120} wrote:|-{2,}\s*(Original|Ursprüngliche)|Von: .+\n(Gesendet|Datum): |From: .+\n(Sent|Date): )/m)
  const text = (cut > 0 ? body.slice(0, cut) : body)
    .split('\n').filter(l => !l.startsWith('>')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
  return text.length > MAX_ITEM_CHARS ? text.slice(0, MAX_ITEM_CHARS) + ' […]' : text
}

function formatItem(i: TimelineItem) {
  const head = [day(i.at), KIND[i.kind], ...i.meta, i.personName ? `Kontakt: ${i.personName}` : null, i.dealName ? `Deal: ${i.dealName}` : null].filter(Boolean).join(' · ')
  const lines = [`### ${head}`, i.title]
  if (i.outcome) lines.push(`Ergebnis: ${i.outcome}`)
  if (i.body) lines.push(stripQuoted(i.body))
  return lines.join('\n')
}

function formatTasks(tasks: Awaited<ReturnType<typeof loadTasks>>) {
  if (!tasks.length) return '—'
  return tasks.map(t => `- [${t.status === 'done' ? 'erledigt' : 'offen'}] ${t.title}${t.due_at ? ` (fällig ${day(t.due_at)})` : ''}${t.notes ? ` – ${t.notes}` : ''}`).join('\n')
}

export async function buildContext(target: AiTarget): Promise<{ title: string; text: string } | null> {
  const supabase = createClient() as any
  const facts: string[] = []
  let title = ''
  let timeline: TimelineItem[] = []
  let tasks: Awaited<ReturnType<typeof loadTasks>> = []

  if (target.kind === 'contact') {
    const { data: p } = await supabase.from('people').select('*, company:companies(id, name, domain, account_status)').eq('id', target.id).single()
    if (!p) return null
    title = name(p)!
    const [{ data: deals }, { data: leads }, tl, open, done] = await Promise.all([
      supabase.from('opportunity_contacts').select('role, deal:opportunities(name, stage, value_eur)').eq('person_id', p.id),
      supabase.from('leads').select('name, stage').eq('person_id', p.id),
      loadTimeline({ personId: p.id }),
      loadTasks({ personId: p.id }),
      loadTasks({ personId: p.id, status: 'done', limit: 10 }),
    ])
    timeline = tl; tasks = [...open, ...done]
    facts.push(`Kontakt: ${title}${p.job_title ? `, ${p.job_title}` : ''}`, `Company: ${p.company?.name ?? '—'} (Status ${p.company?.account_status ?? '—'})`,
      `E-Mail: ${p.email ?? '—'}`, `Rolle: ${p.buyer_role ?? '—'}${p.is_decision_maker ? ', Entscheider' : ''}`)
    if (p.notes) facts.push(`Hintergrund: ${p.notes}`)
    for (const d of deals || []) if (d.deal) facts.push(`Deal: ${d.deal.name} – ${stage(d.deal.stage)}${d.deal.value_eur ? `, ${d.deal.value_eur} €/Jahr` : ''} (Rolle: ${d.role})`)
    for (const l of leads || []) facts.push(`Lead: ${l.name || 'ohne Bezeichnung'} – ${l.stage}`)
  } else if (target.kind === 'company') {
    const { data: c } = await supabase.from('companies').select('*').eq('id', target.id).single()
    if (!c) return null
    title = c.name
    const [{ data: people }, { data: deals }, { data: leads }, tl, open, done] = await Promise.all([
      supabase.from('people').select('full_name, first_name, last_name, email, job_title, buyer_role').eq('company_id', c.id),
      supabase.from('opportunities').select('name, stage, value_eur').eq('company_id', c.id),
      supabase.from('leads').select('name, stage').eq('company_id', c.id),
      loadTimeline({ companyId: c.id }),
      loadTasks({ companyId: c.id }),
      loadTasks({ companyId: c.id, status: 'done', limit: 10 }),
    ])
    timeline = tl; tasks = [...open, ...done]
    facts.push(`Company: ${c.name} (${c.domain ?? 'ohne Domain'}), Status ${c.account_status ?? '—'}`,
      [c.industry, c.city, c.employee_range ? `${c.employee_range} Mitarbeitende` : null].filter(Boolean).join(', ') || '')
    if (c.notes) facts.push(`Notizen: ${c.notes}`)
    for (const p of people || []) facts.push(`Kontakt: ${name(p)}${p.job_title ? `, ${p.job_title}` : ''}${p.buyer_role ? ` (${p.buyer_role})` : ''}`)
    for (const d of deals || []) facts.push(`Deal: ${d.name} – ${stage(d.stage)}${d.value_eur ? `, ${d.value_eur} €/Jahr` : ''}`)
    for (const l of leads || []) facts.push(`Lead: ${l.name || 'ohne Bezeichnung'} – ${l.stage}`)
  } else {
    const { data: o } = await supabase.from('opportunities').select('*, company:companies(id, name, domain)').eq('id', target.id).single()
    if (!o) return null
    title = o.name || o.company?.name || 'Deal'
    const [{ data: contacts }, tl, open, done] = await Promise.all([
      supabase.from('opportunity_contacts').select('role, person:people(full_name, first_name, last_name, email, job_title)').eq('opportunity_id', o.id),
      loadTimeline({ opportunityId: o.id, dealCompanyId: o.company?.id ?? null }),
      loadTasks({ opportunityId: o.id }),
      loadTasks({ opportunityId: o.id, status: 'done', limit: 10 }),
    ])
    timeline = tl; tasks = [...open, ...done]
    facts.push(`Deal: ${title}`, `Company: ${o.company?.name ?? '—'}`, `Stage: ${stage(o.stage)}`, `Wert: ${o.value_eur ? `${o.value_eur} €/Jahr` : '—'}`,
      `Angelegt: ${day(o.created_at)}`)
    if (o.notes) facts.push(`Notiz: ${o.notes}`)
    if (o.close_reason) facts.push(`${o.stage === 'won' ? 'Gewonnen' : 'Verloren'} wegen: ${closeReasonLabel(o.stage, o.close_reason)}${o.close_competitor ? ` (Wettbewerber: ${o.close_competitor})` : ''}${o.close_note ? ` – ${o.close_note}` : ''}`)
    const q = o.qualification || {}
    const quali = QUALI_CRITERIA.filter(c => q[c.key]).map(c => `${c.label}: ${q[c.key].status === 'yes' ? 'bestätigt' : q[c.key].status === 'no' ? 'nein' : 'unklar'}${q[c.key].note ? ` (${q[c.key].note})` : ''}`)
    if (quali.length) facts.push(`Qualifizierung: ${quali.join('; ')}`)
    for (const c of contacts || []) if (c.person) facts.push(`Buying Center: ${name(c.person)}${c.person.job_title ? `, ${c.person.job_title}` : ''} – ${c.role}`)
  }

  // Newest first until the budget is used, then back to chronological order
  const items: string[] = []
  let used = 0
  for (const i of timeline) {
    const t = formatItem(i)
    if (used + t.length > MAX_CHARS) break
    items.push(t); used += t.length
  }
  items.reverse()

  const text = [
    `Heute ist ${new Date().toLocaleDateString('de-DE', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}.`,
    `# Stammdaten`, facts.filter(Boolean).join('\n'),
    `# Aufgaben`, formatTasks(tasks),
    `# Verlauf (älteste zuerst${items.length < timeline.length ? `, nur die neuesten ${items.length} von ${timeline.length} Einträgen` : ''})`,
    items.length ? items.join('\n\n') : 'Noch keine Aktivitäten.',
  ].join('\n\n')
  return { title, text }
}
