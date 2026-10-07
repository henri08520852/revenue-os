'use server'
import { createClient } from '@/lib/supabase/server'

export async function updateOpportunityStage(oppId: string, newStage: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('opportunities')
    .update({ stage: newStage })
    .eq('id', oppId)
  if (error) throw new Error(error.message)
}
