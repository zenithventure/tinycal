"use client"

import { useSession, signOut as nextAuthSignOut } from "next-auth/react"

export function useAuth() {
  const { data: session, status } = useSession()

  const isLoading = status === "loading"
  const isAuthenticated = status === "authenticated"

  const user = session?.user
    ? {
        userId: session.user.id ?? "",
        email: session.user.email ?? "",
        name: session.user.name ?? undefined,
        emailVerified: true,
      }
    : null

  const logout = async () => {
    await nextAuthSignOut({ callbackUrl: "/login" })
  }

  return {
    user,
    isAuthenticated,
    isLoading,
    logout,
  }
}
