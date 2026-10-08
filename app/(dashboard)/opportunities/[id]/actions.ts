'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { LOST_REASONS, WON_REASONS } from '@/lib/dealMeta'

type Result = { error: string | null }

const ROLES = ['champion', 'decision_maker', 'economic_buyer', 'stakeholder']

// opportunities.champion_person_id / economic_buyer_person_id are read by the NBA engine —
// keep them derived from opportunity_contacts so there is one place to edit
async function syncKeyPeople(supabase: any, oppId: string) {
  const { data: contacts } = await supabase
    .from('opportunity_contacts')
    .select('person_id, role, created_at')
    .eq('opportunity_id', oppId)
    .order('created_at', { ascending: true })
  const first = (role: string) => (contacts || []).find((c: any) => c.role === role)?.person_id ?? null
  await supabase
    .from('opportunities')
    .update({ champion_person_id: first('champion'), economic_buyer_person_id: first('economic_buyer') })
    .eq('id', oppId)
}

export async function addOpportunityContact(oppId: string, personId: string, role: string): Promise<Result> {
  if (!personId) return { error: 'Bitte einen Kontakt wählen' }
  if (!ROLES.includes(role)) return { error: `Ungültige Rolle: ${role}` }
  const supabase = createClient() as any
  const { error } = await supabase
    .from('opportunity_contacts')
    .insert({ opportunity_id: oppId, person_id: personId, role })
  if (error) return { error: error.code === '23505' ? 'Kontakt ist bereits verknüpft' : error.message }
  await syncKeyPeople(supabase, oppId)
  revalidatePath(`/opportunities/${oppId}`)
  return { error: null }
}

export async function updateOpportunityContactRole(oppId: string, contactId: string, role: string): Promise<Result> {
  if (!ROLES.includes(role)) return { error: `Ungültige Rolle: ${role}` }
  const supabase = createClient() as any
  const { error } = await supabase
    .from('opportunity_contacts')
    .update({ role })
    .eq('id', contactId)
    .eq('opportunity_id', oppId)
  if (error) return { error: error.message }
  await syncKeyPeople(supabase, oppId)
  revalidatePath(`/opportunities/${oppId}`)
  return { error: null }
}

export async function removeOpportunityContact(oppId: string, contactId: string): Promise<Result> {
  const supabase = createClient() as any
  const { error } = await supabase
    .from('opportunity_contacts')
    .delete()
    .eq('id', contactId)
    .eq('opportunity_id', oppId)
  if (error) return { error: error.message }
  await syncKeyPeople(supabase, oppId)
  revalidatePath(`/opportunities/${oppId}`)
  return { error: null }
}

export async function setOpportunityStage(oppId: string, stage: string): Promise<Result> {
  const supabase = createClient() as any
  const { error } = await supabase.from('opportunities').update({ stage }).eq('id', oppId)
  if (error) return { error: error.message }
  revalidatePath(`/opportunities/${oppId}`)
  revalidatePath('/pipeline')
  revalidatePath('/today')
  revalidatePath('/companies', 'layout')
  return { error: null }
}

export async function setOpportunityOwner(oppId: string, ownerId: string | null): Promise<Result> {
  const supabase = createClient() as any
  const { error } = await supabase.from('opportunities').update({ owner_id: ownerId || null }).eq('id', oppId)
  if (error) return { error: error.message }
  revalidatePath(`/opportunities/${oppId}`)
  revalidatePath('/pipeline')
  revalidatePath('/today')
  return { error: null }
}

// Won / lost with a reason; the reason is also logged so it shows in the timeline and the AI context
export async function closeDeal(oppId: string, input: { stage: 'won' | 'lost'; reason: string; competitor: string | null; note: string | null }): Promise<Result> {
  if (!['won', 'lost'].includes(input.stage)) return { error: 'Ungültige Stage' }
  const list: readonly { key: string; label: string }[] = input.stage === 'won' ? WON_REASONS : LOST_REASONS
  const reason = list.find(r => r.key === input.reason)
  if (!reason) return { error: 'Bitte einen Grund wählen' }
  const competitor = input.competitor?.trim() || null
  const note = input.note?.trim() || null
  const supabase = createClient() as any
  const { data: opp, error } = await supabase.from('opportunities')
    .update({ stage: input.stage, close_reason: reason.key, close_competitor: competitor, close_note: note })
    .eq('id', oppId).select('project_id, company_id').single()
  if (error) return { error: error.message }
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('activities').insert({
    project_id: opp.project_id, company_id: opp.company_id, opportunity_id: oppId,
    activity_type: 'note', direction: 'internal', channel: 'note', source: 'manual',
    occurred_at: new Date().toISOString(), created_by: user?.email ?? null,
    summary: `Deal ${input.stage === 'won' ? 'gewonnen' : 'verloren'}: ${reason.label}${competitor ? ` (${input.stage === 'won' ? 'gegen' : 'an'} ${competitor})` : ''}`,
    extracted_intel: note ? { body: note } : {},
  })
  revalidatePath('/', 'layout')
  return { error: null }
}
