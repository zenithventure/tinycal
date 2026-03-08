import { handlers } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

async function wrappedGET(req: NextRequest) {
  const url = new URL(req.url)
  const isCallback = url.pathname.includes('/callback/')

  try {
    const cookies = req.cookies.getAll().map(c => c.name)
    const response = await handlers.GET(req)
    const location = response?.headers.get('location')

    // If this is a callback that's redirecting to an error page, intercept it
    if (isCallback && location?.includes('error=')) {
      return NextResponse.json({
        intercepted: true,
        originalRedirect: location,
        requestPath: url.pathname + url.search,
        cookiesOnRequest: cookies,
        responseStatus: response?.status,
        responseHeaders: Object.fromEntries(response?.headers.entries() ?? []),
      }, { status: 500 })
    }

    return response
  } catch (error: any) {
    if (isCallback) {
      return NextResponse.json({
        intercepted: true,
        thrown: true,
        error: error?.message ?? String(error),
        name: error?.name,
        code: error?.code,
        cause: error?.cause ? {
          message: error.cause?.message ?? String(error.cause),
          name: error.cause?.name,
          code: error.cause?.code,
          meta: error.cause?.meta,
          stack: error.cause?.stack?.split('\n').slice(0, 5),
        } : undefined,
        stack: error?.stack?.split('\n').slice(0, 8),
      }, { status: 500 })
    }
    throw error
  }
}

export { wrappedGET as GET }
export const { POST } = handlers
