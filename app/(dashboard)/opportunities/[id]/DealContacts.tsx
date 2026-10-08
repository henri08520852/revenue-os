'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { addOpportunityContact, removeOpportunityContact, updateOpportunityContactRole } from './actions'
import { CreateButton } from '@/components/CreateRecord'

export const CONTACT_ROLES = [
  { key: 'champion',       label: 'Champion',        icon: '⭐', color: '#d97706' },
  { key: 'decision_maker', label: 'Decision Maker',  icon: '🎯', color: '#7c3aed' },
  { key: 'economic_buyer', label: 'Economic Buyer',  icon: '💰', color: '#16a34a' },
  { key: 'stakeholder',    label: 'Stakeholder',     icon: '👥', color: '#6b7280' },
]
// Legacy roles that may exist on older rows — shown, not offered
const LEGACY_ROLES: Record<string, string> = { primary: 'Primary', blocker: 'Blocker' }

type Person = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; job_title: string | null; email: string | null }
type Contact = { id: string; role: string | null; person: Person | null }

function name(p: Person | null) {
  if (!p) return 'Unbekannt'
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbenannt'
}

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }
const selectStyle = { padding: '6px 8px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: 'white', color: '#374151' }

export default function DealContacts({ oppId, companyId, contacts, companyPeople }: {
  oppId: string
  companyId: string | null
  contacts: Contact[]
  companyPeople: Person[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState('stakeholder')

  const linked = new Set(contacts.map(c => c.person?.id))
  const available = companyPeople.filter(p => !linked.has(p.id))
  const missing = CONTACT_ROLES.filter(r => r.key !== 'stakeholder' && !contacts.some(c => c.role === r.key))

  function run(fn: () => Promise<{ error: string | null }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else onOk?.()
    })
  }

  return (
    <div style={{ ...cardStyle, opacity: pending ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Buying Center</h3>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{contacts.length}</span>
      </div>

      {missing.length > 0 && (
        <p style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 8px', marginBottom: 12 }}>
          Fehlt: {missing.map(r => r.label).join(', ')}
        </p>
      )}

      {contacts.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Noch keine Kontakte verknüpft</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {contacts.map(c => {
            const r = CONTACT_ROLES.find(x => x.key === c.role)
            return (
              <div key={c.id} style={{ padding: '8px 10px', background: '#f9fafb', borderRadius: 8, borderLeft: `3px solid ${r?.color ?? '#d1d5db'}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    {c.person ? <Link href={`/contacts/${c.person.id}`} style={{ fontSize: 13, fontWeight: 600, color: '#111827', textDecoration: 'none' }}>{name(c.person)}</Link> : <p style={{ fontSize: 13, color: '#9ca3af' }}>Unbekannt</p>}
                    {c.person?.job_title && <p style={{ fontSize: 11, color: '#6b7280' }}>{c.person.job_title}</p>}
                    {c.person?.email && (
                      <a href={`mailto:${c.person.email}`} style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>{c.person.email}</a>
                    )}
                  </div>
                  <button
                    onClick={() => { if (confirm(`${name(c.person)} vom Deal entfernen?`)) run(() => removeOpportunityContact(oppId, c.id)) }}
                    title="Entfernen"
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
                  >×</button>
                </div>
                <select
                  value={c.role ?? 'stakeholder'}
                  onChange={e => run(() => updateOpportunityContactRole(oppId, c.id, e.target.value))}
                  style={{ ...selectStyle, marginTop: 6, width: '100%' }}
                >
                  {c.role && LEGACY_ROLES[c.role] && <option value={c.role} disabled>{LEGACY_ROLES[c.role]}</option>}
                  {CONTACT_ROLES.map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
        {available.length === 0 ? (
          <p style={{ fontSize: 11, color: '#9ca3af' }}>
            Keine weiteren Kontakte bei dieser Company.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <select value={personId} onChange={e => setPersonId(e.target.value)} style={selectStyle}>
              <option value="">Kontakt hinzufügen…</option>
              {available.map(p => <option key={p.id} value={p.id}>{name(p)}{p.job_title ? ` · ${p.job_title}` : ''}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={role} onChange={e => setRole(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                {CONTACT_ROLES.map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
              </select>
              <button
                disabled={!personId || pending}
                onClick={() => run(() => addOpportunityContact(oppId, personId, role), () => { setPersonId(''); setRole('stakeholder') })}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: personId ? 'pointer' : 'default', background: personId ? '#2563eb' : '#e5e7eb', color: personId ? 'white' : '#9ca3af' }}
              >
                Hinzufügen
              </button>
            </div>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <CreateButton kind="contact" label="+ Neuer Kontakt" preset={{ companyId, dealId: oppId, dealRole: 'stakeholder' }} />
        </div>
      </div>

      {error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 8 }}>{error}</p>}
    </div>
  )
}
