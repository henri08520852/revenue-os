import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import StageMoveButtons from './StageMoveButtons'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const STAGES = ['discovery', 'evaluation', 'proposal', 'negotiation', 'won', 'lost'] as const
type Stage = typeof STAGES[number]

const STAGE_LABELS: Record<Stage, string> = {
  discovery:   'Discovery',
  evaluation:  'Evaluation',
  proposal:    'Proposal',
  negotiation: 'Verhandlung',
  won:         'Gewonnen',
  lost:        'Verloren',
}

const STAGE_COLOR: Record<Stage, string> = {
  discovery:   '#9ca3af',
  evaluation:  '#60a5fa',
  proposal:    '#facc15',
  negotiation: '#fb923c',
  won:         '#22c55e',
  lost:        '#d1d5db',
}

export default async function PipelinePage() {
  const supabase = createClient()

  const { data: opps } = await supabase
    .from('opportunities')
    .select('*, companies(id, name, domain, account_score, signal_score)')
    .eq('project_id', PROJECT_ID)
    .order('value_eur', { ascending: false })

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

  const wonTotal = byStage.won.reduce((s, o) => s + (o.value_eur || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0f1e3a 100%)' }}>
        <div className="px-8 py-7">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Pipeline</h1>
              <p className="text-white/40 text-sm mt-1">{(opps || []).length} Deals gesamt</p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-2xl font-bold text-white">€{totalPipeline.toLocaleString('de-DE')}</p>
                <p className="text-xs text-white/40">Aktive Pipeline</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">€{wonTotal.toLocaleString('de-DE')}</p>
                <p className="text-xs text-white/40">Gewonnen</p>
              </div>
            </div>
          </div>

          {/* Stage pills */}
          <div className="flex items-center gap-2 mt-5">
            {activeStages.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STAGE_COLOR[stage] }} />
                  {STAGE_LABELS[stage]}
                  <span className="text-white/40">{byStage[stage].length}</span>
                </div>
                {i < activeStages.length - 1 && (
                  <span className="text-white/20">›</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="px-6 py-6">
        {/* ↓ display:flex als inline style — Tailwind flex wird hier ignoriert */}
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16 }}>
          {activeStages.map(stage => (
            <div key={stage} style={{ flexShrink: 0, width: 256 }}>
              <div
                className="border border-gray-200 rounded-xl overflow-hidden shadow-sm"
                style={{ borderTop: `4px solid ${STAGE_COLOR[stage]}` }}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 border-b border-gray-100 bg-white/90">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">{STAGE_LABELS[stage]}</h3>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {byStage[stage].length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-medium">
                    €{byStage[stage].reduce((s, o) => s + (o.value_eur || 0), 0).toLocaleString('de-DE')}
                  </p>
                </div>

                {/* Cards */}
                <div className="p-2 min-h-32 flex flex-col gap-2 bg-gray-50/50">
                  {byStage[stage].map(opp => (
                    <OppCard
                      key={opp.id}
                      opp={opp}
                      currentStage={stage}
                      allStages={STAGES}
                      stageLabels={STAGE_LABELS}
                    />
                  ))}
                  {byStage[stage].length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-6">Keine Deals</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Won / Lost */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {(['won', 'lost'] as Stage[]).map(stage => (
            <div
              key={stage}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              style={{ borderTop: `4px solid ${STAGE_COLOR[stage]}` }}
            >
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {STAGE_LABELS[stage]}
              </h3>
              <div className="flex items-end justify-between mb-3">
                <p className="text-xl font-bold text-gray-900">
                  €{byStage[stage].reduce((s, o) => s + (o.value_eur || 0), 0).toLocaleString('de-DE')}
                </p>
                <p className="text-xs text-gray-400">{byStage[stage].length} Deals</p>
              </div>
              <div className="space-y-1.5">
                {byStage[stage].slice(0, 5).map(opp => (
                  <div key={opp.id} className="flex items-center justify-between text-xs">
                    <Link
                      href={`/companies/${opp.companies?.id}`}
                      className="text-gray-600 hover:text-blue-600 truncate max-w-36"
                    >
                      {opp.companies?.name}
                    </Link>
                    <span className="text-gray-400 shrink-0 ml-2">
                      {opp.value_eur ? `€${opp.value_eur.toLocaleString('de-DE')}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OppCard({ opp, currentStage, allStages, stageLabels }: {
  opp: any
  currentStage: Stage
  allStages: readonly Stage[]
  stageLabels: Record<Stage, string>
}) {
  const company = opp.companies
  const isOverdue = opp.next_step_due_at && new Date(opp.next_step_due_at) < new Date()
  const stageIdx = allStages.indexOf(currentStage)
  const prevStage = stageIdx > 0 ? allStages[stageIdx - 1] : null
  const nextStage = stageIdx < allStages.length - 1 ? allStages[stageIdx + 1] : null

  return (
    <div className={`bg-white rounded-lg p-2.5 border shadow-sm ${isOverdue ? 'border-red-200' : 'border-gray-100'}`}>
      <Link
        href={`/companies/${company?.id}`}
        className="text-sm font-medium text-gray-900 hover:text-blue-600 block truncate"
      >
        {company?.name || '—'}
      </Link>

      <div className="flex items-center gap-2 mt-1">
        {opp.value_eur && (
          <p className="text-xs font-semibold text-gray-700">
            €{opp.value_eur.toLocaleString('de-DE')}
          </p>
        )}
        {company?.signal_score >= 50 && (
          <span className="text-xs text-orange-500">🔥{company.signal_score}</span>
        )}
      </div>

      {opp.next_step && (
        <p className="text-xs text-gray-500 mt-1 truncate">→ {opp.next_step}</p>
      )}

      {opp.next_step_due_at && (
        <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {isOverdue ? '⚠ ' : '📅 '}
          {new Date(opp.next_step_due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
        </p>
      )}

      <StageMoveButtons
        oppId={opp.id}
        prevStage={prevStage}
        nextStage={nextStage}
        stageLabels={stageLabels}
      />
    </div>
  )
}
