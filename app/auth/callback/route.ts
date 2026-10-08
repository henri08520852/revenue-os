import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/google/oauth'

export const dynamic = 'force-dynamic'

// Return URL of "Mit Google anmelden" (Supabase OAuth, PKCE)
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/login?error=google`)

  const supabase = createClient() as any
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data?.user) return NextResponse.redirect(`${origin}/login?error=google`)

  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain`)
  }
  return NextResponse.redirect(`${origin}/today`)
}
