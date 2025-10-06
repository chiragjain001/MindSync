import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/dashboard'

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    try {
      await supabase.auth.exchangeCodeForSession(code)
    } catch (e) {
      // If something goes wrong exchanging the code, send the user back to /auth
      return NextResponse.redirect(new URL('/auth?error=oauth_exchange_failed', request.url))
    }
  }

  return NextResponse.redirect(new URL(next, request.url))
}
