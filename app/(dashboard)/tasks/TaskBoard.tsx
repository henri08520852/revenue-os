'use client'

import { useState } from 'react'
import type { Task } from '@/lib/tasks'
import { TaskRow } from '@/components/TaskList'
import TaskDialog, { TaskPickData } from '@/components/TaskDialog'
import { groupTasks } from '../today/DueList'

const GROUPS = [
  { key: 'overdue', label: 'Überfällig',  color: '#dc2626' },
  { key: 'today',   label: 'Heute',       color: '#2563eb' },
  { key: 'week',    label: 'Diese Woche', color: '#374151' },
  { key: 'later',   label: 'Später',      color: '#6b7280' },
  { key: 'none',    label: 'Ohne Datum',  color: '#9ca3af' },
] as const

export default function TaskBoard({ tasks, data, done, showOwner }: { tasks: Task[]; data: TaskPickData; done: boolean; showOwner: boolean }) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const ownerName = (id: string | null) => showOwner ? data.team.find(m => m.user_id === id)?.display_name ?? null : null
  const row = (t: Task) => <TaskRow key={t.id} task={t} ownerName={ownerName(t.owner_id)} onEdit={() => setEditing(t)} />
  const groups = groupTasks(tasks)

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{tasks.length} {done ? 'erledigt' : 'offen'}</span>
        <button onClick={() => setCreating(true)} style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>+ Aufgabe</button>
      </div>
      {!tasks.length && <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>{done ? 'Noch nichts erledigt' : 'Keine offenen Aufgaben 🎉'}</p>}
      {done
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{tasks.map(row)}</div>
        : GROUPS.filter(g => groups[g.key].length).map(g => (
          <div key={g.key} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: g.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{groups[g.key].length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{groups[g.key].map(row)}</div>
          </div>
        ))}
      <TaskDialog open={creating} onClose={() => setCreating(false)} data={data} />
      <TaskDialog open={!!editing} onClose={() => setEditing(null)} data={data} task={editing} />
    </div>
  )
}
