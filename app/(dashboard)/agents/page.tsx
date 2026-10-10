import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { AGENTS, loadSettings } from '@/lib/agents/registry'
import AgentsBoard, { QueueItem, RunRow } from './AgentsBoard'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // "Jetzt ausführen" for the first-message agent writes several drafts

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!

export default async function AgentsPage() {
  const supabase = createClient() as any
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [{ team }, settings, items, runs, monthRuns, seq] = await Promise.all([
    getTeamContext(),
    loadSettings(supabase, PROJECT_ID),
    supabase.from('agent_items')
      .select('id, agent_key, kind, channel, title, body, data, created_at, company_id, person_id, lead_id, companies(name), people(full_name, job_title, linkedin_url)')
      .eq('project_id', PROJECT_ID).eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
    supabase.from('agent_runs').select('id, agent_key, trigger, status, items, summary, error, cost_usd, started_at, finished_at, created_by')
      .eq('project_id', PROJECT_ID).order('started_at', { ascending: false }).limit(25),
    supabase.from('agent_runs').select('agent_key, cost_usd, started_at').eq('project_id', PROJECT_ID).gte('started_at', monthStart),
    supabase.from('sequence_enrollments').select('status').eq('project_id', PROJECT_ID).eq('status', 'active'),
  ])
  const missing = !!items.error && /agent_items|relation|schema cache/i.test(items.error.message || '')

  const lastRun: Record<string, RunRow | null> = {}
  for (const a of AGENTS) lastRun[a.key] = (runs.data || []).find((r: any) => r.agent_key === a.key) ?? null
  const cost = (monthRuns.data || []).reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0)
  const runs7 = (monthRuns.data || []).filter((r: any) => r.started_at >= weekAgo).length
  const names = Object.fromEntries((team || []).map(m => [m.user_id, m.display_name]))

  return (
    <AgentsBoard
      missing={missing}
      settings={settings}
      items={(items.data || []) as QueueItem[]}
      runs={((runs.data || []) as RunRow[]).map(r => ({ ...r, by: r.created_by ? names[r.created_by] ?? null : null }))}
      lastRun={lastRun}
      stats={{ pending: (items.data || []).length, runs7, costUsd: cost, activeSequences: (seq.data || []).length }}
    />
  )
}
