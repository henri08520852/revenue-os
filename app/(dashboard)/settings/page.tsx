import { getTeamContext, initials } from '@/lib/team'
import ProfileForm from './ProfileForm'

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, marginBottom: 20 }
const h2 = { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 16 }

export default async function SettingsPage() {
  const { me, team } = await getTeamContext()

  return (
    <div style={{ padding: '32px 40px', maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 24 }}>Einstellungen</h1>

      <section style={card}>
        <h2 style={h2}>Mein Profil</h2>
        {me ? <ProfileForm initialName={me.display_name} email={me.email} /> : <p style={{ fontSize: 13, color: '#9ca3af' }}>Nicht angemeldet</p>}
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
          <b>Neues Teammitglied hinzufügen (z. B. Simon):</b> Supabase → Authentication → Users → „Add user“ → E-Mail + Passwort
          („Auto Confirm User“ anhaken). Sobald sich die Person einmal hier anmeldet, erscheint sie automatisch im Team und als Owner-Auswahl.
        </div>
      </section>
    </div>
  )
}
