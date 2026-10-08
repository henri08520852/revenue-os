'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { error: string | null }

// Company follow-ups live in companies.current_metrics (next_follow_up_at / follow_up_note)
async function updateFollowUp(companyId: string, patch: { next_follow_up_at: string | null; follow_up_note: string | null; follow_up_owner_id?: string | null }): Promise<Result> {
  const supabase = createClient() as any
  if (patch.next_follow_up_at) {
    const { data: { user } } = await supabase.auth.getUser()
    patch.follow_up_owner_id = user?.id ?? null
  } else {
    patch.follow_up_owner_id = null
  }
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
