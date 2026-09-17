import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const params = new URLSearchParams()
  if (body.project_id) params.set('project_id', body.project_id)

  const vercelUrl = process.env.VERCEL_URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
    (vercelUrl ? 'https://' + vercelUrl : 'http://localhost:3000')

  const res = await fetch(baseUrl + '/api/cron/process-queue?' + params.toString(), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cronSecret },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
