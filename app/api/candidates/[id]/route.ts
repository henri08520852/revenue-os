import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  let body: { action?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { action } = body
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'invalid action' }, { status: 400 })

  const supabase = createServiceClient()

  if (action === 'reject') {
    const { error } = await supabase.from('candidate_companies').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { data: candidate, error: fetchError } = await supabase.from('candidate_companies').select('name, project_id').eq('id', id).single()
  if (fetchError || !candidate) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: company, error: insertError } = await supabase.from('companies').insert({ project_id: candidate.project_id, name: candidate.name, account_status: 'target' }).select('id').single()
  if (insertError || !company) return NextResponse.json({ error: insertError?.message ?? 'insert failed' }, { status: 500 })

  await supabase.from('candidate_companies').update({ status: 'approved', existing_company_id: company.id, reviewed_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true, company_id: company.id })
}
