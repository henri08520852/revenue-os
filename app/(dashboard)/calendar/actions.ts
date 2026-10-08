'use server'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canWriteCalendar, getAccessToken } from '@/lib/google/oauth'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

type Result = { error: string | null; reconnect?: boolean; meetLink?: string | null }

export type MeetingInput = {
  title: string
  startIso: string          // computed in the browser from local date + time
  durationMin: number
  attendees: string[]       // external + internal emails
  description: string | null
  companyId: string | null
  personId: string | null
  opportunityId: string | null
  withMeet: boolean
  sendInvites: boolean
  setAsNextStep: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Creates the event in the organizer's Google Calendar (Google sends the invitations),
// mirrors it into the team calendar and optionally makes it the deal's next step.
export async function createMeeting(input: MeetingInput): Promise<Result> {
  const title = input.title.trim()
  if (!title) return { error: 'Bitte einen Titel eingeben' }
  const start = new Date(input.startIso)
  if (isNaN(start.getTime())) return { error: 'Ungültiges Datum' }
  const end = new Date(start.getTime() + Math.max(15, input.durationMin) * 60000)
  const attendees = Array.from(new Set(input.attendees.map(a => a.trim().toLowerCase()).filter(Boolean)))
  const invalid = attendees.find(a => !EMAIL_RE.test(a))
  if (invalid) return { error: `Ungültige E-Mail: ${invalid}` }

  const { data: { user } } = await (createClient() as any).auth.getUser()
  if (!user) return { error: 'Nicht angemeldet' }

  const svc = createServiceClient()
  const { data: conn } = await svc.from('google_connections').select('*').eq('user_id', user.id).maybeSingle()
  if (!conn) return { error: 'Bitte zuerst unter Einstellungen Gmail & Kalender verbinden', reconnect: true }
  if (!canWriteCalendar(conn.scopes)) return { error: 'Für Meetings bitte Google unter Einstellungen einmal neu verbinden (Schreibrecht für den Kalender)', reconnect: true }

  let token: string
  try {
    token = await getAccessToken(svc, conn)
  } catch (err: any) {
    return { error: `Google-Zugriff fehlgeschlagen: ${err?.message}`, reconnect: true }
  }

  const body: any = {
    summary: title,
    description: input.description || undefined,
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Berlin' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Berlin' },
    attendees: attendees.map(email => ({ email })),
    reminders: { useDefault: true },
  }
  if (input.withMeet) {
    body.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${input.sendInvites ? 'all' : 'none'}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const ev = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = ev?.error?.message || `Google API ${res.status}`
    return { error: `Termin konnte nicht angelegt werden: ${msg}`, reconnect: res.status === 403 || res.status === 401 }
  }

  const meetLink = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri ?? null

  // Show it in the team calendar right away (the next sync keeps it up to date)
  await svc.from('calendar_events').upsert({
    project_id: conn.project_id,
    user_id: user.id,
    google_event_id: ev.id,
    title,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: false,
    meet_link: meetLink,
    html_link: ev.htmlLink ?? null,
    organizer_email: conn.google_email,
    attendees: attendees.map(email => ({ email, name: null, status: 'needsAction' })),
    company_id: input.companyId,
    person_id: input.personId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,google_event_id' })

  // The meeting becomes an open task on the deal → it is the deal's next step (trigger, migration 022)
  if (input.opportunityId && input.setAsNextStep) {
    await svc.from('tasks').insert({
      project_id: conn.project_id, title: `Meeting: ${title}`, task_type: 'meeting',
      due_at: start.toISOString(), has_time: true, owner_id: user.id, created_by: user.id,
      opportunity_id: input.opportunityId, company_id: input.companyId, person_id: input.personId,
    })
  }

  revalidatePath('/calendar')
  revalidatePath('/today')
  if (input.opportunityId) revalidatePath(`/opportunities/${input.opportunityId}`)
  if (input.companyId) revalidatePath(`/companies/${input.companyId}`)
  return { error: null, meetLink }
}
