import { createClient } from '@/lib/supabase/server'
import AddContactButton from '../companies/[id]/AddContactButton'
import ContactsTable from './ContactsTable'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!

export default async function ContactsPage() {
  const supabase = createClient() as any

  const [{ data: people }, { data: companies }] = await Promise.all([
    supabase
      .from('people')
      .select('id, company_id, first_name, last_name, full_name, job_title, email, phone, linkedin_url, buyer_role, is_decision_maker, last_interaction_at, created_at, companies(id, name, account_status)')
      .eq('project_id', PROJECT_ID)
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase
      .from('companies')
      .select('id, name')
      .eq('project_id', PROJECT_ID)
      .order('name', { ascending: true }),
  ])

  const all = people || []
  const decisionMakers = all.filter((p: any) => p.is_decision_maker).length
  const champions = all.filter((p: any) => p.buyer_role === 'champion').length

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Contacts</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            {all.length} Kontakte · {champions} Champions · {decisionMakers} Entscheider
          </p>
        </div>
        <AddContactButton projectId={PROJECT_ID} companies={companies || []} variant="primary" />
      </div>

      <ContactsTable people={all} />
    </div>
  )
}
