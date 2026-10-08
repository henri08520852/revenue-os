'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Task } from '@/lib/tasks'
import { TaskRow } from '@/components/TaskList'
import TaskDialog, { TaskPickData } from '@/components/TaskDialog'

const TZ = 'Europe/Berlin'

// YYYY-MM-DD of a date in Berlin time
function dayKey(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

export function dueBuckets(now = new Date()) {
  const todayKey = dayKey(now)
  const weekday = new Date(`${todayKey}T12:00:00Z`).getUTCDay() // 0 = Sunday
  const daysToSunday = (7 - weekday) % 7
  const sunday = new Date(`${todayKey}T12:00:00Z`)
  sunday.setUTCDate(sunday.getUTCDate() + daysToSunday)
  return { todayKey, weekEndKey: sunday.toISOString().slice(0, 10) }
}

export function groupTasks(tasks: Task[], now = new Date()) {
  const { todayKey, weekEndKey } = dueBuckets(now)
  const overdue: Task[] = [], today: Task[] = [], week: Task[] = [], later: Task[] = [], none: Task[] = []
  for (const t of tasks) {
    if (!t.due_at) { none.push(t); continue }
    const key = dayKey(new Date(t.due_at))
    if (key < todayKey) overdue.push(t)
    else if (key === todayKey) today.push(t)
    else if (key <= weekEndKey) week.push(t)
    else later.push(t)
  }
  return { overdue, today, week, later, none }
}

const GROUPS = [
  { key: 'overdue', label: 'Überfällig',  color: '#dc2626' },
  { key: 'today',   label: 'Heute',       color: '#2563eb' },
  { key: 'week',    label: 'Diese Woche', color: '#6b7280' },
] as const

// "Fällig" block on the Today page: open tasks up to the end of this week, tick off inline
export default function DueList({ tasks, data, mineOnly, showToggle }: { tasks: Task[]; data: TaskPickData; mineOnly?: boolean; showToggle?: boolean }) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const groups = groupTasks(tasks)
  const total = groups.overdue.length + groups.today.length + groups.week.length
  const ownerName = (id: string | null) => data.team.find(m => m.user_id === id)?.display_name ?? null

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Fällige Aufgaben</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/tasks" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>Alle Aufgaben →</Link>
          {showToggle && (
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
              {[{ href: '/today', label: 'Alle', active: !mineOnly }, { href: '/today?mine=1', label: 'Meine', active: !!mineOnly }].map(t => (
                <Link key={t.label} href={t.href} style={{ fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 6, textDecoration: 'none', background: t.active ? '#fff' : 'transparent', color: t.active ? '#111827' : '#6b7280', boxShadow: t.active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                  {t.label}
                </Link>
              ))}
            </div>
          )}
          <button onClick={() => setCreating(true)} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>+ Aufgabe</button>
        </div>
      </div>

      {total === 0 ? (
        <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
          Diese Woche ist nichts fällig 🎉
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {GROUPS.map(g => {
            const list = groups[g.key]
            return (
              <div key={g.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: g.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{list.length}</span>
                </div>
                {list.length === 0
                  ? <p style={{ fontSize: 12, color: '#d1d5db' }}>—</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {list.map(t => <TaskRow key={t.id} task={t} ownerName={mineOnly ? null : ownerName(t.owner_id)} onEdit={() => setEditing(t)} />)}
                    </div>}
              </div>
            )
          })}
        </div>
      )}
      <TaskDialog open={creating} onClose={() => setCreating(false)} data={data} />
      <TaskDialog open={!!editing} onClose={() => setEditing(null)} data={data} task={editing} />
    </div>
  )
}
