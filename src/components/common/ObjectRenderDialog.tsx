// ─── Object images dialog ────────────────────────────────────────────────────
// Offers to render the Map Grid's object images from the user's own game install (lib/object-render). Opens by itself
// at startup while objects are missing renders, unless the user ticked "don't ask again"; More > Render Object Images
// opens it on demand. Starting a job closes it: the work continues in the background with a progress bar at the
// bottom of the window.

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Loader2 } from '@/components/ui/icons'
import { useObjectRenderStore } from '@/store/useObjectRenderStore'
import { refreshPendingCounts, runAllRenderJobs } from '@/lib/object-render/render-job'
import { emptyIndex, saveRenderIndex } from '@/lib/object-render/render-index'
import { useTranslation } from 'react-i18next'

export const RENDER_PROMPT_OFF_KEY = 'oe-object-render-prompt-off'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True when opened by itself at startup: offers "don't ask again" and "not now". */
  startup: boolean
}

export default function ObjectRenderDialog({ open, onOpenChange, startup }: Props) {
  const { t } = useTranslation()
  const pending = useObjectRenderStore((s) => s.pending)
  const job = useObjectRenderStore((s) => s.job)
  const [dontAsk, setDontAsk] = useState(false)
  const running = job.phase === 'preparing' || job.phase === 'exporting' || job.phase === 'rendering'

  useEffect(() => {
    if (open) void refreshPendingCounts()
  }, [open])

  const remember = () => {
    if (!dontAsk) return
    try {
      localStorage.setItem(RENDER_PROMPT_OFF_KEY, '1')
    } catch {
      // Private mode: the prompt comes back next start, which is harmless.
    }
  }

  const start = () => {
    remember()
    onOpenChange(false)
    void runAllRenderJobs()
  }

  const renderAgain = async () => {
    // Forget what was rendered so every object counts as new; the old images stay until each one is replaced.
    await saveRenderIndex(emptyIndex())
    await refreshPendingCounts()
    start()
  }

  const total = pending ? pending.interactables + pending.decorations + pending.cliffs + pending.rivers : null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { remember(); onOpenChange(false) } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('common.objectRenderDialog.nicerObjectImagesForThe')}</DialogTitle>
          <DialogDescription>
            {t('common.objectRenderDialog.drawEveryMineBuildingTree')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {total === null && !running && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('common.objectRenderDialog.checkingWhichObjectsNeedAn')}
            </p>
          )}

          {total !== null && total > 0 && !running && (
            <>
              <p>
                {t('common.objectRenderDialog.theMapWillLookA')}
              </p>
              <p className="text-muted-foreground">
                {t('common.objectRenderDialog.thePicturesAreMadeOn')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('common.objectRenderDialog.waiting', { interactables: pending!.interactables, decorations: pending!.decorations, cliffs: pending!.cliffs, rivers: pending!.rivers })}
              </p>
            </>
          )}

          {total === 0 && !running && <p>{t('common.objectRenderDialog.allObjectImagesAreAlready')}</p>}

          {running && <p>{t('common.objectRenderDialog.renderingIsRunningInThe')}</p>}

          {job.phase === 'error' && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2 text-xs">{job.error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          {startup && !running && total !== 0 ? (
            <div className="flex items-center gap-2">
              <Checkbox id="render-dont-ask" checked={dontAsk} onCheckedChange={(v) => setDontAsk(v === true)} />
              <Label htmlFor="render-dont-ask" className="text-xs text-muted-foreground">{t('common.objectRenderDialog.dontAskAgainAtStartup')}</Label>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {total === 0 && !running && (
              <Button variant="ghost" onClick={() => void renderAgain()}>{t('common.objectRenderDialog.renderEverythingAgain')}</Button>
            )}
            <Button variant="ghost" onClick={() => { remember(); onOpenChange(false) }}>
              {total !== null && total > 0 && !running ? t('common.objectRenderDialog.notNow') : t('ui.close')}
            </Button>
            {total !== null && total > 0 && !running && <Button onClick={start}>{t('common.objectRenderDialog.renderNow')}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
