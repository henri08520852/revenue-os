// Outreach sequence: one open task per step; the next step is created once the current task is done.
// Stops when the contact replies (inbound activity) or the lead leaves "Ansprache/Kontaktiert".
import { SequenceStep, loadSettings, startRun, finishRun } from './registry'

const DAY = 86400000
const dueOn = (ms: number) => `${new Date(ms).toISOString().slice(0, 10)}T10:00:00.000Z`

type Enroll = { projectId: string; leadId: string; personId: string | null; companyId: string | null; ownerId: string | null; createdBy?: string | null; label: string; startStep?: number }

async function createStepTask(supabase: any, e: Enroll, steps: SequenceStep[], index: number, dueMs: number) {
  const s = steps[index]
  const { data, error } = await supabase.from('tasks').insert({
    project_id: e.projectId, title: `${s.title}: ${e.label}`.slice(0, 200), task_type: s.type,
    notes: `Akquise-Abfolge · Schritt ${index + 1} von ${steps.length}${s.draft ? '\nEntwurf: Agents → Freigaben' : s.letter ? '\nBrief zum Drucken: Agents → Freigaben' : ''}`,
    due_at: dueOn(dueMs), has_time: false, owner_id: e.ownerId, created_by: e.createdBy ?? e.ownerId,
    company_id: e.companyId, person_id: e.personId, lead_id: e.leadId,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

// Returns true when the lead was enrolled (caller then skips its own single follow-up task)
export async function enrollLead(supabase: any, e: Enroll): Promise<boolean> {
  const settings = await loadSettings(supabase, e.projectId)
  if (!settings.sequence.enabled) return false
  const steps = settings.sequence.config.steps
  const start = Math.min(Math.max(0, e.startStep ?? 0), steps.length - 1)
  const { data: active } = await supabase.from('sequence_enrollments').select('id').eq('lead_id', e.leadId).eq('status', 'active').limit(1)
  if (active?.length) return true
  const taskId = await createStepTask(supabase, e, steps, start, Date.now())
  const { error } = await supabase.from('sequence_enrollments').insert({
    project_id: e.projectId, lead_id: e.leadId, person_id: e.personId, company_id: e.companyId, owner_id: e.ownerId, step: start, current_task_id: taskId,
  })
  if (error) { await supabase.from('tasks').delete().eq('id', taskId); return false }
  return true
}

export function seqSummary(r: { advanced: number; stopped: number; done: number }) {
  const parts = [r.advanced ? `${r.advanced} nächste${r.advanced > 1 ? '' : 'r'} Schritt${r.advanced > 1 ? 'e' : ''} angelegt` : '', r.stopped ? `${r.stopped} gestoppt (Antwort/weitergerückt)` : '', r.done ? `${r.done} abgeschlossen` : '']
  return parts.filter(Boolean).join(', ') || 'Nichts fällig – alle Schritte laufen noch'
}

// Moves every active enrollment forward; cheap (database only), safe to call often
export async function advanceSequences(supabase: any, projectId: string, trigger: 'manual' | 'cron' | 'event' = 'event') {
  const settings = await loadSettings(supabase, projectId)
  if (!settings.sequence.enabled && trigger !== 'manual') return { advanced: 0, stopped: 0, done: 0 } // switched off = paused
  const steps = settings.sequence.config.steps
  const { data: rows } = await supabase.from('sequence_enrollments')
    .select('id, lead_id, person_id, company_id, owner_id, step, current_task_id, started_at, leads(stage, name, companies(name), people(full_name))')
    .eq('project_id', projectId).eq('status', 'active').limit(500)
  if (!rows?.length) return { advanced: 0, stopped: 0, done: 0 }
  const runId = trigger === 'event' ? null : await startRun(supabase, projectId, 'sequence', trigger)

  const taskIds = rows.map((r: any) => r.current_task_id).filter(Boolean)
  const persons = rows.map((r: any) => r.person_id).filter(Boolean)
  const oldest = rows.map((r: any) => r.started_at).sort()[0]
  const [{ data: tasks }, { data: replies }] = await Promise.all([
    taskIds.length ? supabase.from('tasks').select('id, status, completed_at').in('id', taskIds) : { data: [] },
    persons.length ? supabase.from('activities').select('person_id, occurred_at').in('person_id', persons).eq('direction', 'inbound').gte('occurred_at', oldest) : { data: [] },
  ])
  const taskById = new Map<string, any>((tasks || []).map((t: any) => [t.id, t]))
  let advanced = 0, stopped = 0, done = 0
  for (const r of rows) {
    const stop = async (reason: string) => {
      await supabase.from('sequence_enrollments').update({ status: 'stopped', stop_reason: reason }).eq('id', r.id)
      stopped++
    }
    const stage = r.leads?.stage
    if (!stage || !['outreach', 'contacted'].includes(stage)) { await stop('Lead ist weitergerückt oder geschlossen'); continue }
    if ((replies || []).some((a: any) => a.person_id === r.person_id && a.occurred_at >= r.started_at)) { await stop('Antwort erhalten'); continue }
    const task = r.current_task_id ? taskById.get(r.current_task_id) : null
    if (task && task.status !== 'done') continue           // current step still open
    const next = r.step + 1
    if (next >= steps.length) {
      await supabase.from('sequence_enrollments').update({ status: 'done', current_task_id: null }).eq('id', r.id)
      done++; continue
    }
    // Deleted task → continue now; done task → keep the planned gap between the steps
    const base = task?.completed_at ? Date.parse(task.completed_at) : Date.now()
    const gap = Math.max(0, (steps[next].day - (steps[r.step]?.day ?? 0))) * DAY
    const label = r.leads?.people?.full_name || r.leads?.companies?.name || r.leads?.name || 'Lead'
    const taskId = await createStepTask(supabase, {
      projectId, leadId: r.lead_id, personId: r.person_id, companyId: r.company_id, ownerId: r.owner_id, label,
    }, steps, next, Math.max(Date.now(), base + gap))
    await supabase.from('sequence_enrollments').update({ step: next, current_task_id: taskId }).eq('id', r.id)
    advanced++
  }
  await finishRun(supabase, runId, { items: advanced, summary: seqSummary({ advanced, stopped, done }) })
  return { advanced, stopped, done }
}
