import * as React from "react"
import { cn } from "@/lib/utils"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div>
        <input
          ref={ref}
          className={cn(
            "w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2",
            "bg-white text-gray-900 placeholder:text-gray-400",
            "dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500",
            error
              ? "border-red-500 focus:ring-red-500"
              : "border-gray-300 dark:border-gray-700 focus:ring-blue-500 focus:border-blue-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${props.id}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={props.id ? `${props.id}-error` : undefined}
            className="text-sm text-red-600 dark:text-red-400 mt-1"
          >
            {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"

export { Input }
export type { InputProps }
