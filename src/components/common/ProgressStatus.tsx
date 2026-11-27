// ─── Progress bar + status text ──────────────────────────────────────────
// A progress bar with a short line underneath naming what's currently being
// worked on — generic (no RMG-specific knowledge), for reuse by any other
// long-running operation that reports staged progress (e.g. H3 import).

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface ProgressStatusProps {
  /** 0-100. */
  value: number
  /** See `Progress`: the bar keeps creeping towards this while a stage has nothing to report. */
  creepTo?: number
  creepMs?: number
  /** e.g. "Building roads…" — omitted entirely if blank. */
  label?: string
  className?: string
}

export function ProgressStatus({ value, label, creepTo, creepMs, className }: ProgressStatusProps) {
  return (
    <div className={cn('w-full', className)}>
      <Progress value={value} creepTo={creepTo} creepMs={creepMs} />
      {label && <p className="mt-1.5 truncate text-xs text-muted-foreground">{label}</p>}
    </div>
  )
}
