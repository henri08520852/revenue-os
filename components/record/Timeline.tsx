'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { TimelineItem } from '@/lib/records'
import { deleteActivity } from '@/app/(dashboard)/records/actions'

const STYLE: Record<TimelineItem['kind'], { icon: string; label: string; color: string; bg: string }> = {
  email:    { icon: '✉️', label: 'E-Mail',   color: '#2563eb', bg: '#eff6ff' },
  meeting:  { icon: '📅', label: 'Meeting',  color: '#7c3aed', bg: '#f5f3ff' },
  note:     { icon: '📝', label: 'Notiz',    color: '#b45309', bg: '#fffbeb' },
  call:     { icon: '📞', label: 'Anruf',    color: '#059669', bg: '#ecfdf5' },
  linkedin: { icon: '💼', label: 'LinkedIn', color: '#0a66c2', bg: '#eff6ff' },
  stage:    { icon: '◆',  label: 'Deal',     color: '#16a34a', bg: '#f0fdf4' },
  other:    { icon: '•',  label: 'Sonstiges', color: '#6b7280', bg: '#f9fafb' },
}
const FILTERS: { key: 'all' | TimelineItem['kind']; label: string }[] = [
  { key: 'all', label: 'Alle' }, { key: 'email', label: 'E-Mails' }, { key: 'meeting', label: 'Meetings' },
  { key: 'note', label: 'Notizen' }, { key: 'call', label: 'Anrufe' }, { key: 'stage', label: 'Deal-Änderungen' },
]

const fmt = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' })

export default function Timeline({ items, context, hidePerson, hideDeal }: {
  items: TimelineItem[]
  context: { companyId?: string | null; personId?: string | null; opportunityId?: string | null }
  hidePerson?: boolean
  hideDeal?: boolean
}) {
  const [filter, setFilter] = useState<'all' | TimelineItem['kind']>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const shown = items.filter(i => filter === 'all' || i.kind === filter)
  const counts = items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }), {})

  let lastMonth = ''
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.filter(f => f.key === 'all' || counts[f.key]).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ fontSize: 12, fontWeight: 500, padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', background: filter === f.key ? '#111827' : '#f3f4f6', color: filter === f.key ? '#fff' : '#374151' }}>
            {f.label}{f.key !== 'all' ? ` ${counts[f.key]}` : ` ${items.length}`}
          </button>
        ))}
      </div>

      {!shown.length && <p style={{ fontSize: 13, color: '#9ca3af', padding: '16px 0', textAlign: 'center' }}>Noch keine Aktivitäten – logge eine Notiz, einen Anruf oder verbinde Gmail.</p>}

      <div style={{ position: 'relative' }}>
        {shown.map(it => {
          const st = STYLE[it.kind]
          const month = monthOf(it.at)
          const header = month !== lastMonth ? (lastMonth = month) : null
          const expanded = open.has(it.id)
          const long = (it.body?.length ?? 0) > 180
          return (
            <div key={it.id}>
              {header && <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '14px 0 8px' }}>{header}</p>}
              <div style={{ display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #f3f4f6', marginBottom: 8, background: '#fff', opacity: pending ? 0.7 : 1 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: st.bg, color: st.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{st.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: st.color, marginRight: 6 }}>{st.label}</span>{it.title}
                    </p>
                    <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmt(it.at)}</span>
                  </div>
                  {it.body && (
                    <p onClick={() => long && setOpen(s => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })}
                      style={{ fontSize: 12.5, color: '#4b5563', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap', cursor: long ? 'pointer' : 'default', ...(expanded || !long ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>
                      {it.body}
                    </p>
                  )}
                  {it.outcome && <p style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>→ {it.outcome}</p>}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 11, color: '#9ca3af', alignItems: 'center' }}>
                    {!hidePerson && it.personId && it.personName && <Link href={`/contacts/${it.personId}`} style={{ color: '#2563eb', textDecoration: 'none' }}>👤 {it.personName}</Link>}
                    {!hideDeal && it.dealId && it.dealName && <Link href={`/opportunities/${it.dealId}`} style={{ color: '#16a34a', textDecoration: 'none' }}>◆ {it.dealName}</Link>}
                    {it.meta.map((m, i) => <span key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260, whiteSpace: 'nowrap' }}>{m}</span>)}
                    {long && <button onClick={() => setOpen(s => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, padding: 0 }}>{expanded ? 'weniger' : 'mehr anzeigen'}</button>}
                    {it.source === 'manual' && (
                      <button onClick={() => { if (confirm('Eintrag löschen?')) startTransition(async () => { await deleteActivity(it.id, context) }) }}
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 11, padding: 0 }}>löschen</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
