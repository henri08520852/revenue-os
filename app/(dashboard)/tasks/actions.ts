'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
const TYPES = ['todo', 'call', 'email', 'follow_up', 'meeting']

type Result = { error: string | null }

export type TaskInput = {
  title: string
  taskType: string
  dueIso: string | null      // computed in the browser (date-only → 10:00 UTC of that day)
  hasTime: boolean
  ownerId: string | null
  companyId: string | null
  personId: string | null
  opportunityId: string | null
  leadId: string | null
  notes: string | null
}

// Tasks feed Today, the calendar, the task list and every record page
function revalidateAll() {
  revalidatePath('/', 'layout')
}

// Fill missing links from the linked records (contact/deal/lead → company)
async function completeLinks(supabase: any, i: Pick<TaskInput, 'companyId' | 'personId' | 'opportunityId' | 'leadId'>) {
  let { companyId, personId } = i
  if (i.leadId) {
    const { data: l } = await supabase.from('leads').select('company_id, person_id').eq('id', i.leadId).single()
    companyId ||= l?.company_id ?? null; personId ||= l?.person_id ?? null
  }
  if (!companyId && i.opportunityId) {
    const { data: o } = await supabase.from('opportunities').select('company_id').eq('id', i.opportunityId).single()
    companyId = o?.company_id ?? null
  }
  if (!companyId && personId) {
    const { data: p } = await supabase.from('people').select('company_id').eq('id', personId).single()
    companyId = p?.company_id ?? null
  }
  return { companyId, personId, opportunityId: i.opportunityId, leadId: i.leadId }
}

export async function createTask(input: TaskInput): Promise<Result> {
  const title = input.title.trim()
  if (!title) return { error: 'Bitte einen Titel eingeben' }
  if (!TYPES.includes(input.taskType)) return { error: 'Ungültiger Typ' }
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const links = await completeLinks(supabase, input)
  const { error } = await supabase.from('tasks').insert({
    project_id: PROJECT_ID,
    title,
    notes: input.notes?.trim() || null,
    task_type: input.taskType,
    due_at: input.dueIso,
    has_time: !!input.dueIso && input.hasTime,
    owner_id: input.ownerId ?? user?.id ?? null,
    created_by: user?.id ?? null,
    company_id: links.companyId,
    person_id: links.personId,
    opportunity_id: links.opportunityId,
    lead_id: links.leadId,
  })
  if (error) return { error: error.message }
  revalidateAll()
  return { error: null }
}

export async function updateTask(id: string, input: Partial<TaskInput>): Promise<Result> {
  const patch: Record<string, any> = {}
  if (input.title !== undefined) {
    if (!input.title.trim()) return { error: 'Titel darf nicht leer sein' }
    patch.title = input.title.trim()
  }
  if (input.taskType !== undefined) patch.task_type = input.taskType
  if (input.dueIso !== undefined) { patch.due_at = input.dueIso; patch.has_time = !!input.dueIso && !!input.hasTime }
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  const supabase = createClient() as any
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { error: null }
}

export async function setTaskDone(id: string, done: boolean): Promise<Result> {
  const supabase = createClient() as any
  const { error } = await supabase.from('tasks').update({ status: done ? 'done' : 'open' }).eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { error: null }
}

export async function deleteTask(id: string): Promise<Result> {
  const supabase = createClient() as any
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return { error: null }
}
