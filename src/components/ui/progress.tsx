import * as React from "react"

import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0-100. Values outside that range are clamped. */
  value?: number
  /** While the bar sits at `value`, a second fill of the same colour creeps from `value` up to this (0-100) over `creepMs`, easing out, so a long
   *  stage with no report of its own still visibly moves. Restarts whenever `value` changes. */
  creepTo?: number
  creepMs?: number
}

// Plain div implementation, not a Radix primitive — unlike this repo's other
// ui/ components, a progress bar has no focus/keyboard/dismiss behavior for
// Radix to add, just a visual fill + ARIA attributes, so a dependency isn't
// worth it here.
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, creepTo, creepMs = 20000, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value))
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}
        {...props}
      >
        {creepTo !== undefined && creepTo > clamped && (
          <div
            key={clamped}
            className="absolute inset-0 h-full w-full bg-primary"
            style={{
              '--creep-from': clamped,
              '--creep-to': Math.min(100, creepTo),
              animation: `progress-creep ${creepMs}ms cubic-bezier(0.15, 0.6, 0.3, 1) forwards`,
            } as React.CSSProperties}
          />
        )}
        <div
          className="h-full w-full flex-1 bg-primary transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${100 - clamped}%)` }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
