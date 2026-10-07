import { createClient } from '@/lib/supabase/server'
import PipelineClient from './PipelineClient'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const STAGE_LABELS: Record<string, string> = {
  discovery: 'Discovery', erstgespraech: 'Erstgespräch', evaluation: 'Evaluation',
  proposal: 'Angebot', negotiation: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren',
}

const STAGE_COLOR: Record<string, string> = {
  discovery: '#9ca3af', erstgespraech: '#818cf8', evaluation: '#60a5fa',
  proposal: '#facc15', negotiation: '#fb923c', won: '#22c55e', lost: '#d1d5db',
}

export default async function PipelinePage() {
  const supabase = createClient()

  const { data: opps } = await supabase
    .from('opportunities')
    .select('*, companies(id, name, domain, account_score, signal_score)')
    .eq('project_id', PROJECT_ID)
    .order('value_eur', { ascending: false })

  const activeStages = ['discovery', 'erstgespraech', 'evaluation', 'proposal', 'negotiation']
  const allOpps = opps || []
  const pipelineTotal = allOpps
    .filter(o => activeStages.includes(o.stage))
    .reduce((s, o) => s + (o.value_eur || 0), 0)
  const wonTotal = allOpps
    .filter(o => o.stage === 'won')
    .reduce((s, o) => s + (o.value_eur || 0), 0)

  // Stage pill counts for header
  const stageCounts = activeStages.map(s => ({
    stage: s,
    label: STAGE_LABELS[s],
    color: STAGE_COLOR[s],
    count: allOpps.filter(o => o.stage === s).length,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0f1e3a 100%)' }}>
        <div className="px-8 py-7">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Pipeline</h1>
              <p className="text-white/40 text-sm mt-1">{allOpps.length} Deals gesamt</p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-2xl font-bold text-white">€{pipelineTotal.toLocaleString('de-DE')}</p>
                <p className="text-xs text-white/40">Aktive Pipeline</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">€{wonTotal.toLocaleString('de-DE')}</p>
                <p className="text-xs text-white/40">Gewonnen</p>
              </div>
            </div>
          </div>

          {/* Stage mini-stats */}
          <div className="flex items-center gap-3 mt-5">
            {stageCounts.map(({ stage, label, color, count }) => (
              <div key={stage} className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-xs text-white/70">{label}</span>
                <span className="text-xs font-bold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive board/list */}
      <PipelineClient initialOpps={allOpps} />
    </div>
  )
}
