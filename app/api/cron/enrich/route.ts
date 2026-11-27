// Website + Impressum for the best "Heiße Firmen" (Vercel cron, several times a day)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { enrichCandidates } from '@/lib/discovery/enrich'
import { logRun, rescorePending } from '@/lib/discovery/hiring'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const svc = createServiceClient()
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
  // Scoring rules changed → catch up on pending candidates first (each run takes a share)
  const rescore = await rescorePending(svc, projectId, 20_000)
  const result = await enrichCandidates(svc, projectId, { budgetMs: 32_000 })
  await logRun(svc, projectId, 'enrich', { ...result, ...rescore })
  return NextResponse.json({ ok: true, ...result, ...rescore })
}
