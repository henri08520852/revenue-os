import { createClient } from '@/lib/supabase/server'
import HotCompanies, { SourceStatus } from './HotCompanies'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // "Jetzt suchen" runs the discovery inline

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
const ATS_SOURCES = ['personio', 'greenhouse', 'lever', 'smartrecruiters', 'recruitee', 'workable', 'softgarden', 'join', 'onlyfy', 'dvinci', 'rexx', 'concludis']

export default async function CandidatesPage() {
  const supabase = createClient() as any
  const since = new Date(Date.now() - 30 * 86400000).toISOString()

  // Postings per source (last 30 days) + when each source last delivered
  const sourceStats = async (sources: string[]) => {
    const [{ count }, { data: last }] = await Promise.all([
      supabase.from('job_postings').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT_ID).in('source', sources).gte('last_seen_at', since),
      supabase.from('job_postings').select('last_seen_at').eq('project_id', PROJECT_ID).in('source', sources).order('last_seen_at', { ascending: false }).limit(1),
    ])
    return { postings: count ?? 0, lastAt: last?.[0]?.last_seen_at ?? null }
  }

  const countAts = (status?: string) => {
    let q = supabase.from('ats_accounts').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT_ID)
    if (status) q = q.eq('status', status)
    return q.then((r: any) => r.count ?? 0)
  }
  const [{ data }, ba, google, ats, atsKnown, atsActive, eures] = await Promise.all([
    supabase.from('candidate_companies')
      .select('id, name, source_type, signal_hint, confidence, score, hiring, evidence, existing_company_id, enrichment_data, updated_at, created_at')
      .eq('project_id', PROJECT_ID).eq('status', 'pending')
      .order('score', { ascending: false, nullsFirst: false }).order('confidence', { ascending: false }).limit(300),
    sourceStats(['ba']), sourceStats(['google_jobs']), sourceStats(ATS_SOURCES), countAts(), countAts('active'), sourceStats(['eures']),
  ])

  const sources: SourceStatus[] = [
    { name: 'BA-Jobbörse', area: 'Deutschland', active: true, note: 'kostenlos', ...ba },
    { name: 'EURES', area: 'Österreich · Schweiz', active: true, note: 'kostenlos', ...eures },
    { name: 'Google Jobs', area: 'DE · AT · CH', active: !!process.env.SERPAPI_KEY, note: process.env.SERPAPI_KEY ? `${Number(process.env.SERPAPI_SEARCHES_PER_DAY) || 2} Suchen/Tag` : 'SERPAPI_KEY fehlt', ...google },
    { name: 'Karriereseiten', area: 'Personio, softgarden, JOIN, Recruitee, d.vinci, …', active: true, note: `${atsKnown.toLocaleString('de-DE')} Seiten bekannt, ${atsActive.toLocaleString('de-DE')} mit DACH-Stellen`, ...ats },
    { name: 'Northdata', area: 'Größe, Handelsregister', active: !!process.env.NORTHDATA_API_KEY, note: process.env.NORTHDATA_API_KEY ? 'ab Score 60' : 'NORTHDATA_API_KEY fehlt', postings: null, lastAt: null },
  ]

  const all = data || []
  return <HotCompanies sources={sources} hiring={all.filter((c: any) => c.source_type === 'hiring')} news={all.filter((c: any) => c.source_type !== 'hiring')} />
}
