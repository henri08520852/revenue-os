'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { Task } from '@/lib/tasks'
import TaskDialog, { TASK_TYPES, TaskLink, TaskPickData } from './TaskDialog'
import { deleteTask, setTaskDone } from '@/app/(dashboard)/tasks/actions'

const TZ = 'Europe/Berlin'
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })

export function dueLabel(t: Pick<Task, 'due_at' | 'has_time'>) {
  if (!t.due_at) return null
  const d = new Date(t.due_at)
  const k = dayKey(d)
  const today = dayKey(new Date())
  const tomorrow = dayKey(new Date(Date.now() + 86400000))
  const day = k === today ? 'Heute' : k === tomorrow ? 'Morgen' : d.toLocaleDateString('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })
  return t.has_time ? `${day}, ${d.toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}` : day
}

export function isOverdue(t: Pick<Task, 'due_at' | 'has_time' | 'status'>) {
  if (!t.due_at || t.status === 'done') return false
  return t.has_time ? new Date(t.due_at).getTime() < Date.now() : dayKey(new Date(t.due_at)) < dayKey(new Date())
}

// One task row: checkbox, title, due badge, owner, linked record(s)
export function TaskRow({ task, ownerName, hideLinks, onEdit }: { task: Task; ownerName?: string | null; hideLinks?: ('company' | 'person' | 'deal' | 'lead')[]; onEdit?: () => void }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(task.status === 'done')
  const overdue = isOverdue({ ...task, status: done ? 'done' : 'open' })
  const type = TASK_TYPES.find(t => t.key === task.task_type)
  const hide = new Set(hideLinks ?? [])
  const links = [
    !hide.has('deal') && task.deal ? { href: `/opportunities/${task.deal.id}`, label: `◆ ${task.deal.name || 'Deal'}`, color: '#16a34a' } : null,
    !hide.has('lead') && task.lead && !task.deal ? { href: `/leads?focus=${task.lead.id}`, label: `● Lead${task.lead.name ? ' ' + task.lead.name : ''}`, color: '#7c3aed' } : null,
    !hide.has('company') && task.company ? { href: `/companies/${task.company.id}`, label: task.company.name, color: '#1d4ed8' } : null,
    !hide.has('person') && task.person ? { href: `/contacts/${task.person.id}`, label: `👤 ${task.person.name}`, color: '#2563eb' } : null,
  ].filter(Boolean) as { href: string; label: string; color: string }[]

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 10, background: overdue ? '#fef2f2' : '#f9fafb', opacity: pending ? 0.6 : 1 }}>
      <input type="checkbox" checked={done} title={done ? 'Wieder öffnen' : 'Erledigt'}
        onChange={e => { const v = e.target.checked; setDone(v); startTransition(async () => { const r = await setTaskDone(task.id, v); if (r.error) setDone(!v) }) }}
        style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={onEdit} disabled={!onEdit} style={{ all: 'unset', cursor: onEdit ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, color: done ? '#9ca3af' : '#111827', textDecoration: done ? 'line-through' : 'none', wordBreak: 'break-word' }}>
            {type?.icon} {task.title}
          </button>
          {task.due_at && <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? '#dc2626' : '#6b7280', whiteSpace: 'nowrap' }}>{overdue ? '⚠ ' : ''}{dueLabel(task)}</span>}
        </div>
        {(links.length > 0 || ownerName) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2, fontSize: 11 }}>
            {links.map(l => <Link key={l.href} href={l.href} style={{ color: l.color, textDecoration: 'none' }}>{l.label}</Link>)}
            {ownerName && <span style={{ color: '#9ca3af' }}>{ownerName}</span>}
          </div>
        )}
        {task.notes && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2, whiteSpace: 'pre-wrap' }}>{task.notes}</p>}
      </div>
      {onEdit && (
        <button onClick={() => { if (confirm('Aufgabe löschen?')) startTransition(async () => { await deleteTask(task.id) }) }} title="Löschen"
          style={{ border: 'none', background: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
      )}
    </div>
  )
}

// Task block for record pages: open tasks of the record + "+ Aufgabe"
export default function TaskList({ tasks, data, link, hideLinks, emptyText = 'Keine offenen Aufgaben' }: {
  tasks: Task[]
  data: TaskPickData
  link?: TaskLink
  hideLinks?: ('company' | 'person' | 'deal' | 'lead')[]
  emptyText?: string
}) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const ownerName = (id: string | null) => data.team.find(m => m.user_id === id)?.display_name ?? null
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.map(t => <TaskRow key={t.id} task={t} ownerName={ownerName(t.owner_id)} hideLinks={hideLinks} onEdit={() => setEditing(t)} />)}
        {!tasks.length && <p style={{ fontSize: 12, color: '#9ca3af' }}>{emptyText}</p>}
      </div>
      <button onClick={() => setCreating(true)} style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Aufgabe</button>
      <TaskDialog open={creating} onClose={() => setCreating(false)} data={data} link={link} />
      <TaskDialog open={!!editing} onClose={() => setEditing(null)} data={data} task={editing} />
    </div>
  )
}
