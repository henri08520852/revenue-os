import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AddCompanyButton from './AddCompanyButton'
 
const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
 
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  target:      { pill: 'bg-gray-100 text-gray-600',        dot: 'bg-gray-400' },
  warm:        { pill: 'bg-yellow-50 text-yellow-700 border border-yellow-200', dot: 'bg-yellow-500' },
  hot:         { pill: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
  active_deal: { pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  customer:    { pill: 'bg-sky-50 text-sky-700 border border-sky-200',           dot: 'bg-sky-500' },
  inactive:    { pill: 'bg-gray-50 text-gray-400',          dot: 'bg-gray-300' },
}
 
const STATUS_LABELS: Record<string, string> = {
  target: 'Target', warm: 'Warm', hot: '🔥 Hot', active_deal: '💼 Active Deal',
  customer: 'Customer', inactive: 'Inactive',
}
 
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string }
}) {
  const supabase = createClient()
 
  let query = supabase
    .from('companies')
    .select('id, name, domain, account_status, account_score, icp_score, signal_score, current_metrics, last_signal_at')
    .eq('project_id', PROJECT_ID)
    .order('account_score', { ascending: false })
    .limit(100)
 
  if (searchParams.status) query = query.eq('account_status', searchParams.status)
  if (searchParams.q) query = query.ilike('name', `%${searchParams.q}%`)
 
  const { data: companies, error } = await query
 
  // Count per status
  const { data: statusCounts } = await supabase
    .from('companies')
    .select('account_status')
    .eq('project_id', PROJECT_ID)
 
  const counts: Record<string, number> = {}
  ;(statusCounts || []).forEach((r: any) => {
    counts[r.account_status] = (counts[r.account_status] || 0) + 1
  })
 
  const statuses = ['target', 'warm', 'hot', 'active_deal', 'customer', 'inactive']
 
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0f1e3a 100%)' }}>
        <div className="px-8 py-7">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Companies</h1>
              <p className="text-white/40 text-sm mt-1">{statusCounts?.length || 0} Unternehmen im CRM</p>
            </div>
            <AddCompanyButton projectId={PROJECT_ID} />
          </div>
 
          {/* Status pills */}
          <div className="flex items-center gap-2 mt-5 flex-wrap">
            <a
              href="/companies"
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                !searchParams.status
                  ? 'bg-white text-gray-900 shadow'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
              }`}
            >
              Alle <span className="ml-1 opacity-70">{statusCounts?.length || 0}</span>
            </a>
            {statuses.map(s => (
              <a
                key={s}
                href={`/companies?status=${s}`}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  searchParams.status === s
                    ? 'bg-white text-gray-900 shadow'
                    : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                }`}
              >
                {STATUS_LABELS[s]} {counts[s] ? <span className="ml-1 opacity-60">{counts[s]}</span> : null}
              </a>
            ))}
 
            <form className="ml-auto" method="get">
              {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
              <input
                name="q"
                defaultValue={searchParams.q}
                placeholder="🔍 Suche…"
                className="px-3.5 py-1.5 bg-white/10 border border-white/20 rounded-full text-sm text-white placeholder-white/40 focus:outline-none focus:bg-white/20 w-44"
              />
            </form>
          </div>
        </div>
      </div>
 
      {/* Table */}
      <div className="px-8 py-6">
        {error && <p className="text-sm text-red-500 mb-4">Fehler: {error.message}</p>}
 
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Unternehmen</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Score</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">ICP</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Signale</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Jobs</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Letztes Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(companies || []).map(company => {
                const metrics = company.current_metrics as any || {}
                const style = STATUS_STYLES[company.account_status] || STATUS_STYLES.target
                return (
                  <tr key={company.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-5 py-3.5">
                      <Link href={`/companies/${company.id}`} className="group-hover:text-sky-600 transition-colors">
                        <p className="font-semibold text-gray-900 group-hover:text-sky-600">{company.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{company.domain || '—'}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.pill}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {company.account_status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <ScoreBar value={company.account_score || 0} />
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-600 font-medium">
                      {company.icp_score ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-600 font-medium">
                      {company.signal_score ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-600 font-medium">
                      {metrics.open_jobs ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-gray-400 font-medium">
                      {company.last_signal_at ? formatRelative(company.last_signal_at) : '—'}
                    </td>
                  </tr>
                )
              })}
              {!companies?.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl mx-auto mb-3">🏢</div>
                    <p className="text-gray-500 font-medium text-sm">Noch keine Unternehmen</p>
                    <p className="text-gray-400 text-xs mt-1">Füge dein erstes Zielunternehmen hinzu</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
 
        <p className="text-xs text-gray-400 mt-3">{companies?.length || 0} Unternehmen geladen</p>
      </div>
    </div>
  )
}
 
function ScoreBar({ value }: { value: number }) {
  const color = value >= 70 ? 'from-emerald-500 to-emerald-400' : value >= 40 ? 'from-yellow-500 to-amber-400' : 'from-gray-300 to-gray-200'
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-gray-700 font-semibold w-6 text-right text-xs">{value || '—'}</span>
    </div>
  )
}
 
function formatRelative(dateStr: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diffDays === 0) return 'heute'
  if (diffDays === 1) return 'gestern'
  return `vor ${diffDays}d`
}
