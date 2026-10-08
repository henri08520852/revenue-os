'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Conn = { google_email: string; gmail_last_synced_at: string | null; last_error: string | null } | null

const STATUS: Record<string, { ok: boolean; text: string }> = {
  connected:        { ok: true,  text: 'Google verbunden – erster Sync ist gelaufen.' },
  denied:           { ok: false, text: 'Verbindung abgebrochen.' },
  wrong_domain:     { ok: false, text: 'Bitte ein @altoris.one-Google-Konto verwenden.' },
  invalid_state:    { ok: false, text: 'Sitzung abgelaufen – bitte erneut verbinden.' },
  no_refresh_token: { ok: false, text: 'Google hat keinen Langzeit-Zugriff erteilt – bitte erneut verbinden.' },
  not_configured:   { ok: false, text: 'Google-Zugangsdaten fehlen auf dem Server (GOOGLE_CLIENT_ID / _SECRET).' },
  error:            { ok: false, text: 'Verbindung fehlgeschlagen – bitte erneut versuchen.' },
}

function ago(iso: string | null) {
  if (!iso) return 'noch nie'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  if (min < 1440) return `vor ${Math.round(min / 60)} Std.`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export default function GoogleConnect({ conn, status, configured }: { conn: Conn; status: string | null; configured: boolean }) {
  const [busy, setBusy] = useState<null | 'sync' | 'disconnect'>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(status ? STATUS[status] ?? null : null)
  const router = useRouter()

  async function sync() {
    setBusy('sync'); setMsg(null)
    const res = await fetch('/api/google/sync', { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    setMsg(j.error
      ? { ok: false, text: `Sync-Fehler: ${j.error}` }
      : { ok: true, text: `Synchronisiert: ${j.emails ?? 0} neue E-Mails, ${j.meetings ?? 0} neue Meetings, ${j.events ?? 0} Termine im Kalender.` })
    router.refresh()
  }

  async function disconnect() {
    if (!confirm('Google-Verbindung trennen? Bereits geloggte Aktivitäten bleiben erhalten.')) return
    setBusy('disconnect'); setMsg(null)
    await fetch('/api/google/disconnect', { method: 'POST' })
    setBusy(null)
    router.refresh()
  }

  const btn = (primary: boolean) => ({
    padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', textDecoration: 'none',
    border: primary ? 'none' : '1px solid #e5e7eb', background: primary ? '#2563eb' : '#fff', color: primary ? '#fff' : '#374151',
    display: 'inline-block',
  })

  return (
    <div>
      <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 16 }}>
        Verbinde dein Altoris-Google-Konto: E-Mails und Termine mit bekannten Kontakten bzw. Company-Domains werden
        automatisch als Aktivität geloggt, deine Termine erscheinen im Team-Kalender. Nur Lesezugriff – Revenue OS sendet nichts.
      </p>

      {conn ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 14px', background: conn.last_error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${conn.last_error ? '#fecaca' : '#bbf7d0'}`, borderRadius: 10 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>✓ {conn.google_email}</p>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Letzter Sync: {ago(conn.gmail_last_synced_at)}</p>
            {conn.last_error && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>Fehler beim letzten Sync: {conn.last_error}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={sync} disabled={!!busy} style={btn(true)}>{busy === 'sync' ? 'Synchronisiere…' : 'Jetzt synchronisieren'}</button>
            <button onClick={disconnect} disabled={!!busy} style={btn(false)}>{busy === 'disconnect' ? 'Trenne…' : 'Trennen'}</button>
          </div>
        </div>
      ) : configured ? (
        <a href="/api/google/connect" style={btn(true)}>Gmail & Kalender verbinden</a>
      ) : (
        <p style={{ fontSize: 13, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
          Noch nicht eingerichtet: GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET fehlen in Vercel (siehe Setup-Anleitung).
        </p>
      )}

      {msg && <p style={{ fontSize: 13, color: msg.ok ? '#16a34a' : '#dc2626', marginTop: 12 }}>{msg.text}</p>}
    </div>
  )
}
