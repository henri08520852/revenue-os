// Shared record page layout (company / contact / deal): steckbrief | timeline | associations
import Link from 'next/link'
import type { UpcomingItem } from '@/lib/records'

export function RecordLayout({ breadcrumb, left, center, right }: {
  breadcrumb: { label: string; href?: string }[]
  left: React.ReactNode
  center: React.ReactNode
  right: React.ReactNode
}) {
  return (
    <div style={{ padding: '20px 28px', maxWidth: 1480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
        {breadcrumb.map((b, i) => (
          <span key={i} style={{ display: 'inline-flex', gap: 6 }}>
            {i > 0 && <span>›</span>}
            {b.href ? <Link href={b.href} style={{ color: '#9ca3af', textDecoration: 'none' }}>{b.label}</Link> : <span style={{ color: '#374151' }}>{b.label}</span>}
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr) minmax(240px, 300px)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{left}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>{center}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{right}</div>
      </div>
    </div>
  )
}

export function Card({ title, count, action, children, pad = 16 }: { title?: string; count?: number; action?: React.ReactNode; children: React.ReactNode; pad?: number }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: pad, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{title}</h3>
            {count !== undefined && <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', borderRadius: 20, padding: '1px 8px' }}>{count}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0' }}>{text}</p>
}

const UP_STYLE: Record<UpcomingItem['kind'], { icon: string; color: string }> = {
  meeting: { icon: '📅', color: '#2563eb' },
  lead:    { icon: '●', color: '#7c3aed' },
  deal:    { icon: '◆', color: '#16a34a' },
  company: { icon: '⏰', color: '#1d4ed8' },
}

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  if (!items.length) return <Empty text="Nichts geplant – lege ein Meeting oder Follow-up an." />
  const startOfToday = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }) + 'T00:00:00')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(u => {
        const overdue = new Date(u.at) < startOfToday
        const st = UP_STYLE[u.kind]
        const when = new Date(u.at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', ...(u.kind === 'meeting' ? { hour: '2-digit', minute: '2-digit' } : {}) })
        // Meeting rows contain a second link (Meet) → the row itself must not be a link (no nested <a>)
        const titleEl = u.meet && u.href
          ? <a href={u.href} target="_blank" rel="noopener noreferrer" style={{ color: '#111827', textDecoration: 'none' }}>{u.title}</a>
          : u.title
        const inner = (
          <>
            <span style={{ color: st.color, width: 16, flexShrink: 0, textAlign: 'center' }}>{st.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleEl}</p>
              {u.sub && <p style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.sub}</p>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? '#dc2626' : '#6b7280', whiteSpace: 'nowrap' }}>{overdue ? '⚠ ' : ''}{when}</span>
            {u.meet && <a href={u.meet} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>Meet ↗</a>}
          </>
        )
        const style = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: overdue ? '#fef2f2' : '#f9fafb', textDecoration: 'none' }
        if (!u.href || u.meet) return <div key={u.id} style={style}>{inner}</div>
        return u.external
          ? <a key={u.id} href={u.href} target="_blank" rel="noopener noreferrer" style={style}>{inner}</a>
          : <Link key={u.id} href={u.href} style={style}>{inner}</Link>
      })}
    </div>
  )
}

// Compact association row used in the right column
export function AssocRow({ href, title, sub, badge, badgeColor }: { href: string; title: string; sub?: string | null; badge?: string | null; badgeColor?: { bg: string; fg: string } }) {
  return (
    <Link href={href} style={{ display: 'block', padding: '9px 10px', borderRadius: 10, border: '1px solid #f3f4f6', textDecoration: 'none', marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {badge && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: badgeColor?.bg ?? '#f3f4f6', color: badgeColor?.fg ?? '#4b5563', whiteSpace: 'nowrap' }}>{badge}</span>}
      </div>
      {sub && <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
    </Link>
  )
}
