import { createClient } from '@/lib/supabase/server'
import { getMeetingData } from '@/lib/meetingData'
import CalendarView, { CalItem, CalView } from './CalendarView'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
const TZ = 'Europe/Berlin'
const MEMBER_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2']

// Day arithmetic on YYYY-MM-DD keys (Berlin calendar days)
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const mondayOf = (key: string) => addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7))

function rangeFor(view: CalView, anchor: string) {
  if (view === 'day') return { start: anchor, days: 1 }
  if (view === 'week') return { start: mondayOf(anchor), days: 7 }
  const first = `${anchor.slice(0, 7)}-01`
  return { start: mondayOf(first), days: 42 }
}

export default async function CalendarPage({ searchParams }: { searchParams: { view?: string; date?: string; week?: string; member?: string } }) {
  const supabase = createClient() as any
  const meeting = await getMeetingData()
  const { team, meId } = meeting

  const view: CalView = searchParams.view === 'day' || searchParams.view === 'month' ? searchParams.view : 'week'
  const todayKey = dayKey(new Date())
  const anchorRaw = searchParams.date || searchParams.week
  const anchor = anchorRaw && /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : todayKey
  const { start, days } = rangeFor(view, anchor)
  // Query one day wider on each side; the client buckets by local day
  const from = new Date(`${addDays(start, -1)}T00:00:00Z`).toISOString()
  const to = new Date(`${addDays(start, days + 1)}T00:00:00Z`).toISOString()
  const memberFilter = searchParams.member === 'me' ? meId : searchParams.member || null

  const colorOf = new Map(team.map((m, i) => [m.user_id, MEMBER_COLORS[i % MEMBER_COLORS.length]]))
  const nameOf = new Map(team.map(m => [m.user_id, m.display_name]))

  let evQuery = supabase
    .from('calendar_events')
    .select('id, user_id, title, start_at, end_at, all_day, meet_link, html_link, company:companies(id, name)')
    .eq('project_id', PROJECT_ID).gte('start_at', from).lt('start_at', to)
    .order('start_at', { ascending: true })
  if (memberFilter) evQuery = evQuery.eq('user_id', memberFilter)

  const [{ data: events }, { data: leads }, { data: deals }, { data: reminders }] = await Promise.all([
    evQuery,
    supabase.from('leads').select('id, name, owner_id, next_follow_up_at, company:companies(id, name)')
      .eq('project_id', PROJECT_ID).not('stage', 'in', '(converted,disqualified)')
      .gte('next_follow_up_at', from).lt('next_follow_up_at', to),
    supabase.from('opportunities').select('id, name, owner_id, next_step, next_step_due_at, company:companies(id, name)')
      .eq('project_id', PROJECT_ID).not('stage', 'in', '(won,lost)')
      .gte('next_step_due_at', from).lt('next_step_due_at', to),
    supabase.from('companies').select('id, name, current_metrics')
      .eq('project_id', PROJECT_ID).not('current_metrics->>next_follow_up_at', 'is', null)
      .gte('current_metrics->>next_follow_up_at', from).lt('current_metrics->>next_follow_up_at', to),
  ])

  // The same meeting in several team calendars is shown once, with all owners
  const grouped = new Map<string, CalItem>()
  for (const e of events || []) {
    const key = `${e.title}|${e.start_at}`
    const owner = nameOf.get(e.user_id) ?? '?'
    const color = colorOf.get(e.user_id) ?? '#6b7280'
    const g = grouped.get(key)
    if (g) {
      if (!g.owners.includes(owner)) { g.owners.push(owner); g.colors.push(color) }
      g.company ||= e.company
      g.meet ||= e.meet_link
      continue
    }
    grouped.set(key, {
      id: e.id, kind: 'event', title: e.title, sub: null, start: e.start_at, end: e.end_at, allDay: e.all_day,
      owners: [owner], colors: [color], company: e.company, meet: e.meet_link, href: e.html_link, external: true,
    })
  }

  const ownerOk = (id: string | null) => !memberFilter || id === memberFilter
  const tasks: CalItem[] = [
    ...(leads || []).filter((l: any) => ownerOk(l.owner_id)).map((l: any): CalItem => ({
      id: 'l' + l.id, kind: 'lead', title: l.company?.name || l.name || 'Lead', sub: 'Follow-up', start: l.next_follow_up_at, end: null, allDay: true,
      owners: [nameOf.get(l.owner_id) ?? ''].filter(Boolean), colors: [], company: l.company, meet: null, href: `/leads?focus=${l.id}`, external: false,
    })),
    ...(deals || []).filter((o: any) => ownerOk(o.owner_id)).map((o: any): CalItem => ({
      id: 'o' + o.id, kind: 'deal', title: o.name || o.company?.name || 'Deal', sub: o.next_step || 'Nächster Schritt', start: o.next_step_due_at, end: null, allDay: true,
      owners: [nameOf.get(o.owner_id) ?? ''].filter(Boolean), colors: [], company: o.company, meet: null, href: `/opportunities/${o.id}`, external: false,
    })),
    ...(reminders || []).filter((c: any) => ownerOk(c.current_metrics?.follow_up_owner_id ?? null)).map((c: any): CalItem => ({
      id: 'c' + c.id, kind: 'company', title: c.name, sub: c.current_metrics?.follow_up_note || 'Erinnerung', start: c.current_metrics.next_follow_up_at, end: null, allDay: true,
      owners: [nameOf.get(c.current_metrics?.follow_up_owner_id) ?? ''].filter(Boolean), colors: [], company: { id: c.id, name: c.name }, meet: null, href: `/companies/${c.id}`, external: false,
    })),
  ]

  return (
    <CalendarView
      view={view}
      anchor={anchor}
      rangeStart={start}
      days={days}
      todayKey={todayKey}
      member={searchParams.member ?? ''}
      members={team.map(m => ({ key: m.user_id === meId ? 'me' : m.user_id, label: m.display_name, color: colorOf.get(m.user_id) ?? '#6b7280' }))}
      items={[...Array.from(grouped.values()), ...tasks]}
      meeting={meeting}
      hasEvents={(events || []).length > 0}
    />
  )
}
