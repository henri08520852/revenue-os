'use client'

import { useState, useTransition } from 'react'
import { createLead } from './actions'

type Company = { id: string; name: string }
type Person = { id: string; company_id: string | null; full_name: string | null; first_name: string | null; last_name: string | null; job_title: string | null }

const EMPTY = { companyId: '', personId: '', name: '', nextFollowUp: '', notes: '' }

export default function AddLeadButton({ companies, people }: { companies: Company[]; people: Person[] }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const companyPeople = people.filter(p => p.company_id === form.companyId)

  function close() {
    setOpen(false)
    setForm(EMPTY)
    setError(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.companyId) { setError('Bitte eine Company wählen'); return }
    setError(null)
    startTransition(async () => {
      const res = await createLead({
        companyId: form.companyId,
        personId: form.personId || null,
        name: form.name.trim() || null,
        nextFollowUp: form.nextFollowUp || null,
        notes: form.notes.trim() || null,
      })
      if (res.error) setError(res.error)
      else close()
    })
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 13, color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6,
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500,
        background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
      }}>
        + Lead
      </button>

      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: 460 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Lead anlegen</h2>
              <button onClick={close} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <form id="add-lead-form" onSubmit={submit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Company *</label>
                <select value={form.companyId} required
                  onChange={e => setForm(f => ({ ...f, companyId: e.target.value, personId: '' }))}
                  style={inputStyle}>
                  <option value="">— wählen —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Ansprechpartner (optional)</label>
                <select value={form.personId} disabled={!form.companyId}
                  onChange={e => setForm(f => ({ ...f, personId: e.target.value }))}
                  style={{ ...inputStyle, color: form.companyId ? '#111827' : '#9ca3af' }}>
                  <option value="">{!form.companyId ? 'Erst Company wählen' : companyPeople.length ? '— keiner —' : 'Keine Contacts bei dieser Company'}</option>
                  {companyPeople.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbenannt'}{p.job_title ? ` · ${p.job_title}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Bezeichnung (optional)</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Recruiting Q1" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Follow-up am</label>
                <input type="date" value={form.nextFollowUp} onChange={e => setForm(f => ({ ...f, nextFollowUp: e.target.value }))} style={{ ...inputStyle, width: 'auto' }} />
              </div>

              <div>
                <label style={labelStyle}>Notiz</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {error && (
                <p style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', margin: 0 }}>{error}</p>
              )}
            </form>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button type="button" onClick={close} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: 'white', cursor: 'pointer' }}>Abbrechen</button>
              <button type="submit" form="add-lead-form" disabled={pending} style={{ flex: 1, padding: '9px 0', background: pending ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: pending ? 'default' : 'pointer' }}>
                {pending ? 'Speichern…' : 'Lead anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
