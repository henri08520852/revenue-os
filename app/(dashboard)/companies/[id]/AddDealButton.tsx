'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  companyName: string
  projectId: string
}

const STAGES = [
  { value: 'discovery',     label: 'Discovery',     color: '#6b7280' },
  { value: 'erstgespraech', label: 'Erstgespräch',  color: '#3b82f6' },
  { value: 'evaluation',    label: 'Evaluation',    color: '#8b5cf6' },
  { value: 'proposal',      label: 'Proposal',      color: '#f59e0b' },
  { value: 'negotiation',   label: 'Verhandlung',   color: '#ef4444' },
]

export default function AddDealButton({ companyId, companyName, projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: `${companyName} — HireFlow`,
    stage: 'discovery' as const,
    value: '',
    nextStep: '',
    nextStepDate: '',
  })
  const router = useRouter()
  const supabase = createClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.from('opportunities').insert({
      project_id: projectId,
      company_id: companyId,
      name: form.name,
      stage: form.stage,
      value_eur: form.value ? parseFloat(form.value) : null,
      next_step: form.nextStep || null,
      next_step_due_at: form.nextStepDate ? new Date(form.nextStepDate).toISOString() : null,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setOpen(false)
      router.refresh()
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    color: '#111827',
    background: 'white',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 6,
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', fontSize: 13, fontWeight: 500,
          background: '#16a34a', color: 'white', border: 'none',
          borderRadius: 8, cursor: 'pointer',
        }}
      >
        💼 Deal anlegen
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: 460 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>💼 Deal anlegen</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <form onSubmit={submit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div>
                <label style={labelStyle}>Deal-Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Stage</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STAGES.map(s => (
                    <button key={s.value} type="button" onClick={() => setForm(f => ({ ...f, stage: s.value as any }))}
                      style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1.5px solid', borderColor: form.stage === s.value ? s.color : '#e5e7eb', background: form.stage === s.value ? s.color : 'white', color: form.stage === s.value ? 'white' : '#6b7280' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Potenzial (€/Jahr)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af' }}>€</span>
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="5.000" style={{ ...inputStyle, paddingLeft: 24 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Nächster Schritt</label>
                  <input value={form.nextStep} onChange={e => setForm(f => ({ ...f, nextStep: e.target.value }))} placeholder="Demo vereinbaren" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fällig am</label>
                  <input type="date" value={form.nextStepDate} onChange={e => setForm(f => ({ ...f, nextStepDate: e.target.value }))} style={{ ...inputStyle, width: 'auto' }} />
                </div>
              </div>

              {error && (
                <p style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', margin: 0 }}>{error}</p>
              )}
            </form>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setOpen(false)} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', background: 'white', cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={submit} disabled={loading} style={{ flex: 1, padding: '9px 0', background: loading ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
                {loading ? 'Speichern…' : '💼 Deal anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
