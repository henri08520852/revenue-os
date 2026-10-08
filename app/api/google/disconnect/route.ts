import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Removes the connection (tokens) and the user's synced calendar events. Logged activities stay.
export async function POST() {
  const { data: { user } } = await (createClient() as any).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const svc = createServiceClient()
  const { data: conn } = await svc.from('google_connections').select('refresh_token').eq('user_id', user.id).maybeSingle()
  if (conn?.refresh_token) {
    // Best effort: revoke the grant at Google as well
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, { method: 'POST' }).catch(() => {})
  }
  await svc.from('google_connections').delete().eq('user_id', user.id)
  await svc.from('calendar_events').delete().eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
