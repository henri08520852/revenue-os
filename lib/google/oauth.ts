// Google OAuth for the Gmail + Calendar sync (server-only).
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Redirect URI = <app origin>/api/google/callback

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  // Create meetings (with Meet link) and send invitations from Revenue OS
  'https://www.googleapis.com/auth/calendar.events',
]

export const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export function canWriteCalendar(scopes: string | null | undefined) {
  return !!scopes && scopes.split(/\s+/).includes(CALENDAR_WRITE_SCOPE)
}

// Only accounts of this Workspace domain may connect / use the app
export const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'altoris.one').toLowerCase()

export function isAllowedEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith('@' + ALLOWED_EMAIL_DOMAIN)
}

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET nicht gesetzt')
  return { id, secret }
}

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function buildAuthUrl(redirectUri: string, state: string, loginHint?: string) {
  const { id } = clientCreds()
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',       // we need a refresh token for background sync
    prompt: 'consent',            // always return a refresh token, also on reconnect
    include_granted_scopes: 'true',
    hd: ALLOWED_EMAIL_DOMAIN,
    state,
  })
  if (loginHint) params.set('login_hint', loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  id_token?: string
  error?: string
  error_description?: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(`Google Token-Fehler: ${json.error_description || json.error || res.status}`)
  return json
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = clientCreds()
  return tokenRequest({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
}

// Email claim from the id_token (issued directly by Google's token endpoint over TLS)
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    return payload.email_verified ? payload.email : null
  } catch {
    return null
  }
}

export type GoogleConnection = {
  user_id: string
  project_id: string
  google_email: string
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
  gmail_last_synced_at: string | null
  calendar_last_synced_at: string | null
}

// Returns a valid access token, refreshing (and persisting) it when expired
export async function getAccessToken(svc: any, conn: GoogleConnection): Promise<string> {
  const exp = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0
  if (conn.access_token && exp - Date.now() > 60_000) return conn.access_token

  const { id, secret } = clientCreds()
  const t = await tokenRequest({ refresh_token: conn.refresh_token, client_id: id, client_secret: secret, grant_type: 'refresh_token' })
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString()
  await svc.from('google_connections')
    .update({ access_token: t.access_token, access_token_expires_at: expiresAt })
    .eq('user_id', conn.user_id)
  conn.access_token = t.access_token
  conn.access_token_expires_at = expiresAt
  return t.access_token
}

export async function googleGet(accessToken: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}
