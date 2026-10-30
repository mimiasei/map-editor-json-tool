// A thin strip at the bottom of the window that follows the render job (lib/object-render/render-job.ts), so TSE stays
// usable while it runs. Hidden when no job has run; a finished, cancelled or failed job leaves a one-line result to dismiss.

import { useEffect, useState } from 'react'
import { X } from '@/components/ui/icons'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useObjectRenderStore, type JobName } from '@/store/useObjectRenderStore'
import { cancelRenderJob } from '@/lib/object-render/render-job'
import { useTranslation } from 'react-i18next'

const JOB_LABEL: Record<JobName, string> = { interactables: 'map objects', decorations: 'decorations', cliffs: 'cliffs', rivers: 'river pieces' }

export default function ObjectRenderProgressBar() {
  const { t } = useTranslation()
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
          <span className="shrink-0 font-medium">{t('layout.objectRenderProgressBar.rendering', { label })}</span>
          <Progress value={pct} className="max-w-md flex-1" />
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {job.phase === 'preparing' ? 'preparing…' : `${job.done} / ${job.total}`}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{job.current}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void cancelRenderJob()}>{t('shared.cancel')}</Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">
            {job.phase === 'done' && (job.failed > 0 ? t('layout.objectRenderProgressBar.finishedWithFailures', { label, failed: job.failed }) : t('layout.objectRenderProgressBar.finished', { label }))}
            {job.phase === 'cancelled' && t('layout.objectRenderProgressBar.renderingStoppedWhatIsFinished')}
            {job.phase === 'error' && t('layout.objectRenderProgressBar.failed', { error: job.error })}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t('layout.objectRenderProgressBar.dismiss')} onClick={() => setDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}
