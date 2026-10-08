import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { loadTimeline, loadUpcoming } from '@/lib/records'
import { getMeetingData } from '@/lib/meetingData'
import { ACCOUNT_STATUSES, OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'
import { RecordLayout, Card, Empty, UpcomingList, AssocRow } from '@/components/record/Layout'
import Timeline from '@/components/record/Timeline'
import QuickActions from '@/components/record/QuickActions'
import Properties from '@/components/record/Properties'
import TaskList from '@/components/TaskList'
import { loadTasks } from '@/lib/tasks'
import { CreateButton } from '@/components/CreateRecord'

const BUYER_ROLES = [
  { value: 'champion', label: '⭐ Champion' },
  { value: 'economic_buyer', label: '💰 Budget-Entscheider' },
  { value: 'influencer', label: '💡 Influencer' },
  { value: 'user', label: '👤 Nutzer' },
  { value: 'blocker', label: '🚧 Blocker' },
]
const DEAL_ROLES: Record<string, string> = { champion: '⭐ Champion', decision_maker: '🎯 Decision Maker', economic_buyer: '💰 Economic Buyer', stakeholder: '👥 Stakeholder', primary: 'Primary', blocker: '🚧 Blocker' }
const LEAD_STAGES: Record<string, string> = { outreach: 'Outreach', contacted: 'Kontaktiert', qualified: 'Qualifiziert', converted: 'Umgewandelt', disqualified: 'Disqualifiziert' }

export default async function ContactPage({ params }: { params: { id: string } }) {
  const supabase = createClient() as any
  const { data: person } = await supabase
    .from('people')
    .select('*, company:companies(id, name, domain, account_status)')
    .eq('id', params.id)
    .single()
  if (!person) notFound()

  const name = person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email || 'Unbenannt'
  const initials = name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()

  const [tasks, timeline, upcoming, meeting, { data: dealLinks }, { data: leads }, { data: companies }] = await Promise.all([
    loadTasks({ personId: person.id }),
    loadTimeline({ personId: person.id }),
    loadUpcoming({ personId: person.id, personEmail: person.email }),
    getMeetingData(),
    supabase.from('opportunity_contacts').select('role, deal:opportunities(id, name, stage, value_eur)').eq('person_id', person.id),
    supabase.from('leads').select('id, name, stage, next_follow_up_at').eq('person_id', person.id).order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').eq('project_id', person.project_id).order('name'),
  ])

  const deals = (dealLinks || []).filter((l: any) => l.deal)
  const status = ACCOUNT_STATUSES.find(s => s.key === person.company?.account_status)
  const openDeals = deals.filter((l: any) => !['won', 'lost'].includes(l.deal.stage))

  return (
    <RecordLayout
      breadcrumb={[{ label: 'Contacts', href: '/contacts' }, { label: name }]}
      left={<>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{name}</h1>
              {person.job_title && <p style={{ fontSize: 13, color: '#6b7280' }}>{person.job_title}</p>}
              {person.company && <Link href={`/companies/${person.company.id}`} style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>{person.company.name}</Link>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {person.email && <a href={`mailto:${person.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>✉ {person.email}</a>}
            {person.phone && <a href={`tel:${String(person.phone).replace(/\s/g, '')}`} style={{ color: '#2563eb', textDecoration: 'none' }}>📞 {person.phone}</a>}
            {person.linkedin_url && <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>LinkedIn ↗</a>}
          </div>
          <div style={{ marginTop: 14 }}>
            <QuickActions
              target={{ companyId: person.company_id, personId: person.id, opportunityId: null }}
              deals={deals.map((l: any) => ({ id: l.deal.id, label: l.deal.name || 'Deal' }))}
              meeting={meeting}
              taskData={meeting}
              taskLink={{ personId: person.id, companyId: person.company_id }}
              meetingPrefill={{ companyId: person.company_id, opportunityId: openDeals[0]?.deal.id ?? null, attendeeEmails: person.email ? [String(person.email).toLowerCase()] : [], title: person.company ? `${person.company.name} × Altoris` : `${name} × Altoris` }}
            />
          </div>
        </Card>
        <Card>
          <Properties kind="contact" id={person.id} fields={[
            { key: 'first_name', label: 'Vorname', value: person.first_name },
            { key: 'last_name', label: 'Nachname', value: person.last_name },
            { key: 'job_title', label: 'Position', value: person.job_title },
            { key: 'email', label: 'E-Mail', value: person.email, type: 'email', link: person.email ? `mailto:${person.email}` : null },
            { key: 'phone', label: 'Telefon', value: person.phone, type: 'tel', link: person.phone ? `tel:${String(person.phone).replace(/\s/g, '')}` : null },
            { key: 'linkedin_url', label: 'LinkedIn', value: person.linkedin_url, type: 'url', link: person.linkedin_url },
            { key: 'company_id', label: 'Company', value: person.company_id, type: 'select', options: (companies || []).map((c: any) => ({ value: c.id, label: c.name })), display: person.company?.name ?? (person.company_id ? 'Unbekannt' : null) },
            { key: 'buyer_role', label: 'Rolle', value: person.buyer_role, type: 'select', options: BUYER_ROLES, display: BUYER_ROLES.find(r => r.value === person.buyer_role)?.label ?? null },
            { key: 'is_decision_maker', label: 'Entscheider', value: !!person.is_decision_maker, type: 'checkbox' },
            { key: 'notes', label: 'Hintergrund', value: person.notes, type: 'textarea' },
          ]} />
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 14 }}>
            Letzter Kontakt: {person.last_interaction_at ? new Date(person.last_interaction_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
          </p>
        </Card>
      </>}
      center={<>
        <Card title="Anstehend" count={tasks.length + upcoming.length}>
          <TaskList tasks={tasks} data={meeting} link={{ personId: person.id, companyId: person.company_id }} hideLinks={['person']} />
          {upcoming.length > 0 && <div style={{ marginTop: 12 }}><p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Termine</p><UpcomingList items={upcoming} /></div>}
        </Card>
        <Card title="Aktivitäten" count={timeline.length}>
          <Timeline items={timeline} context={{ companyId: person.company_id, personId: person.id }} hidePerson />
        </Card>
      </>}
      right={<>
        <Card title="Company">
          {person.company
            ? <AssocRow href={`/companies/${person.company.id}`} title={person.company.name} sub={person.company.domain} badge={status?.label} badgeColor={status ? { bg: status.bg, fg: status.text } : undefined} />
            : <Empty text="Keiner Company zugeordnet – unter „Bearbeiten“ wählen." />}
        </Card>
        <Card title="Deals" count={deals.length} action={<CreateButton kind="deal" preset={{ companyId: person.company_id, personId: person.id }} />}>
          {deals.length ? deals.map((l: any) => (
            <AssocRow key={l.deal.id} href={`/opportunities/${l.deal.id}`} title={l.deal.name || 'Deal'}
              sub={[DEAL_ROLES[l.role] ?? l.role, l.deal.value_eur ? `${Number(l.deal.value_eur).toLocaleString('de-DE')} €` : null].filter(Boolean).join(' · ')}
              badge={(OPPORTUNITY_STAGE_LABELS as Record<string, string>)[l.deal.stage] ?? l.deal.stage}
              badgeColor={l.deal.stage === 'won' ? { bg: '#dcfce7', fg: '#166534' } : l.deal.stage === 'lost' ? { bg: '#f3f4f6', fg: '#6b7280' } : { bg: '#dbeafe', fg: '#1d4ed8' }} />
          )) : <Empty text="In keinem Deal." />}
        </Card>
        <Card title="Leads" count={(leads || []).length} action={<CreateButton kind="lead" preset={{ companyId: person.company_id, personId: person.id }} />}>
          {(leads || []).length ? (leads || []).map((l: any) => (
            <AssocRow key={l.id} href={`/pipeline?focus=${l.id}`} title={l.name || person.company?.name || 'Lead'}
              sub={l.next_follow_up_at ? `Follow-up ${new Date(l.next_follow_up_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })}` : null}
              badge={LEAD_STAGES[l.stage] ?? l.stage} badgeColor={{ bg: '#ede9fe', fg: '#6d28d9' }} />
          )) : <Empty text="Kein Lead mit diesem Kontakt." />}
        </Card>
      </>}
    />
  )
}
