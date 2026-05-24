"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check, X, AlertTriangle, Info } from "lucide-react"

// --- Types ---

type ToastVariant = "success" | "error" | "warning" | "info"

interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

interface ToastContextValue {
  toast: (message: string, options?: { variant?: ToastVariant; duration?: number }) => void
}

// --- Variant config ---

const variantClasses = {
  success:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800",
  error:
    "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900",
  warning:
    "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-200 dark:border-yellow-800",
  info:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900",
} as const

const variantIcons = {
  success: Check,
  error: X,
  warning: AlertTriangle,
  info: Info,
} as const

// --- Context ---

const ToastContext = React.createContext<ToastContextValue | null>(null)

function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

// --- Toast item ---

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    // Trigger enter animation on next frame
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(t.id), 150)
    }, t.duration)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, onDismiss])

  const Icon = variantIcons[t.variant]

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-lg border shadow-md text-sm font-medium transition-all duration-150",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
        variantClasses[t.variant]
      )}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{t.message}</span>
      <button
        onClick={() => {
          setVisible(false)
          setTimeout(() => onDismiss(t.id), 150)
        }}
        className="p-0.5 rounded hover:bg-black/5 transition"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// --- Provider + Toaster ---

let toastCounter = 0

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (message: string, options?: { variant?: ToastVariant; duration?: number }) => {
      const id = `toast-${++toastCounter}`
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          variant: options?.variant ?? "info",
          duration: options?.duration ?? 3000,
        },
      ])
    },
    []
  )

  const contextValue = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast container - fixed at top center */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export { ToastProvider, useToast }
export type { ToastVariant, ToastContextValue }
