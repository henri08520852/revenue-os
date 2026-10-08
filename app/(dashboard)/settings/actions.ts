'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export async function updateMyDisplayName(name: string): Promise<{ error: string | null }> {
  const display_name = name.trim()
  if (!display_name) return { error: 'Name darf nicht leer sein' }
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('project_members')
    .update({ display_name })
    .eq('project_id', PROJECT_ID)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { error: null }
}
