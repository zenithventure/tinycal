import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import prisma from '@/lib/prisma'
import { track } from '@/lib/track'

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
        let user: Awaited<ReturnType<typeof prisma.user.findUnique>>
        try {
          user = await prisma.user.findUnique({
            where: { email: profile.email },
          })
        } catch (dbError) {
          console.error("[auth] Database error in JWT callback:", dbError)
          throw dbError
        }
        if (!user) {
          const baseSlug = profile.email
            .split('@')[0]
            .replace(/[^a-z0-9]/gi, '')
            .toLowerCase()

          // Handle slug conflicts by appending a random suffix
          let slug = baseSlug
          const existing = await prisma.user.findUnique({ where: { slug } })
          if (existing) {
            slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
          }

          const newUser = await prisma.user.create({
            data: {
              email: profile.email,
              name: profile.name ?? null,
              image: (profile as any).picture ?? null,
              slug,
            },
          })

          user = newUser

          // #116 setup-completion metric: one user_signed_up per user, only
          // on first sign-in (i.e. only when the user row is created here).
          // Fire-and-forget: sign-in must never depend on analytics.
          void track("user_signed_up", { userId: newUser.id })

          // Set up default Mon-Fri 9am-5pm availability
          await prisma.availability.createMany({
            data: [1, 2, 3, 4, 5].map((day) => ({
              userId: newUser.id,
              dayOfWeek: day,
              startTime: "09:00",
              endTime: "17:00",
              enabled: true,
            })),
          })
        }
        token.userId = user.id
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
  pages: {
    signIn: '/login',
  },
})
