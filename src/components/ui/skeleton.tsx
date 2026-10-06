import * as React from "react"
import { cn } from "@/lib/utils"

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-gray-200 rounded-lg motion-reduce:animate-none",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
export type { SkeletonProps }
