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
      if (account && profile?.email) {
        try {
          let user = await prisma.user.findUnique({
            where: { email: profile.email },
          })
          if (!user) {
            const baseSlug = profile.email
              .split('@')[0]
              .replace(/[^a-z0-9]/gi, '')
              .toLowerCase()
            user = await prisma.user.create({
              data: {
                email: profile.email,
                name: profile.name ?? null,
                image: (profile as any).picture ?? null,
                slug: baseSlug,
              },
            })
          }
          token.userId = user.id
        } catch (error) {
          console.error('[auth] JWT callback error:', error)
          throw error
        }
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
    },
    warn(code, ...message) {
      console.warn('[auth][warn]', code, ...message)
    },
    debug(code, ...message) {
      console.log('[auth][debug]', code, ...message)
    },
  },
  pages: {
    signIn: '/login',
  },
})
