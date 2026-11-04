// ─── Generate on this map ─────────────────────────────────────────────────────
// Runs chosen layers of the random map generator on the map that is open (generate-on-map.ts). Existing content is never touched,
// and the whole result is one undo step.

import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import InteractableSelectorDialog from '@/components/common/InteractableSelectorDialog'
import { useCatalogStore } from '@/store/useCatalogStore'
import { containerToRawBlocks, useMapDocumentStore } from '@/store/useMapDocumentStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { extractMapContext } from '@/lib/map-extract'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { decorationSubcategoryName } from '@/lib/map-grid/decoration-subcategories'
import { DIFFICULTY_LEVELS, RICHNESS_LEVELS, type RmgDifficulty, type RmgRichness } from '@/lib/rmg/classic-presets'
import { DECORATION_TYPES, TREASURE_TYPES, generateOnMap, type DecorationType, type OnMapResult, type TreasureType } from '@/lib/rmg/generate-on-map'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The tiles of a valley are rare in hand-made maps and in the game's own generator, so only hills get a slider. */
const VALLEY_CHANCE = 0.03

function Layer({ title, on, onChange, children }: { title: string; on: boolean; onChange: (on: boolean) => void; children?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{title}</Label>
        <Switch checked={on} onCheckedChange={onChange} />
      </div>
      {children && <div className={on ? 'space-y-2' : 'space-y-2 opacity-50 pointer-events-none'}>{children}</div>}
    </section>
  )
}

function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={step} className="flex-1" />
      <span className="text-xs tabular-nums w-10 text-right">{value.toFixed(2)}</span>
    </div>
  )
}

