"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Calendar, Clock, Settings, Webhook, LayoutDashboard, LogOut, Users, Menu, X, LifeBuoy, Link2, KeyRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/contexts/auth-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/event-types", label: "Event Types", icon: Calendar },
  { href: "/dashboard/bookings", label: "Bookings", icon: Clock },
  { href: "/dashboard/meeting-links", label: "Meeting Links", icon: Link2 },
  { href: "/dashboard/availability", label: "Availability", icon: Clock },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading, isAuthenticated, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login")
    }
  }, [isLoading, isAuthenticated, router])

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  async function handleSignOut() {
    await logout()
    router.push("/")
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-100">
      {/* Top bar */}
      <header className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 h-14 flex items-center px-4 md:px-6 sticky top-0 z-50">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden mr-3 p-1 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="text-lg font-bold text-blue-600">
          Tiny<span className="text-gray-900 dark:text-gray-100">Cal</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline">{user?.email}</span>
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-950 z-50 transform transition-transform duration-200 ease-in-out md:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-800">
          <span className="text-lg font-bold text-blue-600">
            Tiny<span className="text-gray-900 dark:text-gray-100">Cal</span>
          </span>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                  active
                    ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="w-56 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 min-h-[calc(100vh-3.5rem)] p-4 hidden md:block">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                    active
                      ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-300"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  )
}
