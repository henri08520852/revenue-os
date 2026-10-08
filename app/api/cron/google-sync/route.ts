// Daily safety-net sync for all connected Google accounts (Vercel cron).
// Pages also trigger a sync on load when the last one is older than 10 minutes.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { syncConnection } from '@/lib/google/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()
  const { data: conns } = await svc.from('google_connections').select('*')
  const results: Record<string, unknown> = {}
  for (const conn of conns || []) results[conn.google_email] = await syncConnection(svc, conn)
  return NextResponse.json({ ok: true, results })
}
