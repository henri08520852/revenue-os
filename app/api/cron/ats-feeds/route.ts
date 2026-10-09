// Career-site feeds (Vercel cron, several times a day): find new sites in the crawl index,
// then check due feeds → "Heiße Firmen"
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { discoverAtsAccounts, pollAtsAccounts } from '@/lib/discovery/ats-feeds'
import { logRun } from '@/lib/discovery/hiring'

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
  const discovery = await discoverAtsAccounts(svc, projectId, 12_000)
  const poll = await pollAtsAccounts(svc, projectId, 40_000)
  await logRun(svc, projectId, 'ats-feeds', { discovery, poll })
  return NextResponse.json({ ok: true, discovery, poll })
}
