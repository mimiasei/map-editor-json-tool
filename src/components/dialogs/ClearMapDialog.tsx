// File > Clear map: empties the loaded map (objects, terrain, water, elevation, roads, rivers, player areas) and keeps everything the map
// is called and configured as. It replaces the Map Grid's Clear All button, which sat next to "delete selected" and was mistaken for it,
// so confirming takes a typed name and the dialog says what goes and what stays.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { containerToRawBlocks, useMapDocumentStore } from '@/store/useMapDocumentStore'
import { logError } from '@/lib/logger'

const FALLBACK_WORD = 'CLEAR'

export default function ClearMapDialog() {
  const { t } = useTranslation()
  const container = useMapDocumentStore((s) => s.container)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const onOpen = () => { setTyped(''); setOpen(true) }
    window.addEventListener('oe:clear-map', onOpen)
    return () => window.removeEventListener('oe:clear-map', onOpen)
  }, [])

  const info = useMemo(() => {
    if (!open || !container) return null
    const { block1, block2 } = containerToRawBlocks(container) as {
      block1: { title?: string }
      block2: { objects?: Array<{ ids?: number[] }>; squads?: unknown[]; markers?: unknown[] }
    }
    return {
      title: (block1.title ?? '').trim(),
      objects: (block2.objects ?? []).reduce((n, g) => n + (g.ids?.length ?? 0), 0),
      squads: block2.squads?.length ?? 0,
      markers: block2.markers?.length ?? 0,
    }
  }, [open, container])

  const word = info?.title || FALLBACK_WORD

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
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('dialogs.clearMap.title')}</DialogTitle>
          <DialogDescription>
            {info ? t('dialogs.clearMap.intro') : t('dialogs.clearMap.noMap')}
          </DialogDescription>
        </DialogHeader>
        {info && (
          <>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-destructive">
                {t('dialogs.clearMap.removes', { objects: info.objects, squads: info.squads, markers: info.markers })}
              </p>
              <p className="text-muted-foreground">{t('dialogs.clearMap.resets')}</p>
              <p className="text-muted-foreground">{t('dialogs.clearMap.keeps')}</p>
              <p className="text-xs text-muted-foreground">{t('dialogs.clearMap.undo')}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{t('dialogs.clearMap.typeToConfirm', { word })}</p>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} autoFocus />
            </div>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" data-skin-large onClick={() => setOpen(false)}>
            {t('shared.cancel')}
          </Button>
          {info && (
            <Button type="button" variant="destructive" data-skin-large disabled={typed.trim() !== word} onClick={clear}>
              {t('dialogs.clearMap.button')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
