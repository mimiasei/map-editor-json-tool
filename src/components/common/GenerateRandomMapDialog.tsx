// ─── Generate Random Map (issue #210, Milestone 3) ──────────────────────────
// Tauri-only, same reasoning as NewMapDialog: needs real filesystem read
// access to the bundled template.map resource (plus a loaded GameCatalog —
// see generate-map-file.ts). Terrain is zone-driven (each zone gets its own
// biome, see zone-population.ts) so there's no single map-wide biome to
// pick. Outside live preview, every tunable beyond Core Configuration lives
// behind a left-nav category picker (issue #232 — Terrain & Elevation /
// Biomes / Roads & Rivers / Scenery & Decoration / Economy & Encounters /
// Connectivity & Portals / Advanced), one category's fields visible at a
// time instead of one long flat "Advanced" accordion. These map straight
// onto template.ts's own RandomMapTemplate format, with Save/Load Template
// buttons (footer) reusing native-fs.ts's generic JSON open/save (works in
// both builds, even though generation itself is Tauri-only) — deliberately
// scoped down from VCMI's own per-zone template authoring (no zone-graph
// topology editor exists yet; see issue #210's Milestone 4/5 notes).
//
// Two real user-requested additions (issue #210): "Terrain only" (Generate
// produces just the tile arrays — no spawners, no roads, no objects — for a
// map maker who wants the random fractal terrain shape but places
// everything else themselves), and a three-stage live preview:
//   1. 'terrain' — a fixed-size canvas shows live biome/water/elevation;
//      only water/zone/biome controls are visible (everything else would be
//      inert at this point anyway). The Seed reroll die (Core Configuration,
//      always visible regardless of stage) picks a fresh random one.
//   2. 'roads' — the canvas adds roads/rivers on top of the now-locked
//      terrain; only the winding sliders are visible, plus their OWN
//      independent "road seed" + reroll (deliberately separate from the
//      terrain seed — rerolling road shape must never silently change the
//      terrain the user already confirmed).
//   3. 'all' — every remaining category's fields (scenery, economy,
//      connectivity) are all visible at once, for one last adjustment
//      pass — the same fields the left-nav shows one at a time outside
//      live preview.
// See generate-terrain.ts's own header comment for why the roads preview is
// NOT pixel-guaranteed identical to the eventual real roads (it's a
// cosmetic tuning aid, not a forecast) while the terrain phase IS
// guaranteed identical for the same seed (one shared implementation).

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dices, Info, X } from 'lucide-react'
import { MAP_SIZE_PRESETS, presetKey } from '@/components/common/NewMapDialog'
import { generateRandomMapFile, previewTerrain } from '@/lib/rmg/generate-map-file'
import { previewRoads } from '@/lib/rmg/preview-roads'
import type { TerrainResult } from '@/lib/rmg/generate-terrain'
import { paintTerrainCanvas } from '@/lib/map-grid/terrain-canvas'
import { ALL_TEMPLATE_BIOMES, DEFAULT_TEMPLATE_OVERRIDES, RMG_TEMPLATE_VERSION, parseRandomMapTemplate, stringifyRandomMapTemplate, type RandomMapTemplate } from '@/lib/rmg/template'
import { Checkbox } from '@/components/ui/checkbox'
import { BIOME_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import SelectGameTemplateDialog from '@/components/common/SelectGameTemplateDialog'
import { ProgressStatus } from '@/components/common/ProgressStatus'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { openFile, saveFile } from '@/lib/native-fs'
import { logError, logInfo, logWarn } from '@/lib/logger'
import { describeUnreachablePlacement, describeIsolatedPlayerStart } from '@/lib/map-grid/reachability-validation'

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

/** Left-nav categories (issue #232) — a real sidebar column (not just an
 *  inline nav within the scrolling content), same 3-column shape as the
 *  design mockup: nav | content | live-preview. 'core' ("Start") holds Map
 *  name/Size/Players/Game template/Seed/Terrain only/Live preview — the
 *  same fields that used to sit permanently above the old flat "Advanced"
 *  accordion, now just another nav destination, and the one always
 *  reachable regardless of live-preview stage (see NAV_STAGE_ALLOWED)
 *  since that's where the Live preview off-switch lives. */
type Category = 'core' | 'terrain' | 'biomes' | 'roads' | 'scenery' | 'economy' | 'connectivity' | 'advanced'
const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'core', label: 'Start' },
  { id: 'terrain', label: 'Terrain & Elevation' },
  { id: 'biomes', label: 'Biomes' },
  { id: 'roads', label: 'Roads & Rivers' },
  { id: 'scenery', label: 'Scenery & Decoration' },
  { id: 'economy', label: 'Economy & Encounters' },
  { id: 'connectivity', label: 'Connectivity & Portals' },
  { id: 'advanced', label: 'Advanced' },
]
/** During live preview, only these categories have anything to show (see
 *  the showXFields derivations below) — everything else's nav button is
 *  disabled rather than clickable-but-blank. 'core' is always included:
 *  the Live preview switch (to turn it back off) lives there. */
