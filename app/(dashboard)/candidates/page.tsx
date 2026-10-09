import { createClient } from '@/lib/supabase/server'
import HotCompanies from './HotCompanies'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // "Jetzt suchen" runs the discovery inline

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export default async function CandidatesPage() {
  const supabase = createClient() as any
  const { data } = await supabase.from('candidate_companies')
    .select('id, name, source_type, signal_hint, confidence, score, hiring, evidence, existing_company_id, updated_at, created_at')
    .eq('project_id', PROJECT_ID).eq('status', 'pending')
    .order('score', { ascending: false, nullsFirst: false }).order('confidence', { ascending: false }).limit(300)
  const all = data || []
  return <HotCompanies hiring={all.filter((c: any) => c.source_type === 'hiring')} news={all.filter((c: any) => c.source_type !== 'hiring')} />
}
