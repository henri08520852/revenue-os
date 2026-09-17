import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StatusBadge from './StatusBadge'

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  // Parallel data load
  const [companyRes, signalsRes, jobsRes, actionsRes, activitiesRes] = await Promise.all([
    supabase.from('companies')
      .select('*')
      .eq('id', params.id)
      .single(),
    supabase.from('signals')
      .select('*')
      .eq('company_id', params.id)
      .eq('status', 'active')
      .order('strength', { ascending: false }),
    supabase.from('jobs')
      .select('*')
      .eq('company_id', params.id)
      .eq('status', 'active')
      .order('first_seen_at', { ascending: false })
      .limit(30),
    supabase.from('actions')
      .select('*')
      .eq('company_id', params.id)
      .in('status', ['pending', 'done'])
      .order('generated_at', { ascending: false })
      .limit(10),
    supabase.from('activities')
      .select('*, people(first_name, last_name)')
      .eq('company_id', params.id)
      .order('occurred_at', { ascending: false })
      .limit(10),
  ])

  if (companyRes.error || !companyRes.data) notFound()

  const company = companyRes.data
  const signals = signalsRes.data || []
  const jobs = jobsRes.data || []
  const actions = actionsRes.data || []
  const activities = activitiesRes.data || []
  const metrics = (company.current_metrics as any) || {}

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/companies" className="hover:text-gray-600">Companies</Link>
        <span>›</span>
        <span className="text-gray-700">{company.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noopener"
              className="text-sm text-gray-400 hover:text-primary-600"
            >
              {company.domain} ↗
            </a>
            <StatusBadge status={company.account_status} companyId={company.id} />
          </div>
        </div>

        {/* Score summary */}
        <div className="flex gap-4 text-center">
          <ScorePill label="Account" value={company.account_score || 0} />
          <ScorePill label="ICP" value={company.icp_score || 0} />
          <ScorePill label="Signale" value={company.signal_score || 0} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column: signals + jobs */}
        <div className="col-span-2 space-y-5">
          {/* Active Signals */}
          <Section title="Aktive Signale" count={signals.length}>
            {signals.length === 0 && <EmptyState text="Keine aktiven Signale" />}
            <div className="space-y-2">
              {signals.map(sig => (
                <div key={sig.id} className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      {sig.signal_type.replace(/_/g, ' ')}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${sig.strength}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{sig.strength}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{sig.reason}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Open Jobs */}
          <Section title="Offene Stellen" count={metrics.open_jobs || 0}>
            {jobs.length === 0 && <EmptyState text="Keine Jobs gefunden" />}
            <div className="space-y-1.5">
              {jobs.map(job => (
                <div key={job.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm text-gray-900">{job.title}</p>
                    <p className="text-xs text-gray-400">{job.location || '—'} · {job.role_category}</p>
                  </div>
                  <div className="text-right">
                    {job.source_url && (
                      <a href={job.source_url} target="_blank" rel="noopener"
                        className="text-xs text-primary-500 hover:text-primary-700">↗</a>
                    )}
                    <p className="text-xs text-gray-400">{job.days_open}d</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Activity Log */}
          <Section title="Aktivitäten" count={activities.length}>
            {activities.length === 0 && <EmptyState text="Noch keine Aktivitäten" />}
            <div className="space-y-2">
              {activities.map((act: any) => (
                <div key={act.id} className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="text-xs text-gray-400 w-20 shrink-0 pt-0.5">
                    {new Date(act.occurred_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  </div>
                  <div>
                    <p className="text-sm text-gray-700">{act.summary || act.activity_type}</p>
                    {act.people && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        mit {act.people.first_name} {act.people.last_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Right column: pending actions + metrics */}
        <div className="space-y-5">
          {/* Quick stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Job-Metriken</h3>
            <dl className="space-y-2 text-sm">
              <MetricRow label="Gesamt offen" value={metrics.open_jobs ?? '—'} />
              <MetricRow label="Commercial" value={metrics.commercial_jobs ?? 0} />
              <MetricRow label="Recruiter" value={metrics.recruiter_jobs ?? 0} />
              <MetricRow label="Engineering" value={metrics.engineering_jobs ?? 0} />
              <MetricRow label="Leadership" value={metrics.leadership_jobs ?? 0} />
              {metrics.ats_type && <MetricRow label="ATS" value={metrics.ats_type} />}
            </dl>
          </div>

          {/* Pending actions */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
            {actions.length === 0 && <p className="text-xs text-gray-400">Keine ausstehenden Actions</p>}
            <div className="space-y-2">
              {actions.map(action => (
                <div key={action.id}
                  className={`text-xs rounded-lg px-3 py-2 ${action.status === 'done' ? 'bg-green-50 text-green-700 line-through' : 'bg-yellow-50 text-yellow-800'}`}>
                  {action.action_type.replace(/_/g, ' ')} · {action.estimated_minutes}m
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        {title}
        <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
      </h3>
      {children}
    </div>
  )
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'text-green-600' : value >= 40 ? 'text-yellow-600' : 'text-gray-400'
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 py-2">{text}</p>
}
