'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NoAccess({ email }: { email: string | null }) {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 32, maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontSize: 28, marginBottom: 12 }}>🔒</p>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Kein Zugriff auf Revenue OS</h1>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
          Du bist als <b>{email}</b> angemeldet. Revenue OS ist nur für das Altoris-Team – bitte mit deinem @altoris.one-Konto anmelden.
        </p>
        <button onClick={signOut} style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Abmelden & mit Altoris-Konto anmelden
        </button>
      </div>
    </div>
  )
}
