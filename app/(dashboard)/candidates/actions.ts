'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { runHiringDiscovery } from '@/lib/discovery/hiring'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
type Result = { error: string | null; href?: string }

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10)

async function companyFor(supabase: any, c: any): Promise<string> {
  if (c.existing_company_id) return c.existing_company_id
  const { data: found } = await supabase.from('companies').select('id').eq('project_id', PROJECT_ID).ilike('name', c.name).limit(1)
  if (found?.length) return found[0].id
  const { data, error } = await supabase.from('companies')
    .insert({ project_id: PROJECT_ID, name: c.name, account_status: 'target', source: c.source_type === 'hiring' ? 'hiring_signal' : 'news_signal' })
    .select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

// Candidate → company (+ optional lead in Outreach with a first task)
export async function takeCandidate(id: string, asLead: boolean): Promise<Result> {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht angemeldet' }
  const { data: c } = await supabase.from('candidate_companies').select('*').eq('id', id).single()
  if (!c) return { error: 'Nicht gefunden' }
  try {
    const companyId = await companyFor(supabase, c)
    const reason = c.hiring ? `${c.hiring.open} offene Stellen${c.hiring.new14 ? `, ${c.hiring.new14} neu in 14 Tagen` : ''}${c.hiring.repeated?.[0] ? `, ${c.hiring.repeated[0].count}× ${c.hiring.repeated[0].role}` : ''}` : (c.evidence?.[0]?.title ?? null)
    let href = `/companies/${companyId}`
    if (asLead) {
      const [{ data: openLead }, { data: openDeal }] = await Promise.all([
        supabase.from('leads').select('id').eq('company_id', companyId).in('stage', ['outreach', 'contacted', 'qualified']).limit(1),
        supabase.from('opportunities').select('id').eq('company_id', companyId).not('stage', 'in', '(won,lost)').limit(1),
      ])
      if (!openLead?.length && !openDeal?.length) {
        const { data: lead, error } = await supabase.from('leads').insert({
          project_id: PROJECT_ID, company_id: companyId, owner_id: user.id, stage: 'outreach', source: 'signal',
          notes: reason ? `Signal: ${reason}` : null,
        }).select('id').single()
        if (error) return { error: error.message }
        await supabase.from('tasks').insert({
          project_id: PROJECT_ID, title: `Erstansprache ${c.name}${reason ? ` (${reason})` : ''}`.slice(0, 200), task_type: 'todo',
          due_at: `${tomorrow()}T10:00:00.000Z`, has_time: false, owner_id: user.id, created_by: user.id, company_id: companyId, lead_id: lead.id,
        })
        href = `/pipeline?focus=${lead.id}`
      } else href = openDeal?.length ? `/opportunities/${openDeal[0].id}` : `/pipeline?focus=${openLead![0].id}`
    }
    // Keep the hiring numbers visible on the company
    if (c.hiring) {
      await supabase.from('signals').insert({
        project_id: PROJECT_ID, company_id: companyId, signal_type: 'hiring_pressure', strength: c.score ?? 50, confidence: 80,
        reason: reason || 'Viele offene Stellen', evidence: { ...c.hiring, jobs: c.evidence },
        expires_at: new Date(Date.now() + 21 * 86400000).toISOString(),
      })
    }
    await supabase.from('candidate_companies').update({ status: 'approved', existing_company_id: companyId, reviewed_at: new Date().toISOString(), reviewed_by: user.email ?? null }).eq('id', id)
    revalidatePath('/candidates')
    return { error: null, href }
  } catch (e: any) {
    return { error: e?.message || 'Fehler' }
  }
}

export async function rejectCandidate(id: string): Promise<Result> {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('candidate_companies').update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user?.email ?? null }).eq('id', id)
  revalidatePath('/candidates')
  return { error: error?.message ?? null }
}

// Manual run of the daily search (team members only; writes with the service role)
export async function searchNow(): Promise<{ error: string | null; summary?: string }> {
  const { me, denied } = await getTeamContext()
  if (!me || denied) return { error: 'Nicht berechtigt' }
  try {
    const s = await runHiringDiscovery(createServiceClient(), PROJECT_ID, { budgetMs: 50_000 })
    revalidatePath('/candidates')
    return { error: s.postings ? null : s.errors[0] ?? 'Keine Stellen gefunden', summary: `${s.postings} Stellen gelesen · ${s.employers} Firmen bewertet · ${s.candidates} neu` }
  } catch (e: any) {
    return { error: e?.message || 'Fehler' }
  }
}
