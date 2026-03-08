import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const publicRoutes = [
  '/', '/login',
  '/api/webhooks', '/api/availability', '/api/bookings',
  '/api/stripe/webhook', '/api/auth',
]

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

function isPublicDynamicRoute(pathname: string): boolean {
  if (['/book/', '/cancel/', '/reschedule/'].some(p => pathname.startsWith(p))) return true
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 1 &&
    !['dashboard', 'api', 'login', '_next'].includes(segments[0])
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
