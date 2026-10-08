import { getTeamContext, initials } from '@/lib/team'
import ProfileForm from './ProfileForm'
import GoogleConnect from './GoogleConnect'
import { createServiceClient } from '@/lib/supabase/server'
import { canWriteCalendar, googleConfigured } from '@/lib/google/oauth'

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, marginBottom: 20 }
const h2 = { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 16 }

async function loadConnection(userId: string | undefined) {
  if (!userId) return null
  try {
    // google_connections is service-role only (tokens) — select just the display fields
    const { data } = await createServiceClient()
      .from('google_connections').select('google_email, gmail_last_synced_at, last_error, scopes').eq('user_id', userId).maybeSingle()
    return data ?? null
  } catch {
    return null
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: { google?: string } }) {
  const { me, team } = await getTeamContext()
  const conn = await loadConnection(me?.user_id)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 24 }}>Einstellungen</h1>

      <section style={card}>
        <h2 style={h2}>Mein Profil</h2>
        {me ? <ProfileForm initialName={me.display_name} email={me.email} /> : <p style={{ fontSize: 13, color: '#9ca3af' }}>Nicht angemeldet</p>}
      </section>

      <section style={card}>
        <h2 style={h2}>Gmail & Kalender</h2>
        <GoogleConnect conn={conn} status={searchParams.google ?? null} configured={googleConfigured()} needsReconnect={!!conn && !canWriteCalendar((conn as any).scopes)} />
      </section>

      <section style={card}>
        <h2 style={h2}>Team <span style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af', marginLeft: 6 }}>{team.length}</span></h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {team.map(m => (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid #f3f4f6' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.user_id === me?.user_id ? '#2563eb' : '#eff6ff', color: m.user_id === me?.user_id ? '#fff' : '#1d4ed8', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {initials(m.display_name)}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {m.display_name}{m.user_id === me?.user_id && <span style={{ fontSize: 11, fontWeight: 500, color: '#2563eb', marginLeft: 8 }}>Du</span>}
                </p>
                <p style={{ fontSize: 12, color: '#9ca3af' }}>{m.email}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: '#f9fafb', borderRadius: 10, fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
          <b>Neues Teammitglied:</b> Jede Person mit einer @altoris.one-Adresse meldet sich einfach mit „Mit Google anmelden“ an
          und erscheint danach automatisch im Team und in der Owner-Auswahl.
        </div>
      </section>
    </div>
  )
}
