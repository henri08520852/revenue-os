'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

// Stages a lead can be moved to by hand — 'converted' is only set by convertLeadToOpportunity
const MOVABLE_STAGES = ['outreach', 'contacted', 'qualified', 'disqualified']

// Date-only follow-ups are stored at 10:00 UTC → same calendar day in Berlin all year
function toIsoOrNull(date: string | null | undefined) {
  if (!date) return null
  return `${date}T10:00:00.000Z`
}

// The lead's follow-up date is its earliest open task (leads.next_follow_up_at is derived
// by trigger, migration 022). Setting a date updates that task or creates a follow-up task.
async function setFollowUpTask(supabase: any, lead: { id: string; project_id: string; company_id: string | null; person_id: string | null; owner_id: string | null; name: string | null }, dueIso: string | null) {
  const { data: open } = await supabase.from('tasks').select('id').eq('lead_id', lead.id).eq('status', 'open')
    .order('due_at', { ascending: true, nullsFirst: false }).limit(1)
  if (open?.length) return supabase.from('tasks').update({ due_at: dueIso, has_time: false }).eq('id', open[0].id)
  if (!dueIso) return { error: null }
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('tasks').insert({
    project_id: lead.project_id, title: `Follow-up${lead.name ? ' – ' + lead.name : ''}`, task_type: 'follow_up',
    due_at: dueIso, has_time: false, owner_id: lead.owner_id ?? user?.id ?? null, created_by: user?.id ?? null,
    company_id: lead.company_id, person_id: lead.person_id, lead_id: lead.id,
  })
}

export async function createLead(input: {
  companyId: string
  personId: string | null
  name: string | null
  nextFollowUp: string | null
  notes: string | null
  ownerId?: string | null
}): Promise<{ error: string | null }> {
  if (!PROJECT_ID) return { error: 'NEXT_PUBLIC_DEFAULT_PROJECT_ID not set' }
  if (!input.companyId) return { error: 'Company fehlt' }

  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const { data: created, error } = await supabase.from('leads').insert({
    project_id: PROJECT_ID,
    owner_id: input.ownerId || user?.id || null,
    company_id: input.companyId,
    person_id: input.personId || null,
    name: input.name || null,
    stage: 'outreach',
    source: 'manual',
    notes: input.notes || null,
  }).select('id, project_id, company_id, person_id, owner_id, name').single()
  if (error) return { error: error.message }
  if (input.nextFollowUp) {
    const { error: tErr } = await setFollowUpTask(supabase, created, toIsoOrNull(input.nextFollowUp))
    if (tErr) return { error: tErr.message }
  }
  revalidatePath('/leads')
  revalidatePath('/today')
  revalidatePath('/companies', 'layout')
  return { error: null }
}

export async function updateLeadStage(leadId: string, stage: string): Promise<{ error: string | null }> {
  if (!MOVABLE_STAGES.includes(stage)) return { error: `Ungültige Stage: ${stage}` }
  const supabase = createClient() as any
  const { error } = await supabase
    .from('leads')
    .update({ stage })
    .eq('id', leadId)
    .is('converted_to_opportunity_id', null)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  revalidatePath('/today')
  revalidatePath('/companies', 'layout')
  return { error: null }
}

export async function updateLeadOwner(leadId: string, ownerId: string | null): Promise<{ error: string | null }> {
  const supabase = createClient() as any
  const { error } = await supabase.from('leads').update({ owner_id: ownerId || null }).eq('id', leadId)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  revalidatePath('/today')
  return { error: null }
}

export async function updateLeadFollowUp(leadId: string, date: string | null): Promise<{ error: string | null }> {
  const supabase = createClient() as any
  const { data: lead, error: lErr } = await supabase.from('leads').select('id, project_id, company_id, person_id, owner_id, name').eq('id', leadId).single()
  if (lErr || !lead) return { error: lErr?.message || 'Lead nicht gefunden' }
  const { error } = await setFollowUpTask(supabase, lead, toIsoOrNull(date))
  if (error) return { error: error.message }
  revalidatePath('/leads')
  revalidatePath('/today')
  revalidatePath('/companies', 'layout')
  return { error: null }
}

export type ConvertState = { error: string | null }

// Used with useFormState: returns an error message, or redirects to the new deal on success
export async function convertLeadToOpportunity(leadId: string, _prev: ConvertState): Promise<ConvertState> {
  const supabase = createClient() as any

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*, company:companies(name)')
    .eq('id', leadId)
    .single()
  if (leadErr || !lead) return { error: leadErr?.message || 'Lead nicht gefunden' }

  // Already converted → just go to the deal
  if (lead.converted_to_opportunity_id) redirect(`/opportunities/${lead.converted_to_opportunity_id}`)
  if (!lead.company_id) return { error: 'Lead hat keine Company — Deal braucht eine Company' }

  const { data: opp, error: oppErr } = await supabase
    .from('opportunities')
    .insert({
      project_id: lead.project_id,
      company_id: lead.company_id,
      name: lead.name || lead.company?.name || 'Neuer Deal',
      stage: 'discovery',
      owner_id: lead.owner_id || (await supabase.auth.getUser()).data.user?.id || null,
      champion_person_id: lead.person_id,
      notes: lead.notes,
    })
    .select('id')
    .single()
  if (oppErr || !opp) return { error: oppErr?.message || 'Deal konnte nicht angelegt werden' }

  if (lead.person_id) {
    const { error: ocErr } = await supabase
      .from('opportunity_contacts')
      .insert({ opportunity_id: opp.id, person_id: lead.person_id, role: 'champion' })
    if (ocErr) {
      await supabase.from('opportunities').delete().eq('id', opp.id)
      return { error: ocErr.message }
    }
  }

  // Guard against a concurrent double conversion: only update if still unconverted
  const { data: updated, error: updErr } = await supabase
    .from('leads')
    .update({
      stage: 'converted',
      converted_at: new Date().toISOString(),
      converted_to_opportunity_id: opp.id,
    })
    .eq('id', leadId)
    .is('converted_to_opportunity_id', null)
    .select('id')
  if (updErr || !updated?.length) {
    // opportunity_contacts cascade with the opportunity
    await supabase.from('opportunities').delete().eq('id', opp.id)
    return { error: updErr?.message || 'Lead wurde bereits umgewandelt' }
  }

  // Open lead tasks continue on the deal (they stay linked to the lead for history)
  await supabase.from('tasks').update({ opportunity_id: opp.id }).eq('lead_id', leadId).eq('status', 'open')

  revalidatePath('/leads')
  revalidatePath('/pipeline')
  revalidatePath('/today')
  revalidatePath('/companies', 'layout')
  redirect(`/opportunities/${opp.id}`)
}
