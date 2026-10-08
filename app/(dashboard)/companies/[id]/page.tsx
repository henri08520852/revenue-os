import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StatusBadge from './StatusBadge'
import LogActivityButton from './LogActivityButton'
import AddContactButton from './AddContactButton'
import AddDealButton from './AddDealButton'
import QuickNoteButton from './QuickNoteButton'
import FollowUpButton from './FollowUpButton'
import AddLeadButton from '../../leads/AddLeadButton'
import { OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'
import { getTeamContext } from '@/lib/team'
import { getMeetingData } from '@/lib/meetingData'
import { MeetingButton } from '@/components/MeetingDialog'

const SIGNAL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  news_funding:    { label: 'Funding',            icon: '💰', color: '#10b981' },
  news_leadership: { label: 'Leadership',          icon: '👔', color: '#6366f1' },
  news_press:      { label: 'Presseartikel',       icon: '📰', color: '#64748b' },
  news_expansion:  { label: 'Expansion',           icon: '🚀', color: '#f59e0b' },
  news_product:    { label: 'Neues Produkt',       icon: '✨', color: '#8b5cf6' },
  job_posting:     { label: 'Stellenanzeige',      icon: '💼', color: '#0ea5e9' },
  job_growth:      { label: 'Hiring-Signal',       icon: '📈', color: '#22c55e' },
  tech_change:     { label: 'Tech-Wechsel',        icon: '⚙️', color: '#ef4444' },
  funding_round:   { label: 'Finanzierungsrunde',  icon: '💵', color: '#10b981' },
}

const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', linkedin: '💼', meeting: '🤝', note: '📝',
}

const LEAD_STAGE_LABELS: Record<string, string> = {
  outreach: 'Outreach', contacted: 'Kontaktiert', qualified: 'Qualifiziert',
  converted: 'Umgewandelt', disqualified: 'Disqualifiziert',
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })

