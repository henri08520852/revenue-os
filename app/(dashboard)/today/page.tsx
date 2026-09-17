import { createClient } from '@/lib/supabase/server'
import TriggerQueueButton from './TriggerQueueButton'
import ActionCard from './ActionCard'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Kritisch',  color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  2: { label: 'Dringend',  color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  3: { label: 'Wichtig',   color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  4: { label: 'Normal',    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  5: { label: 'Optional',  color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

const SIGNAL_ICONS: Record<string, string> = {
  hiring_acceleration: '🚀',
  commercial_hiring:   '💼',
  recruiter_vacancy:   '🔍',
  repeated_role:       '🔄',
  new_head_of_people:  '👑',
  warm_relationship:   '🤝',
  overdue_followup:    '⏰',
}

const SIGNAL_COLORS: Record<string, string> = {
  hiring_acceleration: 'border-l-violet-500 bg-violet-500/5',
  commercial_hiring:   'border-l-sky-500 bg-sky-500/5',
  recruiter_vacancy:   'border-l-emerald-500 bg-emerald-500/5',
  repeated_role:       'border-l-amber-500 bg-amber-500/5',
  new_head_of_people:  'border-l-rose-500 bg-rose-500/5',
  warm_relationship:   'border-l-teal-500 bg-teal-500/5',
  overdue_followup:    'border-l-orange-500 bg-orange-500/5',
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: { minutes?: string }
}) {
  const supabase = createClient()
  const minutes = parseInt(searchParams.minutes || '30', 10)

  const { data: queue, error: queueError } = await supabase.rpc('get_today_queue', {
    p_project_id: PROJECT_ID,
    p_minutes_available: minutes,
    p_limit: 20,
  })

  const { data: recentSignals } = await supabase
    .from('signals')
    .select('*, companies(name, domain)')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'active')
    .order('detected_at', { ascending: false })
    .limit(10)

  const { count: hotCount } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .in('account_status', ['hot', 'active_deal'])

  const { count: pendingActions } = await supabase
    .from('actions')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .eq('status', 'pending')

  const { count: activeSignals } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .eq('status', 'active')

  const totalMinutes = (queue || []).reduce((sum: number, a: any) => sum + (a.estimated_minutes || 0), 0)

  const dateStr = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #1a1040 50%, #0f1e3a 100%)' }}>
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #7c3aed22 0%, transparent 50%), radial-gradient(circle at 80% 20%, #0284c722 0%, transparent 50%)' }}
        />
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/40 text-sm font-medium mb-1">{dateStr}</p>
              <h1 className="text-2xl font-bold text-white">Today's Queue</h1>
              <p className="text-white/50 text-sm mt-1">
                {queue?.length
                  ? `${queue.length} Actions · ${totalMinutes} min Budget`
                  : 'Noch keine Actions — füge Unternehmen hinzu'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <TimeSelector currentMinutes={minutes} />
              <TriggerQueueButton projectId={PROJECT_ID} />
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <KPICard
              label="Actions heute"
              value={queue?.length || 0}
              sub={totalMinutes ? `${totalMinutes} min` : 'Queue leer'}
              gradient="from-violet-600 to-violet-700"
              icon="⚡"
            />
            <KPICard
              label="Aktive Signale"
              value={activeSignals || 0}
              sub="Kaufsignale"
              gradient="from-emerald-600 to-emerald-700"
              icon="📡"
            />
            <KPICard
              label="Hot Accounts"
              value={hotCount || 0}
              sub="Hot + Active Deal"
              gradient="from-amber-600 to-orange-700"
              icon="🔥"
            />
            <KPICard
              label="Ausstehend"
              value={pendingActions || 0}
              sub="Alle offenen Actions"
              gradient="from-sky-600 to-sky-700"
              icon="📋"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        <div className="grid grid-cols-3 gap-6 max-w-6xl">
          {/* Action Queue — 2/3 */}
          <div className="col-span-2 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Prioritäts-Queue · {minutes} min Budget
              </h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {queue?.length || 0} Actions
              </span>
            </div>

            {queueError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                Fehler: {queueError.message}
              </div>
            )}

            {!queue?.length && !queueError && (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl mx-auto mb-3">⚡</div>
                <p className="text-gray-600 font-medium text-sm">Queue ist leer</p>
                <p className="text-gray-400 text-xs mt-1">
                  Füge Unternehmen hinzu und klicke &ldquo;Run Queue&rdquo;
                </p>
              </div>
            )}

            {(queue || []).map((action: any, i: number) => (
              <ActionCard key={action.id || i} action={action} index={i} priorityLabels={PRIORITY_LABELS} />
            ))}
          </div>

          {/* Signals Panel — 1/3 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Neue Signale
              </h2>
              {recentSignals?.length ? (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  {recentSignals.length} aktiv
                </span>
              ) : null}
            </div>

            <div className="space-y-2">
              {(recentSignals || []).map((sig: any) => (
                <SignalCard key={sig.id} signal={sig} />
              ))}
              {!recentSignals?.length && (
                <div className="bg-white border border-dashed border-gray-200 rounded-xl p-6 text-center">
                  <p className="text-gray-400 text-xs">Noch keine Signale</p>
                  <p className="text-gray-300 text-xs mt-1">Werden nach dem Queue-Run generiert</p>
                </div>
              )}
            </div>

            {/* Quick Tip */}
            <div className="mt-4 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-violet-700 mb-1">💡 Nächster Schritt</p>
              <p className="text-xs text-violet-600">
                Füge deine ersten Zielunternehmen hinzu, dann klicke &ldquo;Run Queue&rdquo; — Revenue OS analysiert Signale automatisch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({
  label, value, sub, gradient, icon,
}: {
  label: string; value: number; sub: string; gradient: string; icon: string
}) {
  return (
    <div className={`rounded-xl p-4 bg-gradient-to-br ${gradient} text-white shadow-lg relative overflow-hidden`}>
      <div className="absolute top-3 right-3 text-2xl opacity-20">{icon}</div>
      <p className="text-xs font-medium text-white/70 mb-1">{label}</p>
      <p className="text-3xl font-bold text-white leading-none">{value}</p>
      <p className="text-xs text-white/60 mt-1.5">{sub}</p>
    </div>
  )
}

function TimeSelector({ currentMinutes }: { currentMinutes: number }) {
  const options = [15, 30, 60, 90]
  return (
    <div className="flex items-center gap-1 bg-white/10 backdrop-blur rounded-lg p-1">
      {options.map(min => (
        <a
          key={min}
          href={`/today?minutes=${min}`}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            currentMinutes === min
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          {min}m
        </a>
      ))}
    </div>
  )
}

function SignalCard({ signal }: { signal: any }) {
  const icon = SIGNAL_ICONS[signal.signal_type] || '📡'
  const colorClass = SIGNAL_COLORS[signal.signal_type] || 'border-l-gray-400 bg-gray-50'
  const company = signal.companies

  return (
    <div className={`bg-white border border-gray-100 border-l-4 ${colorClass} rounded-lg px-3 py-2.5 shadow-sm`}>
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-900 truncate">{company?.name || '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{signal.reason}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="h-1 flex-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500"
                style={{ width: `${Math.min(signal.strength, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 shrink-0 font-medium">{signal.strength}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
