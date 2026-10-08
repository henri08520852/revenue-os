import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DealEditor from './DealEditor'
import { ACTIVE_OPPORTUNITY_STAGES, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS, ACCOUNT_STATUSES } from '@/lib/stages'
import DealContacts from './DealContacts'
import DealOwner from './DealOwner'
import { getTeamContext } from '@/lib/team'
import { getMeetingData } from '@/lib/meetingData'
import { loadTimeline, loadUpcoming } from '@/lib/records'
import { RecordLayout, Card, Empty, UpcomingList, AssocRow } from '@/components/record/Layout'
import Timeline from '@/components/record/Timeline'
import AiAssistant from '@/components/record/AiAssistant'
import QuickActions from '@/components/record/QuickActions'
import TaskList from '@/components/TaskList'
import QualificationCard from '@/components/QualificationCard'
import { closeReasonLabel } from '@/lib/dealMeta'
import { loadTasks } from '@/lib/tasks'

type Stage = typeof OPPORTUNITY_STAGES[number]
const STAGE_LABELS = OPPORTUNITY_STAGE_LABELS
const STAGE_COLORS: Record<Stage, { bg: string; fg: string }> = {
  discovery:     { bg: '#f3f4f6', fg: '#4b5563' },
  erstgespraech: { bg: '#e0e7ff', fg: '#4338ca' },
  evaluation:    { bg: '#dbeafe', fg: '#1d4ed8' },
  proposal:      { bg: '#fef9c3', fg: '#a16207' },
  negotiation:   { bg: '#ffedd5', fg: '#c2410c' },
  won:           { bg: '#dcfce7', fg: '#15803d' },
  lost:          { bg: '#f3f4f6', fg: '#6b7280' },
}
const LEAD_STAGES: Record<string, string> = { outreach: 'Outreach', contacted: 'Kontaktiert', qualified: 'Qualifiziert', converted: 'Umgewandelt', disqualified: 'Disqualifiziert' }
const fmtDate = (iso: string, o: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: '2-digit' }) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', ...o })

