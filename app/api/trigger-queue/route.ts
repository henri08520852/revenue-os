import { NextResponse } from 'next/server'
import { processQueue } from '@/lib/connectors/runner'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  try {
    const stats = await processQueue(body.project_id)
    return NextResponse.json({ ok: true, processed: (stats as any).processed ?? 0 })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
