'use client'

import { useEffect, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { convertLeadToOpportunity, updateLeadFollowUp, updateLeadOwner, updateLeadStage } from './actions'

export const LEAD_STAGES = [
  { key: 'outreach',     label: 'Outreach',     color: '#94a3b8' },
  { key: 'contacted',    label: 'Kontaktiert',  color: '#60a5fa' },
  { key: 'qualified',    label: 'Qualifiziert', color: '#8b5cf6' },
  { key: 'converted',    label: 'Umgewandelt',  color: '#16a34a' },
  { key: 'disqualified', label: 'Disqualifiziert', color: '#9ca3af' },
]

const MOVABLE = ['outreach', 'contacted', 'qualified', 'disqualified']

type Member = { user_id: string; display_name: string }

type Lead = {
  id: string
  owner_id?: string | null
  name: string | null
  stage: string
  notes: string | null
  next_follow_up_at: string | null
  converted_to_opportunity_id: string | null
  converted_at: string | null
  company: { id: string; name: string; domain: string | null } | null
  person: { id: string; full_name: string | null; first_name: string | null; last_name: string | null; job_title: string | null } | null
}

export function personName(p: { full_name: string | null; first_name: string | null; last_name: string | null } | null) {
  if (!p) return null
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null
}

function toDateInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function ConvertSubmit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{
      width: '100%', padding: '7px 0', fontSize: 12, fontWeight: 600,
      background: pending ? '#9ca3af' : '#16a34a', color: 'white', border: 'none',
      borderRadius: 7, cursor: pending ? 'default' : 'pointer',
    }}>
      {pending ? 'Wird umgewandelt…' : '💼 In Deal umwandeln'}
    </button>
  )
}

function ConvertButton({ leadId }: { leadId: string }) {
  const [state, formAction] = useFormState(convertLeadToOpportunity.bind(null, leadId), { error: null })
  return (
    <form action={formAction} style={{ marginTop: 10 }}>
      <ConvertSubmit />
      {state.error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{state.error}</p>}
    </form>
  )
}

function LeadCard({ lead, focused, team }: { lead: Lead; focused: boolean; team: Member[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const done = lead.stage === 'converted' || lead.stage === 'disqualified'
  const due = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const overdue = !done && due !== null && due < startOfToday
  const contact = personName(lead.person)

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
    })
  }

  return (
    <div id={`lead-${lead.id}`} style={{
      background: 'white',
      border: focused ? '2px solid #2563eb' : '1px solid #e5e7eb',
      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
      opacity: pending ? 0.6 : 1,
      boxShadow: focused ? '0 0 0 4px #dbeafe' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        {lead.company ? (
          <Link href={`/companies/${lead.company.id}`} style={{ fontSize: 13, fontWeight: 600, color: '#111827', textDecoration: 'none' }}>
            {lead.company.name}
          </Link>
        ) : (
          <p style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>Ohne Company</p>
        )}
        {team.length > 0 && (
          <select
            value={lead.owner_id ?? ''}
            onChange={e => run(() => updateLeadOwner(lead.id, e.target.value || null))}
            title="Owner"
            style={{ fontSize: 11, padding: '1px 4px', border: 'none', borderRadius: 10, background: lead.owner_id ? '#eff6ff' : '#f3f4f6', color: lead.owner_id ? '#1d4ed8' : '#9ca3af', maxWidth: 90, cursor: 'pointer', flexShrink: 0 }}
          >
            <option value="">kein Owner</option>
            {team.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select>
        )}
      </div>
      {lead.name && <p style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>{lead.name}</p>}
      {contact && (
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          👤 {contact}{lead.person?.job_title ? ` · ${lead.person.job_title}` : ''}
        </p>
      )}
      {lead.notes && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, whiteSpace: 'pre-wrap' }}>{lead.notes}</p>}

      {lead.stage === 'converted' ? (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          {lead.converted_to_opportunity_id ? (
            <Link href={`/opportunities/${lead.converted_to_opportunity_id}`} style={{ color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}>
              → Zum Deal
            </Link>
          ) : <span style={{ color: '#9ca3af' }}>Deal gelöscht</span>}
          {lead.converted_at && (
            <span style={{ color: '#9ca3af', marginLeft: 8 }}>
              {new Date(lead.converted_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </span>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', fontSize: 11, color: overdue ? '#dc2626' : '#9ca3af', fontWeight: 600, marginBottom: 4 }}>
              {overdue ? '⚠️ Follow-up' : '📅 Follow-up'}
            </label>
            <input
              type="date"
              defaultValue={toDateInput(lead.next_follow_up_at)}
              onChange={e => run(() => updateLeadFollowUp(lead.id, e.target.value || null))}
              style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', fontSize: 12, border: `1px solid ${overdue ? '#fecaca' : '#e5e7eb'}`, borderRadius: 6, color: '#111827', background: overdue ? '#fef2f2' : 'white' }}
            />
          </div>
          <select
            value={lead.stage}
            onChange={e => run(() => updateLeadStage(lead.id, e.target.value))}
            style={{ width: '100%', marginTop: 8, padding: '5px 6px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, color: '#4b5563', background: 'white' }}
          >
            {LEAD_STAGES.filter(s => MOVABLE.includes(s.key)).map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {lead.stage !== 'disqualified' && <ConvertButton leadId={lead.id} />}
        </>
      )}
      {error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{error}</p>}
    </div>
  )
}

export default function LeadBoard({ leads, focusId, team = [] }: { leads: Lead[]; focusId: string | null; team?: Member[] }) {
  useEffect(() => {
    if (focusId) document.getElementById(`lead-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LEAD_STAGES.length}, minmax(180px, 1fr))`, gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
      {LEAD_STAGES.map(stage => {
        const items = leads.filter(l => l.stage === stage.key)
        return (
          <div key={stage.key} style={{ background: '#f3f4f6', borderRadius: 12, padding: 12, minHeight: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{stage.label}</span>
              </div>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>Keine Leads</p>
            ) : (
              items.map(lead => <LeadCard key={lead.id} lead={lead} focused={lead.id === focusId} team={team} />)
            )}
          </div>
        )
      })}
    </div>
  )
}
