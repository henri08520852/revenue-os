import Link from 'next/link'

const TZ = 'Europe/Berlin'

export type DueItem = {
  kind: 'lead' | 'deal' | 'company'
  id: string
  href: string
  title: string
  subtitle: string | null
  dueAt: string
  owner?: string | null
}

// YYYY-MM-DD of a date in Berlin time — server runs in UTC on Vercel
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

export function groupDue(items: DueItem[], now = new Date()) {
  const { todayKey, weekEndKey } = dueBuckets(now)
  const sorted = items.filter(i => i.dueAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const overdue: DueItem[] = [], today: DueItem[] = [], week: DueItem[] = []
  for (const item of sorted) {
    const key = dayKey(new Date(item.dueAt))
    if (key < todayKey) overdue.push(item)
    else if (key === todayKey) today.push(item)
    else if (key <= weekEndKey) week.push(item)
  }
  return { overdue, today, week }
}

const KIND_META: Record<DueItem['kind'], { label: string; color: string }> = {
  lead:    { label: 'LEAD',    color: '#7c3aed' },
  deal:    { label: 'DEAL',    color: '#16a34a' },
  company: { label: 'ERINNERUNG', color: '#2563eb' },
}

const GROUPS = [
  { key: 'overdue', label: 'Überfällig',   color: '#dc2626', bg: '#fef2f2' },
  { key: 'today',   label: 'Heute',        color: '#2563eb', bg: '#eff6ff' },
  { key: 'week',    label: 'Diese Woche',  color: '#6b7280', bg: '#f9fafb' },
] as const

export default function DueList({ items, mineOnly, showToggle }: { items: DueItem[]; mineOnly?: boolean; showToggle?: boolean }) {
  const groups = groupDue(items)
  const total = groups.overdue.length + groups.today.length + groups.week.length

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Fällig</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{total} Follow-ups & nächste Schritte</span>
          {showToggle && (
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
              {[{ href: '/today', label: 'Alle', active: !mineOnly }, { href: '/today?mine=1', label: 'Meine', active: !!mineOnly }].map(t => (
                <Link key={t.label} href={t.href} style={{ fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 6, textDecoration: 'none', background: t.active ? '#fff' : 'transparent', color: t.active ? '#111827' : '#6b7280', boxShadow: t.active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {total === 0 ? (
        <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
          Diese Woche ist nichts fällig
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {GROUPS.map(g => {
            const list = groups[g.key]
            return (
              <div key={g.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: g.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{list.length}</span>
                </div>
                {list.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#d1d5db' }}>—</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map(item => (
                      <Link key={`${item.kind}-${item.id}`} href={item.href} style={{
                        display: 'block', padding: '10px 12px', background: g.bg, borderRadius: 8,
                        textDecoration: 'none', borderLeft: `3px solid ${g.color}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: KIND_META[item.kind].color, flexShrink: 0 }}>
                            {KIND_META[item.kind].label}
                          </span>
                        </div>
                        {item.subtitle && (
                          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subtitle}</p>
                        )}
                        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          {new Date(item.dueAt).toLocaleDateString('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })}
                          {item.owner ? ` · ${item.owner}` : ''}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
