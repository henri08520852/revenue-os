import Link from 'next/link'
import { loadTasks, TaskArea } from '@/lib/tasks'
import { getMeetingData } from '@/lib/meetingData'
import TaskBoard from './TaskBoard'

// Short explanation per tab, shown under the heading
const AREA_INFO: Record<string, string> = {
  all: 'Alle Aufgaben aus Akquise, Sales und Operations an einem Ort',
  akquise: 'Aufgaben zu konkreten Firmen, Leads und Deals – auch alles, was Akquise-Abfolgen und der Follow-up-Wächter automatisch anlegen',
  sales: 'Eigene Vertriebsaufgaben ohne festen Kontakt, z. B. Pitch-Deck, Preise, Zielgruppenlisten – Verknüpfung optional',
  operations: 'Interne Aufgaben rund um Firma und Betrieb, z. B. Verträge, Buchhaltung, Tools, Website – keine CRM-Verknüpfung nötig',
}

export default async function TasksPage({ searchParams }: { searchParams: { mine?: string; status?: string; area?: string } }) {
  const data = await getMeetingData()
  const mineOnly = searchParams.mine !== '0' && !!data.meId   // default: my tasks
  const done = searchParams.status === 'done'
  const area = (['akquise', 'operations', 'sales'] as const).find(a => a === searchParams.area) ?? null as TaskArea | null
  const tasks = await loadTasks({ status: done ? 'done' : 'open', ownerId: mineOnly ? data.meId : null, area, limit: done ? 100 : 500 })

  const link = (p: { mine?: boolean; done?: boolean; area?: TaskArea | null }) => {
    const m = p.mine ?? mineOnly, d = p.done ?? done, a = p.area === undefined ? area : p.area
    const q = [a ? `area=${a}` : null, m ? null : 'mine=0', d ? 'status=done' : null].filter(Boolean).join('&')
    return `/tasks${q ? '?' + q : ''}`
  }
  const tab = (active: boolean) => ({ fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 6, textDecoration: 'none', background: active ? '#fff' : 'transparent', color: active ? '#111827' : '#6b7280', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>Aufgaben</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{AREA_INFO[area ?? 'all']}</p>
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
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {([[null, 'Alle'], ['akquise', 'Akquise'], ['sales', 'Sales'], ['operations', 'Operations']] as [TaskArea | null, string][]).map(([a, l]) => (
          <Link key={l} href={link({ area: a })} style={{ fontSize: 14, fontWeight: 600, padding: '8px 14px', textDecoration: 'none', marginBottom: -1, color: area === a ? '#2563eb' : '#6b7280', borderBottom: `2px solid ${area === a ? '#2563eb' : 'transparent'}` }}>{l}</Link>
        ))}
      </div>
      <TaskBoard tasks={tasks} data={data} done={done} showOwner={!mineOnly} area={area} />
    </div>
  )
}
