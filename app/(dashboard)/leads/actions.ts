'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

// Stages a lead can be moved to by hand — 'converted' is only set by convertLeadToOpportunity
const MOVABLE_STAGES = ['outreach', 'contacted', 'qualified', 'disqualified']

function toIsoOrNull(date: string | null | undefined) {
  if (!date) return null
  // <input type="date"> yields YYYY-MM-DD; store as local 09:00 so it lands on the right day
  return new Date(`${date}T09:00:00`).toISOString()
}

export async function createLead(input: {
  companyId: string
  personId: string | null
  name: string | null
  nextFollowUp: string | null
  notes: string | null
}): Promise<{ error: string | null }> {
  if (!PROJECT_ID) return { error: 'NEXT_PUBLIC_DEFAULT_PROJECT_ID not set' }
  if (!input.companyId) return { error: 'Company fehlt' }

  const supabase = createClient() as any
  const { error } = await supabase.from('leads').insert({
    project_id: PROJECT_ID,
    company_id: input.companyId,
    person_id: input.personId || null,
    name: input.name || null,
    stage: 'outreach',
    source: 'manual',
    notes: input.notes || null,
    next_follow_up_at: toIsoOrNull(input.nextFollowUp),
  })
  if (error) return { error: error.message }
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

export async function updateLeadFollowUp(leadId: string, date: string | null): Promise<{ error: string | null }> {
  const supabase = createClient() as any
  const { error } = await supabase
    .from('leads')
    .update({ next_follow_up_at: toIsoOrNull(date) })
    .eq('id', leadId)
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

  revalidatePath('/leads')
  revalidatePath('/pipeline')
  revalidatePath('/today')
  revalidatePath('/companies', 'layout')
  redirect(`/opportunities/${opp.id}`)
}
