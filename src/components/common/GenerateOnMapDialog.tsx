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
import CheckGroup from '@/components/common/CheckGroup'
import InteractableSelectorDialog from '@/components/common/InteractableSelectorDialog'
import { useCatalogStore } from '@/store/useCatalogStore'
import { containerToRawBlocks, useMapDocumentStore } from '@/store/useMapDocumentStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { extractMapContext } from '@/lib/map-extract'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { decorationSubcategoryName } from '@/lib/map-grid/decoration-subcategories'
import { BIOME_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import { readTemplateAndCatalog } from '@/lib/rmg/generate-map-file'
import { DIFFICULTY_LEVELS, RICHNESS_LEVELS, type RmgDifficulty, type RmgRichness } from '@/lib/rmg/classic-presets'
import { DECORATION_TYPES, TREASURE_TYPES, generateOnMap, type DecorationType, type OnMapResult, type TreasureType } from '@/lib/rmg/generate-on-map'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ALL_BIOMES: readonly BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

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
      <span className="text-xs tabular-nums w-10 text-right">{Number.isInteger(step) ? value : value.toFixed(2)}</span>
    </div>
  )
}

export default function GenerateOnMapDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const catalog = useCatalogStore((s) => s.catalog)
  const [richness, setRichness] = useState<RmgRichness>('medium')
  const [difficulty, setDifficulty] = useState<RmgDifficulty>('normal')
  const [terrainOn, setTerrainOn] = useState(false)
  const [terrainMode, setTerrainMode] = useState<'zones' | 'patches' | 'defined'>('zones')
  const [terrainScope, setTerrainScope] = useState<'unpainted' | 'all'>('unpainted')
  const [terrainBiomes, setTerrainBiomes] = useState<Set<BiomeId>>(new Set(ALL_BIOMES))
  const [bordersOn, setBordersOn] = useState(false)
  const [waterOn, setWaterOn] = useState(false)
  const [waterChance, setWaterChance] = useState(0.3)
  const [elevationOn, setElevationOn] = useState(false)
  const [hillChance, setHillChance] = useState(0.5)
  const [minesOn, setMinesOn] = useState(false)
  const [roadsOn, setRoadsOn] = useState(false)
  const [spurChance, setSpurChance] = useState(0.8)
  const [riversOn, setRiversOn] = useState(false)
  const [riverCount, setRiverCount] = useState(2)
  const [treasuresOn, setTreasuresOn] = useState(true)
  const [treasureDensity, setTreasureDensity] = useState(1)
  const [treasureTypes, setTreasureTypes] = useState<Set<TreasureType>>(new Set(TREASURE_TYPES))
  const [decorationsOn, setDecorationsOn] = useState(true)
  const [decorationTypes, setDecorationTypes] = useState<Set<DecorationType>>(new Set(DECORATION_TYPES))
  const [decorationDensity, setDecorationDensity] = useState(0.35)
  const [biomePurity, setBiomePurity] = useState(0.9)
  const [highContrast, setHighContrast] = useState(false)
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

  // Borders need zones: the ones the terrain layer lays out in this run, or the map's own (a generated map keeps them as areas).
  const mapZoneCount = useMapContextStore((s) => s.context?.zoneAreas?.length ?? 0)
  const definedZones = terrainOn && terrainMode === 'defined'
  const definedAreaCount = useMapContextStore((s) => new Set((s.context?.customAreasPainting ?? []).filter((id) => id !== 0)).size)
  const zonesAvailable = definedZones ? definedAreaCount > 0 : (terrainOn && terrainMode === 'zones') || mapZoneCount > 1
  const bordersChosen = bordersOn && zonesAvailable

  const nothingChosen = (!terrainOn || definedZones || terrainBiomes.size === 0) && !bordersChosen && !waterOn && !elevationOn && !minesOn && !roadsOn && !riversOn && (!treasuresOn || treasureTypes.size === 0) && (!decorationsOn || decorationTypes.size === 0) && !interactablesOn && !encountersOn

  /** `finish`: every layer on with every kind, and the terrain laid out with zones when the map is still a blank one-biome map (otherwise the terrain stays). */
  const handleGenerate = (finish = false) => {
    const current = useMapDocumentStore.getState().container
    if (!current || !catalog) return
    setBusy(true)
    setError(null)
    setResult(null)
    // Let the busy state paint before the synchronous generation blocks the thread.
    window.setTimeout(async () => {
      try {
        const tilesMap = useMapContextStore.getState().context?.tilesMap ?? []
        const blank = tilesMap.length > 0 && tilesMap.every((b) => b === tilesMap[0])
        const terrainLayer = finish ? (blank ? { mode: 'zones' as const, scope: 'unpainted' as const, biomes: new Set<BiomeId>(ALL_BIOMES) } : undefined) : terrainOn && terrainMode !== 'defined' ? { mode: terrainMode, scope: terrainScope, biomes: terrainBiomes } : undefined
        const template = terrainLayer?.mode === 'zones' ? (await readTemplateAndCatalog())?.template : undefined
        if (terrainLayer?.mode === 'zones' && !template) throw new Error(t('mapGrid.generateOnMap.needsDesktop'))
        const out = generateOnMap(current, catalog, {
          settings: { richness, difficulty },
          terrain: terrainLayer ? { ...terrainLayer, template } : undefined,
          borders: finish ? blank || mapZoneCount > 1 : bordersChosen,
          definedZones: !finish && bordersChosen && definedZones,
          water: finish || waterOn ? { chance: waterChance } : undefined,
          elevation: finish || elevationOn ? { hillChance, valleyChance: VALLEY_CHANCE } : undefined,
          mines: finish || minesOn ? {} : undefined,
          roads: finish || roadsOn ? { spurChance } : undefined,
          rivers: finish || riversOn ? { count: riverCount } : undefined,
          treasures: finish || treasuresOn ? { density: treasureDensity, types: finish ? new Set(TREASURE_TYPES) : treasureTypes } : undefined,
          decorations: finish || decorationsOn ? { types: finish ? new Set(DECORATION_TYPES) : decorationTypes, density: decorationDensity, biomePurity, allowHighContrastBiomes: highContrast } : undefined,
          interactables: finish || interactablesOn ? { density: interactableDensity, disabledSids } : undefined,
          encounters: finish || encountersOn ? { density: encounterDensity, guardExisting } : undefined,
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
            <div className="flex items-center gap-3 rounded-md bg-secondary/40 px-3 py-2">
              <p className="flex-1 text-xs text-muted-foreground">{t('mapGrid.generateOnMap.finishHint')}</p>
              <Button size="sm" disabled={busy || !catalog} onClick={() => handleGenerate(true)}>{t('mapGrid.generateOnMap.finish')}</Button>
            </div>

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

            <Layer title={t('mapGrid.generateOnMap.terrain')} on={terrainOn} onChange={setTerrainOn}>
              <div className="grid grid-cols-2 gap-3">
                <Select value={terrainMode} onValueChange={(v) => setTerrainMode(v as 'zones' | 'patches' | 'defined')}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zones">{t('mapGrid.generateOnMap.terrainZones')}</SelectItem>
                    <SelectItem value="patches">{t('mapGrid.generateOnMap.terrainPatches')}</SelectItem>
                    <SelectItem value="defined" disabled={definedAreaCount === 0}>{t('mapGrid.generateOnMap.terrainDefined')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={terrainScope} disabled={definedZones} onValueChange={(v) => setTerrainScope(v as 'unpainted' | 'all')}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpainted">{t('mapGrid.generateOnMap.scopeUnpainted')}</SelectItem>
                    <SelectItem value="all">{t('mapGrid.generateOnMap.scopeAll')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={definedZones ? 'opacity-50 pointer-events-none' : undefined}>
              <CheckGroup
                options={ALL_BIOMES.map((id) => ({ id, label: BIOME_NAMES[id] }))}
                selected={terrainBiomes}
                onChange={setTerrainBiomes}
              />
              </div>
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.borders')} on={bordersChosen} onChange={setBordersOn}>
              <p className="text-xs text-muted-foreground">{zonesAvailable ? t('mapGrid.generateOnMap.bordersHint') : t('mapGrid.generateOnMap.bordersNeedZones')}</p>
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.water')} on={waterOn} onChange={setWaterOn}>
              <SliderRow label={t('mapGrid.generateOnMap.amount')} value={waterChance} min={0.05} max={0.8} step={0.05} onChange={setWaterChance} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.elevation')} on={elevationOn} onChange={setElevationOn}>
              <SliderRow label={t('mapGrid.generateOnMap.amount')} value={hillChance} min={0.1} max={1} step={0.05} onChange={setHillChance} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.mines')} on={minesOn} onChange={setMinesOn}>
              <p className="text-xs text-muted-foreground">{t('mapGrid.generateOnMap.minesHint')}</p>
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.roads')} on={roadsOn} onChange={setRoadsOn}>
              <SliderRow label={t('mapGrid.generateOnMap.roadSpurs')} value={spurChance} min={0} max={1} step={0.05} onChange={setSpurChance} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.rivers')} on={riversOn} onChange={setRiversOn}>
              <SliderRow label={t('mapGrid.generateOnMap.riverCount')} value={riverCount} min={1} max={5} step={1} onChange={setRiverCount} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.treasures')} on={treasuresOn} onChange={setTreasuresOn}>
              <CheckGroup
                options={TREASURE_TYPES.map((type) => ({ id: type, label: t(`mapGrid.generateOnMap.treasureType.${type}`) }))}
                selected={treasureTypes}
                onChange={setTreasureTypes}
              />
              <SliderRow label={t('mapGrid.generateOnMap.amount')} value={treasureDensity} min={0.2} max={3} step={0.1} onChange={setTreasureDensity} />
            </Layer>

            <Layer title={t('mapGrid.generateOnMap.decorations')} on={decorationsOn} onChange={setDecorationsOn}>
              <CheckGroup
                options={DECORATION_TYPES.map((type) => ({ id: type, label: decorationSubcategoryName(type) }))}
                selected={decorationTypes}
                onChange={setDecorationTypes}
              />
              <SliderRow label={t('mapGrid.generateOnMap.density')} value={decorationDensity} min={0.05} max={1} step={0.05} onChange={setDecorationDensity} />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground" title={t('mapGrid.toolBrushSettingsPopover.biomeMixTooltip.obstacles')}>{t('mapGrid.toolBrushSettingsPopover.biomeMix')}</span>
                  <span className="text-xs text-muted-foreground">
                    {biomePurity >= 1 ? t('mapGrid.toolBrushSettingsPopover.thisBiomeOnly') : biomePurity <= 0 ? t('mapGrid.toolBrushSettingsPopover.allBiomes') : `${Math.round(biomePurity * 100)}% pure`}
                  </span>
                </div>
                <Slider value={[biomePurity]} onValueChange={(v) => setBiomePurity(v[0])} min={0} max={1} step={0.01} />
                <label className="flex items-center gap-2 text-xs" title={t('mapGrid.toolBrushSettingsPopover.whenOffACrossBiome')}>
                  <Checkbox checked={highContrast} onCheckedChange={(v) => setHighContrast(v === true)} />
                  {t('mapGrid.toolBrushSettingsPopover.allowHighContrastBiomes')}
                </label>
              </div>
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
            <Button size="sm" disabled={busy || nothingChosen || !catalog} onClick={() => handleGenerate()}>
              {busy ? t('mapGrid.generateOnMap.generating') : t('mapGrid.generateOnMap.generate')}
            </Button>
          </div>
        </DraggableDialogContent>
      </Dialog>
      <InteractableSelectorDialog open={pickerOpen} onOpenChange={setPickerOpen} disabledSids={disabledSids} onChange={setDisabledSids} />
    </>
  )
}
