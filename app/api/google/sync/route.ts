import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { syncConnection } from '@/lib/google/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_INTERVAL_MS = 10 * 60 * 1000

// Syncs the signed-in user's Gmail + Calendar.
// ?ifStale=1 → no-op when the last sync is younger than 10 minutes (used on page load).
export async function POST(request: Request) {
  const { data: { user } } = await (createClient() as any).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const svc = createServiceClient()
  const { data: conn } = await svc.from('google_connections').select('*').eq('user_id', user.id).maybeSingle()
  if (!conn) return NextResponse.json({ connected: false })

  const ifStale = new URL(request.url).searchParams.get('ifStale') === '1'
  const last = conn.gmail_last_synced_at ? new Date(conn.gmail_last_synced_at).getTime() : 0
  if (ifStale && Date.now() - last < MIN_INTERVAL_MS) return NextResponse.json({ connected: true, skipped: true })

  const result = await syncConnection(svc, conn)
  return NextResponse.json({ connected: true, ...result }, { status: result.error ? 502 : 200 })
}
