// ─── Generate Random Map (issue #210, Milestone 3) ──────────────────────────
// Tauri-only, same reasoning as NewMapDialog: needs real filesystem read
// access to the bundled template.map resource (plus a loaded GameCatalog —
// see generate-map-file.ts). Terrain is zone-driven (each zone gets its own
// biome, see zone-population.ts) so there's no single map-wide biome to
// pick. The Advanced section exposes the real template parameters this
// generator supports (water/obstacle/treasure density, a reproducibility
// seed) via template.ts's own RandomMapTemplate format, with Save/Load
// buttons reusing native-fs.ts's generic JSON open/save (works in both
// builds, even though generation itself is Tauri-only) — deliberately
// scoped down from VCMI's own per-zone template authoring (no zone-graph
// topology editor exists yet; see issue #210's Milestone 4/5 notes).
//
// Two real user-requested additions (issue #210): "Terrain only" (Generate
// produces just the tile arrays — no spawners, no roads, no objects — for a
// map maker who wants the random fractal terrain shape but places
// everything else themselves), and a three-stage live preview:
//   1. 'terrain' — a fixed-size canvas shows live biome/water/elevation;
//      only water/zone/seed controls are visible (everything else would be
//      inert at this point anyway). A "Reroll" button next to Seed picks a
//      fresh random one.
//   2. 'roads' — the canvas adds roads/rivers on top of the now-locked
//      terrain; only the winding sliders are visible, plus their OWN
//      independent "road seed" + reroll (deliberately separate from the
//      terrain seed — rerolling road shape must never silently change the
//      terrain the user already confirmed).
//   3. 'all' — every control (including terrain/road sliders again, for one
//      last adjustment) is visible, exactly like the pre-preview dialog.
// See generate-terrain.ts's own header comment for why the roads preview is
// NOT pixel-guaranteed identical to the eventual real roads (it's a
// cosmetic tuning aid, not a forecast) while the terrain phase IS
// guaranteed identical for the same seed (one shared implementation).

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, Dices } from 'lucide-react'
import { MAP_SIZE_PRESETS, presetKey } from '@/components/common/NewMapDialog'
import { generateRandomMapFile, previewTerrain } from '@/lib/rmg/generate-map-file'
import { previewRoads } from '@/lib/rmg/preview-roads'
import type { TerrainResult } from '@/lib/rmg/generate-terrain'
import { paintTerrainCanvas } from '@/lib/map-grid/terrain-canvas'
import { DEFAULT_TEMPLATE_OVERRIDES, RMG_TEMPLATE_VERSION, parseRandomMapTemplate, stringifyRandomMapTemplate, type RandomMapTemplate } from '@/lib/rmg/template'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { openFile, saveFile } from '@/lib/native-fs'
import { logError, logInfo, logWarn } from '@/lib/logger'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (result: { name: string; warnings: string[] }) => void
}

const DEFAULT_SIZE_KEY = presetKey({ sizeX: 64, sizeZ: 64 })
const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8]
const PREVIEW_DEBOUNCE_MS = 250
/** The live-preview canvas is always this many CSS pixels square,
 *  regardless of the chosen map size — a real user request, so the preview
 *  never changes footprint as sliders/size change. Every map size preset
 *  this dialog offers is square, so a fixed square box never has to
 *  letterbox anything. */
const PREVIEW_CANVAS_SIZE = 300

type PreviewPhase = 'off' | 'terrain' | 'roads' | 'all'

