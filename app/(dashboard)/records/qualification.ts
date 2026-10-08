'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { cleanQualification } from '@/lib/dealMeta'

// Saves the qualification checklist of a lead or a deal (migration 025)
export async function saveQualification(kind: 'lead' | 'deal', id: string, value: unknown): Promise<{ error: string | null }> {
  const supabase = createClient() as any
  const table = kind === 'lead' ? 'leads' : 'opportunities'
  const { error } = await supabase.from(table).update({ qualification: cleanQualification(value) }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { error: null }
}
