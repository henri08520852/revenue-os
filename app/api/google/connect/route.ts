import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl, googleConfigured } from '@/lib/google/oauth'

export const dynamic = 'force-dynamic'

// Starts the Google consent flow for Gmail + Calendar read access
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/settings?google=not_configured`)

  const { data: { user } } = await (createClient() as any).auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const state = randomBytes(24).toString('hex')
  const res = NextResponse.redirect(buildAuthUrl(`${origin}/api/google/callback`, state, user.email))
  res.cookies.set('google_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google', maxAge: 600 })
  return res
}
