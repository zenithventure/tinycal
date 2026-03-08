import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import prisma from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      // TEMPORARY: Skip Prisma to isolate if DB call is the issue
      if (account && profile?.email) {
        token.userId = "temp-test-id"
        token.email = profile.email
      }
      return token
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string
      }
      return session
    },
  },
  debug: true,
  logger: {
    error(code, ...message) {
      console.error('[auth][error]', code, JSON.stringify(message))
      // Store error for debug endpoint retrieval
      ;(globalThis as any).__lastAuthError = {
        timestamp: new Date().toISOString(),
        code,
        message: JSON.stringify(message),
      }
    },
    warn(code, ...message) {
      console.warn('[auth][warn]', code, ...message)
    },
    debug(code, ...message) {
      console.log('[auth][debug]', code, ...message)
      // Store last 5 debug messages
      if (!(globalThis as any).__authDebugLog) (globalThis as any).__authDebugLog = []
      ;(globalThis as any).__authDebugLog.push({
        timestamp: new Date().toISOString(),
        code,
        message: message.map((m: any) => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' '),
      })
      if ((globalThis as any).__authDebugLog.length > 10) (globalThis as any).__authDebugLog.shift()
    },
  },
  pages: {
    signIn: '/login',
  },
})
