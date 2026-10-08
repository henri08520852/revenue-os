import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import StatusBadge from './StatusBadge'
import { CreateButton } from '@/components/CreateRecord'
import { OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'
import { getTeamContext } from '@/lib/team'
import { getMeetingData } from '@/lib/meetingData'
import { loadTimeline, loadUpcoming } from '@/lib/records'
import { RecordLayout, Card, Empty, UpcomingList, AssocRow } from '@/components/record/Layout'
import Timeline from '@/components/record/Timeline'
import QuickActions from '@/components/record/QuickActions'
import Properties from '@/components/record/Properties'
import TaskList from '@/components/TaskList'
import { loadTasks } from '@/lib/tasks'

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

const BUYER_ROLE_LABELS: Record<string, string> = {
  economic_buyer: '💰 Budget', champion: '⭐ Champion',
  influencer: '💡 Influencer', user: '👤 Nutzer', blocker: '🚧 Blocker',
}

const LEAD_STAGE_LABELS: Record<string, string> = {
  outreach: 'Outreach', contacted: 'Kontaktiert', qualified: 'Qualifiziert',
  converted: 'Umgewandelt', disqualified: 'Disqualifiziert',
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit' })

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const supabase = createClient() as any

  const { data: company } = await supabase.from('companies').select('*').eq('id', params.id).single()
  if (!company) notFound()

  const projectId = (company.project_id || process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID) as string
  const [{ data: signals }, { data: jobs }, { data: actions }, { data: peopleData }, { data: leadsData }, { data: dealsData }, timeline, upcoming, meeting, { me, team }, tasks] = await Promise.all([
    supabase.from('signals').select('*').eq('company_id', params.id).eq('status', 'active').order('strength', { ascending: false }),
    supabase.from('jobs').select('*').eq('company_id', params.id).eq('status', 'active').order('first_seen_at', { ascending: false }).limit(30),
    supabase.from('actions').select('*').eq('company_id', params.id).in('status', ['pending', 'done']).order('generated_at', { ascending: false }).limit(10),
    supabase.from('people').select('*').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('leads').select('id, name, stage, next_follow_up_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    supabase.from('opportunities').select('id, name, stage, value_eur, next_step, next_step_due_at').eq('company_id', params.id).order('created_at', { ascending: false }),
    loadTimeline({ companyId: params.id }),
    loadUpcoming({ companyId: params.id }),
    getMeetingData(),
    getTeamContext(),
    loadTasks({ companyId: params.id }),
  ])

  const people = peopleData || []
  const leads = (leadsData || []).filter((l: any) => l.stage !== 'converted')  // converted leads live on as deals
  const deals = dealsData || []
  const openDeals = deals.filter((d: any) => !['won', 'lost'].includes(d.stage))
  const metrics = company.current_metrics || {}
  const scoreColor = (v: number) => v >= 70 ? '#16a34a' : v >= 40 ? '#d97706' : '#9ca3af'
  const personLabel = (p: any) => p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unbenannt'

  return (
    <RecordLayout
      breadcrumb={[{ label: 'Companies', href: '/companies' }, { label: company.name }]}
      left={<>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{company.name}</h1>
            <StatusBadge status={company.account_status} companyId={company.id} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', fontSize: 12 }}>
            {company.domain && <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: '#6b7280', textDecoration: 'none' }}>{company.domain} ↗</a>}
            <a href={company.linkedin_url || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company.name)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>LinkedIn ↗</a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
            {[{ label: 'Account', value: company.account_score || 0 }, { label: 'ICP', value: company.icp_score || 0 }, { label: 'Signale', value: company.signal_score || 0 }].map(s => (
              <div key={s.label} style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 10, padding: '8px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: scoreColor(s.value) }}>{s.value}</p>
                <p style={{ fontSize: 10, color: '#9ca3af' }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <QuickActions
              target={{ companyId: company.id, personId: null, opportunityId: null }}
              contacts={people.map((p: any) => ({ id: p.id, label: personLabel(p) }))}
              deals={openDeals.map((d: any) => ({ id: d.id, label: d.name || 'Deal' }))}
              meeting={meeting}
              meetingPrefill={{ companyId: company.id, opportunityId: openDeals[0]?.id ?? null }}
              taskData={meeting}
              taskLink={{ companyId: company.id }}
            />
          </div>
        </Card>
        <Card>
          <Properties kind="company" id={company.id} fields={[
            { key: 'name', label: 'Name', value: company.name },
            { key: 'domain', label: 'Domain (für E-Mail-Zuordnung)', value: company.domain, link: company.domain ? `https://${company.domain}` : null },
            { key: 'website_url', label: 'Website', value: company.website_url, type: 'url', link: company.website_url },
            { key: 'linkedin_url', label: 'LinkedIn', value: company.linkedin_url, type: 'url', link: company.linkedin_url },
            { key: 'industry', label: 'Branche', value: company.industry },
            { key: 'city', label: 'Stadt', value: company.city },
            { key: 'employee_range', label: 'Mitarbeiter', value: company.employee_range },
            { key: 'notes', label: 'Notizen', value: company.notes, type: 'textarea' },
          ]} />
        </Card>
      </>}
      center={<>
        <Card title="Anstehend" count={tasks.length + upcoming.length}>
          <TaskList tasks={tasks} data={meeting} link={{ companyId: company.id }} hideLinks={['company']} />
          {upcoming.length > 0 && <div style={{ marginTop: 12 }}><p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Termine</p><UpcomingList items={upcoming} /></div>}
        </Card>
        <Card title="Aktivitäten" count={timeline.length}>
          <Timeline items={timeline} context={{ companyId: company.id }} />
        </Card>
        <Card title="Aktive Signale" count={(signals || []).length}>
          {!(signals || []).length ? <Empty text="Keine aktiven Signale" /> : (signals || []).map((sig: any) => {
            const meta = SIGNAL_LABELS[sig.signal_type] || { label: String(sig.signal_type).replace(/_/g, ' '), icon: '📡', color: '#6b7280' }
            return (
              <div key={sig.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{meta.icon} {meta.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 70, height: 5, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden', display: 'inline-block' }}>
                      <span style={{ display: 'block', height: '100%', background: meta.color, width: `${sig.strength}%` }} />
                    </span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{sig.strength}</span>
                  </span>
                </div>
                {(sig.reason || sig.content) && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>{sig.reason || sig.content}</p>}
              </div>
            )
          })}
        </Card>
        {(jobs || []).length > 0 && (
          <Card title="Offene Stellen" count={(jobs || []).length}>
            {(jobs || []).map((job: any) => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div>
                  <p style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{job.title}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>{job.location || '—'} · {job.role_category}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {job.source_url && <a href={job.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#0ea5e9' }}>↗</a>}
                  <p style={{ fontSize: 11, color: '#9ca3af' }}>{job.days_open}d</p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </>}
      right={<>
        <Card title="Kontakte" count={people.length} action={<CreateButton kind="contact" preset={{ companyId: company.id }} />}>
          {!people.length ? <Empty text="Noch keine Kontakte" /> : people.map((p: any) => (
            <AssocRow key={p.id} href={`/contacts/${p.id}`} title={`${personLabel(p)}${p.is_decision_maker ? ' ★' : ''}`} sub={[p.job_title, p.email].filter(Boolean).join(' · ') || null}
              badge={p.buyer_role ? BUYER_ROLE_LABELS[p.buyer_role] ?? p.buyer_role : null} />
          ))}
        </Card>
        <Card title="Deals" count={deals.length} action={<CreateButton kind="deal" preset={{ companyId: company.id }} />}>
          {!deals.length ? <Empty text="Noch kein Deal" /> : deals.map((d: any) => (
            <AssocRow key={d.id} href={`/opportunities/${d.id}`} title={d.name || 'Deal'}
              sub={[d.value_eur ? `${Number(d.value_eur).toLocaleString('de-DE')} €` : null, !['won', 'lost'].includes(d.stage) && d.next_step ? `→ ${d.next_step}${d.next_step_due_at ? ` · ${fmtDate(d.next_step_due_at)}` : ''}` : null].filter(Boolean).join(' · ') || null}
              badge={(OPPORTUNITY_STAGE_LABELS as Record<string, string>)[d.stage] ?? d.stage}
              badgeColor={d.stage === 'won' ? { bg: '#dcfce7', fg: '#166534' } : d.stage === 'lost' ? { bg: '#f3f4f6', fg: '#6b7280' } : { bg: '#dbeafe', fg: '#1d4ed8' }} />
          ))}
        </Card>
        <Card title="Leads" count={leads.length} action={<CreateButton kind="lead" preset={{ companyId: company.id }} />}>
          {!leads.length ? <Empty text="Kein offener Lead" /> : leads.map((l: any) => (
            <AssocRow key={l.id} href={`/pipeline?focus=${l.id}`} title={l.name || company.name}
              sub={l.next_follow_up_at && l.stage !== 'disqualified' ? `Follow-up ${fmtDate(l.next_follow_up_at)}` : null}
              badge={LEAD_STAGE_LABELS[l.stage] ?? l.stage} badgeColor={{ bg: '#ede9fe', fg: '#6d28d9' }} />
          ))}
        </Card>
        <Card title="Job-Metriken">
          {[
            { label: 'Gesamt offen', value: metrics.open_jobs ?? '—' },
            { label: 'Commercial', value: metrics.commercial_jobs ?? 0 },
            { label: 'Recruiter', value: metrics.recruiter_jobs ?? 0 },
            { label: 'Engineering', value: metrics.engineering_jobs ?? 0 },
            { label: 'Leadership', value: metrics.leadership_jobs ?? 0 },
            ...(metrics.ats_type ? [{ label: 'ATS', value: metrics.ats_type }] : []),
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
              <span style={{ color: '#6b7280' }}>{row.label}</span>
              <span style={{ fontWeight: 600, color: '#111827' }}>{String(row.value)}</span>
            </div>
          ))}
        </Card>
        {(actions || []).length > 0 && (
          <Card title="Empfohlene Actions">
            {(actions || []).map((a: any) => (
              <div key={a.id} style={{ fontSize: 12, borderRadius: 8, padding: '7px 10px', marginBottom: 6, background: a.status === 'done' ? '#f0fdf4' : '#fffbeb', color: a.status === 'done' ? '#16a34a' : '#92400e', textDecoration: a.status === 'done' ? 'line-through' : 'none' }}>
                {a.title || String(a.action_type).replace(/_/g, ' ')} · {a.estimated_minutes}m
              </div>
            ))}
          </Card>
        )}
      </>}
    />
  )
}
