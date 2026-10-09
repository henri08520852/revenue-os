// API for the "Revenue OS für LinkedIn" Chrome extension (linkedin-extension/).
// Runs with the signed-in user's session cookie → same RLS as the app.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'

export const dynamic = 'force-dynamic'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://revenue-os-chi.vercel.app').replace(/\/$/, '')
const LEAD_STAGES: Record<string, string> = { outreach: 'Outreach', contacted: 'Im Gespräch', qualified: 'Qualifiziert', converted: 'Umgewandelt', disqualified: 'Disqualifiziert' }

// Same slug the people trigger stores in linkedin_id (migration 003)
function slugOf(url: string | null | undefined) {
  const m = String(url || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i)
  return m ? m[1] : null
}
const cleanUrl = (slug: string) => `https://www.linkedin.com/in/${slug}/`
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function findPerson(supabase: any, slug: string | null, name: string) {
  if (slug) {
    const { data } = await supabase.from('people').select('id, full_name, first_name, last_name, job_title, company_id, linkedin_url')
      .eq('project_id', PROJECT_ID).eq('linkedin_id', slug).maybeSingle()
    if (data) return data
  }
  if (name) {
    const { data } = await supabase.from('people').select('id, full_name, first_name, last_name, job_title, company_id, linkedin_url')
      .eq('project_id', PROJECT_ID).ilike('full_name', name).limit(2)
    if (data?.length === 1) return data[0]
  }
  return null
}

async function status(supabase: any, person: any) {
  if (!person) return { known: false }
  const companyId = person.company_id
  const [{ data: company }, { data: leads }, { data: deals }, { data: tasks }] = await Promise.all([
    companyId ? supabase.from('companies').select('id, name').eq('id', companyId).single() : Promise.resolve({ data: null }),
    companyId ? supabase.from('leads').select('id, name, stage').eq('company_id', companyId).not('stage', 'in', '(converted)').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    companyId ? supabase.from('opportunities').select('id, name, stage').eq('company_id', companyId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from('tasks').select('title, due_at').eq('person_id', person.id).eq('status', 'open').order('due_at', { ascending: true, nullsFirst: false }).limit(1),
  ])
  return {
    known: true,
    person: { id: person.id, name: person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' '), jobTitle: person.job_title, url: `${APP_URL}/contacts/${person.id}` },
    company: company ? { id: company.id, name: company.name, url: `${APP_URL}/companies/${company.id}` } : null,
    leads: (leads || []).map((l: any) => ({ id: l.id, name: l.name, stage: LEAD_STAGES[l.stage] ?? l.stage, url: `${APP_URL}/pipeline?focus=${l.id}` })),
    deals: (deals || []).map((d: any) => ({ id: d.id, name: d.name, stage: (OPPORTUNITY_STAGE_LABELS as Record<string, string>)[d.stage] ?? d.stage, url: `${APP_URL}/opportunities/${d.id}` })),
    nextTask: tasks?.[0] ?? null,
  }
}

