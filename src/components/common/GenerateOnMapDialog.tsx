// ─── Generate on this map ─────────────────────────────────────────────────────
// Runs chosen layers of the random map generator on the map that is open (generate-on-map.ts). Existing content is never touched,
// and the whole result is one undo step.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import InteractableSelectorDialog from '@/components/common/InteractableSelectorDialog'
import { useCatalogStore } from '@/store/useCatalogStore'
import { containerToRawBlocks, useMapDocumentStore } from '@/store/useMapDocumentStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { extractMapContext } from '@/lib/map-extract'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { DECORATION_TYPES, generateOnMap, type DecorationType, type OnMapResult } from '@/lib/rmg/generate-on-map'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function GenerateOnMapDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const catalog = useCatalogStore((s) => s.catalog)
  const [decorationsOn, setDecorationsOn] = useState(true)
  const [decorationTypes, setDecorationTypes] = useState<Set<DecorationType>>(new Set(DECORATION_TYPES))
  const [decorationDensity, setDecorationDensity] = useState(0.35)
  const [interactablesOn, setInteractablesOn] = useState(true)
  const [interactableDensity, setInteractableDensity] = useState(0.25)
  const [disabledSids, setDisabledSids] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OnMapResult['added'] | null>(null)

  const toggleType = (type: DecorationType, on: boolean) => {
    const next = new Set(decorationTypes)
    if (on) next.add(type)
    else next.delete(type)
    setDecorationTypes(next)
  }

  const nothingChosen = (!decorationsOn || decorationTypes.size === 0) && !interactablesOn

  const handleGenerate = () => {
    const current = useMapDocumentStore.getState().container
    if (!current || !catalog) return
    setBusy(true)
    setError(null)
    setResult(null)
    // Let the busy state paint before the synchronous generation blocks the thread.
    window.setTimeout(() => {
      try {
        const out = generateOnMap(current, catalog, {
          decorations: decorationsOn ? { types: decorationTypes, density: decorationDensity } : undefined,
          interactables: interactablesOn ? { density: interactableDensity, disabledSids } : undefined,
        }, createSeededRng(Math.floor(Math.random() * 2 ** 31)))
        // One store write = one undo step (applyEdit does the same per edit).
        useMapDocumentStore.setState({ container: out.container, mapIsDirty: true })
        useMapContextStore.getState().setContext(extractMapContext(containerToRawBlocks(out.container)))
        setResult(out.added)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={460} defaultHeight={520} minWidth={380} minHeight={360} storageKey="generate-on-map">
          <DraggableDialogDragHandle className="px-6 pt-6 pb-3 pr-10 border-b border-border shrink-0">
            <DialogTitle>{t('mapGrid.generateOnMap.title')}</DialogTitle>
            <DialogDescription className="text-xs">{t('mapGrid.generateOnMap.description')}</DialogDescription>
          </DraggableDialogDragHandle>
          <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-5">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t('mapGrid.generateOnMap.decorations')}</Label>
                <Switch checked={decorationsOn} onCheckedChange={setDecorationsOn} />
              </div>
              <div className={decorationsOn ? 'space-y-2' : 'space-y-2 opacity-50 pointer-events-none'}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {DECORATION_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={decorationTypes.has(type)} onCheckedChange={(v) => toggleType(type, v === true)} />
                      {t(`mapGrid.generateOnMap.type.${type}`)}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">{t('mapGrid.generateOnMap.density')}</span>
                  <Slider value={[decorationDensity]} onValueChange={(v) => setDecorationDensity(v[0])} min={0.05} max={1} step={0.05} className="flex-1" />
                  <span className="text-xs tabular-nums w-10 text-right">{decorationDensity.toFixed(2)}</span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t('mapGrid.generateOnMap.interactables')}</Label>
                <Switch checked={interactablesOn} onCheckedChange={setInteractablesOn} />
              </div>
              <div className={interactablesOn ? 'space-y-2' : 'space-y-2 opacity-50 pointer-events-none'}>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPickerOpen(true)}>
                  {t('mapGrid.generateOnMap.chooseInteractables', { count: disabledSids.size })}
                </Button>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">{t('mapGrid.generateOnMap.density')}</span>
                  <Slider value={[interactableDensity]} onValueChange={(v) => setInteractableDensity(v[0])} min={0.05} max={0.4} step={0.01} className="flex-1" />
                  <span className="text-xs tabular-nums w-10 text-right">{interactableDensity.toFixed(2)}</span>
                </div>
              </div>
            </section>

            <p className="text-xs text-muted-foreground">{t('mapGrid.generateOnMap.keepsExisting')}</p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {result && (
              <p className="text-xs text-emerald-600">
                {t('mapGrid.generateOnMap.done', { decorations: result.decorations, fauna: result.fauna, interactables: result.interactables })}
              </p>
            )}
          </div>
          <div className="px-6 py-3 border-t border-border flex justify-end gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>{t('ui.close')}</Button>
            <Button size="sm" disabled={busy || nothingChosen || !catalog} onClick={handleGenerate}>
              {busy ? t('mapGrid.generateOnMap.generating') : t('mapGrid.generateOnMap.generate')}
            </Button>
          </div>
        </DraggableDialogContent>
      </Dialog>
      <InteractableSelectorDialog open={pickerOpen} onOpenChange={setPickerOpen} disabledSids={disabledSids} onChange={setDisabledSids} />
    </>
  )
}
