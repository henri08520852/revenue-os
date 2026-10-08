'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { error: string | null }

export async function addCompanyNote(companyId: string, text: string): Promise<Result> {
  const summary = text.trim()
  if (!summary) return { error: 'Notiz ist leer' }
  const supabase = createClient() as any

  const { data: company, error: cErr } = await supabase
    .from('companies').select('project_id').eq('id', companyId).single()
  if (cErr || !company) return { error: cErr?.message || 'Company nicht gefunden' }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('activities').insert({
    project_id: company.project_id,
    company_id: companyId,
    activity_type: 'note',
    direction: 'internal',
    channel: 'note',
    summary,
    occurred_at: new Date().toISOString(),
    source: 'manual',
    created_by: user?.email ?? null,
  })
  if (error) return { error: error.message }
  revalidatePath(`/companies/${companyId}`)
  return { error: null }
}

// Company follow-ups live in companies.current_metrics (next_follow_up_at / follow_up_note)
async function updateFollowUp(companyId: string, patch: { next_follow_up_at: string | null; follow_up_note: string | null }): Promise<Result> {
  const supabase = createClient() as any
  const { data: company, error: cErr } = await supabase
    .from('companies').select('current_metrics').eq('id', companyId).single()
  if (cErr || !company) return { error: cErr?.message || 'Company nicht gefunden' }

  const { error } = await supabase
    .from('companies')
    .update({ current_metrics: { ...(company.current_metrics || {}), ...patch } })
    .eq('id', companyId)
  if (error) return { error: error.message }
  revalidatePath(`/companies/${companyId}`)
  revalidatePath('/today')
  return { error: null }
}

export async function setCompanyFollowUp(companyId: string, date: string, note: string): Promise<Result> {
  if (!date) return { error: 'Bitte ein Datum wählen' }
  return updateFollowUp(companyId, {
    next_follow_up_at: new Date(`${date}T09:00:00`).toISOString(),
    follow_up_note: note.trim() || null,
  })
}

export async function clearCompanyFollowUp(companyId: string): Promise<Result> {
  return updateFollowUp(companyId, { next_follow_up_at: null, follow_up_note: null })
}
