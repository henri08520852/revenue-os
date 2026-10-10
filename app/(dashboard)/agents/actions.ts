'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { AGENTS, AgentKey, DEFAULTS } from '@/lib/agents/registry'
import { runFollowUpGuard } from '@/lib/agents/followUpGuard'
import { advanceSequences, seqSummary } from '@/lib/agents/sequence'
import { draftMissing, draftFirstMessage, draftOnEvent } from '@/lib/agents/firstMessage'
import { draftLetter, draftLettersDue, letterNow, LetterData } from '@/lib/agents/letter'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
type Result = { error: string | null; summary?: string }

async function session() {
  const { me, denied } = await getTeamContext()
  if (!me || denied) throw new Error('Nicht angemeldet')
  return { supabase: createClient() as any, me }
}
const fail = (e: any): Result => ({ error: e?.message || 'Fehler' })
const isKey = (k: string): k is AgentKey => AGENTS.some(a => a.key === k)

export async function runAgent(key: string): Promise<Result> {
  try {
    const { supabase } = await session()
    let summary = ''
    if (key === 'follow_up_guard') {
      const r = await runFollowUpGuard(supabase, PROJECT_ID, 'manual')
      summary = r.created ? `${r.created} Nachfass-Aufgabe${r.created > 1 ? 'n' : ''} angelegt` : 'Alles im Fluss – nichts zu tun'
    } else if (key === 'sequence') {
      const r = await advanceSequences(supabase, PROJECT_ID, 'manual')
      summary = seqSummary(r)
    } else if (key === 'first_message') {
      const r = await draftMissing(supabase, PROJECT_ID, 'manual', { limit: 4, budgetMs: 40_000 })
      summary = r.drafted ? `${r.drafted} Entw${r.drafted > 1 ? 'ürfe' : 'urf'} erstellt` : 'Keine Leads ohne Entwurf'
    } else if (key === 'letter') {
      const r = await draftLettersDue(supabase, PROJECT_ID, 'manual', { limit: 3, budgetMs: 40_000 })
      summary = r.drafted ? `${r.drafted} Brief${r.drafted === 1 ? '' : 'e'} erstellt` : 'Kein Lead steht gerade beim Brief-Schritt – Briefe gibt es auch direkt auf der Company-Seite'
    } else return { error: 'Unbekannter Agent' }
    revalidatePath('/agents')
    return { error: null, summary }
  } catch (e) { return fail(e) }
}

export async function setAgentEnabled(key: string, enabled: boolean): Promise<Result> {
  if (!isKey(key)) return { error: 'Unbekannter Agent' }
  try {
    const { supabase } = await session()
    const { data: row } = await supabase.from('automation_settings').select('config').eq('project_id', PROJECT_ID).eq('agent_key', key).maybeSingle()
    const { error } = await supabase.from('automation_settings').upsert({ project_id: PROJECT_ID, agent_key: key, enabled, config: row?.config ?? {}, updated_at: new Date().toISOString() })
    if (error) return { error: error.message }
    revalidatePath('/agents')
    return { error: null }
  } catch (e) { return fail(e) }
}

export async function saveAgentConfig(key: string, config: Record<string, unknown>): Promise<Result> {
  if (!isKey(key)) return { error: 'Unbekannter Agent' }
  try {
    const { supabase } = await session()
    // Only known fields, with sane bounds
    const clean: Record<string, unknown> = {}
    for (const f of Object.keys(DEFAULTS[key])) if (f in config) clean[f] = config[f]
    if (key === 'follow_up_guard') clean.days = Math.min(60, Math.max(2, Number(clean.days) || 7))
    if (key === 'sequence') {
      const steps = Array.isArray(clean.steps) ? (clean.steps as any[]) : []
      clean.steps = steps.slice(0, 10).map(s => ({
        day: Math.min(90, Math.max(0, Math.round(Number(s.day) || 0))), title: String(s.title || '').trim().slice(0, 120) || 'Schritt',
        type: ['todo', 'call', 'email', 'follow_up'].includes(s.type) ? s.type : 'todo',
        ...(s.draft ? { draft: true } : {}), ...(s.letter || s.type === 'letter' ? { letter: true } : {}),
      })).sort((a, b) => a.day - b.day)
      if (!(clean.steps as any[]).length) return { error: 'Mindestens ein Schritt' }
    }
    if (key === 'letter') {
      for (const f of Object.keys(clean)) clean[f] = String(clean[f] ?? '').slice(0, f === 'template' ? 8000 : 1000)
      if (!String(clean.template || '').trim()) return { error: 'Die Vorlage darf nicht leer sein' }
    }
    if (key === 'first_message') {
      for (const f of ['pitch', 'style', 'examples', 'offer', 'link']) if (f in clean) clean[f] = String(clean[f] ?? '').slice(0, 6000)
      if ('address' in clean) clean.address = ['du', 'Sie'].includes(clean.address as string) ? clean.address : 'auto'
      if ('autoDraft' in clean) clean.autoDraft = !!clean.autoDraft
    }
    const { data: row } = await supabase.from('automation_settings').select('enabled, config').eq('project_id', PROJECT_ID).eq('agent_key', key).maybeSingle()
    const { error } = await supabase.from('automation_settings').upsert({
      project_id: PROJECT_ID, agent_key: key, enabled: row?.enabled ?? true, config: { ...(row?.config || {}), ...clean }, updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    revalidatePath('/agents')
    return { error: null }
  } catch (e) { return fail(e) }
}

export async function saveItem(id: string, body: string, connectNote: string | null): Promise<Result> {
  try {
    const { supabase } = await session()
    const { data: item } = await supabase.from('automation_items').select('data').eq('id', id).single()
    if (!item) return { error: 'Entwurf nicht gefunden' }
    const { error } = await supabase.from('automation_items').update({ body: body.slice(0, 5000), data: { ...item.data, connect_note: connectNote?.slice(0, 600) ?? null, edited: true } }).eq('id', id)
    return { error: error?.message ?? null }
  } catch (e) { return fail(e) }
}

// "Als gesendet markieren": approve + log the message on the contact's timeline
export async function approveItem(id: string, body: string, connectNote: string | null): Promise<Result> {
  try {
    const { supabase, me } = await session()
    const saved = await saveItem(id, body, connectNote)
    if (saved.error) return saved
    const { data: item } = await supabase.from('automation_items').select('company_id, person_id, lead_id, channel, body').eq('id', id).single()
    const now = new Date().toISOString()
    const { error } = await supabase.from('automation_items').update({ status: 'approved', decided_at: now, decided_by: me.user_id }).eq('id', id)
    if (error) return { error: error.message }
    if (item?.company_id && item.channel === 'post') {
      await supabase.from('activities').insert({
        project_id: PROJECT_ID, company_id: item.company_id, person_id: item.person_id, activity_type: 'note', direction: 'outbound',
        channel: 'post', source: 'manual', occurred_at: now, created_by: me.email ?? null, summary: 'Brief verschickt', extracted_intel: { body: item.body },
      })
    }
    if (item?.person_id && item.channel === 'linkedin') {
      await supabase.from('activities').insert({
        project_id: PROJECT_ID, company_id: item.company_id, person_id: item.person_id, activity_type: 'linkedin_message', direction: 'outbound',
        channel: 'linkedin_message', source: 'manual', occurred_at: now, created_by: me.email ?? null, summary: 'LinkedIn-Nachricht',
        raw_reference: `li:${item.person_id}:outbound:${String(item.body).slice(0, 200)}`, extracted_intel: { body: item.body },
      })
    }
    revalidatePath('/agents')
    return { error: null }
  } catch (e) { return fail(e) }
}

export async function dismissItem(id: string): Promise<Result> {
  try {
    const { supabase, me } = await session()
    const { error } = await supabase.from('automation_items').update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: me.user_id }).eq('id', id)
    revalidatePath('/agents')
    return { error: error?.message ?? null }
  } catch (e) { return fail(e) }
}

