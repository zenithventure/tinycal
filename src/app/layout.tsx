import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { cookies } from "next/headers"
import "./globals.css"
import { Providers } from "@/components/providers"
import { THEME_COOKIE, type Theme } from "@/lib/contexts/theme-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "TinyCal — Simple Scheduling for Busy People",
  description: "A lightweight scheduling platform with calendar sync, booking pages, and automatic meeting links.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieTheme = cookies().get(THEME_COOKIE)?.value
  const theme: Theme = cookieTheme === "dark" ? "dark" : "light"

  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined}>
      <body className={inter.className}>
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  )
}
