'use client'

import { dayKeyBerlin, hhmmBerlin, minutesOfDayBerlin } from '@/lib/tz'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import MeetingDialog, { MeetingData, MeetingPrefill } from '@/components/MeetingDialog'
import FollowUpDialog from './FollowUpDialog'

export type CalView = 'day' | 'week' | 'month'

export type CalItem = {
  id: string
  kind: 'event' | 'lead' | 'deal' | 'company'
  title: string
  sub: string | null
  start: string
  end: string | null
  allDay: boolean
  owners: string[]
  colors: string[]
  company: { id: string; name: string } | null
  meet: string | null
  href: string | null
  external: boolean
}

const HOUR_START = 7
const HOUR_END = 21
const HOUR_PX = 52
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const TASK_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  lead:    { bg: '#f5f3ff', fg: '#6d28d9', icon: '●' },
  deal:    { bg: '#f0fdf4', fg: '#15803d', icon: '◆' },
  company: { bg: '#eff6ff', fg: '#1d4ed8', icon: '⏰' },
}

// Local (browser) day key and helpers — the team works in Europe/Berlin
const localKey = dayKeyBerlin
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const hhmm = (iso: string) => hhmmBerlin(iso)
const minutesOfDay = minutesOfDayBerlin
const itemDay = (it: CalItem) => it.allDay && it.kind === 'event' ? it.start.slice(0, 10) : localKey(new Date(it.start))

// Side-by-side columns for overlapping events within one day
function layout(events: CalItem[]) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
  const out: { it: CalItem; lane: number; lanes: number }[] = []
  let cluster: { it: CalItem; lane: number; end: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map(c => c.lane + 1))
    cluster.forEach(c => out.push({ it: c.it, lane: c.lane, lanes }))
    cluster = []
  }
  for (const it of sorted) {
    const s = new Date(it.start).getTime()
    const e = it.end ? new Date(it.end).getTime() : s + 30 * 60000
    if (cluster.length && s >= clusterEnd) flush()
    const used = new Set(cluster.filter(c => c.end > s).map(c => c.lane))
    let lane = 0
    while (used.has(lane)) lane++
    cluster.push({ it, lane, end: e })
    clusterEnd = Math.max(clusterEnd, e)
  }
  if (cluster.length) flush()
  return out
}

