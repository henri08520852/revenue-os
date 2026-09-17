// Vercel Cron Route — processes the refresh queue
// Called by pg_cron (or Vercel cron config) every 15 minutes
// Protected by CRON_SECRET to prevent unauthorized triggers
// Uses service role client — NEVER expose this route publicly without auth

import { NextRequest, NextResponse } from 'next/server'
import { processQueue } from '@/lib/connectors/runner'

export const maxDuration = 60 // Vercel Pro: 60s max for cron routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron] CRON_SECRET not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = request.nextUrl.searchParams.get('project_id') || undefined

  const start = Date.now()
  console.log(`[cron] Starting queue run${projectId ? ` for project ${projectId}` : ''}`)

  try {
    const stats = await processQueue(projectId)
    const duration = Date.now() - start

    console.log(`[cron] Done in ${duration}ms:`, stats)

    return NextResponse.json({
      ok: true,
      duration_ms: duration,
      ...stats,
    })
  } catch (err) {
    const duration = Date.now() - start
    console.error('[cron] Fatal error:', err)

    return NextResponse.json({
      ok: false,
      duration_ms: duration,
      error: String(err),
    }, { status: 500 })
  }
}

// Also support POST for manual triggers from dashboard
export async function POST(request: NextRequest) {
  return GET(request)
}
