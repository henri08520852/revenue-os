import { createClient } from '@/lib/supabase/server'
import { OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'

export type TimelineItem = {
  id: string
  kind: 'email' | 'meeting' | 'note' | 'call' | 'linkedin' | 'stage' | 'other'
  at: string
  title: string
  body: string | null
  meta: string[]            // e.g. ["eingehend", "mit Anna Müller", "henri@…"]
  outcome: string | null
  source: string | null     // manual | gmail | calendar | …
  personId: string | null
  personName: string | null
  dealId: string | null
  dealName: string | null
}

export type UpcomingItem = {
  id: string
  kind: 'meeting' | 'lead' | 'deal' | 'company'
  at: string
  title: string
  sub: string | null
  href: string | null
  external: boolean
  meet: string | null
}

const KIND: Record<string, TimelineItem['kind']> = {
  email: 'email', meeting: 'meeting', event_meeting: 'meeting', note: 'note', voice_note: 'note',
  call: 'call', linkedin_message: 'linkedin', linkedin_comment: 'linkedin', linkedin_connection: 'linkedin',
}
const DIRECTION: Record<string, string> = { inbound: 'eingehend', outbound: 'ausgehend' }
const stageLabel = (s: string | null) => (s && (OPPORTUNITY_STAGE_LABELS as Record<string, string>)[s]) || s || '—'
const personName = (p: any) => p ? (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null) : null

// Timeline for a company, a contact or a deal (newest first)
export async function loadTimeline(target: { companyId?: string; personId?: string; opportunityId?: string; dealCompanyId?: string | null }): Promise<TimelineItem[]> {
  const supabase = createClient() as any
  let q = supabase
    .from('activities')
    .select('id, activity_type, direction, occurred_at, summary, outcome, extracted_intel, source, created_by, person_id, opportunity_id, person:people(full_name, first_name, last_name), deal:opportunities(name)')
    .order('occurred_at', { ascending: false })
    .limit(200)
  if (target.personId) q = q.eq('person_id', target.personId)
  else if (target.opportunityId) {
    // Deal: its own activities + company-level ones that are not tied to another deal
    q = target.dealCompanyId
      ? q.or(`opportunity_id.eq.${target.opportunityId},and(company_id.eq.${target.dealCompanyId},opportunity_id.is.null)`)
      : q.eq('opportunity_id', target.opportunityId)
  } else if (target.companyId) q = q.eq('company_id', target.companyId)
  else return []

  // Stage changes of the relevant deals
  let dealIds: string[] = []
  if (target.opportunityId) dealIds = [target.opportunityId]
  else if (target.companyId) {
    const { data: deals } = await supabase.from('opportunities').select('id').eq('company_id', target.companyId)
    dealIds = (deals || []).map((d: any) => d.id)
  } else if (target.personId) {
    const { data: links } = await supabase.from('opportunity_contacts').select('opportunity_id').eq('person_id', target.personId)
    dealIds = (links || []).map((l: any) => l.opportunity_id)
  }

  const [{ data: acts }, { data: history }] = await Promise.all([
    q,
    dealIds.length
      ? supabase.from('opportunity_stage_history').select('id, opportunity_id, from_stage, to_stage, changed_at, deal:opportunities(name)').in('opportunity_id', dealIds).order('changed_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
  ])

  const items: TimelineItem[] = (acts || []).map((a: any) => {
    const intel = a.extracted_intel || {}
    const meta: string[] = []
    if (a.direction && DIRECTION[a.direction]) meta.push(DIRECTION[a.direction])
    if (a.source === 'gmail' && intel.from) meta.push(`von ${intel.from}`)
    if (a.source === 'gmail' && intel.to) meta.push(`an ${intel.to}`)
    if (a.source === 'calendar') meta.push('aus Kalender')
    if (a.created_by && a.source === 'manual') meta.push(a.created_by)
    return {
      id: a.id,
      kind: KIND[a.activity_type] ?? 'other',
      at: a.occurred_at,
      title: a.summary || a.activity_type,
      body: intel.body || intel.snippet || null,
      meta,
      outcome: a.outcome,
      source: a.source,
      personId: a.person_id,
      personName: personName(a.person),
      dealId: a.opportunity_id,
      dealName: a.deal?.name ?? null,
    }
  })
  for (const h of history || []) {
    items.push({
      id: 'h' + h.id,
      kind: 'stage',
      at: h.changed_at,
      title: h.from_stage ? `${stageLabel(h.from_stage)} → ${stageLabel(h.to_stage)}` : `Deal angelegt (${stageLabel(h.to_stage)})`,
      body: null, meta: [], outcome: null, source: 'system', personId: null, personName: null,
      dealId: h.opportunity_id, dealName: h.deal?.name ?? null,
    })
  }
  return items.filter(i => i.at).sort((a, b) => b.at.localeCompare(a.at))
}

// Upcoming meetings + due follow-ups / next steps for a record
export async function loadUpcoming(target: { companyId?: string | null; personId?: string; personEmail?: string | null; opportunityId?: string }): Promise<UpcomingItem[]> {
  const supabase = createClient() as any
  const nowIso = new Date(Date.now() - 60 * 60000).toISOString()
  const out: UpcomingItem[] = []

  const evBase = () => supabase.from('calendar_events').select('id, title, start_at, meet_link, html_link').gte('start_at', nowIso).order('start_at').limit(10)
  let ev: any = null
  if (target.personId) {
    // Matched to the contact, or the contact is on the guest list
    ev = Promise.all([
      evBase().eq('person_id', target.personId),
      target.personEmail ? evBase().contains('attendees', [{ email: target.personEmail.toLowerCase() }]) : Promise.resolve({ data: [] }),
    ]).then(([a, b]: any[]) => {
      const seen = new Set<string>()
      return { data: [...(a.data || []), ...(b.data || [])].filter((e: any) => !seen.has(e.id) && !!seen.add(e.id)) }
    })
  } else if (target.companyId) ev = evBase().eq('company_id', target.companyId)

  let leads = supabase.from('leads').select('id, name, next_follow_up_at, company:companies(name)').not('next_follow_up_at', 'is', null).not('stage', 'in', '(converted,disqualified)')
  if (target.personId) leads = leads.eq('person_id', target.personId)
  else if (target.companyId && !target.opportunityId) leads = leads.eq('company_id', target.companyId)
  else leads = null

  let deals = supabase.from('opportunities').select('id, name, next_step, next_step_due_at').not('next_step_due_at', 'is', null).not('stage', 'in', '(won,lost)')
  if (target.opportunityId) deals = deals.eq('id', target.opportunityId)
  else if (target.companyId) deals = deals.eq('company_id', target.companyId)
  else if (target.personId) {
    const { data: links } = await supabase.from('opportunity_contacts').select('opportunity_id').eq('person_id', target.personId)
    const ids = (links || []).map((l: any) => l.opportunity_id)
    deals = ids.length ? deals.in('id', ids) : null
  }

  const [evRes, leadRes, dealRes, compRes] = await Promise.all([
    ev ?? Promise.resolve({ data: [] }),
    leads ?? Promise.resolve({ data: [] }),
    deals ?? Promise.resolve({ data: [] }),
    target.companyId && !target.personId && !target.opportunityId
      ? supabase.from('companies').select('id, current_metrics').eq('id', target.companyId).single()
      : Promise.resolve({ data: null }),
  ])

  for (const e of evRes.data || []) out.push({ id: 'e' + e.id, kind: 'meeting', at: e.start_at, title: e.title, sub: null, href: e.html_link, external: true, meet: e.meet_link })
  for (const l of leadRes.data || []) out.push({ id: 'l' + l.id, kind: 'lead', at: l.next_follow_up_at, title: 'Lead-Follow-up', sub: [l.company?.name, l.name].filter(Boolean).join(' · ') || null, href: `/leads?focus=${l.id}`, external: false, meet: null })
  for (const d of dealRes.data || []) out.push({ id: 'd' + d.id, kind: 'deal', at: d.next_step_due_at, title: d.next_step || 'Nächster Schritt', sub: d.name, href: `/opportunities/${d.id}`, external: false, meet: null })
  const cm = compRes.data?.current_metrics
  if (cm?.next_follow_up_at) out.push({ id: 'c' + target.companyId, kind: 'company', at: cm.next_follow_up_at, title: 'Erinnerung', sub: cm.follow_up_note ?? null, href: null, external: false, meet: null })

  return out.filter(u => u.at).sort((a, b) => a.at.localeCompare(b.at))
}
