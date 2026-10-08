'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ACCOUNT_STATUSES } from '@/lib/stages'

// people.buyer_role values (people_buyer_role_check)
const ROLES: Record<string, { label: string; bg: string; text: string }> = {
  champion:       { label: '⭐ Champion',          bg: '#fef3c7', text: '#92400e' },
  economic_buyer: { label: '💰 Budget-Entscheider', bg: '#dcfce7', text: '#166534' },
  influencer:     { label: '💡 Influencer',         bg: '#e0e7ff', text: '#3730a3' },
  user:           { label: '👤 Nutzer',             bg: '#f3f4f6', text: '#4b5563' },
  blocker:        { label: '🚧 Blocker',            bg: '#fee2e2', text: '#991b1b' },
}

type Person = {
  id: string
  company_id: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  buyer_role: string | null
  is_decision_maker: boolean | null
  last_interaction_at: string | null
  companies: { id: string; name: string; account_status: string | null } | null
}

function displayName(p: Person) {
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbenannt'
}

function initials(p: Person) {
  const n = displayName(p).split(' ').filter(Boolean)
  return ((n[0]?.[0] || '') + (n[1]?.[0] || '')).toUpperCase() || '?'
}

function relative(iso: string | null) {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 30) return `vor ${days} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit' })
}

const th = { textAlign: 'left' as const, padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const td = { padding: '12px 16px', fontSize: 13, color: '#374151', verticalAlign: 'middle' as const }
const chip = (active: boolean) => ({
  padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
  background: active ? '#2563eb' : '#f3f4f6', color: active ? '#fff' : '#374151',
})

export default function ContactsTable({ people }: { people: Person[] }) {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return people.filter(p => {
      if (role === 'decision_maker' && !p.is_decision_maker) return false
      if (role !== 'all' && role !== 'decision_maker' && p.buyer_role !== role) return false
      if (!q) return true
      return [displayName(p), p.email, p.job_title, p.companies?.name].some(v => v?.toLowerCase().includes(q))
    })
  }, [people, search, role])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Name, Firma, Position oder E-Mail suchen…"
          style={{ flex: '1 1 260px', maxWidth: 360, padding: '8px 12px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setRole('all')} style={chip(role === 'all')}>Alle</button>
          <button onClick={() => setRole('decision_maker')} style={chip(role === 'decision_maker')}>🎯 Entscheider</button>
          {Object.entries(ROLES).map(([key, r]) => (
            <button key={key} onClick={() => setRole(key)} style={chip(role === key)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
              <th style={th}>Name</th>
              <th style={th}>Unternehmen</th>
              <th style={th}>Position</th>
              <th style={th}>Rolle</th>
              <th style={th}>Letzter Kontakt</th>
              <th style={th}>Kanal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const r = p.buyer_role ? ROLES[p.buyer_role] : null
              const status = ACCOUNT_STATUSES.find(s => s.key === p.companies?.account_status)
              return (
                <tr key={p.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {initials(p)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/contacts/${p.id}`} style={{ fontWeight: 600, color: '#111827', textDecoration: 'none' }}>{displayName(p)}</Link>
                        {p.email && <p style={{ fontSize: 12, color: '#9ca3af' }}>{p.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    {p.companies ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link href={`/companies/${p.companies.id}`} style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}>
                          {p.companies.name}
                        </Link>
                        {status && (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: status.bg, color: status.text, fontWeight: 500 }}>{status.label}</span>
                        )}
                      </div>
                    ) : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td style={{ ...td, color: p.job_title ? '#374151' : '#d1d5db' }}>{p.job_title || '—'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {r ? (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: r.bg, color: r.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.label}</span>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                      {p.is_decision_maker && (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#ede9fe', color: '#5b21b6', fontWeight: 500, whiteSpace: 'nowrap' }}>🎯 Entscheider</span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>{relative(p.last_interaction_at)}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                      {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>LinkedIn</a>}
                      {p.email && <a href={`mailto:${p.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>E-Mail</a>}
                      {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} style={{ color: '#2563eb', textDecoration: 'none' }}>Anrufen</a>}
                      {!p.linkedin_url && !p.email && !p.phone && <span style={{ color: '#d1d5db' }}>—</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>👥</p>
            {people.length === 0 ? (
              <>
                <p style={{ fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>Noch keine Kontakte</p>
                <p style={{ fontSize: 13 }}>Lege oben rechts den ersten Kontakt an – oder direkt auf einer Company-Seite.</p>
              </>
            ) : (
              <p style={{ fontSize: 13 }}>Keine Kontakte für diesen Filter</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
