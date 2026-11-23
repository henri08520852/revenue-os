import { createClient } from '@/lib/supabase/server'
import { loadSettings } from '@/lib/agents/registry'
import Composer, { ContactOption, SentRow } from './Composer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // one AI draft

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!

export default async function ComposePage({ searchParams }: { searchParams: { person?: string } }) {
  const supabase = createClient() as any
  const [{ data: people }, { data: sent }, settings] = await Promise.all([
    supabase.from('people').select('id, full_name, job_title, persona, persona_source, linkedin_url, company_id, companies(name)')
      .eq('project_id', PROJECT_ID).order('updated_at', { ascending: false }).limit(800),
    supabase.from('automation_items').select('id, title, body, data, decided_at, person_id, lead_id, leads(stage, replied_at)')
      .eq('project_id', PROJECT_ID).eq('agent_key', 'first_message').eq('status', 'approved').order('decided_at', { ascending: false }).limit(40),
    loadSettings(supabase, PROJECT_ID),
  ])
  const contacts: ContactOption[] = (people || []).map((p: any) => ({
    id: p.id, name: p.full_name || 'Ohne Namen', title: p.job_title, company: p.companies?.name ?? null,
    persona: p.persona_source === 'manual' ? p.persona : null, linkedin: p.linkedin_url,
  }))
  return (
    <Composer
      contacts={contacts}
      sent={(sent || []) as SentRow[]}
      preselect={searchParams.person ?? null}
      baseTexts={settings.first_message.config.useBaseText ? settings.first_message.config.baseTexts : null}
      industries={settings.first_message.config.industries.filter(i => i.active).map(i => ({ key: i.key, label: i.label }))}
    />
  )
}
