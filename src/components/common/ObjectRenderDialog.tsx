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
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useObjectRenderStore } from '@/store/useObjectRenderStore'
import { refreshPendingCounts, runAllRenderJobs } from '@/lib/object-render/render-job'
import { emptyIndex, saveRenderIndex } from '@/lib/object-render/render-index'

export const RENDER_PROMPT_OFF_KEY = 'oe-object-render-prompt-off'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True when opened by itself at startup: offers "don't ask again" and "not now". */
  startup: boolean
}

export default function ObjectRenderDialog({ open, onOpenChange, startup }: Props) {
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

  const total = pending ? pending.interactables + pending.decorations + pending.cliffs : null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { remember(); onOpenChange(false) } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nicer object images for the Map Grid</DialogTitle>
          <DialogDescription>
            Draw every mine, building, tree and rock on the map as a clean picture instead of a small icon.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {total === null && !running && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking which objects need an image…
            </p>
          )}

          {total !== null && total > 0 && !running && (
            <>
              <p>
                The map will look a lot nicer and cleaner: objects get proper pictures with soft shadows, so you can tell
                them apart at a glance and see how a map really fits together.
              </p>
              <p className="text-muted-foreground">
                The pictures are made on this computer from your own copy of the game, so nothing is downloaded and
                nothing from the game is shared. It runs in the background while you keep working (the progress bar is at
                the bottom of the window), usually takes a few minutes, and uses your graphics card. You can cancel at any
                time and continue later from More &gt; Render Object Images.
              </p>
              <p className="text-xs text-muted-foreground">
                Waiting: {pending!.interactables} map objects, then {pending!.decorations} decorations (trees, rocks,
                animals), then {pending!.cliffs} cliff pieces (the edges of raised ground).
              </p>
            </>
          )}

          {total === 0 && !running && <p>All object images are already made. New game objects are picked up automatically.</p>}

          {running && <p>Rendering is running in the background, see the progress bar at the bottom of the window.</p>}

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
              <Label htmlFor="render-dont-ask" className="text-xs text-muted-foreground">Don&apos;t ask again at startup</Label>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {total === 0 && !running && (
              <Button variant="ghost" onClick={() => void renderAgain()}>Render everything again</Button>
            )}
            <Button variant="ghost" onClick={() => { remember(); onOpenChange(false) }}>
              {total !== null && total > 0 && !running ? 'Not now' : 'Close'}
            </Button>
            {total !== null && total > 0 && !running && <Button onClick={start}>Render now</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