export async function redraftItem(id: string): Promise<Result> {
  try {
    const { supabase } = await session()
    const { data: item } = await supabase.from('automation_items').select('kind, company_id, person_id, lead_id').eq('id', id).single()
    if (!item?.company_id) return { error: 'Entwurf ohne Firma' }
    const target = { projectId: PROJECT_ID, companyId: item.company_id, personId: item.person_id, leadId: item.lead_id }
    if (item.kind === 'letter') await draftLetter(supabase, target)
    else await draftFirstMessage(supabase, target)
    revalidatePath('/agents')
    return { error: null }
  } catch (e) { return fail(e) }
}

// After a Heiße Firma was taken as lead: draft in the background (respects the agent's switches)
export async function draftForLead(leadId: string): Promise<Result> {
  try {
    const { supabase } = await session()
    const { data: lead } = await supabase.from('leads').select('company_id, person_id').eq('id', leadId).single()
    if (!lead?.company_id) return { error: null }
    const r = await draftOnEvent(supabase, { projectId: PROJECT_ID, companyId: lead.company_id, personId: lead.person_id, leadId })
    return { error: null, summary: r ? 'Entwurf erstellt' : undefined }
  } catch (e) { return fail(e) }
}

// Letter edits: body + recipient/subject (the print view reads these)
export async function saveLetter(id: string, body: string, data: Partial<LetterData>): Promise<Result> {
  try {
    const { supabase } = await session()
    const { data: item } = await supabase.from('automation_items').select('data').eq('id', id).single()
    if (!item) return { error: 'Brief nicht gefunden' }
    const recipient = { ...item.data.recipient, ...(data.recipient || {}) }
    const { error } = await supabase.from('automation_items').update({
      body: body.slice(0, 8000), data: { ...item.data, ...data, recipient, edited: true },
    }).eq('id', id)
    return { error: error?.message ?? null }
  } catch (e) { return fail(e) }
}

// Company page: first message / letter on demand
export async function draftForCompany(companyId: string, kind: 'message' | 'letter'): Promise<Result & { itemId?: string }> {
  try {
    const { supabase } = await session()
    const [{ data: lead }, { data: people }] = await Promise.all([
      supabase.from('leads').select('id, person_id').eq('company_id', companyId).in('stage', ['outreach', 'contacted', 'qualified']).order('created_at', { ascending: false }).limit(1),
      supabase.from('people').select('id').eq('company_id', companyId).order('created_at', { ascending: true }).limit(1),
    ])
    const target = { projectId: PROJECT_ID, companyId, personId: lead?.[0]?.person_id ?? people?.[0]?.id ?? null, leadId: lead?.[0]?.id ?? null }
    if (kind === 'letter') {
      const r = await letterNow(supabase, target)
      revalidatePath('/agents')
      return { error: null, itemId: r.itemId, summary: r.missingAddress ? 'Brief erstellt – Anschrift bitte ergänzen' : 'Brief erstellt' }
    }
    const r = await draftFirstMessage(supabase, target)
    revalidatePath('/agents')
    return { error: null, itemId: r.itemId, summary: 'Entwurf erstellt' }
  } catch (e) { return fail(e) }
}
