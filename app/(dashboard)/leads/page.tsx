import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LeadBoard from './LeadBoard'
import AddLeadButton from './AddLeadButton'
import { getTeamContext } from '@/lib/team'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export default async function LeadsPage({ searchParams }: { searchParams: { focus?: string; owner?: string } }) {
  const supabase = createClient() as any
  const { me, team } = await getTeamContext()
  // ?owner=me | <user id> | (none = all)
  const ownerFilter = searchParams.owner === 'me' ? me?.user_id : searchParams.owner

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

  const allLeads = (leads || []).filter((l: any) => !ownerFilter || l.owner_id === ownerFilter)
  const open = allLeads.filter((l: any) => !['converted', 'disqualified'].includes(l.stage)).length
  const converted = allLeads.filter((l: any) => l.stage === 'converted').length

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Leads</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            {open} offen · {converted} in Deals umgewandelt ·{' '}
            <Link href="/guide#leads" style={{ color: '#2563eb', textDecoration: 'none' }}>Wie funktionieren Leads?</Link>
          </p>
        </div>
        <AddLeadButton companies={companies || []} people={people || []} team={team} currentUserId={me?.user_id ?? null} />
      </div>

      {team.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[{ key: '', label: 'Alle' }, ...(me ? [{ key: 'me', label: 'Meine' }] : []), ...team.filter(m => m.user_id !== me?.user_id).map(m => ({ key: m.user_id, label: m.display_name }))].map(f => {
            const active = (searchParams.owner ?? '') === f.key
            return (
              <Link key={f.key || 'all'} href={f.key ? `/leads?owner=${f.key}` : '/leads'} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, textDecoration: 'none', background: active ? '#2563eb' : '#f3f4f6', color: active ? '#fff' : '#374151' }}>
                {f.label}
              </Link>
            )
          })}
        </div>
      )}

      <LeadBoard leads={allLeads} focusId={searchParams.focus ?? null} team={team} />
    </div>
  )
}
