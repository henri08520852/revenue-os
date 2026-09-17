// Generate NBA actions for a project
// Called manually from the dashboard or after queue processing

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateActions } from '@/lib/nba/engine'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  // Verify authenticated user (not cron — this is user-triggered)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const projectId = body.project_id || process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
  const minutesAvailable = body.minutes_available || 30

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  }

  try {
    const count = await generateActions(supabase, { projectId, minutesAvailable })
    return NextResponse.json({ ok: true, actions_created: count })
  } catch (err) {
    console.error('[actions/generate]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
