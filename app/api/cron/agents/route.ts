// Daily agents run (Vercel cron, early morning): sequence steps, follow-up guard, first-message drafts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { advanceSequences } from '@/lib/agents/sequence'
import { runFollowUpGuard } from '@/lib/agents/followUpGuard'
import { draftMissing } from '@/lib/agents/firstMessage'

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
  const out: Record<string, unknown> = {}
  // Order matters: sequences first (creates step tasks), then the guard skips anything that has an open task
  try { out.sequence = await advanceSequences(svc, projectId, 'cron') } catch (e: any) { out.sequence = { error: e?.message } }
  try { out.followUp = await runFollowUpGuard(svc, projectId, 'cron') } catch (e: any) { out.followUp = { error: e?.message } }
  try { out.drafts = await draftMissing(svc, projectId, 'cron', { limit: 6, budgetMs: 35_000 }) } catch (e: any) { out.drafts = { error: e?.message } }
  return NextResponse.json({ ok: true, ...out })
}
