import { handlers } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

async function wrappedGET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const cookies = req.cookies.getAll().map(c => c.name)

    // Store request info for debug endpoint
    ;(globalThis as any).__lastCallbackError = {
      timestamp: new Date().toISOString(),
      path: url.pathname + url.search,
      cookiesPresent: cookies,
      status: 'processing',
    }

    const response = await handlers.GET(req)

    const location = response?.headers.get('location')
    ;(globalThis as any).__lastCallbackError = {
      ...(globalThis as any).__lastCallbackError,
      responseStatus: response?.status,
      redirectLocation: location,
      status: location?.includes('error=') ? 'error-redirect' : 'ok',
    }

    return response
  } catch (error) {
    ;(globalThis as any).__lastCallbackError = {
      ...(globalThis as any).__lastCallbackError,
      status: 'thrown',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error && error.cause ? String(error.cause) : undefined,
    }
    throw error
  }
}

export { wrappedGET as GET }
export const { POST } = handlers
