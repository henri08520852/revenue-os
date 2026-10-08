import { createClient } from '@/lib/supabase/server'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export type TeamMember = { user_id: string; display_name: string; email: string | null }

// "henri.steckhan@gmail.com" → "Henri"
export function defaultDisplayName(email: string | null | undefined) {
  const local = (email || '').split('@')[0].split(/[._-]/)[0]
  return local ? local[0].toUpperCase() + local.slice(1) : 'Unbekannt'
}

export function initials(name: string | null | undefined) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

// Current user + team for the default project. Adds the user to project_members on
// first visit (migration 020), so owner pickers and the settings page know them.
export async function getTeamContext(): Promise<{ me: TeamMember | null; team: TeamMember[] }> {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !PROJECT_ID) return { me: null, team: [] }

  const { data: rows, error } = await supabase
    .from('project_members')
    .select('user_id, display_name, email')
    .eq('project_id', PROJECT_ID)
    .order('created_at', { ascending: true })

  // Table missing (migration 020 not applied) → degrade gracefully
  if (error) {
    const me = { user_id: user.id, display_name: defaultDisplayName(user.email), email: user.email ?? null }
    return { me, team: [me] }
  }

  let team: TeamMember[] = (rows || []).map((r: any) => ({
    user_id: r.user_id,
    display_name: r.display_name || defaultDisplayName(r.email),
    email: r.email,
  }))

  let me = team.find(m => m.user_id === user.id) || null
  if (!me) {
    me = { user_id: user.id, display_name: defaultDisplayName(user.email), email: user.email ?? null }
    await supabase.from('project_members').upsert(
      { project_id: PROJECT_ID, user_id: user.id, display_name: me.display_name, email: me.email },
      { onConflict: 'project_id,user_id', ignoreDuplicates: true },
    )
    team = [...team, me]
  }
  return { me, team }
}

export function memberName(team: TeamMember[], userId: string | null | undefined) {
  if (!userId) return null
  return team.find(m => m.user_id === userId)?.display_name ?? null
}
