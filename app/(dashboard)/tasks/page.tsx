import Link from 'next/link'
import { loadTasks } from '@/lib/tasks'
import { getMeetingData } from '@/lib/meetingData'
import TaskBoard from './TaskBoard'

export default async function TasksPage({ searchParams }: { searchParams: { mine?: string; status?: string } }) {
  const data = await getMeetingData()
  const mineOnly = searchParams.mine !== '0' && !!data.meId   // default: my tasks
  const done = searchParams.status === 'done'
  const tasks = await loadTasks({ status: done ? 'done' : 'open', ownerId: mineOnly ? data.meId : null, limit: done ? 100 : 500 })

  const link = (p: { mine?: boolean; done?: boolean }) => {
    const m = p.mine ?? mineOnly, d = p.done ?? done
    const q = [m ? null : 'mine=0', d ? 'status=done' : null].filter(Boolean).join('&')
    return `/tasks${q ? '?' + q : ''}`
  }
  const tab = (active: boolean) => ({ fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 6, textDecoration: 'none', background: active ? '#fff' : 'transparent', color: active ? '#111827' : '#6b7280', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Aufgaben</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Follow-ups, Anrufe, nächste Schritte – verknüpft mit Company, Kontakt, Lead oder Deal</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
            <Link href={link({ mine: true })} style={tab(mineOnly)}>Meine</Link>
            <Link href={link({ mine: false })} style={tab(!mineOnly)}>Alle</Link>
          </div>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
            <Link href={link({ done: false })} style={tab(!done)}>Offen</Link>
            <Link href={link({ done: true })} style={tab(done)}>Erledigt</Link>
          </div>
        </div>
      </div>
      <TaskBoard tasks={tasks} data={data} done={done} showOwner={!mineOnly} />
    </div>
  )
}