function randomSeedValue(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

function pctLabel(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** The preset closest in tile area to `(sizeX, sizeZ)` — used when loading
 *  a template whose size doesn't exactly match a preset, so the dialog's
 *  preset-only Size selector still shows something sensible rather than
 *  silently reverting to the default. */
function closestPreset(sizeX: number, sizeZ: number): { sizeX: number; sizeZ: number } {
  const targetArea = sizeX * sizeZ
  return MAP_SIZE_PRESETS.reduce((best, p) => (
    Math.abs(p.sizeX * p.sizeZ - targetArea) < Math.abs(best.sizeX * best.sizeZ - targetArea) ? p : best
  ), MAP_SIZE_PRESETS[0])
}

/** A small icon-only reroll button — reused for both the terrain seed and
 *  the independent road seed below. */
function RerollButton({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onClick} disabled={disabled} title={title}>
      <Dices className="h-3.5 w-3.5" />
    </Button>
  )
}

export default function GenerateRandomMapDialog({ open, onOpenChange, onGenerated }: Props) {
  const [mapName, setMapName] = useState('Random Map')
  const [sizeKey, setSizeKey] = useState(DEFAULT_SIZE_KEY)
  const [playerCount, setPlayerCount] = useState(2)
  const [waterContent, setWaterContent] = useState<'none' | 'normal' | 'islands'>(DEFAULT_TEMPLATE_OVERRIDES.waterContent)
  const [waterChance, setWaterChance] = useState(DEFAULT_TEMPLATE_OVERRIDES.waterChance)
  const [obstacleDensity, setObstacleDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.obstacleDensity)
  const [treasureDensity, setTreasureDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.treasureDensity)
  const [objectVariety, setObjectVariety] = useState(DEFAULT_TEMPLATE_OVERRIDES.objectVariety)
  const [usePortals, setUsePortals] = useState(DEFAULT_TEMPLATE_OVERRIDES.usePortals)
  const [zoneJaggedness, setZoneJaggedness] = useState(DEFAULT_TEMPLATE_OVERRIDES.zoneJaggedness)
  const [zoneSpread, setZoneSpread] = useState(DEFAULT_TEMPLATE_OVERRIDES.zoneSpread)
  const [boundaryGuardStrength, setBoundaryGuardStrength] = useState(DEFAULT_TEMPLATE_OVERRIDES.boundaryGuardStrength)
  const [squadDensity, setSquadDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.squadDensity)
  const [roadWindingAmplitude, setRoadWindingAmplitude] = useState(DEFAULT_TEMPLATE_OVERRIDES.roadWindingAmplitude)
  const [roadWindingWavelength, setRoadWindingWavelength] = useState(DEFAULT_TEMPLATE_OVERRIDES.roadWindingWavelength)
  const [seedText, setSeedText] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [terrainOnly, setTerrainOnly] = useState(false)
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('off')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  // The roads preview's own randomness, deliberately independent from the
  // terrain seed above — rerolling it must never change the terrain the
  // user already confirmed. Not part of RandomMapTemplate/Save-Load: it
  // only ever affects this preview's own rendering (see preview-roads.ts's
  // own header comment on why it isn't reused by the real generator).
  const [roadSeed, setRoadSeed] = useState(randomSeedValue)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lockedTerrainRef = useRef<TerrainResult | null>(null)

  const selectedSize = MAP_SIZE_PRESETS.find((p) => presetKey(p) === sizeKey) ?? MAP_SIZE_PRESETS[6]
  const previewActive = previewPhase !== 'off'
  // Terrain-defining controls are editable in 'terrain' (still being tuned)
  // and 'all' (one last adjustment allowed) but locked while 'roads' is
  // being tuned specifically, so a roads-phase preview always reflects the
  // terrain the user actually confirmed.
  const terrainLocked = previewPhase === 'roads'
  // Visibility (not just enablement) — a real user request: while live
  // preview is running, only show sliders relevant to the CURRENT stage;
  // outside live preview, "Advanced" reveals everything at once, same as
  // before this feature existed.
  const showTerrainSliders = previewPhase === 'off' ? advancedOpen : (previewPhase === 'terrain' || previewPhase === 'all')
  const showRoadSliders = previewPhase === 'off' ? advancedOpen : (previewPhase === 'roads' || previewPhase === 'all')
  const showObjectSliders = previewPhase === 'off' ? advancedOpen : previewPhase === 'all'

  const drawTerrainCanvas = (tilesMap: number[], waterMap: number[], roadNodes?: Set<number>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = selectedSize.sizeX
    canvas.height = selectedSize.sizeZ
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintTerrainCanvas(ctx, selectedSize.sizeX, selectedSize.sizeZ, tilesMap, waterMap, undefined, roadNodes)
  }

  // Live preview — debounced on every field relevant to whatever's
  // currently editable. Recomputes terrain in 'terrain'/'all' (still
  // editable there), then layers a roads preview on top in 'roads'/'all'.
  useEffect(() => {
    if (previewPhase === 'off') return
    const timer = setTimeout(() => {
      void (async () => {
        setPreviewBusy(true)
        setPreviewError(null)
        try {
          let terrain = lockedTerrainRef.current
          if (previewPhase === 'terrain' || previewPhase === 'all') {
            const seed = seedText.trim() && Number.isFinite(Number(seedText)) ? Number(seedText) : undefined
            if (seed === undefined) return // handleTogglePreview always fills a seed in before entering 'terrain'
            const result = await previewTerrain({
              sizeX: selectedSize.sizeX, sizeZ: selectedSize.sizeZ, playerCount,
              waterContent, waterChance, zoneJaggedness, zoneSpread,
              rng: createSeededRng(seed), includeSpawners: true, playerSpawnerSid: 'city-spawner', computeWater: true,
            })
            if (!result) return // not Tauri
            terrain = result
            lockedTerrainRef.current = result
          }
          if (!terrain) return
          const b2 = JSON.parse(new TextDecoder().decode(terrain.container.chunks[1])) as { tilesMap: number[]; waterMap: number[] }
          if (previewPhase === 'roads' || previewPhase === 'all') {
            const { roadNodes, riverNodes } = previewRoads(terrain, { roadWindingAmplitude, roadWindingWavelength, rng: createSeededRng(roadSeed) })
            drawTerrainCanvas(b2.tilesMap, b2.waterMap, new Set([...roadNodes, ...riverNodes]))
          } else {
            drawTerrainCanvas(b2.tilesMap, b2.waterMap)
          }
        } catch (e) {
          setPreviewError(e instanceof Error ? e.message : String(e))
        } finally {
          setPreviewBusy(false)
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPhase, sizeKey, playerCount, waterContent, waterChance, zoneJaggedness, zoneSpread, seedText, roadWindingAmplitude, roadWindingWavelength, roadSeed])

  const handleTogglePreview = (checked: boolean) => {
    if (checked) {
      // A live preview only reproduces exactly what it showed if the final
      // Generate call reuses the SAME seed — auto-fill one now (visibly,
      // still editable) rather than leaving it blank.
      if (!seedText.trim()) setSeedText(String(randomSeedValue()))
      setPreviewError(null)
      setPreviewPhase('terrain')
    } else {
      setPreviewPhase('off')
      lockedTerrainRef.current = null
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const seed = seedText.trim() ? Number(seedText) : undefined
      const result = await generateRandomMapFile({
        mapName,
        sizeX: selectedSize.sizeX,
        sizeZ: selectedSize.sizeZ,
        playerCount,
        playerSpawnerSid: 'city-spawner',
        waterContent,
        waterChance,
        obstacleDensity,
        treasureDensity,
        objectVariety,
        usePortals,
        zoneJaggedness,
        zoneSpread,
        boundaryGuardStrength,
        squadDensity,
        roadWindingAmplitude,
        roadWindingWavelength,
        terrainOnly,
        rng: seed !== undefined && Number.isFinite(seed) ? createSeededRng(seed) : undefined,
      })
      if (!result) return // not Tauri — no filesystem access to read the template
      logInfo(`Generated random map: ${result.name}`)
      onGenerated({ name: result.name, warnings: result.warnings })
      onOpenChange(false)
    } catch (e) {
      logError(`Failed to generate random map: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleConfirmTerrain = () => {
    if (terrainOnly) {
      void handleGenerate()
      return
    }
    setPreviewPhase('roads')
  }

  const handleConfirmRoads = () => {
    setPreviewPhase('all')
  }

  const handleSaveTemplate = async () => {
    const template: RandomMapTemplate = {
      version: RMG_TEMPLATE_VERSION,
      sizeX: selectedSize.sizeX,
      sizeZ: selectedSize.sizeZ,
      playerCount,
      playerSpawnerSid: 'city-spawner',
      waterContent,
      waterChance,
      obstacleDensity,
      treasureDensity,
      objectVariety,
      usePortals,
      zoneJaggedness,
      zoneSpread,
      boundaryGuardStrength,
      squadDensity,
      roadWindingAmplitude,
      roadWindingWavelength,
      seed: seedText.trim() && Number.isFinite(Number(seedText)) ? Number(seedText) : undefined,
    }
    await saveFile(stringifyRandomMapTemplate(template), 'rmg-template.json')
  }

  const handleLoadTemplate = async () => {
    const file = await openFile()
    if (!file) return
    try {
      const template = parseRandomMapTemplate(file.content)
      const matchedPreset = MAP_SIZE_PRESETS.find((p) => p.sizeX === template.sizeX && p.sizeZ === template.sizeZ)
      if (!matchedPreset) {
        logWarn(`RMG template size ${template.sizeX}×${template.sizeZ} isn't one of this dialog's presets — using the closest preset instead`)
      }
      const size = matchedPreset ?? closestPreset(template.sizeX, template.sizeZ)
      setSizeKey(presetKey(size))
      setPlayerCount(template.playerCount)
      setWaterContent(template.waterContent)
      setWaterChance(template.waterChance)
      setObstacleDensity(template.obstacleDensity)
      setTreasureDensity(template.treasureDensity)
      setObjectVariety(template.objectVariety)
      setUsePortals(template.usePortals)
      setZoneJaggedness(template.zoneJaggedness)
      setZoneSpread(template.zoneSpread)
      setBoundaryGuardStrength(template.boundaryGuardStrength)
      setSquadDensity(template.squadDensity)
      setRoadWindingAmplitude(template.roadWindingAmplitude)
      setRoadWindingWavelength(template.roadWindingWavelength)
      setSeedText(template.seed !== undefined ? String(template.seed) : '')
      setAdvancedOpen(true)
      logInfo(`Loaded RMG template: ${file.name}`)
    } catch (e) {
      logError(`Failed to load RMG template: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const footerLabel = generating
    ? 'Generating…'
    : previewPhase === 'terrain'
      ? (terrainOnly ? 'Generate' : 'Confirm terrain')
      : previewPhase === 'roads'
        ? 'Confirm roads'
        : 'Generate'
  const footerAction = previewPhase === 'terrain' ? handleConfirmTerrain : previewPhase === 'roads' ? handleConfirmRoads : handleGenerate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={420} defaultHeight={advancedOpen ? 620 : 400} minWidth={360} minHeight={320} storageKey="generate-random-map">
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">Generate Random Map</DialogTitle>
        </DraggableDialogDragHandle>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="rmg-map-name" className="text-xs">Map name</Label>
            <Input id="rmg-map-name" value={mapName} onChange={(e) => setMapName(e.target.value)} className="h-8 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Size</Label>
            <Select value={sizeKey} onValueChange={setSizeKey} disabled={terrainLocked}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAP_SIZE_PRESETS.map((p) => (
                  <SelectItem key={presetKey(p)} value={presetKey(p)}>{p.sizeX} × {p.sizeZ}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Players</Label>
            <Select value={String(playerCount)} onValueChange={(v) => setPlayerCount(Number(v))} disabled={terrainLocked}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAYER_COUNT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="rmg-terrain-only" className="text-xs" title="Produces just the tile arrays (biome/water/elevation) — no player spawners, no roads/rivers, no objects/guards/decoration. For a map maker who wants the random fractal terrain shape but places everything else themselves.">
              Terrain only
            </Label>
            <Switch id="rmg-terrain-only" checked={terrainOnly} onCheckedChange={setTerrainOnly} disabled={previewActive} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="rmg-live-preview" className="text-xs" title="Preview the terrain (and, unless Terrain only, roads/rivers) live before committing — tune sliders, watch the canvas update, then confirm each stage.">
              Live preview
            </Label>
            <Switch id="rmg-live-preview" checked={previewActive} onCheckedChange={handleTogglePreview} />
          </div>

          {previewActive && (
            <div className="space-y-1.5">
              <div className="mx-auto rounded border border-border overflow-hidden bg-muted/30" style={{ width: PREVIEW_CANVAS_SIZE, height: PREVIEW_CANVAS_SIZE }}>
                <canvas ref={canvasRef} className="w-full h-full [image-rendering:pixelated]" />
              </div>
              {previewBusy && <p className="text-xs text-muted-foreground text-center">Rendering preview…</p>}
              {previewError && <p className="text-xs text-destructive text-center">{previewError}</p>}
              <p className="text-xs text-muted-foreground">
                {previewPhase === 'terrain'
                  ? 'Tune terrain below, then confirm to move on.'
                  : previewPhase === 'roads'
                    ? 'Tune road/river winding below, then confirm. Final roads (and any water an object later needs to avoid) may shift slightly once the rest of the map generates.'
                    : 'Adjust anything else you\'d like — including one more pass at terrain/roads — then Generate.'}
              </p>
            </div>
          )}

          {previewPhase === 'off' && (
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Advanced
            </button>
          )}

          {showTerrainSliders && (
            <div className="space-y-4 pl-1">
              <div className="space-y-1.5">
                <Label className="text-xs" title="None: no water at all. Normal: lakes inside some neutral zones. Islands: some neutral zones are fully cut off by water and reached only through a portal — Olden Era has no boats.">
                  Water content
                </Label>
                <Select value={waterContent} onValueChange={(v) => setWaterContent(v as 'none' | 'normal' | 'islands')} disabled={terrainLocked}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="islands">Islands</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {waterContent !== 'none' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      className="text-xs"
                      title={
                        waterContent === 'islands'
                          ? 'How many neutral zones become islands, and how little land each keeps. Player zones are never islands.'
                          : 'How much of each neutral zone\'s free area becomes a lake, and how likely a zone is to get one at all. Player zones never get water.'
                      }
                    >
                      {waterContent === 'islands' ? 'Island amount' : 'Water amount'}
                    </Label>
                    <span className="text-xs text-muted-foreground">{pctLabel(waterChance)}</span>
                  </div>
                  <Slider min={0} max={1} step={0.05} value={[waterChance]} onValueChange={([v]) => setWaterChance(v)} disabled={terrainLocked} />
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="Controls the Penrose-tiling zone-shaping pass's own vertex density — low values give coarser, blockier zone/biome boundaries, high values give finer, more jagged ones.">
                    Zone jaggedness
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(zoneJaggedness)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[zoneJaggedness]} onValueChange={([v]) => setZoneJaggedness(v)} disabled={terrainLocked} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How tightly zones pack together. Below 1×: denser, more crowded zone interiors. Above 1×: more open space per zone, generally cleaner-looking roads.">
                    Zone spread
                  </Label>
                  <span className="text-xs text-muted-foreground">{zoneSpread.toFixed(2)}×</span>
                </div>
                <Slider min={0.5} max={1.8} step={0.05} value={[zoneSpread]} onValueChange={([v]) => setZoneSpread(v)} disabled={terrainLocked} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rmg-seed" className="text-xs">Seed (optional — same seed, same map)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="rmg-seed"
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Random"
                    className="h-8 text-sm"
                    disabled={terrainLocked}
                  />
                  <RerollButton onClick={() => setSeedText(String(randomSeedValue()))} disabled={terrainLocked} title="Reroll seed" />
                </div>
              </div>
            </div>
          )}

          {showRoadSliders && (
            <div className="space-y-4 pl-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How far roads/rivers swing away from a straight line, in tiles.">
                    Road/river winding amplitude
                  </Label>
                  <span className="text-xs text-muted-foreground">{roadWindingAmplitude.toFixed(1)}</span>
                </div>
                <Slider min={0} max={6} step={0.5} value={[roadWindingAmplitude]} onValueChange={([v]) => setRoadWindingAmplitude(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How often roads/rivers curve, in tiles per curve. Lower = more frequent curves (can look jagged if pushed too low); higher = fewer, broader sweeps.">
                    Road/river winding wavelength
                  </Label>
                  <span className="text-xs text-muted-foreground">{roadWindingWavelength}</span>
                </div>
                <Slider min={20} max={100} step={5} value={[roadWindingWavelength]} onValueChange={([v]) => setRoadWindingWavelength(v)} />
              </div>

              {previewActive && (
                <div className="space-y-1.5">
                  <Label className="text-xs" title="The roads/rivers preview's own randomness — independent from the terrain seed, so rerolling it never changes the terrain you already confirmed.">
                    Road/river randomness
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input value={String(roadSeed)} readOnly className="h-8 text-sm text-muted-foreground" />
                    <RerollButton onClick={() => setRoadSeed(randomSeedValue())} title="Reroll road/river randomness" />
                  </div>
                </div>
              )}
            </div>
          )}

          {showObjectSliders && (
            <div className="space-y-4 pl-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Obstacle density</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(obstacleDensity)}</span>
                </div>
                <Slider min={0} max={0.5} step={0.02} value={[obstacleDensity]} onValueChange={([v]) => setObstacleDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Treasure density</Label>
                  <span className="text-xs text-muted-foreground">{treasureDensity.toFixed(1)}×</span>
                </div>
                <Slider min={0} max={3} step={0.1} value={[treasureDensity]} onValueChange={([v]) => setTreasureDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="Chance a given treasure/guard slot places a real, specific object (a resource pile, a named artifact, a pre-composed army) instead of a random placeholder.">
                    Object variety
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(objectVariety)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[objectVariety]} onValueChange={([v]) => setObjectVariety(v)} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="rmg-use-portals" className="text-xs" title="Adds one bonus portal-pair shortcut between the map's two most distant zones, on top of the normal roads — a shortcut, not a replacement.">
                  Use portals
                </Label>
                <Switch id="rmg-use-portals" checked={usePortals} onCheckedChange={setUsePortals} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs" title="Walls every zone-to-zone boundary solid except at each connection's own road crossing, and places one guard at each of those gates — VCMI-style chokepoints, each at least Impossible difficulty. 'Strong'/'Very strong' scale that value up further.">
                  Boundary guards
                </Label>
                <Select value={boundaryGuardStrength} onValueChange={(v) => setBoundaryGuardStrength(v as 'none' | 'normal' | 'strong' | 'very strong')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="strong">Strong</SelectItem>
                    <SelectItem value="very strong">Very strong</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="Chance a real mine/dwelling/resource/artifact gets an extra nearby guard, on top of its own zone's usual guard. Guards near a player's own starting city are kept easy/normal difficulty.">
                    Squad density
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(squadDensity)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[squadDensity]} onValueChange={([v]) => setSquadDensity(v)} />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveTemplate} className="flex-1">
                  Save Template…
                </Button>
                <Button variant="outline" size="sm" onClick={handleLoadTemplate} className="flex-1">
                  Load Template…
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            One zone per player plus a neutral zone between each pair, each
            with its own biome/faction, roads connecting every zone, one
            river, and biome-appropriate scenery. Player zones get a
            faction-matched starting dwelling, mine, and guard; neutral
            zones get a mine (guarded to its own real economic value) and
            scaled treasure. No zone-shape variety yet — see issue #210 for
            the full roadmap.
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button size="sm" onClick={footerAction} disabled={generating || previewBusy || !mapName.trim()}>
            {footerLabel}
          </Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
