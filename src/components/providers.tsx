"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider, type Theme } from "@/lib/contexts/theme-context"

export function Providers({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  initialTheme: Theme
}) {
  return (
    <SessionProvider>
      <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
    </SessionProvider>
  )
}
