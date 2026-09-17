import { createClient } from '@/lib/supabase/server'
import TriggerQueueButton from './TriggerQueueButton'
import ActionCard from './ActionCard'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Kritisch', color: 'bg-red-100 text-red-700' },
  2: { label: 'Dringend', color: 'bg-orange-100 text-orange-700' },
  3: { label: 'Wichtig',  color: 'bg-yellow-100 text-yellow-700' },
  4: { label: 'Normal',   color: 'bg-blue-100 text-blue-700' },
  5: { label: 'Optional', color: 'bg-gray-100 text-gray-500' },
}

export default async function TodayPage() {
  const supabase = createClient()

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
  )
}
