// API for the "Revenue OS für LinkedIn" Chrome extension (linkedin-extension/).
// Runs with the signed-in user's session cookie → same RLS as the app.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { OPPORTUNITY_STAGE_LABELS } from '@/lib/stages'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/google/oauth'
import { loadCrmIndex } from '@/lib/google/matching'
import { rematchInbox } from '@/lib/google/emails'

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

const PERSON_COLS = 'id, full_name, first_name, last_name, job_title, email, company_id, linkedin_url'

async function findPerson(supabase: any, slug: string | null, name: string, email?: string) {
  if (slug) {
    const { data } = await supabase.from('people').select(PERSON_COLS)
      .eq('project_id', PROJECT_ID).eq('linkedin_id', slug).maybeSingle()
    if (data) return data
  }
  if (email) {
    const { data } = await supabase.from('people').select(PERSON_COLS).eq('project_id', PROJECT_ID).eq('email', email).limit(1)
    if (data?.length) return data[0]
  }
  if (name) {
    const { data } = await supabase.from('people').select(PERSON_COLS)
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
    person: { id: person.id, name: person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' '), jobTitle: person.job_title, email: person.email, url: `${APP_URL}/contacts/${person.id}` },
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
      const [crm, { data: companies }] = await Promise.all([
        status(supabase, await findPerson(supabase, slug, name)),
        supabase.from('companies').select('id, name').eq('project_id', PROJECT_ID).order('name').limit(1000),
      ])
      return NextResponse.json({ ...crm, companies: companies || [] })
    }

    if (body.action === 'saveProfile') {
      const first = str(body.firstName, 80), last = str(body.lastName, 80)
      if (!first && !last) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 })
      const companyName = str(body.companyName, 120)
      const email = str(body.email, 200).toLowerCase() || null

      // Company: picked from the CRM, else reuse by name, else create
      let companyId: string | null = str(body.companyId, 60) || null
      if (!companyId && companyName) {
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
      let person = await findPerson(supabase, slug, [first, last].filter(Boolean).join(' '), email ?? undefined)
      const fields = {
        first_name: first || null, last_name: last || null, full_name: [first, last].filter(Boolean).join(' '),
        job_title: str(body.jobTitle, 160) || null, ...(slug ? { linkedin_url: cleanUrl(slug) } : {}),
        ...(companyId ? { company_id: companyId } : {}), ...(email ? { email } : {}),
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
            stage: body.leadStage === 'contacted' ? 'contacted' : 'outreach', source: 'linkedin', name: str(body.leadName, 120) || null,
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
      // A new email address may match mails waiting in the inbox
      if (email) {
        try { await rematchInbox(supabase, PROJECT_ID, await loadCrmIndex(supabase, PROJECT_ID, ALLOWED_EMAIL_DOMAIN)) } catch { /* nothing to match */ }
      }
      const { data: fresh } = await supabase.from('people').select(PERSON_COLS).eq('id', person.id).single()
      return NextResponse.json(await status(supabase, fresh))
    }

    if (body.action === 'logMessage') {
      // One message ({ text, direction }) or the whole visible conversation ({ messages: [...] })
      // Send time read from the chat; ignored when missing, in the future or implausibly old
      const validAt = (v: unknown) => {
        const t = typeof v === 'string' ? Date.parse(v) : NaN
        return Number.isFinite(t) && t <= Date.now() + 5 * 60000 && t > Date.now() - 5 * 365 * 86400000 ? new Date(t).toISOString() : null
      }
      const list: { text: string; direction: 'inbound' | 'outbound'; at: string | null }[] = (Array.isArray(body.messages) ? body.messages : [{ text: body.text, direction: body.direction, at: body.at }])
        .slice(0, 100).map((m: any) => ({ text: str(m?.text, 8000), direction: m?.direction === 'inbound' ? 'inbound' : 'outbound', at: validAt(m?.at) }))
        .filter((m: { text: string }) => m.text)
      if (!list.length) return NextResponse.json({ error: 'Kein Nachrichtentext' }, { status: 400 })
      const person = await findPerson(supabase, slug, name)
      if (!person) return NextResponse.json({ error: 'Kontakt noch nicht in Revenue OS – erst anlegen.' }, { status: 404 })

      const [{ data: deal }, { data: outreachLead }] = person.company_id ? await Promise.all([
        supabase.from('opportunities').select('id').eq('company_id', person.company_id).not('stage', 'in', '(won,lost)').order('created_at', { ascending: false }).limit(1),
        supabase.from('leads').select('id').eq('company_id', person.company_id).eq('stage', 'outreach').limit(1),
      ]) : [{ data: [] }, { data: [] }]

      // Same text twice → log once
      const refs = list.map(m => `li:${person.id}:${m.direction}:${m.text.slice(0, 200)}`)
      const { data: existing } = await supabase.from('activities').select('id, raw_reference, occurred_at').eq('person_id', person.id).in('raw_reference', refs)
      const seen = new Set((existing || []).map((a: any) => a.raw_reference))
      // Already logged without the real time → correct its date now
      for (const a of existing || []) {
        const at = list[refs.indexOf(a.raw_reference)]?.at
        if (at && Date.parse(at) !== Date.parse(a.occurred_at)) await supabase.from('activities').update({ occurred_at: at }).eq('id', a.id)
      }
      const now = Date.now()
      const rows = list.map((m, i) => ({ m, ref: refs[i], at: m.at ?? new Date(now - (list.length - 1 - i) * 1000).toISOString() }))
        .filter(r => !seen.has(r.ref) && (seen.add(r.ref), true))
        .map(({ m, ref, at }) => ({
          project_id: PROJECT_ID, company_id: person.company_id, person_id: person.id, opportunity_id: deal?.[0]?.id ?? null,
          activity_type: 'linkedin_message', direction: m.direction, channel: 'linkedin_message', source: 'manual',
          occurred_at: at, created_by: user.email ?? null, raw_reference: ref,
          summary: m.direction === 'inbound' ? 'LinkedIn-Antwort' : 'LinkedIn-Nachricht',
          extracted_intel: { body: m.text },
        }))
      if (rows.length) {
        const { error } = await supabase.from('activities').insert(rows)
        if (error) throw new Error(error.message)
      }
      const inbound = rows.some(r => r.direction === 'inbound')
      if (inbound) {
        const latest = rows.filter(r => r.direction === 'inbound').map(r => r.occurred_at).sort().pop()
        await supabase.from('people').update({ last_interaction_at: latest }).eq('id', person.id)
      }
      return NextResponse.json({ ...(await status(supabase, person)), logged: rows.length, duplicate: !rows.length, advanced: inbound && !!outreachLead?.length })
    }

    if (body.action === 'addTask') {
      const title = str(body.title, 200)
      if (!title) return NextResponse.json({ error: 'Titel fehlt' }, { status: 400 })
      const person = await findPerson(supabase, slug, name)
      if (!person) return NextResponse.json({ error: 'Kontakt noch nicht in Revenue OS.' }, { status: 404 })
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || '') ? body.dueDate : null
      // Attach to the open deal, else the open lead of the company
      const [{ data: deal }, { data: lead }] = person.company_id ? await Promise.all([
        supabase.from('opportunities').select('id').eq('company_id', person.company_id).not('stage', 'in', '(won,lost)').order('created_at', { ascending: false }).limit(1),
        supabase.from('leads').select('id').eq('company_id', person.company_id).in('stage', ['outreach', 'contacted', 'qualified']).order('created_at', { ascending: false }).limit(1),
      ]) : [{ data: [] }, { data: [] }]
      const { error } = await supabase.from('tasks').insert({
        project_id: PROJECT_ID, title, task_type: ['call', 'email', 'follow_up', 'meeting'].includes(body.taskType) ? body.taskType : 'todo',
        due_at: date ? `${date}T10:00:00.000Z` : null, has_time: false, owner_id: user.id, created_by: user.id,
        company_id: person.company_id, person_id: person.id,
        opportunity_id: deal?.[0]?.id ?? null, lead_id: deal?.[0]?.id ? null : lead?.[0]?.id ?? null,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ...(await status(supabase, person)), taskAdded: true })
    }

    return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Fehler' }, { status: 400 })
  }
}
