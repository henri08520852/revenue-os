import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import TriggerQueueButton from './TriggerQueueButton'
import ActionCard from './ActionCard'
import DueList, { DueItem } from './DueList'
import { getTeamContext, memberName } from '@/lib/team'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Kritisch', color: 'bg-red-100 text-red-700' },
  2: { label: 'Dringend', color: 'bg-orange-100 text-orange-700' },
  3: { label: 'Wichtig',  color: 'bg-yellow-100 text-yellow-700' },
  4: { label: 'Normal',   color: 'bg-blue-100 text-blue-700' },
  5: { label: 'Optional', color: 'bg-gray-100 text-gray-500' },
}

export default async function TodayPage({ searchParams }: { searchParams: { mine?: string } }) {
  const supabase = createClient()
  const { me, team } = await getTeamContext()
  const mineOnly = searchParams.mine === '1' && !!me

  const { data: actions } = await supabase
    .from('actions')
    .select('*, company:companies(name)')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .limit(20)

  const { data: signals } = await supabase
    .from('signals')
    .select('*, company:companies(name)')
    .eq('project_id', PROJECT_ID)
    .order('created_at', { ascending: false })
    .limit(10)

  // Due list: everything up to the end of this week (incl. overdue); DueList buckets by Berlin day
  const dueUntil = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()

  const { data: dueLeads } = await (supabase as any)
    .from('leads')
    .select('id, name, owner_id, next_follow_up_at, company:companies(name), person:people(full_name, first_name, last_name)')
    .eq('project_id', PROJECT_ID)
    .not('next_follow_up_at', 'is', null)
    .not('stage', 'in', '(converted,disqualified)')
    .lte('next_follow_up_at', dueUntil)
    .order('next_follow_up_at', { ascending: true })
    .limit(100)

  const { data: dueDeals } = await (supabase as any)
    .from('opportunities')
    .select('id, name, owner_id, next_step, next_step_due_at, company:companies(name)')
    .eq('project_id', PROJECT_ID)
    .not('next_step_due_at', 'is', null)
    .not('stage', 'in', '(won,lost)')
    .lte('next_step_due_at', dueUntil)
    .order('next_step_due_at', { ascending: true })
    .limit(100)

  // Company-level follow-ups (set via the Follow-up button on the company page)
  const { data: dueCompanies } = await (supabase as any)
    .from('companies')
    .select('id, name, current_metrics')
    .eq('project_id', PROJECT_ID)
    .not('current_metrics->>next_follow_up_at', 'is', null)
    .lte('current_metrics->>next_follow_up_at', dueUntil)
    .limit(100)

  const allDue: (DueItem & { ownerId: string | null })[] = [
    ...(dueCompanies || []).map((c: any) => ({
      kind: 'company' as const,
      id: c.id,
      href: `/companies/${c.id}`,
      title: c.name,
      subtitle: c.current_metrics?.follow_up_note || 'Erinnerung',
      dueAt: c.current_metrics?.next_follow_up_at,
      ownerId: c.current_metrics?.follow_up_owner_id ?? null,
      owner: memberName(team, c.current_metrics?.follow_up_owner_id),
    })),
    ...(dueLeads || []).map((l: any) => {
      const person = l.person && (l.person.full_name || [l.person.first_name, l.person.last_name].filter(Boolean).join(' '))
      return {
        kind: 'lead' as const,
        id: l.id,
        href: `/leads?focus=${l.id}`,
        title: l.company?.name || l.name || 'Lead',
        subtitle: [person, l.name].filter(Boolean).join(' · ') || 'Follow-up',
        dueAt: l.next_follow_up_at,
        ownerId: l.owner_id ?? null,
        owner: memberName(team, l.owner_id),
      }
    }),
    ...(dueDeals || []).map((o: any) => ({
      kind: 'deal' as const,
      id: o.id,
      href: `/opportunities/${o.id}`,
      title: o.name || o.company?.name || 'Deal',
      subtitle: o.next_step || o.company?.name || null,
      dueAt: o.next_step_due_at,
      ownerId: o.owner_id ?? null,
      owner: memberName(team, o.owner_id),
    })),
  ]
  const dueItems = mineOnly ? allDue.filter(i => i.ownerId === me!.user_id) : allDue

  // Today's meetings from the synced team calendars (Berlin day)
  const berlinToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
  let meetingsQuery = (supabase as any)
    .from('calendar_events')
    .select('id, user_id, title, start_at, end_at, all_day, meet_link, company:companies(id, name)')
    .eq('project_id', PROJECT_ID)
    .gte('start_at', new Date(Date.now() - 86400000).toISOString())
    .lte('start_at', new Date(Date.now() + 86400000).toISOString())
    .order('start_at', { ascending: true })
  if (mineOnly) meetingsQuery = meetingsQuery.eq('user_id', me!.user_id)
  const { data: rawMeetings } = await meetingsQuery
  const seenMeetings = new Set<string>()
  const meetings = (rawMeetings || []).filter((m: any) => {
    const day = m.all_day ? m.start_at.slice(0, 10) : new Date(m.start_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
    const k = `${m.title}|${m.start_at}`
    if (day !== berlinToday || seenMeetings.has(k)) return false
    seenMeetings.add(k)
    return true
  })
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>{today}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{"Today's Queue"}</h1>
          <TriggerQueueButton />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Actions heute', value: actions?.length ?? 0, color: '#2563eb' },
          { label: 'Queue leer', value: actions?.length === 0 ? '✓' : '–', color: '#10b981' },
          { label: 'Active Signale', value: signals?.length ?? 0, color: '#f59e0b' },
          { label: 'Ausstehend', value: actions?.filter(a => a.priority <= 2).length ?? 0, color: '#ef4444' },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{kpi.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <DueList items={dueItems} mineOnly={mineOnly} showToggle={team.length > 0} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{"Prioritäts-Queue · 30 min Budget"}</h2>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{actions?.length ?? 0} Actions</span>
          </div>
          {!actions?.length ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>⚡</p>
              <p style={{ fontWeight: 500, marginBottom: 4 }}>Queue ist leer</p>
              <p style={{ fontSize: 13 }}>{"Füge Unternehmen hinzu und klicke \"Run Queue\""}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {actions.map((action) => (
                <ActionCard key={action.id} action={action} priorityLabels={PRIORITY_LABELS} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Termine heute</h2>
            <Link href="/calendar" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>Kalender →</Link>
          </div>
          {!meetings.length ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Keine Termine heute</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {meetings.map((m: any) => (
                <div key={m.id} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                  <span style={{ color: '#6b7280', width: 42, flexShrink: 0 }}>{m.all_day ? 'ganzt.' : hhmm(m.start_at)}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 500, color: '#111827' }}>{m.title}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      {m.company && <Link href={`/companies/${m.company.id}`} style={{ fontSize: 11, color: '#1d4ed8', textDecoration: 'none' }}>{m.company.name}</Link>}
                      {m.meet_link && <a href={m.meet_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>Meet ↗</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 20 }}>Neue Signale</h2>
          {!signals?.length ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
              <p style={{ fontSize: 13, marginBottom: 4 }}>Noch keine Signale</p>
              <p style={{ fontSize: 12 }}>Werden nach dem Queue-Run generiert</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {signals.map((signal) => (
                <div key={signal.id} style={{ padding: '12px 16px', background: '#f9fafb', borderRadius: 8, fontSize: 13 }}>
                  <p style={{ fontWeight: 500, color: '#111827' }}>{signal.company?.name}</p>
                  <p style={{ color: '#6b7280', marginTop: 2 }}>{signal.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
