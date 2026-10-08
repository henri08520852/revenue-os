'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateOpportunityStage(oppId: string, newStage: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('opportunities')
    .update({ stage: newStage })
    .eq('id', oppId)
  if (error) throw new Error(error.message)
  // company status is derived from deal stages (migration 019)
  revalidatePath('/companies', 'layout')
}
