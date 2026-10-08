// Gmail + Calendar → activities / calendar_events (server-only, service role client)
import { getAccessToken, googleGet, GoogleConnection } from './oauth'
import { CrmIndex, domainOf, loadCrmIndex, matchParticipants, parseAddresses } from './matching'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary'
const MAX_MESSAGES = 150
const PAST_DAYS = 30
const FUTURE_DAYS = 60

export type SyncResult = { emails: number; meetings: number; events: number; error?: string }

async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  return out
}

// Insert activities, skipping external refs that already exist (also from teammates' mailboxes)
async function insertActivities(svc: any, projectId: string, source: string, rows: any[]) {
  if (!rows.length) return 0
  const refs: string[] = Array.from(new Set(rows.map(r => r.raw_reference)))
  const seen = new Set<string>()
  // Chunked to keep the request URL short
  for (let i = 0; i < refs.length; i += 40) {
    const { data: existing } = await svc.from('activities')
      .select('raw_reference').eq('project_id', projectId).eq('source', source).in('raw_reference', refs.slice(i, i + 40))
    for (const e of existing || []) seen.add(e.raw_reference)
  }
  const fresh = rows.filter(r => {
    if (seen.has(r.raw_reference)) return false
    seen.add(r.raw_reference)
    return true
  })
  if (!fresh.length) return 0
  const { error } = await svc.from('activities').insert(fresh)
  if (error && error.code !== '23505') throw new Error(error.message)
  return error ? 0 : fresh.length
}

async function touchPeople(svc: any, latest: Map<string, string>) {
  await Promise.all(Array.from(latest.entries()).map(([personId, at]) =>
    svc.from('people').update({ last_interaction_at: at }).eq('id', personId)
      .or(`last_interaction_at.is.null,last_interaction_at.lt."${at}"`)))
}

