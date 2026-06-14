import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)

  // Capture ?ref= affiliate referral code and persist as a 30-day httpOnly cookie.
  // Only set if no cookie already exists so the first referrer gets credit.
  const ref = request.nextUrl.searchParams.get('ref')
  if (ref && /^[A-Z0-9]{6,12}$/.test(ref) && !request.cookies.get('ref_code')) {
    response.cookies.set('ref_code', ref, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
