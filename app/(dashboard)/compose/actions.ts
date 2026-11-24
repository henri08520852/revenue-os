'use server'
// "Nachricht schreiben": pick a contact or type the basics → contact + company + prospect lead → personalised draft.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { draftFirstMessage } from '@/lib/agents/firstMessage'
import { enrollLead } from '@/lib/agents/sequence'
import { PERSONAS, roleCategoryOf, type Persona } from '@/lib/outreach/persona'
import type { SegmentKey } from '@/lib/outreach/segments'
import type { PainKey } from '@/lib/outreach/pains'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!

export type ComposeInput = {
  personId?: string | null
  first?: string; last?: string; title?: string; company?: string; linkedinUrl?: string
  notes?: string; profile?: string
  address?: 'auto' | 'du' | 'Sie'
  segment?: SegmentKey | 'auto'
  industry?: string
  persona?: Persona | 'auto'
  pain?: PainKey | 'auto'
  anyway?: boolean
}

const ITEM_COLS = 'id, agent_key, kind, channel, title, body, data, created_at, company_id, person_id, lead_id, companies(name), people(full_name, job_title, linkedin_url)'

const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
const cleanUrl = (u: string) => {
  const m = u.match(/linkedin\.com\/in\/([^/?#]+)/i)
  return m ? `https://www.linkedin.com/in/${m[1]}` : u || null
}

export async function composeMessage(input: ComposeInput): Promise<{ error: string | null; item?: any; noReason?: boolean }> {
  try {
    const { me, denied } = await getTeamContext()
    if (!me || denied) return { error: 'Nicht angemeldet' }
    const supabase = createClient() as any

    let personId = s(input.personId, 60) || null
    let companyId: string | null = null
    const title = s(input.title, 160)
    const companyName = s(input.company, 120)

    if (personId) {
      const { data: p } = await supabase.from('people').select('id, company_id, job_title').eq('id', personId).single()
      if (!p) return { error: 'Kontakt nicht gefunden' }
      companyId = p.company_id
      if (title && title !== p.job_title) await supabase.from('people').update({ job_title: title }).eq('id', personId)
    }

    // Company: reuse by name, else create
    if (!companyId) {
      if (!companyName) return { error: 'Bitte die Firma angeben.' }
      const { data: existing } = await supabase.from('companies').select('id').eq('project_id', PROJECT_ID).ilike('name', companyName).limit(1)
      if (existing?.length) companyId = existing[0].id
      else {
        const { data: c, error } = await supabase.from('companies').insert({ project_id: PROJECT_ID, name: companyName, account_status: 'target', source: 'manual' }).select('id').single()
        if (error) throw new Error(error.message)
        companyId = c.id
      }
      if (personId) await supabase.from('people').update({ company_id: companyId }).eq('id', personId)
    }

    // Contact: by LinkedIn URL, else by name at that company, else create
    if (!personId) {
      const first = s(input.first, 80), last = s(input.last, 80)
      const full = [first, last].filter(Boolean).join(' ')
      const url = s(input.linkedinUrl, 300) ? cleanUrl(s(input.linkedinUrl, 300)) : null
      let found: any = null
      if (url) found = (await supabase.from('people').select('id').eq('project_id', PROJECT_ID).ilike('linkedin_url', `%${url.split('/in/')[1] ?? url}%`).limit(1)).data?.[0]
      if (!found && full) found = (await supabase.from('people').select('id').eq('project_id', PROJECT_ID).eq('company_id', companyId).ilike('full_name', full).limit(1)).data?.[0]
      if (found) {
        personId = found.id
        await supabase.from('people').update({ company_id: companyId, ...(title ? { job_title: title } : {}), ...(url ? { linkedin_url: url } : {}) }).eq('id', personId)
      } else if (full) {
        const { data, error } = await supabase.from('people').insert({
          project_id: PROJECT_ID, company_id: companyId, first_name: first || null, last_name: last || null, full_name: full,
          job_title: title || null, linkedin_url: url, source: 'manual',
        }).select('id').single()
        if (error) throw new Error(error.message)
        personId = data.id
      }
    }

    // Persona chosen by hand wins over the rule
    if (personId && input.persona && input.persona !== 'auto' && input.persona in PERSONAS) {
      await supabase.from('people').update({ persona: input.persona, persona_source: 'manual', role_category: roleCategoryOf(input.persona) }).eq('id', personId)
    }

    // Open lead of the company, else a new prospect (with the outreach sequence if it is switched on)
    const { data: open } = await supabase.from('leads').select('id, person_id').eq('company_id', companyId).in('stage', ['prospect', 'outreach', 'contacted', 'qualified']).order('created_at', { ascending: false }).limit(1)
    let leadId: string | null = open?.[0]?.id ?? null
    if (!leadId) {
      const { data: openDeal } = await supabase.from('opportunities').select('id').eq('company_id', companyId).not('stage', 'in', '(won,lost)').limit(1)
      if (!openDeal?.length) {
        const { data: lead, error } = await supabase.from('leads').insert({
          project_id: PROJECT_ID, company_id: companyId, person_id: personId, owner_id: me.user_id, stage: 'prospect', source: 'manual',
        }).select('id').single()
        if (error) throw new Error(error.message)
        leadId = lead.id
        const label = [s(input.first, 80), s(input.last, 80)].filter(Boolean).join(' ') || companyName || 'Lead'
        await enrollLead(supabase, { projectId: PROJECT_ID, leadId: lead.id, personId, companyId, ownerId: me.user_id, createdBy: me.user_id, label }).catch(() => false)
      }
    } else if (!open![0].person_id && personId) {
      await supabase.from('leads').update({ person_id: personId }).eq('id', leadId)
    }

    const r = await draftFirstMessage(supabase, { projectId: PROJECT_ID, companyId: companyId!, personId, leadId }, {
      notes: s(input.notes, 1500) || null, profile: s(input.profile, 2500) || null, address: input.address ?? 'auto', segment: input.segment ?? 'auto', industry: input.industry || 'auto', pain: input.pain ?? 'auto', anyway: !!input.anyway,
    })
    const { data: item } = await supabase.from('automation_items').select(ITEM_COLS).eq('id', r.itemId).single()
    revalidatePath('/agents')
    revalidatePath('/compose')
    return { error: null, item }
  } catch (e: any) {
    return { error: e?.message || 'Fehler', ...(e?.noReason ? { noReason: true } : {}) }
  }
}

export async function loadItem(id: string): Promise<any | null> {
  const { me, denied } = await getTeamContext()
  if (!me || denied) return null
  const supabase = createClient() as any
  const { data } = await supabase.from('automation_items').select(ITEM_COLS).eq('id', id).single()
  return data ?? null
}
