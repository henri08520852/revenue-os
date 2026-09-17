import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const STAGES = ['discovery', 'evaluation', 'proposal', 'negotiation', 'won', 'lost'] as const
type Stage = typeof STAGES[number]

const STAGE_LABELS: Record<Stage, string> = {
  discovery:   'Discovery',
  evaluation:  'Evaluation',
  proposal:    'Proposal',
  negotiation: 'Verhandlung',
  won:         'Gewonnen ✓',
  lost:        'Verloren',
}

const STAGE_COLORS: Record<Stage, string> = {
  discovery:   'border-t-gray-300',
  evaluation:  'border-t-blue-400',
  proposal:    'border-t-yellow-400',
  negotiation: 'border-t-orange-400',
  won:         'border-t-green-500',
  lost:        'border-t-gray-200',
}

export default async function PipelinePage() {
  const supabase = createClient()

  const { data: opps } = await supabase
    .from('opportunities')
    .select('*, companies(id, name, domain, account_score)')
    .eq('project_id', PROJECT_ID)
    .order('value_eur', { ascending: false })

  // Group by stage
  const byStage: Record<Stage, any[]> = {
    discovery: [], evaluation: [], proposal: [], negotiation: [], won: [], lost: []
  }
  for (const opp of (opps || [])) {
    const stage = opp.stage as Stage
    if (byStage[stage]) byStage[stage].push(opp)
  }

  const activeStages: Stage[] = ['discovery', 'evaluation', 'proposal', 'negotiation']
  const totalPipeline = activeStages
    .flatMap(s => byStage[s])
    .reduce((sum, o) => sum + (o.value_eur || 0), 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">€{totalPipeline.toLocaleString('de-DE')}</p>
          <p className="text-xs text-gray-400">Gesamt Pipeline</p>
        </div>
      </div>

      {/* Kanban board — horizontal scroll on small screens */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {activeStages.map(stage => (
          <div key={stage} className="flex-none w-64">
            <div className={`bg-white border border-gray-200 border-t-4 ${STAGE_COLORS[stage]} rounded-xl overflow-hidden`}>
              {/* Column header */}
              <div className="px-3 py-2.5 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{STAGE_LABELS[stage]}</h3>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {byStage[stage].length}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  €{byStage[stage].reduce((s, o) => s + (o.value_eur || 0), 0).toLocaleString('de-DE')}
                </p>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-24">
                {byStage[stage].map(opp => (
                  <OppCard key={opp.id} opp={opp} />
                ))}
                {byStage[stage].length === 0 && (
                  <p className="text-xs text-gray-300 text-center py-4">Leer</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Won / Lost summary */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        {(['won', 'lost'] as Stage[]).map(stage => (
          <div key={stage} className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">{STAGE_LABELS[stage]}</h3>
            <p className="text-xl font-bold text-gray-900">
              €{byStage[stage].reduce((s, o) => s + (o.value_eur || 0), 0).toLocaleString('de-DE')}
            </p>
            <p className="text-xs text-gray-400">{byStage[stage].length} Deals</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function OppCard({ opp }: { opp: any }) {
  const company = opp.companies
  const isOverdue = opp.next_step_due_at && new Date(opp.next_step_due_at) < new Date()

  return (
    <div className={`bg-gray-50 rounded-lg p-2.5 border ${isOverdue ? 'border-red-200' : 'border-gray-100'}`}>
      <Link href={`/companies/${company?.id}`} className="text-sm font-medium text-gray-900 hover:text-primary-600 block truncate">
        {company?.name || '—'}
      </Link>
      {opp.value_eur && (
        <p className="text-xs text-gray-600 font-medium">€{opp.value_eur.toLocaleString('de-DE')}</p>
      )}
      {opp.next_step_due_at && (
        <p className={`text-xs mt-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {isOverdue ? '⚠ ' : ''}
          {new Date(opp.next_step_due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
        </p>
      )}
    </div>
  )
}
