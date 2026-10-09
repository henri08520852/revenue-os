// Daily hiring discovery (Vercel cron): job postings → "Heiße Firmen"
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runHiringDiscovery } from '@/lib/discovery/hiring'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
  const stats = await runHiringDiscovery(createServiceClient(), projectId)
  return NextResponse.json({ ok: true, ...stats })
}
