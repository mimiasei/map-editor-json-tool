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

import { biomeName } from '@/lib/map-grid/terrain-names'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dices, LayoutGrid, X } from '@/components/ui/icons'
import FieldInfo from '@/components/common/FieldInfo'
import { loadRmgDialogSettings, saveRmgDialogSettings } from '@/lib/rmg/dialog-persist'
import { neutralZoneRange, availableArchetypes, type LayoutArchetype } from '@/lib/rmg/zone-archetypes'
import { MAX_CITIES_PER_ZONE } from '@/lib/rmg/rmg-tuning'
import { MAP_SIZE_PRESETS, presetKey } from '@/components/common/NewMapDialog'
import { generateRandomMapFile, previewTerrain } from '@/lib/rmg/generate-map-file'
import { previewRoads } from '@/lib/rmg/preview-roads'
import type { TerrainResult } from '@/lib/rmg/generate-terrain'
import { paintTerrainCanvas } from '@/lib/map-grid/terrain-canvas'
import { buildElevationTintMap } from '@/lib/map-grid/elevation-shading'
import { ALL_TEMPLATE_BIOMES, DEFAULT_TEMPLATE_OVERRIDES, RMG_TEMPLATE_VERSION, parseRandomMapTemplate, stringifyRandomMapTemplate, type RandomMapTemplate } from '@/lib/rmg/template'
import { Checkbox } from '@/components/ui/checkbox'
import WinConditionsPanel from '@/components/common/WinConditionsPanel'
import { type BiomeId } from '@/lib/map-grid/terrain-colors'
import SelectGameTemplateDialog from '@/components/common/SelectGameTemplateDialog'
import InteractableSelectorDialog from '@/components/common/InteractableSelectorDialog'
import SpellBanDialog from '@/components/common/SpellBanDialog'
import ArtifactBanDialog from '@/components/common/ArtifactBanDialog'
import { ProgressStatus } from '@/components/common/ProgressStatus'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { loadClassicTuning } from '@/lib/rmg/load-tuning'
import { useCatalogStore } from '@/store/useCatalogStore'
import PlayerBalancePanel from '@/components/common/PlayerBalancePanel'
import type { PlayerBalance } from '@/lib/map-grid/player-balance'
import {
    COMPLEXITY_LEVELS,
    DEFAULT_CLASSIC_SETTINGS,
    DEFAULT_MAX_HEROES,
    DIFFICULTY_LEVELS,
    RICHNESS_LEVELS,
    WATER_LEVELS,
    buildClassicOptions,
    type ClassicSettings
} from '@/lib/rmg/classic-presets'
import { openFile, saveFile } from '@/lib/native-fs'
import { logError, logInfo, logWarn } from '@/lib/logger'
import { describeUnreachablePlacement, describeIsolatedPlayerStart } from '@/lib/map-grid/reachability-validation'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (result: { name: string; warnings: string[] }) => void
}

