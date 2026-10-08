import { createClient } from '@/lib/supabase/server'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export type TaskType = 'todo' | 'call' | 'email' | 'follow_up' | 'meeting'

export type Task = {
  id: string
  title: string
  notes: string | null
  task_type: TaskType
  due_at: string | null
  has_time: boolean
  status: 'open' | 'done'
  owner_id: string | null
  company_id: string | null
  person_id: string | null
  opportunity_id: string | null
  lead_id: string | null
  company: { id: string; name: string } | null
  person: { id: string; name: string } | null
  deal: { id: string; name: string } | null
  lead: { id: string; name: string | null } | null
}

const SELECT = 'id, title, notes, task_type, due_at, has_time, status, owner_id, company_id, person_id, opportunity_id, lead_id, company:companies(id, name), person:people(id, full_name, first_name, last_name), deal:opportunities(id, name), lead:leads(id, name)'

function normalize(t: any): Task {
  const p = t.person
  return {
    ...t,
    person: p ? { id: p.id, name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Kontakt' } : null,
  }
}

// Open (or done) tasks for a record, an owner or a date range
export async function loadTasks(f: {
  status?: 'open' | 'done' | 'all'
  companyId?: string; personId?: string; opportunityId?: string; leadId?: string
  ownerId?: string | null
  dueBefore?: string; dueFrom?: string
  limit?: number
} = {}): Promise<Task[]> {
  const supabase = createClient() as any
  let q = supabase.from('tasks').select(SELECT).eq('project_id', PROJECT_ID)
  const status = f.status ?? 'open'
  if (status !== 'all') q = q.eq('status', status)
  if (f.companyId) q = q.eq('company_id', f.companyId)
  if (f.personId) q = q.eq('person_id', f.personId)
  if (f.opportunityId) q = q.eq('opportunity_id', f.opportunityId)
  if (f.leadId) q = q.eq('lead_id', f.leadId)
  if (f.ownerId) q = q.eq('owner_id', f.ownerId)
  if (f.dueFrom) q = q.gte('due_at', f.dueFrom)
  if (f.dueBefore) q = q.lt('due_at', f.dueBefore)
  q = status === 'done'
    ? q.order('completed_at', { ascending: false })
    : q.order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
  const { data, error } = await q.limit(f.limit ?? 300)
  if (error) return []           // table missing (migration 022 not applied yet)
  return (data || []).map(normalize)
}