const NAV_STAGE_ALLOWED: Record<PreviewPhase, Category[] | null> = {
  off: null,
  terrain: ['core', 'terrain', 'biomes'],
  roads: ['core', 'roads'],
  all: ['core', 'scenery', 'economy', 'connectivity'],
}

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
  const [islandsIncludePlayerZones, setIslandsIncludePlayerZones] = useState(DEFAULT_TEMPLATE_OVERRIDES.islandsIncludePlayerZones)
  const [islandLandRatio, setIslandLandRatio] = useState(DEFAULT_TEMPLATE_OVERRIDES.islandLandRatio)
  const [hillChance, setHillChance] = useState(DEFAULT_TEMPLATE_OVERRIDES.hillChance)
  const [valleyChance, setValleyChance] = useState(DEFAULT_TEMPLATE_OVERRIDES.valleyChance)
  const [obstacleDensity, setObstacleDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.obstacleDensity)
  const [interactableDensity, setInteractableDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.interactableDensity)
  const [mountainDensity, setMountainDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.mountainDensity)
  const [treasureDensity, setTreasureDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.treasureDensity)
  const [objectVariety, setObjectVariety] = useState(DEFAULT_TEMPLATE_OVERRIDES.objectVariety)
  const [usePortals, setUsePortals] = useState(DEFAULT_TEMPLATE_OVERRIDES.usePortals)
  const [zoneJaggedness, setZoneJaggedness] = useState(DEFAULT_TEMPLATE_OVERRIDES.zoneJaggedness)
  const [zoneSpread, setZoneSpread] = useState(DEFAULT_TEMPLATE_OVERRIDES.zoneSpread)
  const [boundaryGuardStrength, setBoundaryGuardStrength] = useState(DEFAULT_TEMPLATE_OVERRIDES.boundaryGuardStrength)
  const [squadDensity, setSquadDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.squadDensity)
  const [roadWindingAmplitude, setRoadWindingAmplitude] = useState(DEFAULT_TEMPLATE_OVERRIDES.roadWindingAmplitude)
  const [roadWindingWavelength, setRoadWindingWavelength] = useState(DEFAULT_TEMPLATE_OVERRIDES.roadWindingWavelength)
  const [organicTerrainBlending, setOrganicTerrainBlending] = useState(DEFAULT_TEMPLATE_OVERRIDES.organicTerrainBlending)
  const [decorationRoadDecayStrength, setDecorationRoadDecayStrength] = useState(DEFAULT_TEMPLATE_OVERRIDES.decorationRoadDecayStrength)
  const [decorationCoOccurrenceStrength, setDecorationCoOccurrenceStrength] = useState(DEFAULT_TEMPLATE_OVERRIDES.decorationCoOccurrenceStrength)
  const [decorationElevationDecayStrength, setDecorationElevationDecayStrength] = useState(DEFAULT_TEMPLATE_OVERRIDES.decorationElevationDecayStrength)
  const [mineGoldBiomeBiasStrength, setMineGoldBiomeBiasStrength] = useState(DEFAULT_TEMPLATE_OVERRIDES.mineGoldBiomeBiasStrength)
  // Which of the 7 real biomes generation may use at all — a real user
  // request ("how many terrain types the RMG will use"). All on by
  // default; at least one must always stay checked (see the checkbox's
  // own onCheckedChange below).
  const [enabledBiomes, setEnabledBiomes] = useState<Record<BiomeId, boolean>>(
    () => Object.fromEntries(ALL_TEMPLATE_BIOMES.map((b) => [b, true])) as Record<BiomeId, boolean>,
  )
  // Real game RMG template (issue #210, Stage 1) — when set, its own zone/
  // connection topology (and playerCount, derived from its own Spawn zones)
  // replaces this dialog's own Size-independent player-count selector and
  // this generator's fixed ring entirely. Deliberately session-only, not
  // part of RandomMapTemplate/Save-Load (same reasoning as `roadSeed`
  // above — a separate, orthogonal choice from this generator's own
  // slider-driven template format).
  const [gameTemplate, setGameTemplate] = useState<{ fileName: string; name: string; json: string } | null>(null)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [seedText, setSeedText] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category>('core')
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState<{ pct: number; label: string } | null>(null)

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

  const enabledBiomesList = ALL_TEMPLATE_BIOMES.filter((b) => enabledBiomes[b])
  const selectedSize = MAP_SIZE_PRESETS.find((p) => presetKey(p) === sizeKey) ?? MAP_SIZE_PRESETS[6]
  const previewActive = previewPhase !== 'off'
  // Terrain-defining controls (Size/Players/water/zone/seed) are only ever
  // editable during the 'terrain' stage itself — once confirmed (moving to
  // 'roads' or 'all'), they stay locked for the rest of the flow (a real
  // user request: no reason to keep adjusting something already
  // confirmed), matching those same controls' own sliders being hidden
  // rather than just disabled from that point on (see `showTerrainSliders`
  // below).
  const terrainLocked = previewPhase === 'roads' || previewPhase === 'all'
  // Visibility (not just enablement) — a real user request: while live
  // preview is running, only show sliders relevant to the CURRENT stage;
  // outside live preview, the left-nav category picker reveals one group
  // at a time instead (issue #232 — replaces the old single flat
  // "Advanced" accordion that showed everything at once).
  // Each stage shows ONLY its own relevant sliders, strictly — once
  // terrain (or roads) is confirmed, there's no reason to keep adjusting
  // it, so the 'all' stage (a real user request) only ever shows the
  // object/guard/decoration categories, not a "one more pass" reopening of
  // the earlier stages' own controls.
  const showCore = activeCategory === 'core'
  const showTerrainSliders = activeCategory === 'terrain' && (previewPhase === 'off' || previewPhase === 'terrain')
  const showBiomesFields = activeCategory === 'biomes' && (previewPhase === 'off' || previewPhase === 'terrain')
  const showRoadSliders = activeCategory === 'roads' && (previewPhase === 'off' || previewPhase === 'roads')
  // The 'all' stage is a real user request: every remaining category shown
  // at once for one last adjustment pass, not gated by nav selection (see
  // this file's own header comment, stage 3) — so these three ignore
  // activeCategory entirely once previewPhase reaches 'all'.
  const showSceneryFields = previewPhase === 'all' || (previewPhase === 'off' && activeCategory === 'scenery')
  const showEconomyFields = previewPhase === 'all' || (previewPhase === 'off' && activeCategory === 'economy')
  const showConnectivityFields = previewPhase === 'all' || (previewPhase === 'off' && activeCategory === 'connectivity')

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
              waterContent, waterChance, islandsIncludePlayerZones, islandLandRatio, hillChance, valleyChance, zoneJaggedness, zoneSpread,
              enabledBiomes: enabledBiomesList, gameTemplateJson: gameTemplate?.json, organicTerrainBlending,
              rng: createSeededRng(seed), includeSpawners: true, playerSpawnerSid: 'city-spawner', computeWater: true, computeElevation: true,
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
  }, [previewPhase, sizeKey, playerCount, waterContent, waterChance, islandsIncludePlayerZones, islandLandRatio, hillChance, valleyChance, zoneJaggedness, zoneSpread, enabledBiomesList.join(','), gameTemplate?.json, seedText, roadWindingAmplitude, roadWindingWavelength, roadSeed, organicTerrainBlending])

  const handleTogglePreview = (checked: boolean) => {
    if (checked) {
      // A live preview only reproduces exactly what it showed if the final
      // Generate call reuses the SAME seed — auto-fill one now (visibly,
      // still editable) rather than leaving it blank.
      if (!seedText.trim()) setSeedText(String(randomSeedValue()))
      setPreviewError(null)
      setPreviewPhase('terrain')
      setActiveCategory('terrain')
    } else {
      setPreviewPhase('off')
      lockedTerrainRef.current = null
      setActiveCategory('core')
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenProgress({ pct: 0, label: 'Starting…' })
    try {
      const seed = seedText.trim() ? Number(seedText) : undefined
      const result = await generateRandomMapFile({
        mapName,
        onProgress: (label, pct) => setGenProgress({ label, pct }),
        sizeX: selectedSize.sizeX,
        sizeZ: selectedSize.sizeZ,
        playerCount,
        playerSpawnerSid: 'city-spawner',
        waterContent,
        waterChance,
        islandsIncludePlayerZones,
        islandLandRatio,
        hillChance,
        valleyChance,
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
        organicTerrainBlending,
        decorationRoadDecayStrength,
        decorationCoOccurrenceStrength,
        decorationElevationDecayStrength,
        mineGoldBiomeBiasStrength,
        terrainOnly,
        enabledBiomes: enabledBiomesList,
        gameTemplateJson: gameTemplate?.json,
        rng: seed !== undefined && Number.isFinite(seed) ? createSeededRng(seed) : undefined,
      })
      if (!result) return // not Tauri — no filesystem access to read the template
      logInfo(`Generated random map: ${result.name}`)
      // Balance score (issue #210, Stage 0) — advisory only, logged rather
      // than a new dialog control for now (see balance-analyzer.ts's own
      // header comment on what this measures/doesn't).
      const { score, findings } = result.balanceReport
      if (score !== null) {
        logInfo(`Balance score: ${score}/100 — ${findings.map((f) => f.message).join(' ')}`)
      }
      // Reachability validation (reachability-validation.ts) — generateRandomMapFile
      // already ran its own portal-aware reachability auto-fix round as part of
      // runPlacementAutoFix, so anything reported here is what that couldn't
      // safely resolve (logged, not blocking — same as the balance score).
      if (result.unreachablePlacements.length > 0) {
        logWarn(`Reachability check: ${result.unreachablePlacements.length} placement(s) still unreachable from any player start after auto-fix`)
        for (const issue of result.unreachablePlacements) logWarn(`  ${describeUnreachablePlacement(issue)}`)
      }
      // Isolated-player-start check — a real, separate gap findUnreachablePlacements
      // above can't catch (see reachability-validation.ts's header comment):
      // two players' zones can each be internally fine yet mutually
      // disconnected. Never auto-fixable, so always just reported.
      if (result.isolatedPlayerStarts.length > 0) {
        logWarn(`Reachability check: ${result.isolatedPlayerStarts.length} player start(s) isolated from every other player`)
        for (const issue of result.isolatedPlayerStarts) logWarn(`  ${describeIsolatedPlayerStart(issue)}`)
      }
      onGenerated({ name: result.name, warnings: result.warnings })
      onOpenChange(false)
    } catch (e) {
      logError(`Failed to generate random map: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenerating(false)
      setGenProgress(null)
    }
  }

  const handleConfirmTerrain = () => {
    if (terrainOnly) {
      void handleGenerate()
      return
    }
    setPreviewPhase('roads')
    setActiveCategory('roads')
  }

  const handleConfirmRoads = () => {
    setPreviewPhase('all')
    setActiveCategory('scenery')
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
      islandsIncludePlayerZones,
      islandLandRatio,
      hillChance,
      valleyChance,
      obstacleDensity,
      interactableDensity,
      mountainDensity,
      treasureDensity,
      objectVariety,
      usePortals,
      zoneJaggedness,
      zoneSpread,
      boundaryGuardStrength,
      squadDensity,
      roadWindingAmplitude,
      roadWindingWavelength,
      organicTerrainBlending,
      decorationRoadDecayStrength,
      decorationCoOccurrenceStrength,
      decorationElevationDecayStrength,
      mineGoldBiomeBiasStrength,
      enabledBiomes: enabledBiomesList,
      // No dedicated UI control yet for these (Phase 1's own "start small"
      // scope) — saved/loaded at their template defaults.
      randomCityCount: DEFAULT_TEMPLATE_OVERRIDES.randomCityCount,
      contentCountLimits: DEFAULT_TEMPLATE_OVERRIDES.contentCountLimits,
      stoneRoadChance: DEFAULT_TEMPLATE_OVERRIDES.stoneRoadChance,
      roadPointOfInterestChance: DEFAULT_TEMPLATE_OVERRIDES.roadPointOfInterestChance,
      roadFullConnectivityChance: DEFAULT_TEMPLATE_OVERRIDES.roadFullConnectivityChance,
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
      setIslandsIncludePlayerZones(template.islandsIncludePlayerZones)
      setIslandLandRatio(template.islandLandRatio)
      setHillChance(template.hillChance)
      setValleyChance(template.valleyChance)
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
      setOrganicTerrainBlending(template.organicTerrainBlending)
      setDecorationRoadDecayStrength(template.decorationRoadDecayStrength)
      setDecorationCoOccurrenceStrength(template.decorationCoOccurrenceStrength)
      setDecorationElevationDecayStrength(template.decorationElevationDecayStrength)
      setMineGoldBiomeBiasStrength(template.mineGoldBiomeBiasStrength)
      setEnabledBiomes(Object.fromEntries(ALL_TEMPLATE_BIOMES.map((b) => [b, template.enabledBiomes.includes(b)])) as Record<BiomeId, boolean>)
      setSeedText(template.seed !== undefined ? String(template.seed) : '')
      setActiveCategory('terrain')
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

  const handleResetAll= () => {
      setWaterContent(DEFAULT_TEMPLATE_OVERRIDES.waterContent)
      setWaterChance(DEFAULT_TEMPLATE_OVERRIDES.waterChance)
      setIslandsIncludePlayerZones(DEFAULT_TEMPLATE_OVERRIDES.islandsIncludePlayerZones)
      setIslandLandRatio(DEFAULT_TEMPLATE_OVERRIDES.islandLandRatio)
      setHillChance(DEFAULT_TEMPLATE_OVERRIDES.hillChance)
      setValleyChance(DEFAULT_TEMPLATE_OVERRIDES.valleyChance)
      setObstacleDensity(DEFAULT_TEMPLATE_OVERRIDES.obstacleDensity)
      setInteractableDensity(DEFAULT_TEMPLATE_OVERRIDES.interactableDensity)
      setMountainDensity(DEFAULT_TEMPLATE_OVERRIDES.mountainDensity)
      setTreasureDensity(DEFAULT_TEMPLATE_OVERRIDES.treasureDensity)
      setObjectVariety(DEFAULT_TEMPLATE_OVERRIDES.objectVariety)
      setUsePortals(DEFAULT_TEMPLATE_OVERRIDES.usePortals)
      setZoneJaggedness(DEFAULT_TEMPLATE_OVERRIDES.zoneJaggedness)
      setZoneSpread(DEFAULT_TEMPLATE_OVERRIDES.zoneSpread)
      setBoundaryGuardStrength(DEFAULT_TEMPLATE_OVERRIDES.boundaryGuardStrength)
      setSquadDensity(DEFAULT_TEMPLATE_OVERRIDES.squadDensity)
      setRoadWindingAmplitude(DEFAULT_TEMPLATE_OVERRIDES.roadWindingAmplitude)
      setRoadWindingWavelength(DEFAULT_TEMPLATE_OVERRIDES.roadWindingWavelength)
      setOrganicTerrainBlending(DEFAULT_TEMPLATE_OVERRIDES.organicTerrainBlending)
      setDecorationRoadDecayStrength(DEFAULT_TEMPLATE_OVERRIDES.decorationRoadDecayStrength)
      setDecorationCoOccurrenceStrength(DEFAULT_TEMPLATE_OVERRIDES.decorationCoOccurrenceStrength)
      setDecorationElevationDecayStrength(DEFAULT_TEMPLATE_OVERRIDES.decorationElevationDecayStrength)
      setMineGoldBiomeBiasStrength(DEFAULT_TEMPLATE_OVERRIDES.mineGoldBiomeBiasStrength)
  }

  if (!open) return null

  return (
    <>
    {/* Inline view (issue #232), not a modal Dialog — same reasoning/pattern
        as Map Grid (issue #195 follow-up): replaces the main editor's layout
        slot in AppShell instead of layering on top, so it fills the whole
        window and needs no resize/drag chrome of its own. AppShell only
        mounts this component while `open` is true, so the `open`-gated
        state/effects throughout this file still behave correctly. */}
    <div className="h-full flex flex-col overflow-hidden rounded-lg bg-[var(--column-center)] dark:bg-background">
        <div className="relative flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-7 w-7"
            title="Close Generate Random Map"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">Generate Random Map</span>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <nav className="w-44 shrink-0 border-r border-border overflow-y-auto p-2 space-y-0.5">
            {CATEGORIES.map((cat) => {
              const allowed = NAV_STAGE_ALLOWED[previewPhase]
              const disabled = allowed !== null && !allowed.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed ${activeCategory === cat.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                >
                  {cat.label}
                </button>
              )
            })}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
              {showCore && (
                <div className="space-y-4">
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
                    <Select value={String(playerCount)} onValueChange={(v) => setPlayerCount(Number(v))} disabled={terrainLocked || !!gameTemplate}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLAYER_COUNT_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {gameTemplate && <p className="text-xs text-muted-foreground">Ignored — the game template below sets its own player count.</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Game template</Label>
                    {gameTemplate ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate" title={gameTemplate.name}>{gameTemplate.name}</span>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setGameTemplate(null)} disabled={terrainLocked}>
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-start text-sm font-normal" onClick={() => setTemplatePickerOpen(true)} disabled={terrainLocked}>
                        Use a game template…
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs" title="Same seed, same map. The number field for typing an exact seed lives in the Advanced category — this is the quick way to get a fresh random terrain result immediately.">
                      Seed
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex-1 truncate">{seedText || 'Random'}</span>
                      <RerollButton onClick={() => setSeedText(String(randomSeedValue()))} disabled={terrainLocked} title="Reroll seed" />
                    </div>
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

                  <p className="text-xs text-muted-foreground">
                    One zone per player plus a neutral zone between each pair, each
                    with its own biome/faction, roads connecting every zone, one
                    river, and biome-appropriate scenery. Player zones get a
                    faction-matched starting dwelling, mine, and guard; neutral
                    zones get a mine (guarded to its own real economic value) and
                    scaled treasure. No zone-shape variety yet.
                  </p>
                </div>
              )}

              {showBiomesFields && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Terrain types ({ALL_TEMPLATE_BIOMES.filter((b) => enabledBiomes[b]).length}/{ALL_TEMPLATE_BIOMES.length} enabled)</Label>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {ALL_TEMPLATE_BIOMES.map((biomeId) => (
                      <div key={biomeId} className="flex items-center gap-2">
                        <Checkbox
                          id={`rmg-biome-${biomeId}`}
                          checked={enabledBiomes[biomeId]}
                          disabled={terrainLocked}
                          onCheckedChange={(checked) => {
                            setEnabledBiomes((prev) => {
                              // At least one biome must always stay enabled —
                              // generation needs at least one usable biome.
                              if (!checked && Object.values(prev).filter(Boolean).length <= 1) return prev
                              return { ...prev, [biomeId]: !!checked }
                            })
                          }}
                        />
                        <Label htmlFor={`rmg-biome-${biomeId}`} className="text-xs font-normal">{BIOME_NAMES[biomeId]}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

          {showTerrainSliders && (
            <div className="space-y-4">
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
                          ? 'How many zones become islands (their individual size is the separate Land/water ratio slider below).'
                          : 'How much of each neutral zone\'s free area becomes a lake, and how likely a zone is to get one at all. Player zones never get water.'
                      }
                    >
                      {waterContent === 'islands' ? 'Island amount' : 'Water amount'}
                    </Label>
                    <span className="text-xs text-muted-foreground">{pctLabel(waterChance)}</span>
                  </div>
                  <Slider min={0} max={1} step={0.01} value={[waterChance]} onValueChange={([v]) => setWaterChance(v)} disabled={terrainLocked} />
                </div>
              )}

              {waterContent === 'islands' && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="rmg-islands-players" className="text-xs" title="Off (default): every player's own start always stays on real, land-connected ground — only neutral zones can become islands. On: a player's own start can be an island too, reachable only by its own portal — at high Island amount the whole map can end up looking flooded, with islands scattered across it instead of a mostly-solid mainland. Either way, an island is ALWAYS reached by portal, never a road, even if Use portals is off.">
                    Player zones can be islands
                  </Label>
                  <Switch id="rmg-islands-players" checked={islandsIncludePlayerZones} onCheckedChange={setIslandsIncludePlayerZones} disabled={terrainLocked} />
                </div>
              )}

              {waterContent === 'islands' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs" title="Independent from Island amount (how MANY islands) — this controls how BIG each one is. Water side: mostly ocean, each island small (this mode's original look). Land side: mostly land, each island large, little open water.">
                      Land/water ratio
                    </Label>
                    <span className="text-xs text-muted-foreground">{Math.round(islandLandRatio * 100)}% land</span>
                  </div>
                  <Slider min={0} max={1} step={0.01} value={[islandLandRatio]} onValueChange={([v]) => setIslandLandRatio(v)} disabled={terrainLocked} />
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How much of each zone's free area becomes raised hill terrain, and how likely a zone is to get one at all — unlike water, both player and neutral zones are eligible (a player's own start tile itself always stays flat). Every hill gets real ramp access.">
                    Hills
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(hillChance)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[hillChance]} onValueChange={([v]) => setHillChance(v)} disabled={terrainLocked} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How much of each zone's free area becomes lowered, DRY valley terrain (decoupled from water — a low tile doesn't have to be a lake). Both player and neutral zones are eligible. Every valley gets real ramp access.">
                    Valleys
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(valleyChance)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[valleyChance]} onValueChange={([v]) => setValleyChance(v)} disabled={terrainLocked} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="Controls the Penrose-tiling zone-shaping pass's own vertex density — low values give coarser, blockier zone/biome boundaries, high values give finer, more jagged ones.">
                    Zone jaggedness
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(zoneJaggedness)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[zoneJaggedness]} onValueChange={([v]) => setZoneJaggedness(v)} disabled={terrainLocked} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How tightly zones pack together. Below 1×: denser, more crowded zone interiors. Above 1×: more open space per zone, generally cleaner-looking roads.">
                    Zone spread
                  </Label>
                  <span className="text-xs text-muted-foreground">{zoneSpread.toFixed(2)}×</span>
                </div>
                <Slider min={0.5} max={1.8} step={0.01} value={[zoneSpread]} onValueChange={([v]) => setZoneSpread(v)} disabled={terrainLocked} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="rmg-organic-blending" className="text-xs" title="Blends terrain biomes organically across zone borders (a real-data-calibrated Wave Function Collapse pass) instead of each zone's flat, sharply-edged biome fill. Only tiles near a zone boundary are affected — zone interiors are unchanged.">
                  Organic terrain blending
                </Label>
                <Switch id="rmg-organic-blending" checked={organicTerrainBlending} onCheckedChange={setOrganicTerrainBlending} disabled={terrainLocked} />
              </div>

            </div>
          )}

          {showRoadSliders && (
            <div className="space-y-4">
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

          {showSceneryFields && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Obstacle density</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(obstacleDensity)}</span>
                </div>
                <Slider min={0} max={0.5} step={0.02} value={[obstacleDensity]} onValueChange={([v]) => setObstacleDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Interactable density</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(interactableDensity)}</span>
                </div>
                <Slider min={0} max={0.5} step={0.02} value={[interactableDensity]} onValueChange={([v]) => setInteractableDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mountain density in zone boundaries</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(mountainDensity)}</span>
                </div>
                <Slider min={0} max={0.8} step={0.02} value={[mountainDensity]} onValueChange={([v]) => setMountainDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How strongly decoration thins out near roads and thickens in unused pockets — a real pattern measured directly against 12 hand-crafted maps (real density near a road is ~0.78x the map's own average, rising to ~1.29x far from any road). 0 = today's flat density, no road-distance effect at all.">
                    Decoration road-distance effect
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(decorationRoadDecayStrength)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[decorationRoadDecayStrength]} onValueChange={([v]) => setDecorationRoadDecayStrength(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How strongly nearby decoration influences what gets placed next to it — real hand-crafted maps show ponds cluster with more pond pieces, and mountains real-avoid pond pieces, measured directly against the same 12-map survey. 0 = today's independent placement, no co-occurrence effect at all.">
                    Decoration clustering (co-occurrence)
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(decorationCoOccurrenceStrength)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[decorationCoOccurrenceStrength]} onValueChange={([v]) => setDecorationCoOccurrenceStrength(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How strongly decoration density follows real elevation/climb evidence — real hand-crafted maps show valley tiles decorated ~3.19x denser than flat/hill tiles, and ramp-adjacent tiles decorated ~0.66x as densely as tiles farther away, measured directly against an 18-map survey. 0 = today's flat density, no elevation/climb effect at all.">
                    Decoration elevation/climb effect
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(decorationElevationDecayStrength)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[decorationElevationDecayStrength]} onValueChange={([v]) => setDecorationElevationDecayStrength(v)} />
              </div>
            </div>
          )}

          {showEconomyFields && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Treasure density</Label>
                  <span className="text-xs text-muted-foreground">{treasureDensity.toFixed(1)}×</span>
                </div>
                <Slider min={0} max={3} step={0.1} value={[treasureDensity]} onValueChange={([v]) => setTreasureDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <Label className="text-xs">Object variety</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>Chance a treasure/guard slot places a real, specific object (a resource pile, a named artifact, a pre-composed army) instead of a random type.</TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(objectVariety)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[objectVariety]} onValueChange={([v]) => setObjectVariety(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="Chance a real mine/dwelling/resource/artifact gets an extra nearby guard, on top of its own zone's usual guard. Guards near a player's own starting city are kept easy/normal difficulty.">
                    Squad density
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(squadDensity)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[squadDensity]} onValueChange={([v]) => setSquadDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How strongly neutral-zone gold mines favor Sand-biome zones — real hand-crafted maps place gold mines on Sand tiles ~2.02x more often than Sand's own share of total map area would predict, measured directly against an 18-map survey. 0 = today's flat biome-blind mine rotation, no bias at all.">
                    Gold mine Sand-biome bias
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(mineGoldBiomeBiasStrength)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[mineGoldBiomeBiasStrength]} onValueChange={([v]) => setMineGoldBiomeBiasStrength(v)} />
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
            </div>
          )}

          {showConnectivityFields && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="rmg-use-portals" className="text-xs" title="Adds one bonus portal-pair shortcut between the map's two most distant zones, on top of the normal roads — a shortcut, not a replacement.">
                  Use portals
                </Label>
                <Switch id="rmg-use-portals" checked={usePortals} onCheckedChange={setUsePortals} />
              </div>
            </div>
          )}

          {activeCategory === 'advanced' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rmg-seed-manual" className="text-xs">Seed (optional — same seed, same map)</Label>
                <Input
                  id="rmg-seed-manual"
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Random"
                  className="h-8 text-sm"
                  disabled={terrainLocked}
                />
              </div>
            </div>
          )}
          </div>

          {/* Live-preview column (issue #232 design) — always its own
              column, not layered inline above the category content, so the
              rendering stays visible no matter which category is open. */}
          <div className="w-96 shrink-0 border-l border-border overflow-y-auto p-4 space-y-2">
            <Label className="text-xs font-semibold">Map Preview</Label>
            {previewActive ? (
              <div className="space-y-1.5">
                <div className="mx-auto rounded border border-border overflow-hidden bg-muted/30" style={{ width: PREVIEW_CANVAS_SIZE, height: PREVIEW_CANVAS_SIZE }}>
                  <canvas ref={canvasRef} className="w-full h-full [image-rendering:pixelated]" />
                </div>
                {previewBusy && <p className="text-xs text-muted-foreground text-center">Rendering preview…</p>}
                {previewError && <p className="text-xs text-destructive text-center">{previewError}</p>}
                <p className="text-xs text-muted-foreground">
                  {previewPhase === 'terrain'
                    ? 'Tune terrain in the sidebar, then confirm to move on.'
                    : previewPhase === 'roads'
                      ? 'Tune road/river winding in the sidebar, then confirm. Final roads (and any water an object later needs to avoid) may shift slightly once the rest of the map generates.'
                      : 'Terrain and roads/rivers are confirmed. Adjust obstacles, treasure, guards, and everything else in the sidebar, then Generate.'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Turn on Live preview (Start page) to see a live rendering here.</p>
            )}
          </div>
        </div>

        {genProgress && (
          <div className="border-t border-border px-4 py-2.5 shrink-0">
            <ProgressStatus value={genProgress.pct} label={genProgress.label} />
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleSaveTemplate}>
                    Save Template…
                </Button>
                <Button variant="ghost" size="sm" onClick={handleLoadTemplate}>
                    Load Template…
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleResetAll()} disabled={generating}>
                    Reset all to defaults
                </Button>
            </div>
          <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={generating}>
                Cancel
              </Button>
              <Button size="sm" onClick={footerAction} disabled={generating || previewBusy || !mapName.trim()}>
                {footerLabel}
              </Button>
        </div>
    </div>

      <SelectGameTemplateDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={setGameTemplate}
      />
    </>
  )
}
