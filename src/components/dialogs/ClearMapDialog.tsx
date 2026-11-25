// File > Clear map: empties the loaded map (objects, terrain, water, elevation, roads, rivers, player areas) and keeps the name and settings.
// It replaces the Map Grid's Clear All button, which sat next to "delete selected" and was mistaken for it; a dialog of its own with the
// counts of what goes is the confirmation.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { containerToRawBlocks, useMapDocumentStore } from '@/store/useMapDocumentStore'
import { logError } from '@/lib/logger'

export default function ClearMapDialog() {
  const { t } = useTranslation()
  const container = useMapDocumentStore((s) => s.container)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('oe:clear-map', onOpen)
    return () => window.removeEventListener('oe:clear-map', onOpen)
  }, [])

  const counts = useMemo(() => {
    if (!open || !container) return null
    const { block2 } = containerToRawBlocks(container) as {
      block2: { objects?: Array<{ ids?: number[] }>; squads?: unknown[]; markers?: unknown[] }
    }
    return {
      objects: (block2.objects ?? []).reduce((n, g) => n + (g.ids?.length ?? 0), 0),
      squads: block2.squads?.length ?? 0,
      markers: block2.markers?.length ?? 0,
    }
  }, [open, container])

  const clear = () => {
    try {
      useMapDocumentStore.getState().applyEdit({ kind: 'clearAll' })
    } catch (e) {
      logError(`Failed to clear the map: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('dialogs.clearMap.title')}</DialogTitle>
          <DialogDescription>{counts ? t('dialogs.clearMap.intro') : t('dialogs.clearMap.noMap')}</DialogDescription>
        </DialogHeader>
        {counts && <p className="text-sm font-medium text-destructive">{t('dialogs.clearMap.removes', counts)}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" data-skin-large onClick={() => setOpen(false)}>
            {t('shared.cancel')}
          </Button>
          {counts && (
            <Button type="button" variant="destructive" data-skin-large onClick={clear}>
              {t('dialogs.clearMap.button')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
