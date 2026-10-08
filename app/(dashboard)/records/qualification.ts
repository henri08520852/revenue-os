'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { cleanQualification, qualiScore, QUALI_CRITERIA } from '@/lib/dealMeta'

// Saves the qualification checklist of a lead or a deal (migration 025)
export async function saveQualification(kind: 'lead' | 'deal', id: string, value: unknown): Promise<{ error: string | null }> {
  const supabase = createClient() as any
  const table = kind === 'lead' ? 'leads' : 'opportunities'
  const q = cleanQualification(value)
  const { error } = await supabase.from(table).update({ qualification: q }).eq('id', id)
  if (error) return { error: error.message }
  // All criteria confirmed → the lead is qualified (ready to become a deal)
  if (kind === 'lead' && qualiScore(q) === QUALI_CRITERIA.length) {
    await supabase.from('leads').update({ stage: 'qualified' }).eq('id', id).in('stage', ['outreach', 'contacted'])
  }
  revalidatePath('/', 'layout')
  return { error: null }
}
