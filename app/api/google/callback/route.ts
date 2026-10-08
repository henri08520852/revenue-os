import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { emailFromIdToken, exchangeCode, isAllowedEmail } from '@/lib/google/oauth'
import { syncConnection } from '@/lib/google/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const back = (status: string) => {
    const res = NextResponse.redirect(`${origin}/settings?google=${status}`)
    res.cookies.delete({ name: 'google_oauth_state', path: '/api/google' })
    return res
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  if (request.nextUrl.searchParams.get('error')) return back('denied')
  if (!code || !state || state !== request.cookies.get('google_oauth_state')?.value) return back('invalid_state')

  const { data: { user } } = await (createClient() as any).auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  try {
    const tokens = await exchangeCode(code, `${origin}/api/google/callback`)
    const email = emailFromIdToken(tokens.id_token)
    if (!email || !isAllowedEmail(email)) return back('wrong_domain')
    if (!tokens.refresh_token) return back('no_refresh_token')

    const projectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!
    const svc = createServiceClient()
    const { error } = await svc.from('google_connections').upsert({
      user_id: user.id,
      project_id: projectId,
      google_email: email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope,
      last_error: null,
    }, { onConflict: 'user_id' })
    if (error) throw new Error(error.message)

    // First sync right away so the user sees data immediately
    const { data: conn } = await svc.from('google_connections').select('*').eq('user_id', user.id).single()
    if (conn) await syncConnection(svc, conn)
    return back('connected')
  } catch (err: any) {
    console.error('[google/callback]', err?.message)
    return back('error')
  }
}

