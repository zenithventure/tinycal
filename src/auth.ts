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
        let user = await prisma.user.findUnique({
          where: { email: profile.email },
        })
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

          user = await prisma.user.create({
            data: {
              email: profile.email,
              name: profile.name ?? null,
              image: (profile as any).picture ?? null,
              slug,
            },
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