const BUYER_ROLE_LABELS: Record<string, string> = {
  economic_buyer: '💰 Budget', champion: '⭐ Champion',
  influencer: '💡 Influencer', user: '👤 Nutzer', blocker: '🚧 Blocker',
}

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [companyRes, signalsRes, jobsRes, actionsRes, activitiesRes, peopleRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', params.id).single(),
    supabase.from('signals').select('*').eq('company_id', params.id).eq('status', 'active').order('strength', { ascending: false }),
    supabase.from('jobs').select('*').eq('company_id', params.id).eq('status', 'active').order('first_seen_at', { ascending: false }).limit(30),
    supabase.from('actions').select('*').eq('company_id', params.id).in('status', ['pending', 'done']).order('generated_at', { ascending: false }).limit(10),
    supabase.from('activities').select('*, people(first_name, last_name)').eq('company_id', params.id).order('occurred_at', { ascending: false }).limit(20),
    supabase.from('people').select('*').eq('company_id', params.id).order('created_at', { ascending: false }),
  ])

  const db = supabase as any
  const { me, team } = await getTeamContext()
  const meetingData = await getMeetingData()
  const [{ data: leadsData }, { data: dealsData }] = await Promise.all([
    db.from('leads').select('id, name, stage, next_follow_up_at, converted_to_opportunity_id').eq('company_id', params.id).order('created_at', { ascending: false }),
    db.from('opportunities').select('id, name, stage, value_eur, next_step, next_step_due_at').eq('company_id', params.id).order('created_at', { ascending: false }),
  ])
  // Converted leads are represented by their deal
  const leads = (leadsData || []).filter((l: any) => l.stage !== 'converted')
  const deals = dealsData || []

  if (companyRes.error || !companyRes.data) notFound()

  const company = companyRes.data
  const projectId = ((company as any).project_id || process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID) as string
  const signals = signalsRes.data || []
  const jobs = jobsRes.data || []
  const actions = actionsRes.data || []
  const activities = activitiesRes.data || []
  const people = peopleRes.data || []
  const metrics = (company.current_metrics as any) || {}
  const linkedinSearchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company.name)}`
  const scoreColor = (v: number) => v >= 70 ? '#16a34a' : v >= 40 ? '#d97706' : '#9ca3af'

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
        <Link href="/companies" style={{ color: '#9ca3af', textDecoration: 'none' }}>Companies</Link>
        <span>›</span>
        <span style={{ color: '#374151' }}>{company.name}</span>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>{company.name}</h1>
              <StatusBadge status={company.account_status} companyId={company.id} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              <a href={`https://${company.domain}`} target="_blank" rel="noopener" style={{ fontSize: 13, color: '#9ca3af', textDecoration: 'none' }}>{company.domain} ↗</a>
              <a href={linkedinSearchUrl} target="_blank" rel="noopener" style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>LinkedIn ↗</a>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {[
              { label: 'Account', value: company.account_score || 0 },
              { label: 'ICP',     value: company.icp_score || 0 },
              { label: 'Signale', value: company.signal_score || 0 },
            ].map(s => (
              <div key={s.label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 72 }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: scoreColor(s.value), margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        {projectId && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <AddLeadButton
              companies={[{ id: company.id, name: company.name }]}
              people={people.map((p: any) => ({ id: p.id, company_id: p.company_id, full_name: p.full_name, first_name: p.first_name, last_name: p.last_name, job_title: p.job_title }))}
              fixedCompanyId={company.id}
              variant="secondary"
              team={team}
              currentUserId={me?.user_id ?? null}
            />
            <AddDealButton companyId={company.id} companyName={company.name} projectId={projectId} team={team} currentUserId={me?.user_id ?? null} />
            <MeetingButton data={meetingData} prefill={{ companyId: company.id, opportunityId: deals.find((d: any) => !['won', 'lost'].includes(d.stage))?.id ?? null }} />
            <span style={{ width: 1, height: 24, background: '#e5e7eb', margin: '0 4px' }} />
            <AddContactButton companyId={company.id} projectId={projectId} />
            <LogActivityButton companyId={company.id} projectId={projectId} />
            <QuickNoteButton companyId={company.id} projectId={projectId} />
            <FollowUpButton companyId={company.id} projectId={projectId} currentFollowUp={(metrics.next_follow_up_at as string) || null} />
          </div>
          {metrics.next_follow_up_at && metrics.follow_up_note && (
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>⏰ Erinnerung: {metrics.follow_up_note}</p>
          )}
        </>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Kontakte" count={people.length}>
            {people.length === 0 ? <EmptyState text="Noch keine Kontakte" /> : people.map((person: any) => (
              <div key={person.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>
                    {person.first_name?.[0]}{person.last_name?.[0]}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>
                      {person.first_name} {person.last_name}
                      {person.is_decision_maker && <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706' }}>★ DM</span>}
                    </p>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: '1px 0 0' }}>{person.job_title || '—'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {person.buyer_role && <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>{BUYER_ROLE_LABELS[person.buyer_role] || person.buyer_role}</span>}
                  {person.linkedin_url && <a href={person.linkedin_url} target="_blank" rel="noopener" style={{ fontSize: 12, color: '#3b82f6' }}>Li ↗</a>}
                  {person.email && <a href={`mailto:${person.email}`} style={{ fontSize: 13, color: '#9ca3af' }}>✉</a>}
                </div>
              </div>
            ))}
          </Card>

          <Card title="Aktive Signale" count={signals.length}>
            {signals.length === 0 ? <EmptyState text="Keine aktiven Signale" /> : signals.map((sig: any) => {
              const meta = SIGNAL_LABELS[sig.signal_type] || { label: sig.signal_type.replace(/_/g, ' '), icon: '📡', color: '#6b7280' }
              return (
                <div key={sig.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 8, border: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{meta.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{meta.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 80, height: 5, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: meta.color, borderRadius: 4, width: `${sig.strength}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 24, textAlign: 'right' }}>{sig.strength}</span>
                    </div>
                  </div>
                  {sig.reason && <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sig.reason}</p>}
                </div>
              )
            })}
          </Card>

          <Card title="Aktivitäten" count={activities.length}>
            {activities.length === 0 ? <EmptyState text="Noch keine Aktivitäten" /> : activities.map((act: any) => (
              <div key={act.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{ACTIVITY_ICONS[act.activity_type] || '•'}</span>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 40, flexShrink: 0, marginTop: 2 }}>
                  {new Date(act.occurred_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{act.summary || act.activity_type}</p>
                  {act.outcome && <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>→ {act.outcome}</p>}
                  {act.next_step_detected && <p style={{ fontSize: 12, color: '#3b82f6', margin: '2px 0 0' }}>📌 {act.next_step_detected}</p>}
                  {act.people && <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>mit {act.people.first_name} {act.people.last_name}</p>}
                </div>
              </div>
            ))}
          </Card>

          <Card title="Offene Stellen" count={jobs.length}>
            {jobs.length === 0 ? <EmptyState text="Keine Jobs gefunden" /> : jobs.map((job: any) => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div>
                  <p style={{ fontSize: 13, color: '#111827', fontWeight: 500, margin: 0 }}>{job.title}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>{job.location || '—'} · {job.role_category}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {job.source_url && <a href={job.source_url} target="_blank" rel="noopener" style={{ fontSize: 12, color: '#0ea5e9' }}>↗</a>}
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{job.days_open}d</p>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>Vertrieb</p>
            {leads.length === 0 && deals.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                Noch kein Lead oder Deal. Starte mit <b style={{ color: '#1d4ed8' }}>+ Lead</b>, sobald du die Company ansprichst.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deals.map((d: any) => {
                  const closed = d.stage === 'won' || d.stage === 'lost'
                  return (
                    <Link key={d.id} href={`/opportunities/${d.id}`} style={{ display: 'block', padding: '10px 12px', borderRadius: 10, textDecoration: 'none', background: d.stage === 'won' ? '#f0fdf4' : closed ? '#f9fafb' : '#eff6ff', border: '1px solid ' + (d.stage === 'won' ? '#bbf7d0' : closed ? '#f3f4f6' : '#bfdbfe') }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>DEAL</span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{(OPPORTUNITY_STAGE_LABELS as Record<string, string>)[d.stage] || d.stage}</span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '2px 0 0' }}>{d.name || 'Deal'}</p>
                      {d.value_eur ? <p style={{ fontSize: 12, color: '#374151', margin: '2px 0 0' }}>{Number(d.value_eur).toLocaleString('de-DE')} €</p> : null}
                      {!closed && d.next_step && (
                        <p style={{ fontSize: 11, color: '#1d4ed8', margin: '4px 0 0' }}>→ {d.next_step}{d.next_step_due_at ? ` · ${fmtDate(d.next_step_due_at)}` : ''}</p>
                      )}
                    </Link>
                  )
                })}
                {leads.map((l: any) => (
                  <Link key={l.id} href={`/leads?focus=${l.id}`} style={{ display: 'block', padding: '10px 12px', borderRadius: 10, textDecoration: 'none', background: l.stage === 'disqualified' ? '#f9fafb' : '#f5f3ff', border: '1px solid ' + (l.stage === 'disqualified' ? '#f3f4f6' : '#ddd6fe') }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>LEAD</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{LEAD_STAGE_LABELS[l.stage] || l.stage}</span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '2px 0 0' }}>{l.name || company.name}</p>
                    {l.next_follow_up_at && l.stage !== 'disqualified' && (
                      <p style={{ fontSize: 11, color: '#6d28d9', margin: '4px 0 0' }}>Follow-up · {fmtDate(l.next_follow_up_at)}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>Job-Metriken</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Gesamt offen', value: metrics.open_jobs ?? '—' },
                { label: 'Commercial',   value: metrics.commercial_jobs ?? 0 },
                { label: 'Recruiter',    value: metrics.recruiter_jobs ?? 0 },
                { label: 'Engineering',  value: metrics.engineering_jobs ?? 0 },
                { label: 'Leadership',   value: metrics.leadership_jobs ?? 0 },
                ...(metrics.ats_type ? [{ label: 'ATS', value: metrics.ats_type }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>{row.label}</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{String(row.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>Actions</p>
            {actions.length === 0
              ? <p style={{ fontSize: 12, color: '#9ca3af' }}>Keine ausstehenden Actions</p>
              : actions.map((action: any) => (
                <div key={action.id} style={{ fontSize: 12, borderRadius: 8, padding: '8px 10px', marginBottom: 6, background: action.status === 'done' ? '#f0fdf4' : '#fffbeb', color: action.status === 'done' ? '#16a34a' : '#92400e', textDecoration: action.status === 'done' ? 'line-through' : 'none' }}>
                  {action.action_type.replace(/_/g, ' ')} · {action.estimated_minutes}m
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{title}</span>
        <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', borderRadius: 20, padding: '1px 8px', fontWeight: 500 }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>{text}</p>
}
