import { createClient } from '@/lib/supabase/server'
import LeadBoard from './LeadBoard'
import AddLeadButton from './AddLeadButton'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export default async function LeadsPage({ searchParams }: { searchParams: { focus?: string } }) {
  const supabase = createClient() as any

  const [{ data: leads }, { data: companies }, { data: people }] = await Promise.all([
    supabase
      .from('leads')
      .select('*, company:companies(id, name, domain), person:people(id, full_name, first_name, last_name, job_title)')
      .eq('project_id', PROJECT_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('companies')
      .select('id, name')
      .eq('project_id', PROJECT_ID)
      .order('name', { ascending: true }),
    supabase
      .from('people')
      .select('id, company_id, full_name, first_name, last_name, job_title')
      .eq('project_id', PROJECT_ID)
      .order('last_name', { ascending: true }),
  ])

  const allLeads = leads || []
  const open = allLeads.filter((l: any) => !['converted', 'disqualified'].includes(l.stage)).length
  const converted = allLeads.filter((l: any) => l.stage === 'converted').length

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Leads</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            {open} offen · {converted} in Deals umgewandelt
          </p>
        </div>
        <AddLeadButton companies={companies || []} people={people || []} />
      </div>

      <LeadBoard leads={allLeads} focusId={searchParams.focus ?? null} />
    </div>
  )
}