const DEFAULT_SIZE_KEY = presetKey({ sizeX: 64, sizeZ: 64 })
const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8]
const PREVIEW_DEBOUNCE_MS = 250
const RANDOM_LAYOUT = 'random'
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
const CATEGORIES: { id: Category }[] = [
  { id: 'core' }, { id: 'terrain' }, { id: 'biomes' }, { id: 'roads' },
  { id: 'scenery' }, { id: 'economy' }, { id: 'connectivity' }, { id: 'advanced' },
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

/** Consolidated 0-100 "Water" slider (issue #232) — spans `waterContent`'s
 *  three modes and `waterChance`'s amount within whichever mode is active
 *  in one control: 0 = 'none', 1-50 = 'normal' with waterChance 0-1, 51-100
 *  = 'islands' with waterChance 0-1. Kept as pure mapping functions (no new
 *  state) so Save/Load Template and the real generator options keep using
 *  waterContent/waterChance completely unchanged underneath. */
function waterSliderValue(waterContent: 'none' | 'normal' | 'islands', waterChance: number): number {
  if (waterContent === 'none') return 0
  if (waterContent === 'normal') return Math.round(waterChance * 50)
  return Math.round(50 + waterChance * 50)
}
function waterSliderLabel(v: number): string {
  if (v <= 0) return 'None'
  if (v <= 50) return `Water ${Math.round((v / 50) * 100)}%`
  return `Islands ${Math.round(((v - 50) / 50) * 100)}%`
}

/** Consolidated "Elevation variation" slider — drives `hillChance` and
 *  `valleyChance` equally (same pure-mapping approach as the water slider
 *  above). Displays the average of the two so loading an old template with
 *  different hill/valley values still shows something sensible. */
function elevationSliderValue(hillChance: number, valleyChance: number): number {
  return Math.round(((hillChance + valleyChance) / 2) * 100)
}

/** Consolidated "Road windiness" slider — drives `roadWindingAmplitude`
 *  (0-6) and `roadWindingWavelength` (100-20, inversely) together. Display
 *  value derives from amplitude alone (same "pick one direction of truth"
 *  approach as the elevation slider above). */
function roadWindinessValue(amplitude: number): number {
  return Math.round((amplitude / 6) * 100)
}
function roadWindinessToState(v: number): { roadWindingAmplitude: number; roadWindingWavelength: number } {
  return { roadWindingAmplitude: (v / 100) * 6, roadWindingWavelength: 100 - (v / 100) * 80 }
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
  // Classic (3 word selectors) vs Advanced (the category nav + sliders) —
  // either-or, never mixed (issue #250).
  // Last used settings (localStorage), restored on open and saved again below.
  const { t } = useTranslation()
  const [saved] = useState(loadRmgDialogSettings)
  const [mode, setMode] = useState<'classic' | 'advanced'>(saved.mode ?? 'classic')
  const [classic, setClassic] = useState<ClassicSettings>(saved.classic ?? DEFAULT_CLASSIC_SETTINGS)
  const [mapName, setMapName] = useState(saved.mapName ?? 'Random Map')
  const [sizeKey, setSizeKey] = useState(saved.sizeKey ?? DEFAULT_SIZE_KEY)
  const [playerCount, setPlayerCount] = useState(saved.playerCount ?? 2)
  // Total neutral cities: off = the default (tuning file or 1), on = `cityTotal`.
  const [limitCities, setLimitCities] = useState(saved.limitCities ?? false)
  // Max heroes per player (Block 2 settings.heroCountMax), shared by Classic and Advanced.
  const [maxHeroes, setMaxHeroes] = useState(saved.maxHeroes ?? DEFAULT_MAX_HEROES)
  const [cityTotal, setCityTotal] = useState(saved.cityTotal ?? 1)
  const neutralZones = neutralZoneRange(playerCount)
  const maxCities = MAX_CITIES_PER_ZONE * neutralZones.max
  const cityTotalShown = Math.min(cityTotal, maxCities)
  const [waterContent, setWaterContent] = useState<'none' | 'normal' | 'islands'>(saved.waterContent ?? DEFAULT_TEMPLATE_OVERRIDES.waterContent)
  const [waterChance, setWaterChance] = useState(saved.waterChance ?? DEFAULT_TEMPLATE_OVERRIDES.waterChance)
  // No longer a user-editable toggle (issue #232 — a player's own start
  // being an island is now always on whenever water content is 'islands';
  // previously an off-by-default switch most people never turned on).
  // Still a real field in RandomMapTemplate/GenerateRandomMapOptions, so
  // every read below just derives it from waterContent instead of storing
  // separate state that could drift out of sync.
  const islandsIncludePlayerZones = waterContent === 'islands'
  const [islandLandRatio, setIslandLandRatio] = useState(saved.islandLandRatio ?? DEFAULT_TEMPLATE_OVERRIDES.islandLandRatio)
  const [hillChance, setHillChance] = useState(saved.hillChance ?? DEFAULT_TEMPLATE_OVERRIDES.hillChance)
  const [valleyChance, setValleyChance] = useState(saved.valleyChance ?? DEFAULT_TEMPLATE_OVERRIDES.valleyChance)
  const [obstacleDensity, setObstacleDensity] = useState(saved.obstacleDensity ?? DEFAULT_TEMPLATE_OVERRIDES.obstacleDensity)
  const [interactableDensity, setInteractableDensity] = useState(saved.interactableDensity ?? DEFAULT_TEMPLATE_OVERRIDES.interactableDensity)
  const [mountainDensity, setMountainDensity] = useState(saved.mountainDensity ?? DEFAULT_TEMPLATE_OVERRIDES.mountainDensity)
  const [treasureDensity, setTreasureDensity] = useState(saved.treasureDensity ?? DEFAULT_TEMPLATE_OVERRIDES.treasureDensity)
  const [objectVariety, setObjectVariety] = useState(saved.objectVariety ?? DEFAULT_TEMPLATE_OVERRIDES.objectVariety)
  const [usePortals, setUsePortals] = useState(saved.usePortals ?? DEFAULT_TEMPLATE_OVERRIDES.usePortals)
  const [zoneJaggedness, setZoneJaggedness] = useState(saved.zoneJaggedness ?? DEFAULT_TEMPLATE_OVERRIDES.zoneJaggedness)
  const [zoneSpread, setZoneSpread] = useState(saved.zoneSpread ?? DEFAULT_TEMPLATE_OVERRIDES.zoneSpread)
  const [boundaryGuardStrength, setBoundaryGuardStrength] = useState(saved.boundaryGuardStrength ?? DEFAULT_TEMPLATE_OVERRIDES.boundaryGuardStrength)
  const [squadDensity, setSquadDensity] = useState(saved.squadDensity ?? DEFAULT_TEMPLATE_OVERRIDES.squadDensity)
  const [roadWindingAmplitude, setRoadWindingAmplitude] = useState(saved.roadWindingAmplitude ?? DEFAULT_TEMPLATE_OVERRIDES.roadWindingAmplitude)
  const [roadWindingWavelength, setRoadWindingWavelength] = useState(saved.roadWindingWavelength ?? DEFAULT_TEMPLATE_OVERRIDES.roadWindingWavelength)
  const [organicTerrainBlending, setOrganicTerrainBlending] = useState(saved.organicTerrainBlending ?? DEFAULT_TEMPLATE_OVERRIDES.organicTerrainBlending)
  const [decorationRoadDecayStrength, setDecorationRoadDecayStrength] = useState(saved.decorationRoadDecayStrength ?? DEFAULT_TEMPLATE_OVERRIDES.decorationRoadDecayStrength)
  const [decorationCoOccurrenceStrength, setDecorationCoOccurrenceStrength] = useState(saved.decorationCoOccurrenceStrength ?? DEFAULT_TEMPLATE_OVERRIDES.decorationCoOccurrenceStrength)
  const [decorationElevationDecayStrength, setDecorationElevationDecayStrength] = useState(saved.decorationElevationDecayStrength ?? DEFAULT_TEMPLATE_OVERRIDES.decorationElevationDecayStrength)
  const [mineGoldBiomeBiasStrength, setMineGoldBiomeBiasStrength] = useState(saved.mineGoldBiomeBiasStrength ?? DEFAULT_TEMPLATE_OVERRIDES.mineGoldBiomeBiasStrength)
  // Real interactable sids excluded from the RMG's own picks (issue #238) —
  // a Set locally (cheap membership checks for the picker dialog), always
  // converted to/from DEFAULT_TEMPLATE_OVERRIDES.disabledInteractableSids'
  // own string[] shape at the template/generation boundary.
  const [disabledInteractableSids, setDisabledInteractableSids] = useState<Set<string>>(() => new Set(saved.disabledInteractableSids ?? DEFAULT_TEMPLATE_OVERRIDES.disabledInteractableSids))
  const [interactablePickerOpen, setInteractablePickerOpen] = useState(false)
  // Spell sids banned on the generated map (added to the tuning file's spells.banned).
  const [bannedSpellSids, setBannedSpellSids] = useState<Set<string>>(() => new Set(saved.bannedSpellSids))
  const [spellPickerOpen, setSpellPickerOpen] = useState(false)
  // Artifact sids banned on the generated map (banInfoData.bannedItems).
  const [bannedArtifactSids, setBannedArtifactSids] = useState<Set<string>>(() => new Set(saved.bannedArtifactSids))
  const [artifactPickerOpen, setArtifactPickerOpen] = useState(false)
  // Which of the 7 real biomes generation may use at all — a real user
  // request ("how many terrain types the RMG will use"). All on by
  // default; at least one must always stay checked (see the checkbox's
  // own onCheckedChange below).
  const [enabledBiomes, setEnabledBiomes] = useState<Record<BiomeId, boolean>>(
    () => Object.fromEntries(ALL_TEMPLATE_BIOMES.map((b) => [b, saved.enabledBiomes?.[b] ?? true])) as Record<BiomeId, boolean>,
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
  // Result step (issue #255): the dialog stays open after generating so the
  // balance report can be read and the map re-rolled before committing.
  const [generated, setGenerated] = useState<{ name: string; warnings: string[]; balance: PlayerBalance | null } | null>(null)
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

  // Persist the last used settings whenever any of them changes.
  useEffect(() => {
    saveRmgDialogSettings({
      mode, classic, mapName, sizeKey, limitCities, usePortals, waterContent, boundaryGuardStrength, playerCount, cityTotal, maxHeroes, waterChance, islandLandRatio, hillChance, valleyChance, obstacleDensity, interactableDensity, mountainDensity, treasureDensity, objectVariety, zoneJaggedness, zoneSpread, squadDensity, roadWindingAmplitude, roadWindingWavelength, organicTerrainBlending, decorationRoadDecayStrength, decorationCoOccurrenceStrength, decorationElevationDecayStrength, mineGoldBiomeBiasStrength,
      enabledBiomes,
      disabledInteractableSids: [...disabledInteractableSids], bannedSpellSids: [...bannedSpellSids], bannedArtifactSids: [...bannedArtifactSids],
    })
  }, [mode, classic, mapName, sizeKey, limitCities, usePortals, waterContent, boundaryGuardStrength, playerCount, cityTotal, maxHeroes, waterChance, islandLandRatio, hillChance, valleyChance, obstacleDensity, interactableDensity, mountainDensity, treasureDensity, objectVariety, zoneJaggedness, zoneSpread, squadDensity, roadWindingAmplitude, roadWindingWavelength, organicTerrainBlending, decorationRoadDecayStrength, decorationCoOccurrenceStrength, decorationElevationDecayStrength, mineGoldBiomeBiasStrength, enabledBiomes, disabledInteractableSids, bannedSpellSids, bannedArtifactSids])
  const selectedSize = MAP_SIZE_PRESETS.find((p) => presetKey(p) === sizeKey) ?? MAP_SIZE_PRESETS[6]
const availableLayouts = availableArchetypes(selectedSize.sizeX, selectedSize.sizeZ, playerCount)
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
  const classicMode = mode === 'classic'
  // A mirrored map needs an even player count and map width, and the built-in zone layout (no game template).
  const mirrorPossible = classicMode && !gameTemplate && playerCount % 2 === 0 && selectedSize.sizeX % 2 === 0
  const mirroredMap = mirrorPossible && !!classic.mirrored
  const shownCategory: Category = classicMode ? 'core' : activeCategory
  const showCore = shownCategory === 'core'
  const showTerrainSliders = shownCategory === 'terrain' && (previewPhase === 'off' || previewPhase === 'terrain')
  const showBiomesFields = shownCategory === 'biomes' && (previewPhase === 'off' || previewPhase === 'terrain')
  const showRoadSliders = shownCategory === 'roads' && (previewPhase === 'off' || previewPhase === 'roads')
  // The 'all' stage is a real user request: every remaining category shown
  // at once for one last adjustment pass, not gated by nav selection (see
  // this file's own header comment, stage 3) — so these three ignore
  // activeCategory entirely once previewPhase reaches 'all'.
  const showSceneryFields = (!classicMode && previewPhase === 'all') || (previewPhase === 'off' && shownCategory === 'scenery')
  const showEconomyFields = (!classicMode && previewPhase === 'all') || (previewPhase === 'off' && shownCategory === 'economy')
  const showConnectivityFields = (!classicMode && previewPhase === 'all') || (previewPhase === 'off' && shownCategory === 'connectivity')

  const drawTerrainCanvas = (tilesMap: number[], waterMap: number[], levelsMap?: number[], roadNodes?: Set<number>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sizeX = selectedSize.sizeX
    const sizeZ = selectedSize.sizeZ
    canvas.width = sizeX
    canvas.height = sizeZ
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Full-strength biome colors (blendAmount 1) — the shared default
    // (DEFAULT_TERRAIN_BLEND, 0.16) is tuned for Map Grid's own overview
    // canvas, where a pale backdrop keeps icons/overlays legible on top;
    // this preview has nothing else drawn over it, so a pale fill just
    // reads as washed-out/transparent-looking rather than helping anything.
    paintTerrainCanvas(ctx, sizeX, sizeZ, tilesMap, waterMap, 1, roadNodes)
    // Elevation tint (same darker/lighter overlay Map Grid itself uses,
    // elevation-shading.ts) — a real user request: hills/valleys previously
    // had no visual representation at all in this canvas.
    if (levelsMap) {
      for (const [node, tint] of buildElevationTintMap(levelsMap)) {
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        ctx.fillStyle = tint === 'lighter' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)'
        ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
      }
    }
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
              layoutArchetype: classicMode && !gameTemplate ? classic.layout : undefined,
              randomPlayerFaction: classicMode ? classic.randomPlayerFaction : undefined,
              mirrored: mirroredMap,
              enabledBiomes: enabledBiomesList, gameTemplateJson: gameTemplate?.json, organicTerrainBlending,
              rng: createSeededRng(seed), includeSpawners: true, playerSpawnerSid: 'city-spawner', computeWater: true, computeElevation: true,
            })
            if (!result) return // not Tauri
            terrain = result
            lockedTerrainRef.current = result
          }
          if (!terrain) return
          const b2 = JSON.parse(new TextDecoder().decode(terrain.container.chunks[1])) as { tilesMap: number[]; waterMap: number[]; levelsMap?: number[] }
          if (previewPhase === 'roads' || previewPhase === 'all') {
            const { roadNodes, riverNodes } = previewRoads(terrain, { roadWindingAmplitude, roadWindingWavelength, rng: createSeededRng(roadSeed) })
            drawTerrainCanvas(b2.tilesMap, b2.waterMap, b2.levelsMap, new Set([...roadNodes, ...riverNodes]))
          } else {
            drawTerrainCanvas(b2.tilesMap, b2.waterMap, b2.levelsMap)
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
  }, [previewPhase, sizeKey, playerCount, waterContent, waterChance, islandsIncludePlayerZones, islandLandRatio, hillChance, valleyChance, zoneJaggedness, zoneSpread, classicMode, classic.layout, classic.randomPlayerFaction, mirroredMap, enabledBiomesList.join(','), gameTemplate?.json, seedText, roadWindingAmplitude, roadWindingWavelength, roadSeed, organicTerrainBlending])

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


  const handleGenerate = async (freshSeed = false) => {
    setGenerating(true)
    setGenProgress({ pct: 0, label: t('common.generateRandomMapDialog.starting') })
    try {
      // Regenerate (issue #255) always rolls a new random map, even if a seed
      // was typed — re-running the same seed would just give the same map.
      const seed = freshSeed ? undefined : seedText.trim() ? Number(seedText) : undefined
      const rng = seed !== undefined && Number.isFinite(seed) ? createSeededRng(seed) : Math.random
      // Classic mode reads the RMG tuning file on every generation (rmg-tuning.ts).
      const opts = classicMode
        ? buildClassicOptions(classic, rng, await loadClassicTuning(useCatalogStore.getState().catalog))
        : { waterContent, waterChance, islandsIncludePlayerZones, islandLandRatio, hillChance, valleyChance, obstacleDensity, interactableDensity, mountainDensity, treasureDensity, objectVariety, usePortals, zoneJaggedness, zoneSpread, boundaryGuardStrength, squadDensity, roadWindingAmplitude, roadWindingWavelength, organicTerrainBlending, decorationRoadDecayStrength, decorationCoOccurrenceStrength, decorationElevationDecayStrength, mineGoldBiomeBiasStrength, disabledInteractableSids: [...disabledInteractableSids], enabledBiomes: enabledBiomesList, randomCityCount: DEFAULT_TEMPLATE_OVERRIDES.randomCityCount, richness: undefined, difficulty: undefined, gameElevationLayouts: false, tuning: undefined }
      const result = await generateRandomMapFile({
        mapName,
        onProgress: (label, pct) => setGenProgress({ label, pct }),
        sizeX: selectedSize.sizeX,
        sizeZ: selectedSize.sizeZ,
        playerCount,
        playerSpawnerSid: 'city-spawner',
        waterContent: opts.waterContent,
        waterChance: opts.waterChance,
        islandsIncludePlayerZones: opts.islandsIncludePlayerZones,
        islandLandRatio: opts.islandLandRatio,
        hillChance: opts.hillChance,
        valleyChance: opts.valleyChance,
        obstacleDensity: opts.obstacleDensity,
        interactableDensity: opts.interactableDensity,
        mountainDensity: opts.mountainDensity,
        treasureDensity: opts.treasureDensity,
        objectVariety: opts.objectVariety,
        usePortals: opts.usePortals,
        zoneJaggedness: opts.zoneJaggedness,
        zoneSpread: opts.zoneSpread,
        layoutArchetype: classicMode && !gameTemplate ? classic.layout : undefined,
        winConditions: classicMode && !gameTemplate ? classic.winConditions : undefined,
        winOptions: classicMode && !gameTemplate ? classic.winOptions : undefined,
        randomPlayerFaction: classicMode ? classic.randomPlayerFaction : undefined,
        mirrored: mirroredMap,
        boundaryGuardStrength: opts.boundaryGuardStrength,
        squadDensity: opts.squadDensity,
        roadWindingAmplitude: opts.roadWindingAmplitude,
        roadWindingWavelength: opts.roadWindingWavelength,
        organicTerrainBlending: opts.organicTerrainBlending,
        decorationRoadDecayStrength: opts.decorationRoadDecayStrength,
        decorationCoOccurrenceStrength: opts.decorationCoOccurrenceStrength,
        decorationElevationDecayStrength: opts.decorationElevationDecayStrength,
        mineGoldBiomeBiasStrength: opts.mineGoldBiomeBiasStrength,
        disabledInteractableSids: opts.disabledInteractableSids,
        includePandoraBox: classic.includePandoraBox,
        randomCityCount: limitCities ? cityTotalShown : opts.randomCityCount,
        maxHeroes,
        richness: opts.richness,
        difficulty: opts.difficulty,
        gameElevationLayouts: opts.gameElevationLayouts,
        tuning: opts.tuning,
        bannedMagics: [...new Set([...(opts.tuning?.spells?.banned ?? []), ...bannedSpellSids])],
        bannedItems: [...bannedArtifactSids],
        terrainOnly,
        enabledBiomes: opts.enabledBiomes,
        gameTemplateJson: gameTemplate?.json,
        rng,
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
      setGenerated({ name: result.name, warnings: result.warnings, balance: result.playerBalance })
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
      disabledInteractableSids: [...disabledInteractableSids],
      enabledBiomes: enabledBiomesList,
      randomCityCount: limitCities ? cityTotalShown : DEFAULT_TEMPLATE_OVERRIDES.randomCityCount,
      maxHeroes,
      // No dedicated UI control yet for these (Phase 1's own "start small"
      // scope) — saved/loaded at their template defaults.
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
      setMode('advanced') // a loaded template's values live in the Advanced sliders
      setPlayerCount(template.playerCount)
      setLimitCities(template.randomCityCount !== DEFAULT_TEMPLATE_OVERRIDES.randomCityCount)
      setCityTotal(template.randomCityCount)
      setMaxHeroes(template.maxHeroes ?? DEFAULT_MAX_HEROES)
      setWaterContent(template.waterContent)
      setWaterChance(template.waterChance)
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
      setDisabledInteractableSids(new Set(template.disabledInteractableSids))
      setEnabledBiomes(Object.fromEntries(ALL_TEMPLATE_BIOMES.map((b) => [b, template.enabledBiomes.includes(b)])) as Record<BiomeId, boolean>)
      setSeedText(template.seed !== undefined ? String(template.seed) : '')
      setActiveCategory('terrain')
      logInfo(`Loaded RMG template: ${file.name}`)
    } catch (e) {
      logError(`Failed to load RMG template: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const footerLabel = generating
    ? t('common.generateRandomMapDialog.footerGenerating')
    : previewPhase === 'terrain'
      ? (terrainOnly ? t('common.generateRandomMapDialog.footerGenerate') : t('common.generateRandomMapDialog.footerConfirmTerrain'))
      : previewPhase === 'roads'
        ? t('common.generateRandomMapDialog.footerConfirmRoads')
        : t('common.generateRandomMapDialog.footerGenerate')
  const footerAction = previewPhase === 'terrain' ? handleConfirmTerrain : previewPhase === 'roads' ? handleConfirmRoads : () => void handleGenerate()

  const handleResetAll= () => {
      setLimitCities(false)
      setCityTotal(DEFAULT_TEMPLATE_OVERRIDES.randomCityCount)
      setMaxHeroes(DEFAULT_MAX_HEROES)
      setWaterContent(DEFAULT_TEMPLATE_OVERRIDES.waterContent)
      setWaterChance(DEFAULT_TEMPLATE_OVERRIDES.waterChance)
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
      setDisabledInteractableSids(new Set(DEFAULT_TEMPLATE_OVERRIDES.disabledInteractableSids))
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
        <div className="relative flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0 bg-[var(--column-left)] dark:bg-card">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-7 w-7"
            title={t('common.generateRandomMapDialog.closeGenerateRandomMap')}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
            <div className="flex gap-1.5">
                <span className="text-sm font-semibold">{t('common.generateRandomMapDialog.generateRandomMap')}</span>
                <FieldInfo text={t('common.generateRandomMapDialog.oneZonePerPlayerPlus')} />
            </div>
        </div>

        {generated ? (
          <div className="flex-1 overflow-y-auto p-6 bg-[var(--column-center)] dark:bg-background">
            <div className="mx-auto max-w-2xl space-y-5">
              <div>
                <h2 className="text-base font-semibold">{t('common.generateRandomMapDialog.mapGenerated')}</h2>
                <p className="text-xs text-muted-foreground">{t('common.generateRandomMapDialog.isLoadedOpenItOr', { name: generated.name })}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('shared.playerBalance')}</h3>
                <PlayerBalancePanel balance={generated.balance} />
              </div>
              {generated.warnings.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('common.generateRandomMapDialog.notes')}</h3>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                    {generated.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('common.generateRandomMapDialog.theFullReportStaysAvailable')}</p>
            </div>
          </div>
        ) : (
        <div className="flex-1 flex overflow-hidden">
          {!classicMode && <nav className="w-60 shrink-0 border-r border-border overflow-y-auto p-2 space-y-1 bg-[var(--column-left)] dark:bg-card">
            {CATEGORIES.map((cat) => {
              const allowed = NAV_STAGE_ALLOWED[previewPhase]
              const disabled = allowed !== null && !allowed.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left text-sm px-3 py-2 rounded disabled:opacity-40 disabled:cursor-not-allowed ${activeCategory === cat.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                >
                  {t(`common.generateRandomMapDialog.categories.${cat.id}`)}
                </button>
              )
            })}
          </nav>}

          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-6 bg-[var(--column-center)] dark:bg-background">
              {showCore && (
                <div className={classicMode ? 'flex px-64 gap-16 items-start justify-center' : undefined}>
                <div className={classicMode ? 'space-y-6 w-2/3 min-w-0' : 'space-y-6'}>
                  <div className="space-y-1.5">
                    <Label htmlFor="rmg-map-name" className="text-xs">{t('shared.mapName')}</Label>
                    <Input id="rmg-map-name" value={mapName} onChange={(e) => setMapName(e.target.value)} className="h-8 text-sm" />
                  </div>

                  <div className="space-y-1.5 w-60 min-w-60">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">{t('common.generateRandomMapDialog.settings')}</Label>
                      <FieldInfo text={t('common.generateRandomMapDialog.classicPickRichnessComplexityAnd')} />
                    </div>
                    <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                      {(['classic', 'advanced'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={previewActive}
                          onClick={() => setMode(m)}
                          className={`text-sm rounded px-3 py-1 disabled:opacity-50 ${mode === m ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {m === 'classic' ? t('common.generateRandomMapDialog.classic') : t('common.generateRandomMapDialog.advanced')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('shared.size')}</Label>
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
                        <Label className="text-xs">{t('shared.players')}</Label>
                        <Select value={String(playerCount)} onValueChange={(v) => setPlayerCount(Number(v))} disabled={terrainLocked || !!gameTemplate}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PLAYER_COUNT_OPTIONS.map((n) => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        {/* Same box as the bare Players label: the info icon lives inside the Label and is capped at h-3, so it cannot make this row taller. */}
                        <Label className="text-xs">
                          {t('common.generateRandomMapDialog.maxHeroes')}
                          <FieldInfo className="ml-1 h-3 align-middle" text={t('common.generateRandomMapDialog.howManyHeroesEachPlayer')} />
                        </Label>
                        <Select value={String(maxHeroes)} onValueChange={(v) => setMaxHeroes(Number(v))} disabled={terrainLocked}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {gameTemplate && <p className="text-xs text-muted-foreground">{t('common.generateRandomMapDialog.playersIgnoredTheGameTemplate')}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="rmg-random-faction" className="text-xs">{t('common.generateRandomMapDialog.randomStartingTowns')}</Label>
                        <FieldInfo text={t('common.generateRandomMapDialog.everyPlayerStartsWithA')} />
                      </div>
                      <Switch
                        id="rmg-random-faction"
                        checked={!!classic.randomPlayerFaction}
                        onCheckedChange={(v) => setClassic((prev) => ({ ...prev, randomPlayerFaction: v || undefined }))}
                        disabled={terrainLocked}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="rmg-limit-cities" className="text-xs">{t('common.generateRandomMapDialog.setNumberOfRandomCities')}</Label>
                        <FieldInfo text={t('common.generateRandomMapDialog.randomCitiesInfo', { perZone: MAX_CITIES_PER_ZONE, players: playerCount, zones: neutralZones.min === neutralZones.max ? String(neutralZones.min) : `${neutralZones.min}-${neutralZones.max}`, maxCities })} />
                      </div>
                      <Switch id="rmg-limit-cities" checked={limitCities} onCheckedChange={setLimitCities} disabled={terrainLocked} />
                    </div>
                  </div>
                  {limitCities && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {t('common.generateRandomMapDialog.neutralZones', { zones: neutralZones.min === neutralZones.max ? neutralZones.min : `${neutralZones.min}-${neutralZones.max}`, players: playerCount })}
                        </span>
                        <span className="text-xs font-medium tabular-nums">{cityTotalShown} {cityTotalShown === 1 ? 'city' : 'cities'}</span>
                      </div>
                      <Slider min={0} max={maxCities} step={1} value={[cityTotalShown]} onValueChange={([v]) => setCityTotal(v)} disabled={terrainLocked} />
                      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums"><span>0</span><span>{maxCities}</span></div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="rmg-pandora" className="text-xs">{t('common.generateRandomMapDialog.includePandorasBox')}</Label>
                        <FieldInfo text={t('common.generateRandomMapDialog.letsANeutralZoneHold')} />
                      </div>
                      <Switch
                        id="rmg-pandora"
                        checked={!!classic.includePandoraBox}
                        onCheckedChange={(v) => setClassic((prev) => ({ ...prev, includePandoraBox: v || undefined }))}
                        disabled={terrainLocked}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="rmg-mirrored" className="text-xs">{t('common.generateRandomMapDialog.mirroredMap')}</Label>
                        <FieldInfo text={t('common.generateRandomMapDialog.theRightHalfOfThe')} />
                      </div>
                      <Switch
                        id="rmg-mirrored"
                        checked={mirroredMap}
                        onCheckedChange={(v) => setClassic((prev) => ({ ...prev, mirrored: v || undefined, water: v && prev.water === 'islands' ? 'some' : prev.water }))}
                        disabled={terrainLocked || !mirrorPossible}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">{t('common.generateRandomMapDialog.gameTemplate')}</Label>
                      <FieldInfo text={t('common.generateRandomMapDialog.aGameTemplateIsA')} />
                    </div>
                    {gameTemplate ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate" title={gameTemplate.name}>{gameTemplate.name}</span>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setGameTemplate(null)} disabled={terrainLocked}>
                          {t('shared.clear')}
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-start text-sm font-normal" onClick={() => setTemplatePickerOpen(true)} disabled={terrainLocked}>
                        {t('common.generateRandomMapDialog.useAGameTemplate')}
                      </Button>
                    )}
                  </div>

                  {classicMode && (
                    <>
                      {([
                        [t('common.generateRandomMapDialog.richness'), t('common.generateRandomMapDialog.richnessInfo'), classic.richness, 'richness', RICHNESS_LEVELS],
                        [t('common.generateRandomMapDialog.complexity'), t('common.generateRandomMapDialog.complexityInfo'), classic.complexity, 'complexity', COMPLEXITY_LEVELS],
                        [t('common.generateRandomMapDialog.difficulty'), t('common.generateRandomMapDialog.difficultyInfo'), classic.difficulty, 'difficulty', DIFFICULTY_LEVELS],
                        [t('common.generateRandomMapDialog.water'), t('common.generateRandomMapDialog.waterInfo'), classic.water, 'water', WATER_LEVELS],
                      ] as const).map(([label, info, value, key, options]) => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">{label}</Label>
                            <FieldInfo text={info} />
                          </div>
                          <Select value={value} onValueChange={(v) => setClassic((prev) => ({ ...prev, [key]: v }))} disabled={terrainLocked}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {/* A mirrored map has no islands (they are joined by portals that are not mirrored). */}
                              {(options as readonly { id: string; label: string }[]).filter((o) => !(mirroredMap && o.id === 'islands')).map((o) => <SelectItem key={o.id} value={o.id}>{t(`common.generateRandomMapDialog.levels.${key}.${o.id}` as never)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                      {!gameTemplate && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">{t('shared.layout')}</Label>
                            <FieldInfo text={t('common.generateRandomMapDialog.howTheZonesAreArranged')} />
                            {classic.layout && availableLayouts.includes(classic.layout) && (
                              <FieldInfo icon={LayoutGrid} text={`${t(`common.generateRandomMapDialog.layouts.${classic.layout}.label`)}: ${t(`common.generateRandomMapDialog.layouts.${classic.layout}.details`)}`} />
                            )}
                          </div>
                          <Select
                            value={classic.layout && availableLayouts.includes(classic.layout) ? classic.layout : RANDOM_LAYOUT}
                            onValueChange={(v) => setClassic((prev) => ({ ...prev, layout: v === RANDOM_LAYOUT ? undefined : (v as LayoutArchetype) }))}
                            disabled={terrainLocked}
                          >
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={RANDOM_LAYOUT}>{t('common.generateRandomMapDialog.random')}</SelectItem>
                              {availableLayouts.map((name) => (
                                <SelectItem key={name} value={name} title={t(`common.generateRandomMapDialog.layouts.${name}.description`)}>{t(`common.generateRandomMapDialog.layouts.${name}.label`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Label className="text-xs">{t('shared.bannedSpells')}</Label>
                        <FieldInfo text={t('common.generateRandomMapDialog.spellsNobodyCanLearnOr')} />
                      </div>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSpellPickerOpen(true)} disabled={terrainLocked}>
                        {bannedSpellSids.size > 0 ? `${bannedSpellSids.size} banned` : t('common.generateRandomMapDialog.noneBanned')}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Label className="text-xs">{t('shared.bannedArtifacts')}</Label>
                        <FieldInfo text={t('common.generateRandomMapDialog.artifactsThatWillNotAppear')} />
                      </div>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setArtifactPickerOpen(true)} disabled={terrainLocked}>
                        {bannedArtifactSids.size > 0 ? `${bannedArtifactSids.size} banned` : t('common.generateRandomMapDialog.noneBanned')}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">{t('common.generateRandomMapDialog.seed')}</Label>
                      <FieldInfo text={t('common.generateRandomMapDialog.sameSeedSameMapThe')} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex-1 truncate">{seedText || t('common.generateRandomMapDialog.random')}</span>
                      <RerollButton onClick={() => setSeedText(String(randomSeedValue()))} disabled={terrainLocked} title={t('common.generateRandomMapDialog.rerollSeed')} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="rmg-terrain-only" className="text-xs">{t('common.generateRandomMapDialog.terrainOnly')}</Label>
                      <FieldInfo text={t('common.generateRandomMapDialog.producesJustTheTileArrays')} />
                    </div>
                    <Switch id="rmg-terrain-only" checked={terrainOnly} onCheckedChange={setTerrainOnly} disabled={previewActive} />
                  </div>

                  {!classicMode && <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="rmg-live-preview" className="text-xs">{t('common.generateRandomMapDialog.livePreview')}</Label>
                      <FieldInfo text={t('common.generateRandomMapDialog.previewTheTerrainAndUnless')} />
                    </div>
                    <Switch id="rmg-live-preview" checked={previewActive} onCheckedChange={handleTogglePreview} />
                  </div>}
                </div>
                {classicMode && !gameTemplate && (
                  <div className="w-1/3 min-w-0 pt-1.5">
                    <WinConditionsPanel settings={classic} onChange={setClassic} disabled={terrainLocked} />
                  </div>
                )}
                </div>
              )}

              {showBiomesFields && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('common.generateRandomMapDialog.terrainTypes', { enabled: ALL_TEMPLATE_BIOMES.filter((b) => enabledBiomes[b]).length, total: ALL_TEMPLATE_BIOMES.length })}</Label>
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
                        <Label htmlFor={`rmg-biome-${biomeId}`} className="text-xs font-normal">{biomeName(biomeId)}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

          {showTerrainSliders && (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('shared.water')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.0NoWaterAtAll')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{waterSliderLabel(waterSliderValue(waterContent, waterChance))}</span>
                </div>
                <Slider
                  min={0} max={100} step={1}
                  value={[waterSliderValue(waterContent, waterChance)]}
                  onValueChange={([v]) => {
                    if (v <= 0) { setWaterContent('none'); setWaterChance(0) }
                    else if (v <= 50) { setWaterContent('normal'); setWaterChance(v / 50) }
                    else { setWaterContent('islands'); setWaterChance((v - 50) / 50) }
                  }}
                  disabled={terrainLocked}
                />
              </div>

              {waterContent === 'islands' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">{t('common.generateRandomMapDialog.landWaterRatio')}</Label>
                      <FieldInfo text={t('common.generateRandomMapDialog.independentFromTheWaterSlider')} />
                    </div>
                    <span className="text-xs text-muted-foreground">{t('common.generateRandomMapDialog.landPercent', { percent: Math.round(islandLandRatio * 100) })}</span>
                  </div>
                  <Slider min={0} max={1} step={0.01} value={[islandLandRatio]} onValueChange={([v]) => setIslandLandRatio(v)} disabled={terrainLocked} />
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.elevationVariation')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.howMuchOfEachZones')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(elevationSliderValue(hillChance, valleyChance) / 100)}</span>
                </div>
                <Slider
                  min={0} max={100} step={1}
                  value={[elevationSliderValue(hillChance, valleyChance)]}
                  onValueChange={([v]) => { setHillChance(v / 100); setValleyChance(v / 100) }}
                  disabled={terrainLocked}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.zoneJaggedness')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.controlsThePenroseTilingZone')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(zoneJaggedness)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[zoneJaggedness]} onValueChange={([v]) => setZoneJaggedness(v)} disabled={terrainLocked} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.zoneSpread')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.howTightlyZonesPackTogether')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{zoneSpread.toFixed(2)}×</span>
                </div>
                <Slider min={0.5} max={1.8} step={0.01} value={[zoneSpread]} onValueChange={([v]) => setZoneSpread(v)} disabled={terrainLocked} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.organicTerrainBlending')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.blendsTerrainBiomesOrganicallyAcross')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(organicTerrainBlending)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[organicTerrainBlending]} onValueChange={([v]) => setOrganicTerrainBlending(v)} disabled={terrainLocked} />
              </div>

            </div>
          )}

          {showRoadSliders && (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.roadWindiness')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.howMuchRoadsRiversCurve')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(roadWindinessValue(roadWindingAmplitude) / 100)}</span>
                </div>
                <Slider
                  min={0} max={100} step={1}
                  value={[roadWindinessValue(roadWindingAmplitude)]}
                  onValueChange={([v]) => {
                    const { roadWindingAmplitude: amp, roadWindingWavelength: wave } = roadWindinessToState(v)
                    setRoadWindingAmplitude(amp)
                    setRoadWindingWavelength(wave)
                  }}
                />
              </div>

              {previewActive && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.roadRiverRandomness')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.theRoadsRiversPreviewsOwn')} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input value={String(roadSeed)} readOnly className="h-8 text-sm text-muted-foreground" />
                    <RerollButton onClick={() => setRoadSeed(randomSeedValue())} title={t('common.generateRandomMapDialog.rerollRoadRiverRandomness')} />
                  </div>
                </div>
              )}
            </div>
          )}

          {showSceneryFields && (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('common.generateRandomMapDialog.obstacleDensity')}</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(obstacleDensity)}</span>
                </div>
                <Slider min={0} max={1} step={0.02} value={[obstacleDensity]} onValueChange={([v]) => setObstacleDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('common.generateRandomMapDialog.interactableDensity')}</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(interactableDensity)}</span>
                </div>
                <Slider min={0} max={0.4} step={0.007} value={[interactableDensity]} onValueChange={([v]) => setInteractableDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('common.generateRandomMapDialog.mountainDensityInZoneBoundaries')}</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(mountainDensity)}</span>
                </div>
                <Slider min={0} max={0.8} step={0.02} value={[mountainDensity]} onValueChange={([v]) => setMountainDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.authenticRealMapPatterns')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.howStronglyRealHandCrafted')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(decorationRoadDecayStrength)}</span>
                </div>
                <Slider
                  min={0} max={1} step={0.05}
                  value={[decorationRoadDecayStrength]}
                  onValueChange={([v]) => {
                    setDecorationRoadDecayStrength(v)
                    setDecorationCoOccurrenceStrength(v)
                    setDecorationElevationDecayStrength(v)
                    setMineGoldBiomeBiasStrength(v)
                  }}
                />
              </div>
            </div>
          )}

          {showEconomyFields && (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.treasureDensity')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.multiplierOnNeutralZoneTreasure')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{treasureDensity.toFixed(1)}×</span>
                </div>
                <Slider min={0} max={3} step={0.1} value={[treasureDensity]} onValueChange={([v]) => setTreasureDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.objectVariety')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.chanceATreasureGuardSlot')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(objectVariety)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[objectVariety]} onValueChange={([v]) => setObjectVariety(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.interactables')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.whichRealInteractableBuildingsSites')} />
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setInteractablePickerOpen(true)}>
                    {disabledInteractableSids.size > 0 ? `${disabledInteractableSids.size} disabled` : t('common.generateRandomMapDialog.allEnabled')}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('common.generateRandomMapDialog.squadDensity')}</Label>
                    <FieldInfo text={t('common.generateRandomMapDialog.chanceARealMineDwelling')} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pctLabel(squadDensity)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[squadDensity]} onValueChange={([v]) => setSquadDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">{t('common.generateRandomMapDialog.boundaryGuards')}</Label>
                  <FieldInfo text={t('common.generateRandomMapDialog.wallsEveryZoneToZone')} />
                </div>
                <Select value={boundaryGuardStrength} onValueChange={(v) => setBoundaryGuardStrength(v as 'none' | 'normal' | 'strong' | 'very strong')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.generateRandomMapDialog.none')}</SelectItem>
                    <SelectItem value="normal">{t('common.generateRandomMapDialog.normal')}</SelectItem>
                    <SelectItem value="strong">{t('common.generateRandomMapDialog.strong')}</SelectItem>
                    <SelectItem value="very strong">{t('common.generateRandomMapDialog.veryStrong')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {showConnectivityFields && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Label htmlFor="rmg-use-portals" className="text-xs">{t('common.generateRandomMapDialog.usePortals')}</Label>
                  <FieldInfo text={t('common.generateRandomMapDialog.addsOneBonusPortalPair')} />
                </div>
                <Switch id="rmg-use-portals" checked={usePortals} onCheckedChange={setUsePortals} />
              </div>
            </div>
          )}

          {activeCategory === 'advanced' && (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="rmg-seed-manual" className="text-xs">{t('common.generateRandomMapDialog.seedOptionalSameSeedSame')}</Label>
                <Input
                  id="rmg-seed-manual"
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={t('common.generateRandomMapDialog.random')}
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
            {!classicMode && (
              <div className="w-96 shrink-0 border-l border-border overflow-y-auto p-4 space-y-2 bg-[var(--column-right)] dark:bg-card">
                <Label className="text-xs font-semibold">{t('common.generateRandomMapDialog.mapPreview')}</Label>
                {previewActive ? (
                  <div className="space-y-1.5">
                    <div className="mx-auto rounded border border-border overflow-hidden bg-muted/30" style={{ width: PREVIEW_CANVAS_SIZE, height: PREVIEW_CANVAS_SIZE }}>
                      <canvas ref={canvasRef} className="w-full h-full [image-rendering:pixelated]" />
                    </div>
                    {previewBusy && <p className="text-xs text-muted-foreground text-center">{t('common.generateRandomMapDialog.renderingPreview')}</p>}
                    {previewError && <p className="text-xs text-destructive text-center">{previewError}</p>}
                    <p className="text-xs text-muted-foreground">
                      {previewPhase === 'terrain'
                        ? t('common.generateRandomMapDialog.tuneTerrainInTheSidebar')
                        : previewPhase === 'roads'
                          ? t('common.generateRandomMapDialog.tuneRoadRiverWindingIn')
                          : t('common.generateRandomMapDialog.terrainAndRoadsRiversAre')}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('common.generateRandomMapDialog.turnOnLivePreviewStart')}</p>
                )}
              </div>
            )}
        </div>
        )}

        {genProgress && (
          <div className="border-t border-border px-4 py-2.5 shrink-0">
            <ProgressStatus value={genProgress.pct} label={genProgress.label} />
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0 bg-[var(--column-left)] dark:bg-card">
          {generated ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setGenerated(null)} disabled={generating}>
                {t('common.generateRandomMapDialog.backToSettings')}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => void handleGenerate(true)} disabled={generating}>
                {generating ? t('common.generateRandomMapDialog.generating') : t('common.generateRandomMapDialog.regenerate')}
              </Button>
              <Button
                size="sm"
                disabled={generating}
                onClick={() => {
                  onGenerated({ name: generated.name, warnings: generated.warnings })
                  setGenerated(null)
                  onOpenChange(false)
                }}
              >
                {t('common.generateRandomMapDialog.openMap')}
              </Button>
            </>
          ) : (
            <>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleSaveTemplate}>
                    {t('common.generateRandomMapDialog.saveTemplate')}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleLoadTemplate}>
                    {t('common.generateRandomMapDialog.loadTemplate')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleResetAll()} disabled={generating}>
                    {t('common.generateRandomMapDialog.resetAllToDefaults')}
                </Button>
            </div>
          <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={generating}>
                {t('shared.cancel')}
              </Button>
              <Button size="sm" onClick={footerAction} disabled={generating || previewBusy || !mapName.trim()}>
                {footerLabel}
              </Button>
            </>
          )}
        </div>
    </div>

      <SelectGameTemplateDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={setGameTemplate}
      />
      <InteractableSelectorDialog
        open={interactablePickerOpen}
        onOpenChange={setInteractablePickerOpen}
        disabledSids={disabledInteractableSids}
        onChange={setDisabledInteractableSids}
      />
      <SpellBanDialog
        open={spellPickerOpen}
        onOpenChange={setSpellPickerOpen}
        bannedSids={bannedSpellSids}
        onChange={setBannedSpellSids}
      />
      <ArtifactBanDialog
        open={artifactPickerOpen}
        onOpenChange={setArtifactPickerOpen}
        bannedSids={bannedArtifactSids}
        onChange={setBannedArtifactSids}
      />
    </>
  )
}
