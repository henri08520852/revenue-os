'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMeetingData } from '@/lib/meetingData'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/google/oauth'
import { loadCrmIndex } from '@/lib/google/matching'
import { rematchInbox } from '@/lib/google/emails'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
const DEAL_STAGES = ['discovery', 'erstgespraech', 'evaluation', 'proposal', 'negotiation']

type Result = { error: string | null; id?: string; href?: string }
export type CompanyRef = { companyId: string | null; newCompany?: { name: string; domain: string | null } | null }

// Picker data for the create dialogs, loaded when a dialog opens
export async function getPickerData() {
  return getMeetingData()
}

const cleanDomain = (d: string | null | undefined) =>
  (d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null

async function resolveCompany(supabase: any, ref: CompanyRef, required: boolean): Promise<{ error: string | null; companyId: string | null }> {
  if (ref.companyId) return { error: null, companyId: ref.companyId }
  const name = ref.newCompany?.name?.trim()
  if (!name) return { error: required ? 'Bitte eine Company wählen oder neu anlegen' : null, companyId: null }
  const domain = cleanDomain(ref.newCompany?.domain)
  if (domain) {
    const { data: existing } = await supabase.from('companies').select('id').eq('project_id', PROJECT_ID).eq('domain', domain).maybeSingle()
    if (existing) return { error: null, companyId: existing.id }
  }
  const { data, error } = await supabase.from('companies')
    .insert({ project_id: PROJECT_ID, name, domain, account_status: 'target' }).select('id').single()
  if (error) return { error: error.message, companyId: null }
  return { error: null, companyId: data.id }
}

// New contacts / domains may match emails waiting in the Posteingang
async function rematch(supabase: any) {
  try {
    const index = await loadCrmIndex(supabase, PROJECT_ID!, ALLOWED_EMAIL_DOMAIN)
    await rematchInbox(supabase, PROJECT_ID!, index)
  } catch { /* emails table missing → nothing to match */ }
}

export async function createCompanyRecord(input: { name: string; domain: string | null }): Promise<Result> {
  const supabase = createClient() as any
  const { error, companyId } = await resolveCompany(supabase, { companyId: null, newCompany: input }, true)
  if (error || !companyId) return { error: error || 'Company konnte nicht angelegt werden' }
  if (input.domain) await rematch(supabase)
  revalidatePath('/', 'layout')
  return { error: null, id: companyId, href: `/companies/${companyId}` }
}

export async function createContactRecord(input: CompanyRef & {
  firstName: string; lastName: string; jobTitle: string | null; email: string | null; phone: string | null
  linkedinUrl: string | null; buyerRole: string | null
  dealId?: string | null; dealRole?: string | null    // also add to a deal's buying center
}): Promise<Result> {
  const first = input.firstName.trim(), last = input.lastName.trim()
  if (!first && !last) return { error: 'Bitte einen Namen eingeben' }
  const supabase = createClient() as any
  const { error: cErr, companyId } = await resolveCompany(supabase, input, false)
  if (cErr) return { error: cErr }
  const email = input.email?.trim().toLowerCase() || null
  const { data, error } = await supabase.from('people').insert({
    project_id: PROJECT_ID, company_id: companyId, first_name: first || null, last_name: last || null,
    full_name: [first, last].filter(Boolean).join(' '), job_title: input.jobTitle?.trim() || null, email,
    phone: input.phone?.trim() || null, linkedin_url: input.linkedinUrl?.trim() || null,
    buyer_role: input.buyerRole || null, source: 'manual',
  }).select('id').single()
  if (error) return { error: error.message }
  if (input.dealId) {
    const { error: dErr } = await supabase.from('opportunity_contacts')
      .insert({ opportunity_id: input.dealId, person_id: data.id, role: input.dealRole || 'stakeholder' })
    if (dErr) return { error: dErr.message }
  }
  if (email) await rematch(supabase)
  revalidatePath('/', 'layout')
  return { error: null, id: data.id, href: `/contacts/${data.id}` }
}

export async function createDealRecord(input: CompanyRef & {
  name: string; stage: string; valueEur: number | null; ownerId: string | null
  championId: string | null; nextStep: string | null; nextStepDate: string | null
}): Promise<Result> {
  if (!DEAL_STAGES.includes(input.stage)) return { error: 'Ungültige Stage' }
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const { error: cErr, companyId } = await resolveCompany(supabase, input, true)
  if (cErr || !companyId) return { error: cErr || 'Company fehlt' }
  let companyName = input.newCompany?.name?.trim() || null
  if (!companyName) {
    const { data: c } = await supabase.from('companies').select('name').eq('id', companyId).single()
    companyName = c?.name ?? null
  }
  const name = input.name.trim() || (companyName ? `${companyName} — HireFlow` : 'Neuer Deal')
  const { data: deal, error } = await supabase.from('opportunities').insert({
    project_id: PROJECT_ID, company_id: companyId, name, stage: input.stage,
    value_eur: input.valueEur, owner_id: input.ownerId || user?.id || null, champion_person_id: input.championId || null,
  }).select('id').single()
  if (error) return { error: error.message }
  if (input.championId) {
    await supabase.from('opportunity_contacts').insert({ opportunity_id: deal.id, person_id: input.championId, role: 'champion' })
  }
  // The next step is the deal's first task (migration 022)
  if (input.nextStep?.trim()) {
    await supabase.from('tasks').insert({
      project_id: PROJECT_ID, title: input.nextStep.trim(), task_type: 'todo',
      due_at: input.nextStepDate ? `${input.nextStepDate}T10:00:00.000Z` : null, has_time: false,
      owner_id: input.ownerId || user?.id || null, company_id: companyId, person_id: input.championId || null, opportunity_id: deal.id,
    })
  }
  revalidatePath('/', 'layout')
  return { error: null, id: deal.id, href: `/opportunities/${deal.id}` }
}

export async function createLeadRecord(input: CompanyRef & {
  stage?: string; personId: string | null; name: string | null; ownerId: string | null; followUpDate: string | null; notes: string | null
}): Promise<Result> {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const { error: cErr, companyId } = await resolveCompany(supabase, input, true)
  if (cErr || !companyId) return { error: cErr || 'Company fehlt' }
  const ownerId = input.ownerId || user?.id || null
  const { data: lead, error } = await supabase.from('leads').insert({
    project_id: PROJECT_ID, owner_id: ownerId, company_id: companyId, person_id: input.personId || null,
    name: input.name?.trim() || null, stage: ['outreach', 'contacted', 'qualified'].includes(input.stage ?? '') ? input.stage : 'outreach', source: 'manual', notes: input.notes?.trim() || null,
  }).select('id').single()
  if (error) return { error: error.message }
  if (input.followUpDate) {
    await supabase.from('tasks').insert({
      project_id: PROJECT_ID, title: `Follow-up${input.name?.trim() ? ' – ' + input.name.trim() : ''}`, task_type: 'follow_up',
      due_at: `${input.followUpDate}T10:00:00.000Z`, has_time: false, owner_id: ownerId,
      company_id: companyId, person_id: input.personId || null, lead_id: lead.id,
    })
  }
  revalidatePath('/', 'layout')
  return { error: null, id: lead.id, href: `/pipeline?focus=${lead.id}` }
}
