import { auth } from '@/auth'
import { NextResponse } from 'next/server'

// Routes that handle their own authentication (Bearer / webhook signature /
// public access). Auth.js middleware must not gate them with a session check —
// otherwise Bearer-token clients get 401 before the route handler runs.
const publicRoutes = [
  '/', '/login',
  '/api/webhooks', '/api/availability', '/api/bookings',
  '/api/slots', '/api/stripe/webhook', '/api/auth',
  '/api/meeting-links',
  '/api/v1',   // REST API — auths via Bearer api key in route handler
  '/api/cron', // cron routes — auth via Bearer CRON_SECRET in route handler
]

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

function isPublicDynamicRoute(pathname: string): boolean {
  if (['/book/', '/cancel/', '/reschedule/', '/m/'].some(p => pathname.startsWith(p))) return true
  const segments = pathname.split('/').filter(Boolean)
  const reserved = ['dashboard', 'api', 'login', '_next']
  // /{slug} (user profile) or /{slug}/{event-type} (booking page)
  return (segments.length === 1 || segments.length === 2) &&
    !reserved.includes(segments[0])
}

export default auth((req: any) => {
  const { pathname } = req.nextUrl
  if (isPublicRoute(pathname) || isPublicDynamicRoute(pathname)) {
    return NextResponse.next()
  }
  if (!req.auth) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL('/login', req.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)','/(api|trpc)(.*)'],
}
