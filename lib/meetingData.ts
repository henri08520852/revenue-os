import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canWriteCalendar } from '@/lib/google/oauth'
import { getTeamContext } from '@/lib/team'
import type { MeetingData } from '@/components/MeetingDialog'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

// Everything the meeting dialog needs (company/contact/deal pickers, team, write access)
export async function getMeetingData(): Promise<MeetingData & { leads: { id: string; label: string }[] }> {
  const supabase = createClient() as any
  const { me, team } = await getTeamContext()

  const [{ data: companies }, { data: people }, { data: deals }, { data: leads }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('project_id', PROJECT_ID).order('name'),
    supabase.from('people').select('id, company_id, full_name, first_name, last_name, email, job_title').eq('project_id', PROJECT_ID),
    supabase.from('opportunities').select('id, name, company_id, companies(name)').eq('project_id', PROJECT_ID).not('stage', 'in', '(won,lost)'),
    supabase.from('leads').select('id, name, company:companies(name)').eq('project_id', PROJECT_ID).not('stage', 'in', '(converted,disqualified)'),
  ])

  let canCreate = false
  if (me) {
    try {
      const { data: conn } = await createServiceClient()
        .from('google_connections').select('scopes').eq('user_id', me.user_id).maybeSingle()
      canCreate = canWriteCalendar(conn?.scopes)
    } catch { /* service key missing → feature off */ }
  }

  return {
    companies: companies || [],
    people: (people || []).map((p: any) => ({
      id: p.id, company_id: p.company_id, email: p.email ? String(p.email).toLowerCase() : null, job_title: p.job_title,
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unbenannt',
    })),
    deals: (deals || []).map((d: any) => ({ id: d.id, company_id: d.company_id, name: d.name || d.companies?.name || 'Deal' })),
    leads: (leads || []).map((l: any) => ({ id: l.id, label: [l.company?.name, l.name].filter(Boolean).join(' · ') || 'Lead' })),
    team: team.map(m => ({ user_id: m.user_id, display_name: m.display_name, email: m.email })),
    meId: me?.user_id ?? null,
    canCreate,
  }
}
