// Follow-up guard: open leads and deals with no open task and no activity for N days get a follow-up task.
import { loadSettings, startRun, finishRun } from './registry'

const LEAD_OPEN = ['outreach', 'contacted', 'qualified']
const MAX_TASKS = 40

export async function runFollowUpGuard(supabase: any, projectId: string, trigger: 'manual' | 'cron') {
  const settings = await loadSettings(supabase, projectId)
  if (!settings.follow_up_guard.enabled && trigger === 'cron') return { created: 0 }
  const days = Math.min(60, Math.max(2, Number(settings.follow_up_guard.config.days) || 7))
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const runId = await startRun(supabase, projectId, 'follow_up_guard', trigger)
  try {
    const [{ data: leads }, { data: deals }, { data: openTasks }] = await Promise.all([
      supabase.from('leads').select('id, name, company_id, person_id, owner_id, created_at, companies(name)').eq('project_id', projectId).in('stage', LEAD_OPEN).lt('created_at', cutoff),
      supabase.from('opportunities').select('id, name, company_id, owner_id, created_at, companies(name)').eq('project_id', projectId).not('stage', 'in', '(won,lost)').lt('created_at', cutoff),
      supabase.from('tasks').select('lead_id, opportunity_id, company_id').eq('project_id', projectId).eq('status', 'open'),
    ])
    const busy = new Set<string>()
    for (const t of openTasks || []) [t.lead_id, t.opportunity_id].forEach((id: string | null) => id && busy.add(id))
    const candidates = [
      ...(leads || []).filter((l: any) => !busy.has(l.id)).map((l: any) => ({ kind: 'lead' as const, ...l })),
      ...(deals || []).filter((d: any) => !busy.has(d.id)).map((d: any) => ({ kind: 'deal' as const, ...d })),
    ]
    const companyIds = Array.from(new Set(candidates.map(c => c.company_id).filter(Boolean)))
    // Recent activity or a recently finished task counts as "in touch"
    const [{ data: acts }, { data: doneTasks }] = companyIds.length ? await Promise.all([
      supabase.from('activities').select('company_id').in('company_id', companyIds).gte('occurred_at', cutoff),
      supabase.from('tasks').select('company_id').in('company_id', companyIds).eq('status', 'done').gte('completed_at', cutoff),
    ]) : [{ data: [] }, { data: [] }]
    const recent = new Set<string>([...(acts || []), ...(doneTasks || [])].map((a: any) => a.company_id))

    const today = `${new Date().toISOString().slice(0, 10)}T10:00:00.000Z`
    const rows = candidates.filter(c => !c.company_id || !recent.has(c.company_id)).slice(0, MAX_TASKS).map(c => ({
      project_id: projectId, task_type: 'follow_up', due_at: today, has_time: false, owner_id: c.owner_id, created_by: c.owner_id,
      title: `Nachfassen: ${c.name || c.companies?.name || (c.kind === 'deal' ? 'Deal' : 'Lead')} (seit ${days} Tagen keine Aktivität)`.slice(0, 200),
      notes: 'Angelegt vom Follow-up-Wächter',
      company_id: c.company_id, person_id: c.kind === 'lead' ? c.person_id : null,
      lead_id: c.kind === 'lead' ? c.id : null, opportunity_id: c.kind === 'deal' ? c.id : null,
    }))
    if (rows.length) {
      const { error } = await supabase.from('tasks').insert(rows)
      if (error) throw new Error(error.message)
    }
    await finishRun(supabase, runId, { items: rows.length, summary: rows.length ? `${rows.length} Nachfass-Aufgabe${rows.length > 1 ? 'n' : ''} angelegt` : 'Alles im Fluss – nichts zu tun' })
    return { created: rows.length }
  } catch (e: any) {
    await finishRun(supabase, runId, { error: e?.message || 'Fehler' })
    throw e
  }
}