export async function syncGmail(svc: any, conn: GoogleConnection, token: string, index: CrmIndex) {
  // Overlap by an hour so nothing slips through between runs
  const since = conn.gmail_last_synced_at
    ? Math.floor(new Date(conn.gmail_last_synced_at).getTime() / 1000) - 3600
    : Math.floor(Date.now() / 1000) - PAST_DAYS * 86400
  const q = `after:${since} -in:chats -category:promotions -category:social -category:forums`

  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const url = `${GMAIL}/messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await googleGet(token, url)
    for (const m of res.messages || []) ids.push(m.id)
    pageToken = res.nextPageToken
  } while (pageToken && ids.length < MAX_MESSAGES)

  const headersWanted = ['From', 'To', 'Cc', 'Subject', 'Message-ID']
  const msgs = await inChunks(ids.slice(0, MAX_MESSAGES), 10, id =>
    googleGet(token, `${GMAIL}/messages/${id}?format=metadata&${headersWanted.map(h => `metadataHeaders=${h}`).join('&')}`))

  const rows: any[] = []
  const latestByPerson = new Map<string, string>()
  for (const m of msgs) {
    const h: Record<string, string> = {}
    for (const x of m.payload?.headers || []) h[x.name.toLowerCase()] = x.value
    const from = parseAddresses(h['from'])
    const all = [...from, ...parseAddresses(h['to']), ...parseAddresses(h['cc'])]
    const match = matchParticipants(index, all)
    if (!match?.companyId) continue

    const occurredAt = new Date(Number(m.internalDate)).toISOString()
    const outbound = from.some(a => domainOf(a) === index.internalDomain)
    rows.push({
      project_id: conn.project_id,
      company_id: match.companyId,
      person_id: match.personId,
      opportunity_id: index.openDealByCompany.get(match.companyId) ?? null,
      activity_type: 'email',
      direction: outbound ? 'outbound' : 'inbound',
      channel: 'email',
      occurred_at: occurredAt,
      summary: h['subject'] || '(kein Betreff)',
      raw_reference: h['message-id'] || `gmail:${m.id}`,
      extracted_intel: { snippet: m.snippet ?? null, from: h['from'] ?? null, to: h['to'] ?? null, mailbox: conn.google_email },
      source: 'gmail',
      created_by: conn.google_email,
    })
    if (match.personId && (latestByPerson.get(match.personId) ?? '') < occurredAt) latestByPerson.set(match.personId, occurredAt)
  }

  const inserted = await insertActivities(svc, conn.project_id, 'gmail', rows)
  await touchPeople(svc, latestByPerson)
  return inserted
}

export async function syncCalendar(svc: any, conn: GoogleConnection, token: string, index: CrmIndex) {
  const timeMin = new Date(Date.now() - PAST_DAYS * 86400000).toISOString()
  const timeMax = new Date(Date.now() + FUTURE_DAYS * 86400000).toISOString()
  const events: any[] = []
  let pageToken: string | undefined
  do {
    const url = `${CAL}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await googleGet(token, url)
    events.push(...(res.items || []))
    pageToken = res.nextPageToken
  } while (pageToken && events.length < 1000)

  const now = Date.now()
  const rows: any[] = []
  const meetings: any[] = []
  const latestByPerson = new Map<string, string>()

  for (const e of events) {
    if (e.status === 'cancelled' || !e.start) continue
    // Skip events the user declined
    const self = (e.attendees || []).find((a: any) => a.self)
    if (self?.responseStatus === 'declined') continue

    const allDay = !!e.start.date
    const startAt = new Date(e.start.dateTime || `${e.start.date}T00:00:00`).toISOString()
    const endAt = e.end ? new Date(e.end.dateTime || `${e.end.date}T00:00:00`).toISOString() : null
    const attendees = (e.attendees || []).map((a: any) => ({ email: a.email?.toLowerCase(), name: a.displayName ?? null, status: a.responseStatus ?? null }))
    const match = matchParticipants(index, attendees.map((a: any) => a.email).filter(Boolean))

    rows.push({
      project_id: conn.project_id,
      user_id: conn.user_id,
      google_event_id: e.id,
      title: e.summary || '(ohne Titel)',
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      location: e.location ?? null,
      meet_link: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri ?? null,
      html_link: e.htmlLink ?? null,
      organizer_email: e.organizer?.email ?? null,
      attendees,
      company_id: match?.companyId ?? null,
      person_id: match?.personId ?? null,
      updated_at: new Date().toISOString(),
    })

    // Past meetings with a known company become activities (once per meeting, team-wide)
    if (match?.companyId && !allDay && endAt && new Date(endAt).getTime() < now) {
      meetings.push({
        project_id: conn.project_id,
        company_id: match.companyId,
        person_id: match.personId,
        opportunity_id: index.openDealByCompany.get(match.companyId) ?? null,
        activity_type: 'meeting',
        direction: 'outbound',
        channel: 'calendar',
        occurred_at: startAt,
        summary: e.summary || 'Meeting',
        raw_reference: `${e.iCalUID || e.id}:${startAt}`,
        extracted_intel: { attendees: attendees.map((a: any) => a.email), calendar: conn.google_email },
        source: 'calendar',
        created_by: conn.google_email,
      })
      if (match.personId && (latestByPerson.get(match.personId) ?? '') < startAt) latestByPerson.set(match.personId, startAt)
    }
  }

  if (rows.length) {
    const { error } = await svc.from('calendar_events').upsert(rows, { onConflict: 'user_id,google_event_id' })
    if (error) throw new Error(error.message)
  }
  // Remove events that were deleted/cancelled in Google within the synced window
  const keep = new Set(rows.map(r => r.google_event_id))
  const { data: stored } = await svc.from('calendar_events')
    .select('id, google_event_id').eq('user_id', conn.user_id).gte('start_at', timeMin).lte('start_at', timeMax)
  const stale = (stored || []).filter((e: any) => !keep.has(e.google_event_id)).map((e: any) => e.id)
  for (let i = 0; i < stale.length; i += 50) {
    await svc.from('calendar_events').delete().in('id', stale.slice(i, i + 50))
  }

  const inserted = await insertActivities(svc, conn.project_id, 'calendar', meetings)
  await touchPeople(svc, latestByPerson)
  return { events: rows.length, meetings: inserted }
}

export async function syncConnection(svc: any, conn: GoogleConnection): Promise<SyncResult> {
  const startedAt = new Date().toISOString()
  try {
    const token = await getAccessToken(svc, conn)
    const index = await loadCrmIndex(svc, conn.project_id, domainOf(conn.google_email))
    const emails = await syncGmail(svc, conn, token, index)
    const cal = await syncCalendar(svc, conn, token, index)
    await svc.from('google_connections').update({
      gmail_last_synced_at: startedAt, calendar_last_synced_at: startedAt, last_error: null,
    }).eq('user_id', conn.user_id)
    return { emails, meetings: cal.meetings, events: cal.events }
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 500)
    await svc.from('google_connections').update({ last_error: message }).eq('user_id', conn.user_id)
    return { emails: 0, meetings: 0, events: 0, error: message }
  }
}
