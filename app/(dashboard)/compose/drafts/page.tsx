import { createClient } from '@/lib/supabase/server'
import DraftsList, { type Entry } from './DraftsList'

export const dynamic = 'force-dynamic'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!

// Every Akquise message in one list: drafts from "Schreiben" and from the Content Studio (shared table content_drafts)
// plus first messages the agent wrote and the team marked as sent. Replies come from the lead (replied_at).
export default async function DraftsPage({ searchParams }: { searchParams: { open?: string } }) {
  const supabase = createClient() as any
  const [drafts, agent] = await Promise.all([
    supabase.from('content_drafts').select('*').eq('kind', 'sales').order('updated_at', { ascending: false }).limit(300),
    supabase.from('automation_items').select('id, title, body, data, channel, decided_at, created_at, person_id, company_id, lead_id, people(full_name), companies(name), leads(replied_at)')
      .eq('project_id', PROJECT_ID).eq('agent_key', 'first_message').eq('status', 'approved').order('decided_at', { ascending: false }).limit(100),
  ])
  const leadIds = Array.from(new Set<string>((drafts.data || []).map((d: any) => d.payload?.crm?.lead_id).filter(Boolean)))
  const personIds = Array.from(new Set<string>((drafts.data || []).map((d: any) => d.payload?.crm?.person_id).filter(Boolean)))
  const [{ data: leads }, { data: inbound }] = await Promise.all([
    leadIds.length ? supabase.from('leads').select('id, replied_at, stage').in('id', leadIds) : { data: [] },
    personIds.length ? supabase.from('activities').select('person_id, occurred_at').in('person_id', personIds).eq('direction', 'inbound').order('occurred_at', { ascending: false }) : { data: [] },
  ])
  const replyOfLead = new Map<string, string | null>((leads || []).map((l: any) => [l.id, l.replied_at as string | null]))
  const lastIn = new Map<string, string>()
  for (const a of inbound || []) if (!lastIn.has(a.person_id)) lastIn.set(a.person_id, a.occurred_at)

  const entries: Entry[] = [
    ...((drafts.data || []) as any[]).map(d => {
      const crm = d.payload?.crm || {}
      const sentAt: string | null = d.payload?.sent?.at || d.published_at || null
      const inAt = crm.person_id ? lastIn.get(crm.person_id) ?? null : null
      const replied = (inAt && sentAt && inAt > sentAt ? inAt : null) || (crm.lead_id ? replyOfLead.get(crm.lead_id) ?? null : null)
      return {
        id: d.id, source: (d.payload?.source === 'revenue-os' ? 'revenue-os' : 'content-studio') as Entry['source'], status: d.status,
        author: d.author, title: d.title || 'Akquise', at: d.updated_at, createdAt: d.created_at, sentAt, replied,
        createdBy: d.created_by, payload: d.payload, personId: crm.person_id ?? null, companyId: crm.company_id ?? null,
      }
    }),
    ...((agent.data || []) as any[]).map(a => ({
      id: a.id, source: 'agent' as const, status: 'published', author: '', title: a.title, at: a.decided_at || a.created_at, createdAt: a.created_at,
      sentAt: a.decided_at, replied: a.leads?.replied_at ?? null, createdBy: null, personId: a.person_id, companyId: a.company_id,
      payload: null, agent: { body: a.body, original: a.data?.original ?? null, note: a.data?.connect_note ?? null, channel: a.channel, playbook: a.data?.playbook_name ? `${a.data.playbook_name} · ${a.data.variant}` : null },
    })),
  ]
  return <DraftsList entries={entries} openId={searchParams.open ?? null} missing={!!drafts.error} />
}