export default function GenerateOnMapDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const catalog = useCatalogStore((s) => s.catalog)
  const [richness, setRichness] = useState<RmgRichness>('medium')
  const [difficulty, setDifficulty] = useState<RmgDifficulty>('normal')
  const [waterOn, setWaterOn] = useState(false)
  const [waterChance, setWaterChance] = useState(0.3)
  const [elevationOn, setElevationOn] = useState(false)
  const [hillChance, setHillChance] = useState(0.5)
  const [treasuresOn, setTreasuresOn] = useState(true)
  const [treasureDensity, setTreasureDensity] = useState(1)
  const [treasureTypes, setTreasureTypes] = useState<Set<TreasureType>>(new Set(TREASURE_TYPES))
  const [decorationsOn, setDecorationsOn] = useState(true)
  const [decorationTypes, setDecorationTypes] = useState<Set<DecorationType>>(new Set(DECORATION_TYPES))
  const [decorationDensity, setDecorationDensity] = useState(0.35)
  const [interactablesOn, setInteractablesOn] = useState(true)
  const [interactableDensity, setInteractableDensity] = useState(0.25)
  const [disabledSids, setDisabledSids] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [encountersOn, setEncountersOn] = useState(true)
  const [encounterDensity, setEncounterDensity] = useState(0.45)
  const [guardExisting, setGuardExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OnMapResult['added'] | null>(null)

  const toggleTreasureType = (type: TreasureType, on: boolean) => {
    const next = new Set(treasureTypes)
    if (on) next.add(type)
    else next.delete(type)
    setTreasureTypes(next)
  }

  const toggleType = (type: DecorationType, on: boolean) => {
    const next = new Set(decorationTypes)
    if (on) next.add(type)
    else next.delete(type)
    setDecorationTypes(next)
  }

  const nothingChosen = !waterOn && !elevationOn && (!treasuresOn || treasureTypes.size === 0) && (!decorationsOn || decorationTypes.size === 0) && !interactablesOn && !encountersOn

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
          settings: { richness, difficulty },
          water: waterOn ? { chance: waterChance } : undefined,
          elevation: elevationOn ? { hillChance, valleyChance: VALLEY_CHANCE } : undefined,
          treasures: treasuresOn ? { density: treasureDensity, types: treasureTypes } : undefined,
          decorations: decorationsOn ? { types: decorationTypes, density: decorationDensity } : undefined,
          interactables: interactablesOn ? { density: interactableDensity, disabledSids } : undefined,
          encounters: encountersOn ? { density: encounterDensity, guardExisting } : undefined,
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

  const levelLabel = (group: 'richness' | 'difficulty', id: string) => t(`common.generateRandomMapDialog.levels.${group}.${id}` as never)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={480} defaultHeight={640} minWidth={380} minHeight={360} storageKey="generate-on-map">
          <DraggableDialogDragHandle className="px-6 pt-6 pb-3 pr-10 border-b border-border shrink-0">
            <DialogTitle>{t('mapGrid.generateOnMap.title')}</DialogTitle>
            <DialogDescription className="text-xs">{t('mapGrid.generateOnMap.description')}</DialogDescription>
          </DraggableDialogDragHandle>
          <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('common.generateRandomMapDialog.richness')}</Label>
                <Select value={richness} onValueChange={(v) => setRichness(v as RmgRichness)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{RICHNESS_LEVELS.map((l) => (<SelectItem key={l.id} value={l.id}>{levelLabel('richness', l.id)}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('common.generateRandomMapDialog.difficulty')}</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as RmgDifficulty)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{DIFFICULTY_LEVELS.map((l) => (<SelectItem key={l.id} value={l.id}>{levelLabel('difficulty', l.id)}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>

            <Layer title={t('mapGrid.generateOnMap.water')} on={waterOn} onChange={setWaterOn}>
              <SliderRow label={t('mapGrid.generateOnMap.amount')} value={waterChance} min={0.05} max={0.8} step={0.05} onChange={setWaterChance} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.elevation')} on={elevationOn} onChange={setElevationOn}>
              <SliderRow label={t('mapGrid.generateOnMap.amount')} value={hillChance} min={0.1} max={1} step={0.05} onChange={setHillChance} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.treasures')} on={treasuresOn} onChange={setTreasuresOn}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {TREASURE_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={treasureTypes.has(type)} onCheckedChange={(v) => toggleTreasureType(type, v === true)} />
                    {t(`mapGrid.generateOnMap.treasureType.${type}`)}
                  </label>
                ))}
              </div>
              <SliderRow label={t('mapGrid.generateOnMap.amount')} value={treasureDensity} min={0.2} max={3} step={0.1} onChange={setTreasureDensity} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.decorations')} on={decorationsOn} onChange={setDecorationsOn}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {DECORATION_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={decorationTypes.has(type)} onCheckedChange={(v) => toggleType(type, v === true)} />
                    {decorationSubcategoryName(type)}
                  </label>
                ))}
              </div>
              <SliderRow label={t('mapGrid.generateOnMap.density')} value={decorationDensity} min={0.05} max={1} step={0.05} onChange={setDecorationDensity} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.interactables')} on={interactablesOn} onChange={setInteractablesOn}>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPickerOpen(true)}>
                {t('mapGrid.generateOnMap.chooseInteractables', { count: disabledSids.size })}
              </Button>
              <SliderRow label={t('mapGrid.generateOnMap.density')} value={interactableDensity} min={0.05} max={0.4} step={0.01} onChange={setInteractableDensity} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.encounters')} on={encountersOn} onChange={setEncountersOn}>
              <SliderRow label={t('mapGrid.generateOnMap.density')} value={encounterDensity} min={0.05} max={1} step={0.05} onChange={setEncounterDensity} />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={guardExisting} onCheckedChange={(v) => setGuardExisting(v === true)} />
                {t('mapGrid.generateOnMap.guardExisting')}
              </label>
            </Layer>

            <p className="text-xs text-muted-foreground">{t('mapGrid.generateOnMap.keepsExisting')}</p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {result && <p className="text-xs text-emerald-600">{t('mapGrid.generateOnMap.done', result)}</p>}
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
