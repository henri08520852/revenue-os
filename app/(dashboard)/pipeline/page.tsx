import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PipelineClient from './PipelineClient'
import { ACTIVE_OPPORTUNITY_STAGES } from '@/lib/stages'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const ACTIVE_STAGES: string[] = ACTIVE_OPPORTUNITY_STAGES

export default async function PipelinePage() {
  const supabase = createClient()

  const { data: opps } = await supabase
    .from('opportunities')
    .select('*, companies(id, name, domain, account_score, signal_score)')
    .eq('project_id', PROJECT_ID)
    .order('value_eur', { ascending: false })

  const allOpps = opps || []
  const pipelineTotal = allOpps
    .filter(o => ACTIVE_STAGES.includes(o.stage))
    .reduce((s, o) => s + (o.value_eur || 0), 0)
  const wonTotal = allOpps
    .filter(o => o.stage === 'won')
    .reduce((s, o) => s + (o.value_eur || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — wie Companies */}
      <div className="px-8 py-7 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
            <p className="text-gray-400 text-sm mt-1">
              {allOpps.length} Deals gesamt ·{' '}
              <Link href="/guide#deals" className="text-blue-600 hover:text-blue-800">Was bedeuten die Stages?</Link>
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xl font-bold text-gray-900">€{pipelineTotal.toLocaleString('de-DE')}</p>
              <p className="text-xs text-gray-400">Aktive Pipeline</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-600">€{wonTotal.toLocaleString('de-DE')}</p>
              <p className="text-xs text-gray-400">Gewonnen</p>
            </div>
          </div>
        </div>
      </div>

      <PipelineClient initialOpps={allOpps} />
    </div>
  )
}
