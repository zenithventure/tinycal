import { handlers } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

// Wrap handlers to capture errors during OAuth callback
async function wrappedGET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    console.log('[auth-route] GET', url.pathname + url.search)
    console.log('[auth-route] cookies:', req.cookies.getAll().map(c => c.name).join(', '))

    const response = await handlers.GET(req)

    console.log('[auth-route] response status:', response?.status)
    if (response?.status && response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      console.log('[auth-route] redirect to:', location)
    }

    return response
  } catch (error) {
    console.error('[auth-route] ERROR:', error)
    // Store error details for the debug endpoint
    const errorInfo = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      cause: error instanceof Error && error.cause ? String(error.cause) : undefined,
    }

    // Return error as JSON for debugging (temporary)
    if (new URL(req.url).searchParams.has('debug')) {
      return NextResponse.json({ authError: errorInfo }, { status: 500 })
    }

    // Re-throw so Auth.js handles it normally
    throw error
  }
}

export { wrappedGET as GET }
export const { POST } = handlers