function TaskChip({ it, compact }: { it: CalItem; compact?: boolean }) {
  const st = TASK_STYLE[it.kind]
  return (
    <Link href={it.href || '#'} title={`${it.title}${it.sub ? ' – ' + it.sub : ''}`} style={{ display: 'block', textDecoration: 'none', fontSize: 11, padding: compact ? '2px 6px' : '4px 7px', borderRadius: 6, marginBottom: 3, background: st.bg, color: st.fg, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
      <b>{st.icon} {it.title}</b>{!compact && it.sub ? <span style={{ color: '#6b7280' }}> · {it.sub}</span> : null}
      {!compact && it.owners[0] ? <span style={{ color: '#9ca3af' }}> · {it.owners[0]}</span> : null}
    </Link>
  )
}

function EventBlock({ it, style, compact }: { it: CalItem; style: React.CSSProperties; compact?: boolean }) {
  const color = it.colors[0] || '#6b7280'
  if (compact) {
    // Short events: one line "time title"
    return (
      <div onClick={e => e.stopPropagation()} title={`${hhmm(it.start)} ${it.title}${it.company ? ' · ' + it.company.name : ''}`}
        style={{ position: 'absolute', ...style, background: '#fff', border: '1px solid #e5e7eb', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '2px 6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 11, lineHeight: '16px', cursor: 'default' }}>
        <span style={{ color: '#6b7280' }}>{hhmm(it.start)} </span>
        {it.href ? <a href={it.href} target="_blank" rel="noopener noreferrer" style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>{it.title}</a> : <b>{it.title}</b>}
        {it.meet && <a href={it.meet} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, color: '#2563eb', textDecoration: 'none' }}>Meet ↗</a>}
      </div>
    )
  }
  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', ...style, background: '#fff', border: '1px solid #e5e7eb', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '3px 6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'default' }}>
      <p style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.3 }}>{hhmm(it.start)}{it.end ? `–${hhmm(it.end)}` : ''}</p>
      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#111827', lineHeight: 1.25 }}>
        {it.href ? <a href={it.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{it.title}</a> : it.title}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2, alignItems: 'center' }}>
        {it.company && <Link href={`/companies/${it.company.id}`} style={{ fontSize: 10, fontWeight: 600, padding: '0 5px', borderRadius: 8, background: '#dbeafe', color: '#1d4ed8', textDecoration: 'none' }}>{it.company.name}</Link>}
        {it.meet && <a href={it.meet} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#2563eb', textDecoration: 'none' }}>Meet ↗</a>}
        {it.owners.map((o, j) => <span key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6b7280' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: it.colors[j] }} />{o}</span>)}
      </div>
    </div>
  )
}

function TimeGrid({ dayKeys, items, todayKey, onSlot }: { dayKeys: string[]; items: CalItem[]; todayKey: string; onSlot: (date: string, time: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  // null until mounted: the now-line is client-only (server and browser clocks differ)
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60000)
    // Start scrolled to ~8:00
    if (scroller.current) scroller.current.scrollTop = HOUR_PX * 1
    return () => clearInterval(t)
  }, [])

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const timed = items.filter(it => it.kind === 'event' && !it.allDay)
  const allDay = items.filter(it => it.allDay)
  const cols = `56px repeat(${dayKeys.length}, minmax(0, 1fr))`

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header + all-day / deadlines row */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid #e5e7eb' }}>
        <div />
        {dayKeys.map((d, i) => {
          const isToday = d === todayKey
          const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7
          return (
            <div key={d} style={{ padding: '8px 8px 6px', borderLeft: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? '#2563eb' : '#6b7280' }}>{WEEKDAYS[wd]}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: isToday ? '#fff' : '#111827', background: isToday ? '#2563eb' : 'transparent', borderRadius: 14, padding: isToday ? '0 7px' : 0 }}>{Number(d.slice(8))}</span>
              </div>
              {allDay.filter(it => itemDay(it) === d).map(it => it.kind === 'event'
                ? <div key={it.id} style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, marginBottom: 3, background: '#f3f4f6', borderLeft: `3px solid ${it.colors[0] || '#9ca3af'}`, color: '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{it.title}</div>
                : <TaskChip key={it.id} it={it} compact={dayKeys.length > 1} />)}
            </div>
          )
        })}
      </div>

      {/* Hour grid */}
      <div ref={scroller} style={{ maxHeight: 640, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, position: 'relative' }}>
          <div>
            {hours.map(h => (
              <div key={h} style={{ height: HOUR_PX, fontSize: 10, color: '#9ca3af', textAlign: 'right', paddingRight: 8, transform: 'translateY(-6px)' }}>{h > HOUR_START ? `${String(h).padStart(2, '0')}:00` : ''}</div>
            ))}
          </div>
          {dayKeys.map(d => {
            const dayEvents = layout(timed.filter(it => itemDay(it) === d))
            const isToday = d === todayKey
            const nowTop = now ? (minutesOfDay(now) - HOUR_START * 60) / 60 * HOUR_PX : -1
            return (
              <div key={d}
                onClick={e => {
                  const y = e.clientY - (e.currentTarget as HTMLDivElement).getBoundingClientRect().top
                  const mins = HOUR_START * 60 + Math.max(0, Math.floor(y / HOUR_PX * 2)) * 30
                  onSlot(d, `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)
                }}
                title="Klicken, um hier ein Meeting zu planen"
                style={{ position: 'relative', borderLeft: '1px solid #f3f4f6', height: hours.length * HOUR_PX, background: isToday ? '#fafcff' : undefined, cursor: 'copy',
                  backgroundImage: `repeating-linear-gradient(to bottom, #f3f4f6 0, #f3f4f6 1px, transparent 1px, transparent ${HOUR_PX}px)` }}>
                {dayEvents.map(({ it, lane, lanes }) => {
                  const s = new Date(it.start)
                  const e = it.end ? new Date(it.end) : new Date(s.getTime() + 30 * 60000)
                  const top = Math.max(0, (minutesOfDay(s) - HOUR_START * 60) / 60 * HOUR_PX)
                  const bottom = Math.min(hours.length * HOUR_PX, (minutesOfDay(e) - HOUR_START * 60) / 60 * HOUR_PX)
                  const height = Math.max(22, bottom - top - 2)
                  return <EventBlock key={it.id} it={it} compact={height < 40} style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }} />
                })}
                {isToday && nowTop > 0 && nowTop < hours.length * HOUR_PX && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: nowTop, height: 2, background: '#ef4444', zIndex: 2 }}>
                    <span style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthGrid({ dayKeys, items, todayKey, month, linkFor }: { dayKeys: string[]; items: CalItem[]; todayKey: string; month: string; linkFor: (view: CalView, date: string) => string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid #e5e7eb' }}>
        {WEEKDAYS.map(w => <div key={w} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {dayKeys.map((d, i) => {
          const inMonth = d.slice(0, 7) === month
          const dayItems = items.filter(it => itemDay(it) === d)
            .sort((a, b) => Number(b.kind !== 'event') - Number(a.kind !== 'event') || a.start.localeCompare(b.start))
          const shown = dayItems.slice(0, 3)
          return (
            <div key={d} style={{ minHeight: 112, padding: 6, borderTop: i >= 7 ? '1px solid #f3f4f6' : undefined, borderLeft: i % 7 ? '1px solid #f3f4f6' : undefined, background: inMonth ? (i % 7 >= 5 ? '#fafafa' : '#fff') : '#f9fafb' }}>
              <Link href={linkFor('day', d)} style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, textDecoration: 'none', marginBottom: 4, color: d === todayKey ? '#fff' : inMonth ? '#111827' : '#d1d5db', background: d === todayKey ? '#2563eb' : 'transparent', borderRadius: 10, padding: d === todayKey ? '0 6px' : 0 }}>
                {Number(d.slice(8))}
              </Link>
              {shown.map(it => it.kind === 'event'
                ? <div key={it.id} title={it.title} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, marginBottom: 3, background: '#f9fafb', borderLeft: `3px solid ${it.colors[0] || '#9ca3af'}`, color: '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {!it.allDay && <span style={{ color: '#9ca3af' }}>{hhmm(it.start)} </span>}{it.title}
                  </div>
                : <TaskChip key={it.id} it={it} compact />)}
              {dayItems.length > shown.length && (
                <Link href={linkFor('day', d)} style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>+{dayItems.length - shown.length} weitere</Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarView({ view, anchor, rangeStart, days, todayKey, member, members, items, meeting, hasEvents }: {
  view: CalView
  anchor: string
  rangeStart: string
  days: number
  todayKey: string
  member: string
  members: { key: string; label: string; color: string }[]
  items: CalItem[]
  meeting: MeetingData & { leads: { id: string; label: string }[] }
  hasEvents: boolean
}) {
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [prefill, setPrefill] = useState<MeetingPrefill | undefined>()
  const [followUpOpen, setFollowUpOpen] = useState(false)

  const dayKeys = Array.from({ length: days }, (_, i) => addDays(rangeStart, i))
  const linkFor = (v: CalView, date: string, m = member) => `/calendar?view=${v}&date=${date}${m ? `&member=${m}` : ''}`
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 0
  const prev = view === 'month' ? `${addDays(`${anchor.slice(0, 7)}-01`, -1).slice(0, 7)}-01` : addDays(anchor, -step)
  const next = view === 'month' ? `${addDays(`${anchor.slice(0, 7)}-01`, 32).slice(0, 7)}-01` : addDays(anchor, step)

  const fmt = (k: string, o: Intl.DateTimeFormatOptions) => new Date(`${k}T12:00:00Z`).toLocaleDateString('de-DE', o)
  const title = view === 'day' ? fmt(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : view === 'week' ? `${fmt(dayKeys[0], { day: 'numeric', month: 'long' })} – ${fmt(dayKeys[6], { day: 'numeric', month: 'long', year: 'numeric' })}`
    : fmt(`${anchor.slice(0, 7)}-15`, { month: 'long', year: 'numeric' })

  const btn = { padding: '7px 12px', fontSize: 13, fontWeight: 500, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#374151', textDecoration: 'none', cursor: 'pointer' }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Team-Kalender</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{title}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
            {(['day', 'week', 'month'] as CalView[]).map(v => (
              <Link key={v} href={linkFor(v, anchor)} style={{ fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 6, textDecoration: 'none', background: view === v ? '#fff' : 'transparent', color: view === v ? '#111827' : '#6b7280', boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                {v === 'day' ? 'Tag' : v === 'week' ? 'Woche' : 'Monat'}
              </Link>
            ))}
          </div>
          <Link href={linkFor(view, prev)} style={btn}>←</Link>
          <Link href={linkFor(view, todayKey)} style={btn}>Heute</Link>
          <Link href={linkFor(view, next)} style={btn}>→</Link>
          <button onClick={() => setFollowUpOpen(true)} style={btn}>⏰ Follow-up</button>
          <button onClick={() => { setPrefill({ date: view === 'day' ? anchor : undefined }); setMeetingOpen(true) }}
            style={{ ...btn, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600 }}>+ Meeting</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ key: '', label: 'Alle', color: '' }, ...members].map(f => (
          <Link key={f.key || 'all'} href={linkFor(view, anchor, f.key)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, textDecoration: 'none', background: member === f.key ? '#111827' : '#f3f4f6', color: member === f.key ? '#fff' : '#374151' }}>
            {f.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />}{f.label}
          </Link>
        ))}
        <span style={{ display: 'inline-flex', gap: 10, marginLeft: 8, fontSize: 11, color: '#6b7280' }}>
          <span style={{ color: TASK_STYLE.lead.fg }}>● Lead-Follow-up</span>
          <span style={{ color: TASK_STYLE.deal.fg }}>◆ Deal-Schritt</span>
          <span style={{ color: TASK_STYLE.company.fg }}>⏰ Erinnerung</span>
        </span>
        {!hasEvents && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>Keine Termine – <Link href="/settings" style={{ color: '#2563eb', textDecoration: 'none' }}>Google-Kalender verbinden</Link></span>}
      </div>

      {view === 'month'
        ? <MonthGrid dayKeys={dayKeys} items={items} todayKey={todayKey} month={anchor.slice(0, 7)} linkFor={linkFor} />
        : <TimeGrid dayKeys={dayKeys} items={items} todayKey={todayKey} onSlot={(date, time) => { setPrefill({ date, time }); setMeetingOpen(true) }} />}

      <MeetingDialog open={meetingOpen} onClose={() => setMeetingOpen(false)} data={meeting} prefill={prefill} />
      <FollowUpDialog open={followUpOpen} onClose={() => setFollowUpOpen(false)} date={view === 'day' ? anchor : todayKey}
        leads={meeting.leads} deals={meeting.deals.map(d => ({ id: d.id, label: d.name }))} companies={meeting.companies.map(c => ({ id: c.id, label: c.name }))} />
    </div>
  )
}
