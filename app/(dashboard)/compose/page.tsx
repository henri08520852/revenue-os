import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { loadAkquise } from '@/lib/akquise/write'
import { authorOf } from '@/lib/akquise/content'
import Writer, { type ContactOption, type PastItem } from './Writer'
import type { DraftRow } from './actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // one AI call with CRM research

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!

export default async function ComposePage({ searchParams }: { searchParams: { person?: string; draft?: string; followup?: string } }) {
  const supabase = createClient() as any
  const [{ me }, { data: people }, { cfg, fm }, drafts, agentSent, samples, open] = await Promise.all([
    getTeamContext(),
    supabase.from('people').select('id, full_name, job_title, linkedin_url, company_id, companies(name)')
      .eq('project_id', PROJECT_ID).order('updated_at', { ascending: false }).limit(800),
    loadAkquise(supabase, PROJECT_ID),
    supabase.from('content_drafts').select('id, title, status, updated_at, published_at, payload').eq('kind', 'sales').neq('status', 'archived').order('updated_at', { ascending: false }).limit(150),
    supabase.from('automation_items').select('id, title, body, decided_at, person_id').eq('project_id', PROJECT_ID).eq('agent_key', 'first_message').eq('status', 'approved').not('person_id', 'is', null).order('decided_at', { ascending: false }).limit(100),
    supabase.from('sales_voice_samples').select('author'),
    searchParams.draft || searchParams.followup ? supabase.from('content_drafts').select('*').eq('id', searchParams.draft || searchParams.followup).maybeSingle() : Promise.resolve({ data: null }),
  ])
  // "Follow-up schreiben" from the history: new draft, same recipient, the sent message as the earlier one
  const base = open.data as DraftRow | null
  const seed = searchParams.followup && base ? {
    author: base.payload.author, personId: base.payload.crm?.person_id ?? null,
    form: { ...base.payload.form, channel: 'followup' as const, sequence: false, prev: base.payload.sent?.text || base.payload.variants?.[base.payload.chosen || 0]?.text || '' },
  } : null
  const contacts: ContactOption[] = (people || []).map((p: any) => ({
    id: p.id, name: p.full_name || 'Ohne Namen', title: p.job_title, company: p.companies?.name ?? null, linkedin: p.linkedin_url,
  }))
  const past: PastItem[] = [
    ...((drafts.data || []) as any[]).filter(d => d.payload?.crm?.person_id).map(d => ({
      id: d.id, personId: d.payload.crm.person_id as string, kind: 'draft' as const, status: d.status as string, at: d.published_at || d.updated_at,
      title: d.title as string, text: (d.payload?.sent?.text || d.payload?.variants?.[d.payload?.chosen || 0]?.text || '') as string,
    })),
    ...((agentSent.data || []) as any[]).map(a => ({ id: a.id, personId: a.person_id, kind: 'agent' as const, status: 'published', at: a.decided_at, title: a.title, text: a.body || '' })),
  ]
  const counts = { henri: 0, simon: 0 }
  for (const s of samples.data || []) if (s.author in counts) counts[s.author as 'henri' | 'simon']++
  return (
    <Writer
      contacts={contacts}
      past={past}
      preselect={searchParams.person ?? null}
      initial={seed ? null : base}
      seed={seed}
      defaultAuthor={authorOf(me?.email)}
      senders={{ henri: cfg.voices.henri.first, simon: cfg.voices.simon.first }}
      sampleCounts={counts}
      floskeln={cfg.floskeln}
      baseTextOn={fm.useBaseText}
    />
  )
}
