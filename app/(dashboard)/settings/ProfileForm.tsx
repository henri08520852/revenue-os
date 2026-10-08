'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { updateMyDisplayName } from './actions'

export default function ProfileForm({ initialName, email }: { initialName: string; email: string | null }) {
  const [name, setName] = useState(initialName)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [signingOut, setSigningOut] = useState(false)
  const router = useRouter()

  function save() {
    setMsg(null)
    startTransition(async () => {
      const res = await updateMyDisplayName(name)
      setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: 'Gespeichert' })
    })
  }

  async function signOut() {
    setSigningOut(true)
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Anzeigename</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }}
              style={{ flex: 1, padding: '9px 12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none' }} />
            <button onClick={save} disabled={pending || !name.trim() || name.trim() === initialName}
              style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: pending || !name.trim() || name.trim() === initialName ? '#e5e7eb' : '#2563eb', color: pending || !name.trim() || name.trim() === initialName ? '#9ca3af' : '#fff' }}>
              {pending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Erscheint als Owner bei Leads und Deals.</p>
          {msg && <p style={{ fontSize: 12, color: msg.ok ? '#16a34a' : '#dc2626', marginTop: 4 }}>{msg.text}</p>}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Login</label>
          <p style={{ fontSize: 14, color: '#111827', padding: '9px 0' }}>{email}</p>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 20, paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          Account wechseln (z. B. von Henri zu Simon): abmelden und mit dem anderen Login anmelden.
        </p>
        <button onClick={signOut} disabled={signingOut}
          style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {signingOut ? 'Abmelden…' : 'Abmelden / Account wechseln'}
        </button>
      </div>
    </div>
  )
}
