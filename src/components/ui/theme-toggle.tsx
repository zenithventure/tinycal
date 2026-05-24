"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/lib/contexts/theme-context"

type ThemeToggleProps = React.ButtonHTMLAttributes<HTMLButtonElement>

const ThemeToggle = React.forwardRef<HTMLButtonElement, ThemeToggleProps>(
  ({ className, ...props }, ref) => {
    const { theme, toggleTheme } = useTheme()
    const isDark = theme === "dark"
    const label = isDark ? "Switch to light mode" : "Switch to dark mode"

    return (
      <button
        ref={ref}
        type="button"
        onClick={toggleTheme}
        aria-label={label}
        title={label}
        className={cn(
          "p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100",
          "dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition",
          className
        )}
        {...props}
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    )
  }
)

ThemeToggle.displayName = "ThemeToggle"

export { ThemeToggle }