export default async function DealPage({ params }: { params: { id: string } }) {
  const supabase = createClient() as any

  const { data: opp } = await supabase
    .from('opportunities')
    .select('*, companies(id, name, domain, account_status, account_score, signal_score)')
    .eq('id', params.id)
    .single()
  if (!opp) notFound()

  const company = opp.companies
  const stage = opp.stage as Stage
  // Prev/next walk the open stages only; won/lost have their own buttons in DealEditor
  const activeIdx = ACTIVE_OPPORTUNITY_STAGES.indexOf(stage)
  const prevStage = activeIdx > 0 ? ACTIVE_OPPORTUNITY_STAGES[activeIdx - 1] : null
  const nextStage = activeIdx >= 0 && activeIdx < ACTIVE_OPPORTUNITY_STAGES.length - 1 ? ACTIVE_OPPORTUNITY_STAGES[activeIdx + 1] : null

  const [{ team }, meetingData, timeline, upcoming, { data: contacts }, { data: companyPeople }, { data: leads }, tasks] = await Promise.all([
    getTeamContext(),
    getMeetingData(),
    loadTimeline({ opportunityId: opp.id, dealCompanyId: company?.id ?? null }),
    loadUpcoming({ opportunityId: opp.id, companyId: company?.id ?? null }),
    supabase.from('opportunity_contacts')
      .select('id, role, created_at, person:people(id, full_name, first_name, last_name, job_title, email)')
      .eq('opportunity_id', opp.id)
      .order('created_at', { ascending: true }),
    company?.id
      ? supabase.from('people').select('id, full_name, first_name, last_name, job_title, email').eq('company_id', company.id).order('last_name', { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase.from('leads').select('id, name, stage, converted_at').eq('converted_to_opportunity_id', opp.id),
    loadTasks({ opportunityId: params.id }),
  ])

  const personLabel = (p: any) => p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unbenannt'
  const status = ACCOUNT_STATUSES.find(s => s.key === company?.account_status)
  const sc = STAGE_COLORS[stage] ?? STAGE_COLORS.discovery

  return (
    <RecordLayout
      breadcrumb={[{ label: 'Pipeline', href: '/pipeline?show=deals' }, ...(company ? [{ label: company.name, href: `/companies/${company.id}` }] : []), { label: opp.name || 'Deal' }]}
      left={<>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>{opp.name || company?.name || 'Deal'}</h1>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: sc.bg, color: sc.fg }}>{STAGE_LABELS[stage]}</span>
          </div>
          {company && <Link href={`/companies/${company.id}`} style={{ display: 'inline-block', marginTop: 4, fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>{company.name}</Link>}
          {opp.value_eur ? <p style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginTop: 10 }}>{Number(opp.value_eur).toLocaleString('de-DE')} €</p> : null}
          {(stage === 'won' || stage === 'lost') && (opp.close_reason || opp.close_note) && (
            <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, background: stage === 'won' ? '#f0fdf4' : '#f9fafb', border: `1px solid ${stage === 'won' ? '#bbf7d0' : '#e5e7eb'}` }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: stage === 'won' ? '#15803d' : '#374151' }}>
                {stage === 'won' ? 'Gewonnen' : 'Verloren'}: {closeReasonLabel(stage, opp.close_reason) ?? '—'}{opp.close_competitor ? ` · ${stage === 'won' ? 'gegen' : 'an'} ${opp.close_competitor}` : ''}
              </p>
              {opp.close_note && <p style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>{opp.close_note}</p>}
            </div>
          )}
          <div style={{ marginTop: 8 }}><DealOwner oppId={opp.id} ownerId={opp.owner_id ?? null} team={team} /></div>
          <div style={{ marginTop: 14 }}>
            <QuickActions
              target={{ companyId: company?.id ?? null, personId: null, opportunityId: opp.id }}
              contacts={(companyPeople || []).map((p: any) => ({ id: p.id, label: personLabel(p) }))}
              meeting={meetingData}
              taskData={meetingData}
              taskLink={{ opportunityId: opp.id, companyId: company?.id ?? null }}
              meetingPrefill={{
                companyId: company?.id ?? null,
                opportunityId: opp.id,
                title: `${company?.name ?? opp.name ?? 'Meeting'} × Altoris`,
                attendeeEmails: (contacts || []).map((c: any) => c.person?.email).filter(Boolean).map((e: string) => e.toLowerCase()),
              }}
            />
          </div>
        </Card>
        <Card title="Deal bearbeiten">
          <DealEditor
            oppId={opp.id}
            initialValue={opp.value_eur || null}
            initialName={opp.name || null}
            currentStage={stage}
            prevStage={prevStage}
            nextStage={nextStage}
            stageLabels={STAGE_LABELS}
          />
        </Card>
        {opp.qualification && Object.keys(opp.qualification).length > 0 && (
          <Card title="Qualifizierung (aus Lead)">
            <QualificationCard kind="deal" id={opp.id} initial={opp.qualification} readOnly />
          </Card>
        )}
        {opp.notes && (
          <Card title="Ursprüngliche Notiz">
            <p style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{opp.notes}</p>
          </Card>
        )}
      </>}
      center={<>
        <AiAssistant target={{ kind: 'deal', id: opp.id }} title={opp.name || company?.name || 'diesem Deal'} />
        <Card title="Anstehend" count={tasks.length + upcoming.length}>
          <TaskList tasks={tasks} data={meetingData} link={{ opportunityId: opp.id, companyId: company?.id ?? null }} hideLinks={['deal', 'company']} />
          {upcoming.length > 0 && <div style={{ marginTop: 12 }}><p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Termine</p><UpcomingList items={upcoming} /></div>}
        </Card>
        <Card title="Aktivitäten" count={timeline.length}>
          <Timeline items={timeline} context={{ companyId: company?.id ?? null, opportunityId: opp.id }} hideDeal />
        </Card>
      </>}
      right={<>
        <Card title="Company">
          {company
            ? <AssocRow href={`/companies/${company.id}`} title={company.name} sub={company.domain} badge={status?.label} badgeColor={status ? { bg: status.bg, fg: status.text } : undefined} />
            : <Empty text="Keine Company" />}
        </Card>
        <DealContacts oppId={opp.id} companyId={company?.id ?? null} contacts={contacts || []} companyPeople={companyPeople || []} />
        <Card title="Herkunft">
          {(leads || []).length
            ? (leads || []).map((l: any) => (
              <AssocRow key={l.id} href={`/pipeline?focus=${l.id}`} title={l.name || company?.name || 'Lead'} sub={l.converted_at ? `umgewandelt am ${fmtDate(l.converted_at)}` : null} badge={LEAD_STAGES[l.stage] ?? l.stage} badgeColor={{ bg: '#ede9fe', fg: '#6d28d9' }} />
            ))
            : <Empty text="Direkt als Deal angelegt" />}
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Erstellt: {fmtDate(opp.created_at)}</span>
            {(opp.won_at || opp.lost_at) && <span>Abgeschlossen: {fmtDate(opp.won_at || opp.lost_at)}</span>}
          </div>
        </Card>
      </>}
    />
  )
}
