import { auth } from '@/auth'
import prisma from './prisma'

export async function getAuthenticatedUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  return prisma.user.findUnique({ where: { id: session.user.id } })
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await auth()
  return !!session?.user?.id
}