export async function POST(req: Request) {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  const { me, denied } = await getTeamContext()
  if (!user || !me || denied) return NextResponse.json({ error: 'Bitte in Revenue OS anmelden.', login: `${APP_URL}/login` }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const slug = slugOf(body.profileUrl)
  const name = str(body.name, 120)

  try {
    if (body.action === 'lookup') {
      return NextResponse.json(await status(supabase, await findPerson(supabase, slug, name)))
    }

    if (body.action === 'saveProfile') {
      const first = str(body.firstName, 80), last = str(body.lastName, 80)
      if (!first && !last) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 })
      const companyName = str(body.companyName, 120)

      // Company: reuse by name, otherwise create
      let companyId: string | null = null
      if (companyName) {
        const { data: existing } = await supabase.from('companies').select('id').eq('project_id', PROJECT_ID).ilike('name', companyName).limit(1)
        if (existing?.length) companyId = existing[0].id
        else {
          const { data: c, error } = await supabase.from('companies')
            .insert({ project_id: PROJECT_ID, name: companyName, account_status: 'target', source: 'linkedin' }).select('id').single()
          if (error) throw new Error(error.message)
          companyId = c.id
        }
      }

      // Contact: update the known one, otherwise create
      let person = await findPerson(supabase, slug, [first, last].filter(Boolean).join(' '))
      const fields = {
        first_name: first || null, last_name: last || null, full_name: [first, last].filter(Boolean).join(' '),
        job_title: str(body.jobTitle, 160) || null, ...(slug ? { linkedin_url: cleanUrl(slug) } : {}),
        ...(companyId ? { company_id: companyId } : {}),
      }
      if (person) {
        const { error } = await supabase.from('people').update(fields).eq('id', person.id)
        if (error) throw new Error(error.message)
      } else {
        const { data, error } = await supabase.from('people').insert({ project_id: PROJECT_ID, source: 'linkedin', ...fields }).select('id').single()
        if (error) throw new Error(error.message)
        person = { id: data.id }
      }

      // Lead in Outreach (unless the company already has an open lead or deal) + follow-up task
      if (body.createLead && companyId) {
        const [{ data: openLead }, { data: openDeal }] = await Promise.all([
          supabase.from('leads').select('id').eq('company_id', companyId).in('stage', ['outreach', 'contacted', 'qualified']).limit(1),
          supabase.from('opportunities').select('id').eq('company_id', companyId).not('stage', 'in', '(won,lost)').limit(1),
        ])
        if (!openLead?.length && !openDeal?.length) {
          const { data: lead, error } = await supabase.from('leads').insert({
            project_id: PROJECT_ID, company_id: companyId, person_id: person.id, owner_id: user.id,
            stage: 'outreach', source: 'linkedin', name: str(body.leadName, 120) || null,
          }).select('id').single()
          if (error) throw new Error(error.message)
          const days = Math.min(60, Math.max(0, Number(body.followUpDays) || 0))
          if (days) {
            const due = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
            await supabase.from('tasks').insert({
              project_id: PROJECT_ID, title: `LinkedIn Follow-up: ${fields.full_name}`, task_type: 'follow_up',
              due_at: `${due}T10:00:00.000Z`, has_time: false, owner_id: user.id, created_by: user.id,
              company_id: companyId, person_id: person.id, lead_id: lead.id,
            })
          }
        }
      }
      const { data: fresh } = await supabase.from('people').select('id, full_name, first_name, last_name, job_title, company_id, linkedin_url').eq('id', person.id).single()
      return NextResponse.json(await status(supabase, fresh))
    }

    if (body.action === 'logMessage') {
      const text = str(body.text, 8000)
      if (!text) return NextResponse.json({ error: 'Kein Nachrichtentext' }, { status: 400 })
      const person = await findPerson(supabase, slug, name)
      if (!person) return NextResponse.json({ error: 'Kontakt noch nicht in Revenue OS – erst auf seinem Profil speichern.' }, { status: 404 })
      const direction = body.direction === 'inbound' ? 'inbound' : 'outbound'

      // Same text twice → log once
      const ref = `li:${person.id}:${direction}:${text.slice(0, 200)}`
      const { data: dup } = await supabase.from('activities').select('id').eq('person_id', person.id).eq('raw_reference', ref).limit(1)
      if (!dup?.length) {
        const { data: deal } = person.company_id
          ? await supabase.from('opportunities').select('id').eq('company_id', person.company_id).not('stage', 'in', '(won,lost)').order('created_at', { ascending: false }).limit(1)
          : { data: [] }
        const { error } = await supabase.from('activities').insert({
          project_id: PROJECT_ID, company_id: person.company_id, person_id: person.id, opportunity_id: deal?.[0]?.id ?? null,
          activity_type: 'linkedin_message', direction, channel: 'linkedin_message', source: 'manual',
          occurred_at: new Date().toISOString(), created_by: user.email ?? null, raw_reference: ref,
          summary: direction === 'inbound' ? 'LinkedIn-Antwort' : 'LinkedIn-Nachricht',
          extracted_intel: { body: text },
        })
        if (error) throw new Error(error.message)
        if (direction === 'inbound') {
          await supabase.from('people').update({ last_interaction_at: new Date().toISOString() }).eq('id', person.id)
        }
      }
      return NextResponse.json({ ...(await status(supabase, person)), logged: !dup?.length, duplicate: !!dup?.length })
    }

    return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Fehler' }, { status: 400 })
  }
}
