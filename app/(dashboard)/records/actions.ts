'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { error: string | null }

// Activity types a person can log by hand (must match activities_activity_type_check)
const LOGGABLE = ['note', 'call', 'email', 'meeting', 'linkedin_message', 'whatsapp'] as const

export type LogInput = {
  type: typeof LOGGABLE[number]
  companyId: string | null
  personId: string | null
  opportunityId: string | null
  summary: string
  outcome: string | null
  direction: 'inbound' | 'outbound' | null
  occurredAt: string | null      // ISO; null = now
}

function revalidateRecords(ids: { companyId?: string | null; personId?: string | null; opportunityId?: string | null }) {
  if (ids.companyId) revalidatePath(`/companies/${ids.companyId}`)
  if (ids.personId) revalidatePath(`/contacts/${ids.personId}`)
  if (ids.opportunityId) revalidatePath(`/opportunities/${ids.opportunityId}`)
}

// Logs a note / call / email / meeting on any combination of company, contact and deal.
// Missing links are filled in from the given records (contact → company, deal → company).
export async function logActivity(input: LogInput): Promise<Result> {
  const summary = input.summary.trim()
  if (!summary) return { error: 'Bitte einen Text eingeben' }
  if (!LOGGABLE.includes(input.type)) return { error: 'Ungültiger Typ' }
  const supabase = createClient() as any

  let { companyId, personId, opportunityId } = input
  let projectId: string | null = null
  if (personId) {
    const { data: p } = await supabase.from('people').select('project_id, company_id').eq('id', personId).single()
    projectId ||= p?.project_id; companyId ||= p?.company_id ?? null
  }
  if (opportunityId) {
    const { data: o } = await supabase.from('opportunities').select('project_id, company_id').eq('id', opportunityId).single()
    projectId ||= o?.project_id; companyId ||= o?.company_id ?? null
  }
  if (companyId && !projectId) {
    const { data: c } = await supabase.from('companies').select('project_id').eq('id', companyId).single()
    projectId = c?.project_id ?? null
  }
  if (!projectId) return { error: 'Kein Datensatz zugeordnet' }

  const { data: { user } } = await supabase.auth.getUser()
  const occurredAt = input.occurredAt || new Date().toISOString()
  const { error } = await supabase.from('activities').insert({
    project_id: projectId,
    company_id: companyId,
    person_id: personId,
    opportunity_id: opportunityId,
    activity_type: input.type,
    direction: input.type === 'note' ? 'internal' : input.direction,
    channel: input.type,
    summary,
    outcome: input.outcome?.trim() || null,
    occurred_at: occurredAt,
    source: 'manual',
    created_by: user?.email ?? null,
  })
  if (error) return { error: error.message }

  if (personId && input.type !== 'note') {
    await supabase.from('people').update({ last_interaction_at: occurredAt }).eq('id', personId)
      .or(`last_interaction_at.is.null,last_interaction_at.lt."${occurredAt}"`)
  }
  revalidateRecords({ companyId, personId, opportunityId })
  return { error: null }
}

export async function deleteActivity(activityId: string, paths: { companyId?: string | null; personId?: string | null; opportunityId?: string | null }): Promise<Result> {
  const supabase = createClient() as any
  // Only hand-made entries can be deleted; synced emails/meetings come back on the next sync
  const { error } = await supabase.from('activities').delete().eq('id', activityId).eq('source', 'manual')
  if (error) return { error: error.message }
  revalidateRecords(paths)
  return { error: null }
}

const CONTACT_FIELDS = ['first_name', 'last_name', 'job_title', 'email', 'phone', 'linkedin_url', 'buyer_role', 'is_decision_maker', 'company_id', 'notes'] as const

export async function updateContact(personId: string, patch: Partial<Record<typeof CONTACT_FIELDS[number], any>>): Promise<Result> {
  const clean: Record<string, any> = {}
  for (const k of CONTACT_FIELDS) if (k in patch) clean[k] = typeof patch[k] === 'string' ? (patch[k].trim() || null) : patch[k]
  if ('email' in clean && clean.email) clean.email = String(clean.email).toLowerCase()
  if ('first_name' in clean || 'last_name' in clean) {
    const supabase = createClient() as any
    const { data: cur } = await supabase.from('people').select('first_name, last_name').eq('id', personId).single()
    const first = 'first_name' in clean ? clean.first_name : cur?.first_name
    const last = 'last_name' in clean ? clean.last_name : cur?.last_name
    clean.full_name = [first, last].filter(Boolean).join(' ') || null
  }
  const supabase = createClient() as any
  const { error } = await supabase.from('people').update(clean).eq('id', personId)
  if (error) return { error: error.message }
  revalidatePath(`/contacts/${personId}`)
  revalidatePath('/contacts')
  return { error: null }
}

const COMPANY_FIELDS = ['name', 'domain', 'website_url', 'linkedin_url', 'industry', 'city', 'employee_range', 'notes'] as const

export async function updateCompany(companyId: string, patch: Partial<Record<typeof COMPANY_FIELDS[number], string | null>>): Promise<Result> {
  const clean: Record<string, any> = {}
  for (const k of COMPANY_FIELDS) if (k in patch) clean[k] = patch[k]?.trim() || null
  if (clean.domain) clean.domain = String(clean.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  if ('name' in clean && !clean.name) return { error: 'Name darf nicht leer sein' }
  const supabase = createClient() as any
  const { error } = await supabase.from('companies').update(clean).eq('id', companyId)
  if (error) return { error: error.message }
  revalidatePath(`/companies/${companyId}`)
  revalidatePath('/companies')
  return { error: null }
}
