'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { baSample, logRun, runHiringDiscovery } from '@/lib/discovery/hiring'
import { discoverAtsAccounts, pollAtsAccounts } from '@/lib/discovery/ats-feeds'
import { enrichCandidates } from '@/lib/discovery/enrich'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
type Result = { error: string | null; href?: string }

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10)

async function companyFor(supabase: any, c: any): Promise<string> {
  if (c.existing_company_id) return c.existing_company_id
  const imp = c.enrichment_data?.impressum
  if (imp?.domain) {
    const { data: byDomain } = await supabase.from('companies').select('id').eq('project_id', PROJECT_ID).eq('domain', imp.domain).limit(1)
    if (byDomain?.length) return byDomain[0].id
  }
  const { data: found } = await supabase.from('companies').select('id').eq('project_id', PROJECT_ID).ilike('name', c.name).limit(1)
  if (found?.length) return found[0].id
  const { data, error } = await supabase.from('companies')
    .insert({
      project_id: PROJECT_ID, name: c.name, account_status: 'target', source: c.source_type === 'hiring' ? 'hiring_signal' : 'news_signal',
      domain: imp?.domain ?? null, website_url: imp?.website ?? null,
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

// HR contact from the job ad → contact (only with a name; a bare jobs@ address goes on the company)
async function hrContactAsPerson(supabase: any, companyId: string, c: any): Promise<string | null> {
  const hr = c.enrichment_data?.hrContact
  if (!hr?.name) return null
  const clean = hr.name.replace(/^(frau|herr|dr\.?|prof\.?)\s+/gi, '').trim()
  const { data: existing } = await supabase.from('people').select('id').eq('company_id', companyId).ilike('full_name', clean).limit(1)
  if (existing?.length) return existing[0].id
  const words = clean.split(/\s+/)
  const { data } = await supabase.from('people').insert({
    project_id: PROJECT_ID, company_id: companyId, first_name: words.slice(0, -1).join(' ') || null, last_name: words[words.length - 1], full_name: clean,
    job_title: hr.title || 'Personal / Recruiting', email: hr.email || null, phone: hr.phone || null, buyer_role: 'champion', source: 'ba_jobad',
  }).select('id').single()
  return data?.id ?? null
}

// Managing directors from the Impressum → contacts (decision makers), skipping existing names
async function managersAsContacts(supabase: any, companyId: string, c: any): Promise<string | null> {
  const imp = c.enrichment_data?.impressum
  if (!imp?.managers?.length) return null
  const { data: existing } = await supabase.from('people').select('id, full_name').eq('company_id', companyId)
  const known = new Map<string, string>((existing || []).map((p: any) => [String(p.full_name).toLowerCase(), p.id]))
  let first: string | null = null
  for (const name of imp.managers as string[]) {
    let id = known.get(name.toLowerCase()) ?? null
    if (!id) {
      const words = name.split(' ')
      const { data } = await supabase.from('people').insert({
        project_id: PROJECT_ID, company_id: companyId, first_name: words.slice(0, -1).join(' '), last_name: words[words.length - 1], full_name: name,
        job_title: 'Geschäftsführung', buyer_role: 'economic_buyer', is_decision_maker: true, source: 'impressum',
      }).select('id').single()
      id = data?.id ?? null
    }
    first = first ?? id
  }
  return first
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
    const managerId = await managersAsContacts(supabase, companyId, c)
    const hrId = await hrContactAsPerson(supabase, companyId, c)
    const contactId = hrId ?? managerId // HR runs the screening day to day → first contact
    const reason = c.hiring ? `${c.hiring.open} offene Stellen${c.hiring.new14 ? `, ${c.hiring.new14} neu in 14 Tagen` : ''}${c.hiring.repeated?.[0] ? `, ${c.hiring.repeated[0].count}× ${c.hiring.repeated[0].role}` : ''}${c.hiring.hrRoles?.length ? `, baut Recruiting auf (${c.hiring.hrRoles[0]})` : ''}` : (c.evidence?.[0]?.title ?? null)
    let href = `/companies/${companyId}`
    if (asLead) {
      const [{ data: openLead }, { data: openDeal }] = await Promise.all([
        supabase.from('leads').select('id').eq('company_id', companyId).in('stage', ['outreach', 'contacted', 'qualified']).limit(1),
        supabase.from('opportunities').select('id').eq('company_id', companyId).not('stage', 'in', '(won,lost)').limit(1),
      ])
      if (!openLead?.length && !openDeal?.length) {
        const { data: lead, error } = await supabase.from('leads').insert({
          project_id: PROJECT_ID, company_id: companyId, person_id: contactId, owner_id: user.id, stage: 'outreach', source: 'signal',
          notes: reason ? `Signal: ${reason}` : null,
        }).select('id').single()
        if (error) return { error: error.message }
        await supabase.from('tasks').insert({
          project_id: PROJECT_ID, title: `Erstansprache ${c.name}${reason ? ` (${reason})` : ''}`.slice(0, 200), task_type: 'todo',
          due_at: `${tomorrow()}T10:00:00.000Z`, has_time: false, owner_id: user.id, created_by: user.id, company_id: companyId, person_id: contactId, lead_id: lead.id,
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
    await supabase.from('candidate_companies').update({ status: 'accepted', existing_company_id: companyId, reviewed_at: new Date().toISOString(), reviewed_by: user.email ?? null }).eq('id', id)
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
    const svc = createServiceClient()
    const d = await discoverAtsAccounts(svc, PROJECT_ID, 8_000)
    const s = await runHiringDiscovery(svc, PROJECT_ID, { budgetMs: 26_000 })
    const a = await pollAtsAccounts(svc, PROJECT_ID, 14_000)
    await logRun(svc, PROJECT_ID, 'manual', { discovery: d, hiring: { ...s, errors: s.errors.slice(0, 5) }, poll: a, baSample })
    revalidatePath('/candidates')
    const crawl = `Web-Archiv: ${d.found} Karriereseiten gefunden${d.pattern ? ` (${d.pattern}${d.done ? ', fertig' : `, Seite ${d.page}`})` : ''}${d.error ? ` – ${d.error}` : ''}`
    const summary = `${s.postings} Stellen aus Jobbörsen · ${crawl} · ${a.checked} Karriereseiten geprüft · ${s.employers + a.employers} Firmen bewertet · ${s.candidates + a.candidates} neu`
    const errors = Array.from(new Set(s.errors.map(e => e.replace(/^BA [^:]+: /, '')))).slice(0, 2).join(' · ')
    return { error: s.postings || a.checked ? null : errors || `Keine Stellen gefunden (BA-Zugang: ${s.baAccess ?? 'unbekannt'})`, summary: errors && (s.postings || a.checked) ? `${summary} · Hinweis: ${errors}` : summary }
  } catch (e: any) {
    return { error: e?.message || 'Fehler' }
  }
}

// Website & Impressum for the cards still missing it (called by the page in the background)
export async function enrichMissing(ids: string[]): Promise<{ error: string | null }> {
  const { me, denied } = await getTeamContext()
  if (!me || denied) return { error: 'Nicht berechtigt' }
  await enrichCandidates(createServiceClient(), PROJECT_ID, { ids: ids.slice(0, 8), budgetMs: 50_000 })
  revalidatePath('/candidates')
  return { error: null }
}
