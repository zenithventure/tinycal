"use client"

import * as React from "react"

export type Theme = "light" | "dark"

export const THEME_COOKIE = "tinycal_theme"
const COOKIE_MAX_AGE_DAYS = 365

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

function writeThemeCookie(theme: Theme) {
  if (typeof document === "undefined") return
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme
  children: React.ReactNode
}) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme)

  React.useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    writeThemeCookie(next)
  }, [])

  const toggleTheme = React.useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark"
      writeThemeCookie(next)
      return next
    })
  }, [])

  const value = React.useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return ctx
}
