// A thin strip at the bottom of the window that follows the render job (lib/object-render/render-job.ts), so TSE stays
// usable while it runs. Hidden when no job has run; a finished, cancelled or failed job leaves a one-line result to dismiss.

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useObjectRenderStore, type JobName } from '@/store/useObjectRenderStore'
import { cancelRenderJob } from '@/lib/object-render/render-job'

const JOB_LABEL: Record<JobName, string> = { interactables: 'map objects', decorations: 'decorations' }

export default function ObjectRenderProgressBar() {
  const job = useObjectRenderStore((s) => s.job)
  const [dismissed, setDismissed] = useState(false)
  const running = job.phase === 'preparing' || job.phase === 'exporting' || job.phase === 'rendering'

  useEffect(() => { if (running) setDismissed(false) }, [running])

  if (job.phase === 'idle' || dismissed) return null
  // Between the two jobs the first one reads "done"; the second starts right away and replaces this.
  const label = job.job ? JOB_LABEL[job.job] : 'objects'
  const pct = job.total > 0 ? (job.done / job.total) * 100 : 0

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card px-3 py-1.5 text-xs">
      {running ? (
        <>
          <span className="shrink-0 font-medium">Rendering {label}</span>
          <Progress value={pct} className="max-w-md flex-1" />
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {job.phase === 'preparing' ? 'preparing…' : `${job.done} / ${job.total}`}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{job.current}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void cancelRenderJob()}>Cancel</Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">
            {job.phase === 'done' && `Finished rendering ${label}${job.failed > 0 ? ` (${job.failed} could not be drawn)` : ''}.`}
            {job.phase === 'cancelled' && `Rendering stopped. What is finished is kept; continue from More > Render Object Images.`}
            {job.phase === 'error' && `Rendering failed: ${job.error}`}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}
