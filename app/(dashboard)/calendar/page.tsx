import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
const TZ = 'Europe/Berlin'
const MEMBER_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2']
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// YYYY-MM-DD in Berlin time
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const mondayOf = (key: string) => {
  const wd = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7 // 0 = Monday
  return addDays(key, -wd)
}
const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

type Item = {
  key: string
  title: string
  start: string
  end: string | null
  allDay: boolean
  owners: string[]
  colors: string[]
  company: { id: string; name: string } | null
  meet: string | null
  link: string | null
}

export default async function CalendarPage({ searchParams }: { searchParams: { week?: string; member?: string } }) {
  const supabase = createClient() as any
  const { me, team } = await getTeamContext()

  const todayKey = dayKey(new Date())
  const weekStart = mondayOf(searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week) ? searchParams.week : todayKey)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  // Query a bit wider than the week, bucket by Berlin day afterwards
  const from = new Date(`${addDays(weekStart, -1)}T00:00:00Z`).toISOString()
  const to = new Date(`${addDays(weekStart, 8)}T00:00:00Z`).toISOString()
  const memberFilter = searchParams.member === 'me' ? me?.user_id : searchParams.member

  const colorOf = new Map(team.map((m, i) => [m.user_id, MEMBER_COLORS[i % MEMBER_COLORS.length]]))
  const nameOf = new Map(team.map(m => [m.user_id, m.display_name]))

  let evQuery = supabase
    .from('calendar_events')
    .select('id, user_id, title, start_at, end_at, all_day, meet_link, html_link, company:companies(id, name)')
    .eq('project_id', PROJECT_ID)
    .gte('start_at', from)
    .lt('start_at', to)
    .order('start_at', { ascending: true })
  if (memberFilter) evQuery = evQuery.eq('user_id', memberFilter)

  const [{ data: events, error: evError }, { data: leads }, { data: deals }] = await Promise.all([
    evQuery,
    supabase.from('leads').select('id, name, owner_id, next_follow_up_at, company:companies(name)')
      .eq('project_id', PROJECT_ID).not('stage', 'in', '(converted,disqualified)')
      .gte('next_follow_up_at', from).lt('next_follow_up_at', to),
    supabase.from('opportunities').select('id, name, owner_id, next_step, next_step_due_at, company:companies(name)')
      .eq('project_id', PROJECT_ID).not('stage', 'in', '(won,lost)')
      .gte('next_step_due_at', from).lt('next_step_due_at', to),
  ])

  // The same meeting in several team calendars is shown once, with all owners
  const grouped = new Map<string, Item>()
  for (const e of events || []) {
    const key = `${e.title}|${e.start_at}`
    const owner = nameOf.get(e.user_id) ?? '?'
    const color = colorOf.get(e.user_id) ?? '#6b7280'
    const existing = grouped.get(key)
    if (existing) {
      if (!existing.owners.includes(owner)) { existing.owners.push(owner); existing.colors.push(color) }
      existing.company ||= e.company
      existing.meet ||= e.meet_link
      continue
    }
    grouped.set(key, {
      key: e.id, title: e.title, start: e.start_at, end: e.end_at, allDay: e.all_day,
      owners: [owner], colors: [color], company: e.company, meet: e.meet_link, link: e.html_link,
    })
  }
  const itemsByDay = new Map<string, Item[]>(days.map(d => [d, []]))
  for (const it of Array.from(grouped.values())) {
    const k = it.allDay ? it.start.slice(0, 10) : dayKey(new Date(it.start))
    itemsByDay.get(k)?.push(it)
  }

  type Task = { key: string; href: string; label: string; sub: string; kind: 'lead' | 'deal' }
  const tasksByDay = new Map<string, Task[]>(days.map(d => [d, []]))
  const ownerOk = (id: string | null) => !memberFilter || id === memberFilter
  for (const l of leads || []) if (ownerOk(l.owner_id)) tasksByDay.get(dayKey(new Date(l.next_follow_up_at)))?.push({
    key: 'l' + l.id, href: `/leads?focus=${l.id}`, kind: 'lead', label: l.company?.name || l.name || 'Lead', sub: 'Follow-up',
  })
  for (const o of deals || []) if (ownerOk(o.owner_id)) tasksByDay.get(dayKey(new Date(o.next_step_due_at)))?.push({
    key: 'o' + o.id, href: `/opportunities/${o.id}`, kind: 'deal', label: o.name || o.company?.name || 'Deal', sub: o.next_step || 'Nächster Schritt',
  })

  const fmtRange = `${new Date(`${days[0]}T12:00:00Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })} – ${new Date(`${days[6]}T12:00:00Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const q = (week: string) => `/calendar?week=${week}${searchParams.member ? `&member=${searchParams.member}` : ''}`
  const navBtn = { padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#374151', textDecoration: 'none' }
  const noEvents = !evError && (events || []).length === 0

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Team-Kalender</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{fmtRange}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href={q(addDays(weekStart, -7))} style={navBtn}>←</Link>
          <Link href={q(mondayOf(todayKey))} style={navBtn}>Heute</Link>
          <Link href={q(addDays(weekStart, 7))} style={navBtn}>→</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ key: '', label: 'Alle', color: null as string | null }, ...team.map(m => ({ key: m.user_id === me?.user_id ? 'me' : m.user_id, label: m.display_name, color: colorOf.get(m.user_id) ?? null }))].map(f => {
          const active = (searchParams.member ?? '') === f.key
          return (
            <Link key={f.key || 'all'} href={`/calendar?week=${weekStart}${f.key ? `&member=${f.key}` : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, textDecoration: 'none', background: active ? '#111827' : '#f3f4f6', color: active ? '#fff' : '#374151' }}>
              {f.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />}
              {f.label}
            </Link>
          )
        })}
        {noEvents && (
          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
            Keine Termine – <Link href="/settings" style={{ color: '#2563eb', textDecoration: 'none' }}>Google-Kalender verbinden</Link>
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', gap: 8, overflowX: 'auto' }}>
        {days.map((d, i) => {
          const isToday = d === todayKey
          const items = (itemsByDay.get(d) || []).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
          const tasks = tasksByDay.get(d) || []
          return (
            <div key={d} style={{ background: i >= 5 ? '#f3f4f6' : '#fff', border: `1px solid ${isToday ? '#93c5fd' : '#e5e7eb'}`, borderRadius: 12, padding: 10, minHeight: 360 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? '#2563eb' : '#6b7280' }}>{WEEKDAYS[i]}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: isToday ? '#2563eb' : '#111827' }}>{Number(d.slice(8, 10))}.</span>
              </div>

              {tasks.map(t => (
                <Link key={t.key} href={t.href} style={{ display: 'block', textDecoration: 'none', fontSize: 11, padding: '5px 7px', borderRadius: 6, marginBottom: 4, background: t.kind === 'deal' ? '#f0fdf4' : '#f5f3ff', color: t.kind === 'deal' ? '#15803d' : '#6d28d9' }}>
                  <b>{t.kind === 'deal' ? '◆' : '●'} {t.label}</b>
                  <span style={{ display: 'block', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.sub}</span>
                </Link>
              ))}

              {items.map(it => (
                <div key={it.key} style={{ padding: '7px 8px', borderRadius: 8, marginBottom: 6, background: '#f9fafb', borderLeft: `3px solid ${it.colors[0]}` }}>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>
                    {it.allDay ? 'ganztägig' : `${time(it.start)}${it.end ? `–${time(it.end)}` : ''}`}
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.3, marginTop: 1, wordBreak: 'break-word' }}>
                    {it.link ? <a href={it.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{it.title}</a> : it.title}
                  </p>
                  {it.company && (
                    <Link href={`/companies/${it.company.id}`} style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: '#dbeafe', color: '#1d4ed8', textDecoration: 'none' }}>
                      {it.company.name}
                    </Link>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {it.owners.map((o, j) => (
                      <span key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6b7280' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.colors[j] }} />{o}
                      </span>
                    ))}
                    {it.meet && <a href={it.meet} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#2563eb', textDecoration: 'none' }}>Meet ↗</a>}
                  </div>
                </div>
              ))}

              {!items.length && !tasks.length && <p style={{ fontSize: 11, color: '#d1d5db' }}>—</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
