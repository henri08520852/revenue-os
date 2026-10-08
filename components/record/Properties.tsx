'use client'

import { useState, useTransition } from 'react'
import { updateCompany, updateContact } from '@/app/(dashboard)/records/actions'

export type Field = {
  key: string
  label: string
  value: string | boolean | null
  type?: 'text' | 'email' | 'url' | 'tel' | 'select' | 'checkbox' | 'textarea'
  options?: { value: string; label: string }[]
  display?: string | null     // pretty value for read mode (e.g. select label)
  link?: string | null        // read mode: render as link
}

// Read-mode property list with an inline edit form ("Bearbeiten")
export default function Properties({ kind, id, fields }: { kind: 'contact' | 'company'; id: string; fields: Field[] }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, any>>(() => Object.fromEntries(fields.map(f => [f.key, f.value ?? (f.type === 'checkbox' ? false : '')])))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = kind === 'contact' ? await updateContact(id, values) : await updateCompany(id, values)
      if (res.error) setError(res.error)
      else setEditing(false)
    })
  }

  const input = { width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{kind === 'contact' ? 'Über diesen Kontakt' : 'Über diese Company'}</h3>
        {!editing
          ? <button onClick={() => setEditing(true)} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>Bearbeiten</button>
          : <button onClick={() => { setEditing(false); setError(null) }} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Abbrechen</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fields.map(f => (
          <div key={f.key}>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{f.label}</p>
            {!editing ? (
              f.type === 'checkbox'
                ? <p style={{ fontSize: 13, color: '#111827' }}>{f.value ? 'Ja' : 'Nein'}</p>
                : f.link && f.value
                  ? <a href={f.link} target={f.type === 'email' || f.type === 'tel' ? undefined : '_blank'} rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>{f.display ?? String(f.value)}</a>
                  : <p style={{ fontSize: 13, color: f.value ? '#111827' : '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{(f.display ?? (f.value as string)) || '—'}</p>
            ) : f.type === 'select' ? (
              <select value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value || null }))} style={input}>
                <option value="">—</option>
                {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'checkbox' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.checked }))} /> Ja
              </label>
            ) : f.type === 'textarea' ? (
              <textarea value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} rows={3} style={{ ...input, resize: 'vertical' }} />
            ) : (
              <input type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} style={input} />
            )}
          </div>
        ))}
      </div>

      {editing && (
        <>
          {error && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{error}</p>}
          <button onClick={save} disabled={pending} style={{ marginTop: 12, width: '100%', padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, background: pending ? '#9ca3af' : '#2563eb', color: '#fff', cursor: 'pointer' }}>
            {pending ? 'Speichern…' : 'Speichern'}
          </button>
        </>
      )}
    </div>
  )
}
