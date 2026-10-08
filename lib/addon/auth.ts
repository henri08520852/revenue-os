// Auth for the Gmail add-on: the add-on sends the user's Google ID token
// (ScriptApp.getIdentityToken()). We let Google validate it and only accept tokens that
//  - were issued for our add-on (aud = GMAIL_ADDON_AUDIENCE, the add-on's OAuth client id),
//  - belong to a verified @ALLOWED_EMAIL_DOMAIN account,
//  - belong to a member of the project.
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/google/oauth'

export type AddonUser = { userId: string; email: string; name: string | null }
export class AddonAuthError extends Error {
  constructor(message: string, public status = 401) { super(message) }
}

export async function authenticateAddon(req: Request, svc: any, projectId: string): Promise<AddonUser> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new AddonAuthError('Kein Google-Token übermittelt')

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, { cache: 'no-store' })
  if (!res.ok) throw new AddonAuthError('Google-Token ungültig oder abgelaufen')
  const info = await res.json()

  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new AddonAuthError('Token nicht von Google')
  if (Number(info.exp) * 1000 < Date.now()) throw new AddonAuthError('Google-Token abgelaufen')
  const email = String(info.email || '').toLowerCase()
  if (info.email_verified !== 'true' && info.email_verified !== true) throw new AddonAuthError('E-Mail nicht verifiziert', 403)
  if (!email.endsWith('@' + ALLOWED_EMAIL_DOMAIN)) throw new AddonAuthError(`Nur für @${ALLOWED_EMAIL_DOMAIN}-Konten`, 403)

  // Fail closed until the add-on's client id is configured; tell the admin which value to set
  const audience = (process.env.GMAIL_ADDON_AUDIENCE || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!audience.length) throw new AddonAuthError(`Add-on noch nicht freigeschaltet. In Vercel die Umgebungsvariable GMAIL_ADDON_AUDIENCE = ${info.aud} setzen und neu deployen.`, 403)
  if (!audience.includes(info.aud)) throw new AddonAuthError('Token gehört nicht zum Revenue-OS-Add-on', 403)

  const { data: member } = await svc.from('project_members').select('user_id, display_name')
    .eq('project_id', projectId).ilike('email', email).maybeSingle()
  if (!member) throw new AddonAuthError('Bitte einmal in Revenue OS anmelden, damit dein Konto dem Team zugeordnet ist.', 403)
  return { userId: member.user_id, email, name: member.display_name ?? null }
}
