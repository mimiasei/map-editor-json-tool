// ─── Map Grid dialog — full-map 2D grid viewer (issue #122, Phase 1) ────────
// View-only MVP: every map tile as a cell, category filters, pan/zoom, hover
// info, click-to-pin. No editing yet — see the plan doc for Phase 2.
//
// Rendering is two-layer, not two-"mode": a canvas swatch layer (cheap
// regardless of map size — real maps go up to 256×256 = 65,536 tiles, too
// many to mount as DOM nodes unconditionally) always sits underneath, and a
// windowed DOM layer (real icons/letters, hover, click) draws on top only for
// whatever's currently in the viewport, so the mounted-node count stays
// bounded by viewport size, not total map size. Both layers share one
// pan/zoom transform and the same pixel-per-cell coordinate space, so they
// never drift out of alignment.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapGridStore } from '@/store/useMapGridStore'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import {
  buildTileIndex,
  pickPrimary,
  getVisibleRange,
  resolveFootprintCells,
  GRID_GROUP_ORDER,
  GRID_GROUP_LABELS,
  type GridGroup,
} from '@/lib/map-grid/tile-index'
import { resolveGridCellVisual } from '@/lib/map-grid/cell-visual'
import {
  INTERACTABLE_SUBCATEGORY_ORDER,
  INTERACTABLE_SUBCATEGORY_LABELS,
  resolveInteractableSubcategory,
  type InteractableSubcategory,
} from '@/lib/map-grid/interactable-subcategories'
import type { PlacedObject, MapEntity } from '@/types/map-context'
import { terrainFillColor, terrainLabel, BIOME_NAMES, BIOME_BASE_COLORS, WATER_TYPE_NAMES, ROAD_TYPE_NAMES, ROAD_BASE_COLORS, RIVER_BASE_COLOR, type BiomeId } from '@/lib/map-grid/terrain-colors'
import { computeShapeChanges } from '@/lib/map-grid/river-shape'
import { floodFillRegion } from '@/lib/map-grid/flood-fill'
import { computeRectangleBounds, nodesInRectangle, type RectangleBounds } from '@/lib/map-grid/rectangle'
import { buildFuzzyObstaclePools, computeFuzzyDistances, computeStrokeBoundingSize, sampleFuzzyObstacles } from '@/lib/map-grid/fuzzy-obstacle'
import { tilesInRadius } from '@/lib/map-grid/brush'
import { buildBlockedTileSet, objectBlockedCells } from '@/lib/map-grid/passability'
import { buildElevationTintMap } from '@/lib/map-grid/elevation-shading'
import { buildRampDirectionMap, type RampDirection } from '@/lib/map-grid/ramp-direction'
import { footprintIconBounds, isFootprintInBounds, computeFootprintTiles, type FootprintCell } from '@/lib/map-grid/footprint'
import MapGridCellContent from '@/components/map-grid/MapGridCellContent'
import ObjectBrowserPanel from '@/components/map-grid/ObjectBrowserPanel'
import RenameEntitySidDialog from '@/components/tree/RenameEntitySidDialog'
import SetDisplayNameDialog from '@/components/tree/SetDisplayNameDialog'
import HeroEditorDialog from '@/components/tree/HeroEditorDialog'
import { buildEntityUsageMap, describeEntityUsage } from '@/lib/entity-usage'
import { isTauri } from '@/lib/native-fs'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import type { MapSaveEdit } from '@/lib/map-save'
import { stepRotation } from '@/lib/map-write'
import { logError } from '@/lib/logger'
import UndockButton from '@/components/panels/UndockButton'
import MapGridSettingsDialog, {
  loadMapGridSettings,
  saveMapGridSettings,
} from '@/components/map-grid/MapGridSettingsDialog'
import { ZoomIn, ZoomOut, Maximize2, Percent, X, SquareArrowOutUpRight, Search, ChevronDown, Ban, Plus, Minus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Paintbrush, Layers, Droplets, SquareDashed, Mountain, Eraser, Milestone, Waves } from 'lucide-react'

// ─── Layout constants ────────────────────────────────────────────────────────

const BASE_CELL_PX = 32
const MIN_SCALE = 0.05
const MAX_SCALE = 4
/** Below this on-screen cell size, icons/letters aren't legible — canvas swatches only. */
const ICON_LOD_THRESHOLD_PX = 16
const OVERDRAW_CELLS = 3
/** Same order as ObjectBrowserPanel.tsx's own BIOME_ORDER — each file keeps
 *  its own copy rather than sharing, matching that file's existing convention. */
const PAINT_BIOME_ORDER: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]
/** Real ids from Core/DB/map/waters/waters.json, for the Water tool's swatch. */
const WATER_TYPE_ORDER = [1, 2, 3, 4, 5, 6, 7]
/** Shared styling for both row and column tile-number gutters — everything
 *  except color, which depends on whether this label's row/column is hovered. */
const TILE_NUMBER_CLASS = 'text-[10px] bg-background/80'
/** Stable empty default for context?.riverNodes — a plain `new Map()` inline
 *  would recreate on every render, same identity-churn issue arrays like
 *  waterMap already accept, but a Map is used directly in Set conversions
 *  below so a stable reference avoids needless recomputation. */
const EMPTY_MAP = new Map<number, { s: number; isWaterfall: boolean }>()

// One flat color per group, for the canvas swatch layer.
const GROUP_COLORS: Record<GridGroup, string> = {
  units: '#e0554f',
  artifacts: '#c9a227',
  spawners: '#4f7fe0',
  interactables: '#5fae5a',
  resources: '#c97fe0',
  decorations: '#8a8a8a',
  zones: '#3fb8af',
}

// Ramp/slope "up" direction → which Lucide arrow to render (ramp-direction.ts).
const RAMP_DIRECTION_ICONS: Record<RampDirection, typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
}

// ─── Filter state (persisted) ────────────────────────────────────────────────

type GridFilterState = Record<GridGroup, boolean>

const GRID_FILTER_STORAGE_KEY = 'oe-map-grid-filter'

function loadGridFilter(): GridFilterState {
  const fallback = Object.fromEntries(GRID_GROUP_ORDER.map((g) => [g, true])) as GridFilterState
  try {
    const raw = localStorage.getItem(GRID_FILTER_STORAGE_KEY)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return fallback
}

function saveGridFilter(f: GridFilterState): void {
  try { localStorage.setItem(GRID_FILTER_STORAGE_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

// issue #130: a cross-cutting filter (not a category), so it's separate from
// GridFilterState rather than another GridGroup entry.
const ENTITY_SIDS_ONLY_STORAGE_KEY = 'oe-map-grid-entity-sids-only'

function loadEntitySidsOnly(): boolean {
  try { return localStorage.getItem(ENTITY_SIDS_ONLY_STORAGE_KEY) === '1' } catch { return false }
}

function saveEntitySidsOnly(v: boolean): void {
  try { localStorage.setItem(ENTITY_SIDS_ONLY_STORAGE_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

// issue #130: Interactables has no natural single toggle — a persisted
// sub-category selection, checked only when the item's group is
// 'interactables' (the main Interactables toggle above still gates the
// whole group first).
type InteractableSubFilterState = Record<InteractableSubcategory, boolean>

const INTERACTABLE_SUBFILTER_STORAGE_KEY = 'oe-map-grid-interactable-subfilter'

function loadInteractableSubFilter(): InteractableSubFilterState {
  const fallback = Object.fromEntries(
    INTERACTABLE_SUBCATEGORY_ORDER.map((c) => [c, true]),
  ) as InteractableSubFilterState
  try {
    const raw = localStorage.getItem(INTERACTABLE_SUBFILTER_STORAGE_KEY)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return fallback
}

function saveInteractableSubFilter(f: InteractableSubFilterState): void {
  try { localStorage.setItem(INTERACTABLE_SUBFILTER_STORAGE_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

// ─── Transform ────────────────────────────────────────────────────────────────

interface Transform { x: number; y: number; scale: number }

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pop the cell-info column into its own Tauri window (issue #125). No-op/absent on web. */
  onUndock?: () => void
  /** True while the cell-info column is already undocked — shows a placeholder instead. */
  undocked?: boolean
}

export default function MapGridDialog({ open, onOpenChange, onUndock, undocked }: Props) {
  const context = useMapContextStore((s) => s.context)
  const catalog = useCatalogStore((s) => s.catalog)
  const scenario = useScenarioStore((s) => s.scenario)
  const mapFilePath = useScenarioStore((s) => s.mapFilePath)
  const localization = useScenarioStore((s) => s.localization)
  const dialogs = useScenarioStore((s) => s.dialogs)
  const entities = context?.entities ?? []

  const sizeX = context?.sizeX ?? 0
  const sizeZ = context?.sizeZ ?? 0
  const placedObjects = context?.placedObjects ?? []
  const tilesMap = context?.tilesMap ?? []
  const waterMap = context?.waterMap ?? []
  const levelsMap = context?.levelsMap ?? []
  const climbsMap = context?.climbsMap ?? []
  const roadsMap = context?.roadsMap ?? []
  const riverNodes = context?.riverNodes ?? EMPTY_MAP

  // issue #195 follow-up: every edit applies directly to the in-memory
  // document (useMapDocumentStore) and commits immediately — no staging
  // buffer, no separate Save step, matching Tiled/Photoshop/GIMP's "the
  // canvas always shows the true live result" model. This one wrapper
  // replaces every tool's old stage*/save* pair: same try/catch + logError
  // convention every individual handler already used, just called
  // synchronously at the moment of the edit instead of on a later Save
  // click. Returns the id an 'addObject'/'addMarker' edit allocated, or
  // undefined (both for every other kind, and if the edit failed).
  const applyEdit = useCallback((edit: MapSaveEdit, failureLabel: string): number | undefined => {
    try {
      return useMapDocumentStore.getState().applyEdit(edit)
    } catch (e) {
      logError(`Failed to ${failureLabel}: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    }
  }, [])

  // Browse/Paint mode toggle (issue #193 Phase 1) — swaps the second header
  // row between the filter-pill row (Browse, always available) and the
  // relocated Paint Terrain/Objects tools (Paint, edit-capable maps only).
  // Deliberately local/ephemeral state, not persisted — resets to Browse on
  // reopen, same as every other in-progress tool state in this dialog
  // (paintBiome, placingSid, etc.).
  const [gridMode, setGridMode] = useState<'browse' | 'paint'>('browse')

  const [filter, setFilter] = useState<GridFilterState>(loadGridFilter)
  const toggleGroup = (g: GridGroup) => {
    setFilter((prev) => {
      const next = { ...prev, [g]: !prev[g] }
      saveGridFilter(next)
      return next
    })
  }

  const [entitySidsOnly, setEntitySidsOnly] = useState<boolean>(loadEntitySidsOnly)
  const toggleEntitySidsOnly = () => {
    setEntitySidsOnly((prev) => {
      const next = !prev
      saveEntitySidsOnly(next)
      return next
    })
  }

  const [interactableSubFilter, setInteractableSubFilter] = useState<InteractableSubFilterState>(
    loadInteractableSubFilter,
  )
  const toggleInteractableSubcategory = (c: InteractableSubcategory) => {
    setInteractableSubFilter((prev) => {
      const next = { ...prev, [c]: !prev[c] }
      saveInteractableSubFilter(next)
      return next
    })
  }
  const setAllInteractableSubcategories = (value: boolean) => {
    const next = Object.fromEntries(
      INTERACTABLE_SUBCATEGORY_ORDER.map((c) => [c, value]),
    ) as InteractableSubFilterState
    setInteractableSubFilter(next)
    saveInteractableSubFilter(next)
  }

  // ── Search (issue #130) — matches sid/entitySid/displayName, highlights
  // every matching tile. Deliberately separate from `highlightedNode` (the
  // single pulsing portal-connection marker): one is exactly one node with
  // a "look here" pulse, the other can be many nodes and needs to stay
  // legible as a set, not pulse in unison.
  const [searchQuery, setSearchQuery] = useState('')
  const searchMatchedNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return new Set<number>()
    const nodes = new Set<number>()
    for (const item of placedObjects) {
      if ([item.sid, item.entitySid, item.displayName].some((v) => v?.toLowerCase().includes(q))) {
        nodes.add(item.node)
      }
    }
    return nodes
  }, [placedObjects, searchQuery])

  const [settings, setSettings] = useState(loadMapGridSettings)
  const updateSettings = (next: typeof settings) => {
    setSettings(next)
    saveMapGridSettings(next)
  }

  // ── Tile index + per-tile primary pick (only for OCCUPIED tiles — a few
  // thousand at most, never the full sizeX*sizeZ space) ──────────────────────
  // issue #195 follow-up: every edit now applies straight to the in-memory
  // document and re-syncs `placedObjects` (via useMapContextStore)
  // immediately, so this reads the committed list directly — no staged/
  // pending merge layer needed anywhere anymore.
  const tileIndex = useMemo(
    () => buildTileIndex(placedObjects, catalog, sizeX, sizeZ),
    [placedObjects, catalog, sizeX, sizeZ],
  )

  // Real footprint cells per placed object (issue #167's multi-tile
  // rendering fix) — resolved once here and reused both for the multi-tile
  // icon bounding boxes below and (via resolveFootprintCells, the same
  // function buildTileIndex uses) so both agree on the exact same shape.
  const footprintCellsByKey = useMemo(() => {
    const map = new Map<string, FootprintCell[]>()
    for (const obj of placedObjects) {
      if (obj.type !== 0) continue
      map.set(obj.key, resolveFootprintCells(obj, catalog))
    }
    return map
  }, [placedObjects, catalog])

  const primaryByNode = useMemo(() => {
    const map = new Map<number, { primary: PlacedObject; group: GridGroup; count: number }>()
    for (const [node, items] of tileIndex) {
      // issue #130: markers ("zones") are real, filterable items now — no
      // hard exclusion here anymore, just the per-group filter[] toggle below.
      // "Entity SIDs only" is cross-cutting: untagged items are dropped
      // before picking a primary, so they neither render nor count.
      const candidates = entitySidsOnly ? items.filter((item) => item.entitySid?.trim()) : items
      const pick = pickPrimary(candidates, catalog)
      if (!pick || !filter[pick.group]) continue
      // issue #130: interactables additionally need their sub-category selected.
      if (pick.group === 'interactables' && !interactableSubFilter[resolveInteractableSubcategory(pick.primary.sid)]) continue
      map.set(node, pick)
    }
    return map
  }, [tileIndex, catalog, filter, entitySidsOnly, interactableSubFilter])

  // Blocked-tile ("passability") overlay — object footprints + elevation
  // walls + water (src/lib/map-grid/passability.ts). Independent of
  // filter/entitySidsOnly/interactableSubFilter (unlike primaryByNode above)
  // since blocking isn't about what's *shown*, it's about what's real on the
  // map regardless of the current view filters.
  const blockedTileSet = useMemo(
    () => buildBlockedTileSet({ sizeX, sizeZ, placedObjects, levelsMap, climbsMap, waterMap }, catalog),
    [sizeX, sizeZ, placedObjects, levelsMap, climbsMap, waterMap, catalog],
  )

  // Elevation tint (src/lib/map-grid/elevation-shading.ts) — a flat darker/
  // lighter fill over every level -1 / level 1 tile, independent of the
  // wall-vs-interior distinction the blocked-tile overlay uses.
  // elevationTintMap is declared further down, after paintLevelStaged exists
  // (issue #193 Phase 2 merges the in-progress Level stroke into it) — a
  // memo's dependency array can't forward-reference a binding declared
  // later in the component body.

  // Ramp/slope direction arrows (src/lib/map-grid/ramp-direction.ts) — folded
  // into the same "Elevation shading" toggle rather than a separate setting,
  // since it's the same underlying story (making levelsMap/climbsMap
  // visually legible) and this dialog already has a lot of toggles.
  const rampDirectionMap = useMemo(
    () => buildRampDirectionMap(sizeX, sizeZ, levelsMap, climbsMap),
    [sizeX, sizeZ, levelsMap, climbsMap],
  )

  // ── Pan/zoom transform ──────────────────────────────────────────────────────
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  // State-backed (not a plain ref): a parent that conditionally mounts this
  // view (AppShell) can defer this DOM node's mount arbitrarily, and a plain
  // useEffect here could fire before that resolves and never re-fire once it
  // does. A callback ref, by contrast, is invoked by React exactly when this
  // DOM node mounts, no matter how deeply that mount was deferred.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Panning is middle-mouse-button only (button 1) — left-button drag is
  // reserved for object move/paint below. Left-button-down still lands here
  // as the fallback when nothing else claims it (e.g. moveState active,
  // clicking a destination tile), so a plain click can still fall through;
  // it just never pans on button 0 (see the `button` check in
  // onPointerMove/onPointerUp).
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number; moved: boolean; button: number } | null>(null)
  // Drives the viewport's cursor while actively panning — dragRef alone
  // can't do this since it's a plain ref (mutating it doesn't re-render), and
  // the cursor should reflect "middle button is held" immediately, not only
  // once the pan crosses the click/drag threshold.
  const [isPanning, setIsPanning] = useState(false)

  // Drag-to-move (issue #167 punch list "real drag-to-move v2") — a
  // pointerdown directly on an occupied tile's icon records the candidate
  // item here (not yet a move — same click-vs-drag threshold disambiguation
  // dragRef above uses for panning). Crossing CLICK_DRAG_THRESHOLD_PX in
  // onPointerMove is what actually calls startMove and begins live-updating
  // moveState.node under the cursor; releasing without crossing it lets the
  // pointerup's native click reach the icon's own onClick (plain select),
  // completely unchanged from before this feature existed.
  const moveDragRef = useRef<{ item: PlacedObject; startX: number; startY: number; moved: boolean } | null>(null)

  // Drag-to-paint-objects — mirrors moveDragRef's shape, kept separate so a
  // middle-mouse pan mid-placingSid can't be misread as a paint stroke (see
  // onPointerDown's button dispatch). Below CLICK_DRAG_THRESHOLD_PX, releasing
  // still falls through to the single-placement click in onPointerUp.
  const paintObjectDragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)

  // In-progress object-paint drag stroke — purely transient (cleared the
  // instant the gesture ends and commits via applyEdit; never held across a
  // tool switch, unlike this session's earlier staging-buffer design).
  // Declared up here, ahead of both its own preview-canvas effect and the
  // "Place object" section below that populates it, since a dependency
  // array (unlike a plain closure reference inside a handler body) is
  // evaluated at this render's hook-call time, not deferred until later —
  // so it needs the binding to already exist by then.
  const [paintObjectStaged, setPaintObjectStaged] = useState<Map<number, string>>(new Map())

  // ── Paint terrain (issue #167 Phase D) ──────────────────────────────────
  // Repaints tilesMap's biome only — never touches objects[]/squads[]/
  // markers[]/any objectsProperties.* table (a different top-level array
  // entirely), so by construction this can't affect a placed object. One
  // tool active at a time: activating this stops Place/the object browser
  // (below), and picking a sid to place stops this (see stopPainting call
  // sites). A whole drag stroke accumulates into one in-memory batch,
  // applied to the document (issue #195 follow-up: useMapDocumentStore) the
  // instant the drag ends — one applyEdit call per stroke, not one per tile
  // dragged over, same batching Save always had, just no separate manual
  // Save click anymore. Declared this early (ahead of onPointerDown/Move/Up
  // and the paint-preview canvas effect below, which both reference it) to
  // avoid a temporal-dead-zone reference.
  const [paintBiome, setPaintBiome] = useState<BiomeId | null>(null)
  // Terrain bucket-fill (issue #193 Phase 3) — an alternate click-to-flood-
  // fill interaction for the same Terrain tool, reusing floodFillRegion the
  // same way Water does. Freehand (drag-stroke) stays the default, matching
  // today's existing behavior unchanged.
  const [terrainBucketMode, setTerrainBucketMode] = useState(false)

  // Shared brush-size radius (issue #193 punch-list item, scoped in the
  // original plan but never wired up in any earlier phase) — applies to
  // every freehand per-tile brush (Terrain, Level, Obstacles). Not
  // meaningful for Water (click-to-flood-fill, not per-tile) or Bucket/
  // Rectangle modes (already their own explicit region shapes). Circular
  // brush shape, computed by src/lib/map-grid/brush.ts's tilesInRadius().
  const [brushRadius, setBrushRadius] = useState(1)

  // ── Rectangle interaction mode (issue #193 Phase 4) — a shared toggle
  // applying uniformly to Terrain/Level/Water: drag a rectangle (live
  // outline preview, Shift=square, Alt=center from src/lib/map-grid/
  // rectangle.ts, matching Tiled's Rectangle tool), and every enclosed node
  // applies with the currently-active brush's value on release — the exact
  // same node-set-computation swap flood-fill already established, so this
  // needs no new write-path code, only a new way to compute which nodes get
  // edited. Terrain's own Bucket toggle is ignored while this is active
  // (checked first in onPointerDown) since a rectangle and a flood-fill are
  // two different selection shapes for the same "batch of nodes" concept.
  const [interactionMode, setInteractionMode] = useState<'freehand' | 'rectangle'>('freehand')
  const rectangleDragRef = useRef<{ tool: 'terrain' | 'level' | 'water' | 'road' | 'obstacles' | 'eraser'; startX: number; startZ: number } | null>(null)
  const [rectanglePreview, setRectanglePreview] = useState<RectangleBounds | null>(null)

  const [obstacleBrushActive, setObstacleBrushActive] = useState(false)
  const obstacleDragRef = useRef<Set<number> | null>(null)

  const [paintStaged, setPaintStaged] = useState<Map<number, BiomeId>>(new Map())
  const paintingRef = useRef(false)

  // ── Paint level (issue #193 Phase 2) — same freehand drag-stroke
  // in-progress-batch convention as Paint Terrain above, just targeting
  // levelsMap (-1/0/1) instead of tilesMap. Deliberately does not touch
  // climbsMap (ramp markers) — see paintLevelTiles' doc comment in
  // map-write.ts.
  const [levelBrush, setLevelBrush] = useState<-1 | 0 | 1 | null>(null)
  const [paintLevelStaged, setPaintLevelStaged] = useState<Map<number, -1 | 0 | 1>>(new Map())
  const levelPaintingRef = useRef(false)

  // ── Paint water (issue #193 Phase 2) — click-to-flood-fill, not a
  // freehand stroke: one click computes and immediately applies the whole
  // contiguous level -1 region with the chosen water type. Restricted to
  // level -1 only (issue #195 follow-up — user-requested; earlier real-map
  // surveys found a rare-but-real minority of shipped water at level 0, but
  // this editor no longer lets new water be painted there) — raising a
  // watered tile to 0/1 via the Level tool clears its water instead (see
  // paintLevelTiles in map-write.ts). No in-progress buffer needed at all
  // (unlike Terrain/Level/Objects) since there's no drag to accumulate —
  // the whole batch is known synchronously.
  const [waterBrush, setWaterBrush] = useState<number | null>(null)

  // ── Paint road — same freehand drag-stroke in-progress-batch convention
  // as Paint Level above, targeting roadsMap (0=none, 1=Dirt, 2=Stone —
  // see terrain-colors.ts's ROAD_TYPE_NAMES for the caveat on which id is
  // which). State declared here (rather than alongside stageRoadNode/
  // commitRoadStroke below) so applyRectangleFill above can reference
  // roadBrush without a temporal-dead-zone error, matching where
  // levelBrush/waterBrush are declared relative to it.
  const [roadBrush, setRoadBrush] = useState<1 | 2 | null>(null)
  const [paintRoadStaged, setPaintRoadStaged] = useState<Map<number, number>>(new Map())
  const roadPaintingRef = useRef(false)

  // Elevation tint, merged with any in-progress (not yet committed) Level
  // drag stroke — same merge-before-render pattern issue #195 Phase 1
  // established, so the preview during an active stroke looks identical to
  // what applying it will produce. blockedTileSet/rampDirectionMap
  // (declared above) deliberately stay committed-only — see
  // paintLevelTiles' climbsMap note in map-write.ts.
  const elevationTintMap = useMemo(() => {
    if (paintLevelStaged.size === 0) return buildElevationTintMap(levelsMap)
    const merged = levelsMap.slice()
    for (const [node, level] of paintLevelStaged) merged[node] = level
    return buildElevationTintMap(merged)
  }, [levelsMap, paintLevelStaged])

  // ── Fuzzy obstacle brush (issue #193 Phase 5) — a freehand drag (or a
  // Rectangle-mode selection, reusing the same drag machinery declared
  // above) accumulates a raw node set; on release the whole set is sampled
  // ONCE via sampleFuzzyObstacles (distance-from-center only makes sense
  // for a complete stroke, not incrementally per tile the way Terrain
  // paints) and applied immediately — a sampled obstacle IS just an object
  // placement, so this reuses the exact same 'paintObjects' edit kind
  // Objects already uses, no new write path.
  const fuzzyObstaclePools = useMemo(
    () => (catalog ? buildFuzzyObstaclePools(catalog.mapObjects) : null),
    [catalog],
  )
  const commitObstacleStroke = useCallback((nodes: number[]) => {
    if (!fuzzyObstaclePools || nodes.length === 0) return
    const distances = computeFuzzyDistances(nodes, sizeX)
    // Pools (pool_small etc.) only look right at 4x4+ (issue #195 follow-up,
    // user-requested) — measured from the stroke's own bounding box so this
    // works the same whether it came from a freehand drag or a Rectangle
    // selection.
    const { width, height } = computeStrokeBoundingSize(nodes, sizeX)
    const poolsAllowed = width >= 4 && height >= 4
    const additions = sampleFuzzyObstacles(distances, (n) => {
      const v = tilesMap[n]
      return v >= 1 && v <= 7 ? (v as BiomeId) : undefined
    }, fuzzyObstaclePools, { poolsAllowed })
    if (additions.length === 0) return
    applyEdit({ kind: 'paintObjects', additions, deletions: [] }, 'scatter obstacles')
  }, [fuzzyObstaclePools, sizeX, tilesMap, applyEdit])
  const stopObstaclePainting = () => setObstacleBrushActive(false)

  // ── Eraser (issue #195 follow-up) — deletes non-terrain content (objects/
  // units/zones) under the brush, same freehand (brush-radius, via
  // eraserDragRef mirroring obstacleDragRef above) or Rectangle-mode
  // selection every other paint tool already offers. Never touches
  // terrain/level/water — only ever calls deleteObject. Applies
  // immediately on stroke release, same as every other brush tool here (no
  // extra confirmation step, unlike the single-object Delete tool in the
  // info panel — Ctrl+Z covers an eraser mistake same as any other edit).
  const [eraserActive, setEraserActive] = useState(false)
  const eraserDragRef = useRef<Set<number> | null>(null)
  const stopEraser = () => setEraserActive(false)
  const commitEraserStroke = useCallback((nodes: number[]) => {
    if (nodes.length === 0) return
    const erased = new Set(nodes)
    // Match by footprint overlap (resolveFootprintCells — the same function
    // click/hover selection already uses), not just an object's own anchor
    // node, so erasing part of a multi-tile mountain/building removes it
    // even if its anchor sits just outside the brushed area. Markers/squads
    // have no footprint template and resolve to their own single node.
    const targets: { entityType: 0 | 1 | 2; entityId: number }[] = []
    for (const obj of placedObjects) {
      const cells = resolveFootprintCells(obj, catalog)
      if (cells.some((c) => erased.has(c.z * sizeX + c.x))) {
        targets.push({ entityType: obj.type, entityId: obj.id })
      }
    }
    for (const { entityType, entityId } of targets) {
      applyEdit({ kind: 'deleteObject', entityType, entityId }, 'erase object')
    }
    // Also deletes any river node under the brush (reuses the same tool
    // rather than a bespoke river-eraser) — the surviving neighbors of a
    // deleted node need their own `s` re-derived too (e.g. a straight line
    // losing one end becomes a point), same reclassification computeShapeChanges
    // does for a newly-painted stroke in commitRiverStroke below.
    const erasedRiverNodes = nodes.filter((n) => riverNodes.has(n))
    if (erasedRiverNodes.length > 0) {
      const survivingSet = new Set(riverNodes.keys())
      for (const n of erasedRiverNodes) survivingSet.delete(n)
      const affected: number[] = []
      for (const n of erasedRiverNodes) {
        const x = n % sizeX
        const z = Math.floor(n / sizeX)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
          affected.push(nz * sizeX + nx)
        }
      }
      const changes = computeShapeChanges(affected, survivingSet, sizeX, sizeZ)
      applyEdit({ kind: 'paintRiver', changes, deletions: erasedRiverNodes }, 'erase river')
    }
  }, [placedObjects, catalog, sizeX, sizeZ, riverNodes, applyEdit])

  const stopPainting = () => {
    setPaintBiome(null)
    setPaintStaged(new Map())
  }
  // Accumulates the in-progress stroke locally (for live preview) — see
  // commitPaintStroke below (called from onPointerUp) for where this
  // actually applies to the document.
  const stagePaintNode = useCallback((node: number, biomeId: BiomeId) => {
    const tiles = tilesInRadius(node % sizeX, Math.floor(node / sizeX), brushRadius, sizeX, sizeZ)
    if (tiles.every((n) => paintStaged.get(n) === biomeId)) return
    setPaintStaged((prev) => {
      const next = new Map(prev)
      for (const n of tiles) next.set(n, biomeId)
      return next
    })
  }, [paintStaged, brushRadius, sizeX, sizeZ])
  const commitPaintStroke = useCallback(() => {
    if (paintStaged.size === 0) return
    const changes = [...paintStaged.entries()].map(([node, biomeId]) => ({ node, biomeId }))
    setPaintStaged(new Map())
    applyEdit({ kind: 'paintTerrain', changes }, 'paint terrain')
  }, [paintStaged, applyEdit])

  // Terrain bucket-fill (issue #193 Phase 3) — click a tile, flood-fill
  // every contiguous tile of ITS CURRENT biome with the newly chosen biome,
  // and apply immediately (the whole region is known synchronously from one
  // click, same as Water's flood-fill — no drag to batch).
  const applyBucketFill = useCallback((node: number, biomeId: BiomeId) => {
    if (tilesMap[node] === undefined) return
    const targetBiome = tilesMap[node]
    const region = floodFillRegion(node, sizeX, sizeZ, (n) => tilesMap[n] === targetBiome)
    if (region.length === 0) return
    applyEdit({ kind: 'paintTerrain', changes: region.map((n) => ({ node: n, biomeId })) }, 'bucket-fill terrain')
  }, [tilesMap, sizeX, sizeZ, applyEdit])

  // Rectangle mode's release-time commit — the whole enclosed region is
  // known at once, so (unlike freehand) this applies immediately rather
  // than accumulating into an in-progress buffer first.
  const applyRectangleFill = useCallback((tool: 'terrain' | 'level' | 'water' | 'road' | 'obstacles' | 'eraser', bounds: RectangleBounds) => {
    const nodes = nodesInRectangle(bounds, sizeX)
    if (nodes.length === 0) return
    if (tool === 'obstacles') {
      commitObstacleStroke(nodes)
      return
    }
    if (tool === 'eraser') {
      commitEraserStroke(nodes)
      return
    }
    if (tool === 'terrain' && paintBiome !== null) {
      applyEdit({ kind: 'paintTerrain', changes: nodes.map((n) => ({ node: n, biomeId: paintBiome })) }, 'paint terrain')
    } else if (tool === 'level' && levelBrush !== null) {
      applyEdit({ kind: 'paintLevel', changes: nodes.map((n) => ({ node: n, level: levelBrush })) }, 'paint level')
    } else if (tool === 'water' && waterBrush !== null) {
      // Water only ever paints level -1 tiles (see applyWaterFill's doc
      // comment) — a rectangle can span other levels too, so filter rather
      // than assume the whole selection qualifies.
      const waterableNodes = nodes.filter((n) => levelsMap[n] === -1)
      if (waterableNodes.length > 0) {
        applyEdit({ kind: 'paintWater', changes: waterableNodes.map((n) => ({ node: n, waterId: waterBrush })) }, 'paint water')
      }
    } else if (tool === 'road' && roadBrush !== null) {
      applyEdit({ kind: 'paintRoad', changes: nodes.map((n) => ({ node: n, roadId: roadBrush })) }, 'paint road')
    }
  }, [sizeX, paintBiome, levelBrush, waterBrush, roadBrush, applyEdit, commitObstacleStroke, commitEraserStroke, levelsMap])

  const stopLevelPainting = () => {
    setLevelBrush(null)
    setPaintLevelStaged(new Map())
  }
  // Accumulates the in-progress stroke locally (for live preview) — see
  // commitLevelStroke below (called from onPointerUp) for where this
  // actually applies to the document.
  const stageLevelNode = useCallback((node: number, level: -1 | 0 | 1) => {
    const tiles = tilesInRadius(node % sizeX, Math.floor(node / sizeX), brushRadius, sizeX, sizeZ)
    if (tiles.every((n) => paintLevelStaged.get(n) === level)) return
    setPaintLevelStaged((prev) => {
      const next = new Map(prev)
      for (const n of tiles) next.set(n, level)
      return next
    })
  }, [paintLevelStaged, brushRadius, sizeX, sizeZ])
  const commitLevelStroke = useCallback(() => {
    if (paintLevelStaged.size === 0) return
    const changes = [...paintLevelStaged.entries()].map(([node, level]) => ({ node, level }))
    setPaintLevelStaged(new Map())
    applyEdit({ kind: 'paintLevel', changes }, 'paint level')
  }, [paintLevelStaged, applyEdit])

  const stopWaterPainting = () => {
    setWaterBrush(null)
  }
  // One click fills the whole contiguous level -1 region containing this
  // tile and applies immediately — see the waterBrush doc comment above for
  // why there's no in-progress buffer for this tool. Water is only ever
  // paintable at level -1 (issue #195 follow-up — user-requested, tighter
  // than the format itself); raising a watered tile to 0/1 via the Level
  // tool clears its water instead (see paintLevelTiles in map-write.ts).
  const applyWaterFill = useCallback((node: number, waterId: number) => {
    if (levelsMap[node] !== -1) return
    const region = floodFillRegion(node, sizeX, sizeZ, (n) => (levelsMap[n] ?? 0) === -1)
    if (region.length === 0) return
    applyEdit({ kind: 'paintWater', changes: region.map((n) => ({ node: n, waterId })) }, 'paint water')
  }, [levelsMap, sizeX, sizeZ, applyEdit])

  // roadBrush/paintRoadStaged/roadPaintingRef declared above (near
  // waterBrush) so applyRectangleFill can reference roadBrush without a
  // temporal-dead-zone error. No level/water side effects here — real
  // sample data shows roads coexisting freely with both, including at a
  // straight road/river crossing (confirmed: painting a road at an
  // existing river node needs no special handling — see paintRoadTiles's
  // doc comment in map-write.ts).
  const stopRoadPainting = () => {
    setRoadBrush(null)
    setPaintRoadStaged(new Map())
  }
  // Accumulates the in-progress stroke locally (for live preview) — see
  // commitRoadStroke below (called from onPointerUp) for where this
  // actually applies to the document.
  const stageRoadNode = useCallback((node: number, roadId: number) => {
    const tiles = tilesInRadius(node % sizeX, Math.floor(node / sizeX), brushRadius, sizeX, sizeZ)
    if (tiles.every((n) => paintRoadStaged.get(n) === roadId)) return
    setPaintRoadStaged((prev) => {
      const next = new Map(prev)
      for (const n of tiles) next.set(n, roadId)
      return next
    })
  }, [paintRoadStaged, brushRadius, sizeX, sizeZ])
  const commitRoadStroke = useCallback(() => {
    if (paintRoadStaged.size === 0) return
    const changes = [...paintRoadStaged.entries()].map(([node, roadId]) => ({ node, roadId }))
    setPaintRoadStaged(new Map())
    applyEdit({ kind: 'paintRoad', changes }, 'paint road')
  }, [paintRoadStaged, applyEdit])

  // ── River (issue: roads/rivers investigation) — a single-mode tool (no
  // material choice — rivers.json only ever defines one real type) that
  // traces a PATH, not an area fill, so it needs the dragged tiles' actual
  // ORDER rather than the unordered Set/Map every other freehand tool uses
  // — river-drag captures them into a plain ordered array (riverDragRef),
  // append-if-different-from-last on every pointermove, same per-move
  // sampling every other freehand tool already does (no Bresenham
  // interpolation needed). No brush-radius/Rectangle-mode support — a
  // river is inherently one tile wide, matching the real format's own
  // sparse per-node (not per-area) shape. Applies immediately on stroke
  // release (no staged preview, same convention as Obstacles/Eraser) since
  // there's no in-progress buffer to render a "final" color for — the real
  // color only renders once committed anyway (see the river canvas pass
  // below). Deletion reuses the Eraser tool (see commitEraserStroke's own
  // extension above) rather than a bespoke river-eraser.
  const [riverActive, setRiverActive] = useState(false)
  const riverDragRef = useRef<number[] | null>(null)
  const stopRiverPainting = () => setRiverActive(false)
  const commitRiverStroke = useCallback((orderedNodes: number[]) => {
    const newNodes = orderedNodes.filter((n) => !riverNodes.has(n))
    if (newNodes.length === 0) return
    const mergedSet = new Set(riverNodes.keys())
    for (const n of newNodes) mergedSet.add(n)
    // Reclassify every newly-painted node AND any pre-existing neighbor
    // whose own shape just changed (e.g. a straight line gaining a branch
    // becomes a join) — not just the new nodes themselves.
    const affected = [...newNodes]
    for (const n of newNodes) {
      const x = n % sizeX
      const z = Math.floor(n / sizeX)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        affected.push(nz * sizeX + nx)
      }
    }
    const changes = computeShapeChanges(affected, mergedSet, sizeX, sizeZ)
    applyEdit({ kind: 'paintRiver', changes }, 'paint river')
  }, [riverNodes, sizeX, sizeZ, applyEdit])

  const fitToViewport = useCallback(() => {
    if (!viewportEl || sizeX <= 0 || sizeZ <= 0) return
    const { width, height } = viewportEl.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    const totalW = sizeX * BASE_CELL_PX
    const totalH = sizeZ * BASE_CELL_PX
    const scale = clampScale(Math.min(width / totalW, height / totalH, 1))
    setTransform({
      x: (width - totalW * scale) / 2,
      y: (height - totalH * scale) / 2,
      scale,
    })
    setContainerSize({ width, height })
  }, [viewportEl, sizeX, sizeZ])

  // Auto-fit on the FIRST real (non-zero) layout measurement after opening.
  const hasAutoFitRef = useRef(false)
  useEffect(() => {
    if (!open || !viewportEl) { hasAutoFitRef.current = false; return }
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
      if (!hasAutoFitRef.current && width > 0 && height > 0) {
        hasAutoFitRef.current = true
        fitToViewport()
      }
    })
    ro.observe(viewportEl)
    return () => ro.disconnect()
  }, [open, viewportEl, fitToViewport])

  // Panning must work when the drag starts on top of an icon cell (icons can
  // cover most of the visible area once zoomed in), so pointer capture can't
  // simply be skipped based on the pointerdown target. It also can't be
  // acquired unconditionally on pointerdown and released again on a
  // non-moved pointerup: empirically (verified with a real browser), once
  // capture has been active for any part of a pointerdown→pointerup
  // sequence, the browser's derived click event still targets the capturing
  // element even after capture is released before the click is dispatched —
  // releasing "in time" does not un-redirect it.
  //
  // The fix instead is to never acquire capture in the first place until
  // real movement is confirmed: acquire it lazily inside onPointerMove, the
  // instant the pointer crosses a small threshold. A plain click (no
  // movement) then never triggers capture at all, so it reaches whatever's
  // actually under the cursor — the cell — with no redirection to fight.
  const CLICK_DRAG_THRESHOLD_PX = 4
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Panning is the middle mouse button only, so it never fights the
    // object-move/paint gestures below (which need left-button drag) and so
    // native HTML5 image drag on an icon <img> (a "no-drop" cursor, since
    // nothing here is a real drop target) never gets a chance to hijack a
    // left-button gesture in the first place.
    if (e.button === 1) {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: transform.x, startTy: transform.y, moved: false, button: 1 }
      setIsPanning(true)
      return
    }
    if (e.button !== 0) return
    // Paint mode replaces panning entirely while active — a pointer-down
    // starts a paint stroke (captured so it continues even if the cursor
    // briefly leaves the canvas), not a viewport drag.
    if (paintBiome !== null) {
      if (interactionMode === 'rectangle') {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) {
          e.currentTarget.setPointerCapture(e.pointerId)
          rectangleDragRef.current = { tool: 'terrain', startX: node % sizeX, startZ: Math.floor(node / sizeX) }
          setRectanglePreview({ minX: node % sizeX, maxX: node % sizeX, minZ: Math.floor(node / sizeX), maxZ: Math.floor(node / sizeX) })
        }
        return
      }
      if (terrainBucketMode) {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) applyBucketFill(node, paintBiome)
        return
      }
      paintingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stagePaintNode(node, paintBiome)
      return
    }
    // Same freehand-stroke idea for the Level brush.
    if (levelBrush !== null) {
      if (interactionMode === 'rectangle') {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) {
          e.currentTarget.setPointerCapture(e.pointerId)
          rectangleDragRef.current = { tool: 'level', startX: node % sizeX, startZ: Math.floor(node / sizeX) }
          setRectanglePreview({ minX: node % sizeX, maxX: node % sizeX, minZ: Math.floor(node / sizeX), maxZ: Math.floor(node / sizeX) })
        }
        return
      }
      levelPaintingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stageLevelNode(node, levelBrush)
      return
    }
    // Water is click-to-flood-fill, not a drag stroke — one pointerdown
    // computes and applies the whole contiguous region in one action (see
    // applyWaterFill's doc comment). Rectangle mode replaces that with a
    // drag-a-rect-then-fill-every-enclosed-tile interaction instead — a
    // genuinely different selection shape (not level-bounded), so it's
    // offered as an alternative rather than folded into the click behavior.
    if (waterBrush !== null) {
      if (interactionMode === 'rectangle') {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) {
          e.currentTarget.setPointerCapture(e.pointerId)
          rectangleDragRef.current = { tool: 'water', startX: node % sizeX, startZ: Math.floor(node / sizeX) }
          setRectanglePreview({ minX: node % sizeX, maxX: node % sizeX, minZ: Math.floor(node / sizeX), maxZ: Math.floor(node / sizeX) })
        }
        return
      }
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) applyWaterFill(node, waterBrush)
      return
    }
    // Same freehand-stroke idea for the Road brush.
    if (roadBrush !== null) {
      if (interactionMode === 'rectangle') {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) {
          e.currentTarget.setPointerCapture(e.pointerId)
          rectangleDragRef.current = { tool: 'road', startX: node % sizeX, startZ: Math.floor(node / sizeX) }
          setRectanglePreview({ minX: node % sizeX, maxX: node % sizeX, minZ: Math.floor(node / sizeX), maxZ: Math.floor(node / sizeX) })
        }
        return
      }
      roadPaintingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stageRoadNode(node, roadBrush)
      return
    }
    // River — ordered stroke capture, no Rectangle-mode/brush-radius (see
    // riverActive's own doc comment above).
    if (riverActive) {
      riverDragRef.current = []
      e.currentTarget.setPointerCapture(e.pointerId)
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) riverDragRef.current.push(node)
      return
    }
    // Fuzzy obstacle brush — freehand drag accumulates the raw node set
    // (sampled once as a whole on release, see commitObstacleStroke); a
    // Rectangle-mode drag reuses the exact same rectangleDragRef machinery
    // Terrain/Level/Water already use.
    if (obstacleBrushActive) {
      if (interactionMode === 'rectangle') {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) {
          e.currentTarget.setPointerCapture(e.pointerId)
          rectangleDragRef.current = { tool: 'obstacles', startX: node % sizeX, startZ: Math.floor(node / sizeX) }
          setRectanglePreview({ minX: node % sizeX, maxX: node % sizeX, minZ: Math.floor(node / sizeX), maxZ: Math.floor(node / sizeX) })
        }
        return
      }
      obstacleDragRef.current = new Set()
      e.currentTarget.setPointerCapture(e.pointerId)
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) {
        for (const n of tilesInRadius(node % sizeX, Math.floor(node / sizeX), brushRadius, sizeX, sizeZ)) {
          obstacleDragRef.current.add(n)
        }
      }
      return
    }
    // Eraser — same freehand/Rectangle drag machinery as Obstacles above,
    // committed via commitEraserStroke instead of the fuzzy sampler.
    if (eraserActive) {
      if (interactionMode === 'rectangle') {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) {
          e.currentTarget.setPointerCapture(e.pointerId)
          rectangleDragRef.current = { tool: 'eraser', startX: node % sizeX, startZ: Math.floor(node / sizeX) }
          setRectanglePreview({ minX: node % sizeX, maxX: node % sizeX, minZ: Math.floor(node / sizeX), maxZ: Math.floor(node / sizeX) })
        }
        return
      }
      eraserDragRef.current = new Set()
      e.currentTarget.setPointerCapture(e.pointerId)
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) {
        for (const n of tilesInRadius(node % sizeX, Math.floor(node / sizeX), brushRadius, sizeX, sizeZ)) {
          eraserDragRef.current.add(n)
        }
      }
      return
    }
    // Same idea while placing/painting objects: a left-button-down here is a
    // paint-stroke candidate, resolved into either a stroke or a single
    // placement by whether it crosses the threshold (see onPointerMove/Up).
    if (placingSid || placingCreatureId || placingZoneSid) {
      paintObjectDragRef.current = { startX: e.clientX, startY: e.clientY, moved: false }
      return
    }
    // A pointerdown directly on an occupied tile (no move/placing/paint
    // already active) is a drag-to-move candidate — real commitment (calling
    // startMove) waits for the same movement threshold as panning below, so
    // a plain click still reaches the icon's own onClick unmolested.
    if (canEditEntities && !moveState) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      const item = node !== null ? primaryByNode.get(node)?.primary : undefined
      if (item) {
        moveDragRef.current = { item, startX: e.clientX, startY: e.clientY, moved: false }
        return
      }
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: transform.x, startTy: transform.y, moved: false, button: 0 }
  }

  // Screen (client) coordinates → world tile node, via the same inverse-
  // transform math zoomAt() uses. Works for every tile in map bounds
  // regardless of occupancy or the icon LOD tier (issue #125) — hover/click
  // no longer depend on a DOM node existing for that specific cell.
  //
  // The .map format's own row-major node numbering (node = z*sizeX+x, per
  // olden_era_map_format.md) puts z=0 at the map's south edge, but this
  // dialog draws screen row 0 at the top — so every conversion between a
  // tile's data z and its on-screen row goes through `sizeZ - 1 - z` (a
  // self-inverse flip, used identically in both directions here and at
  // every z→pixel site below). Without it the grid rendered vertically
  // mirrored versus the real game/map editor (issue #130).
  const screenToNode = useCallback((clientX: number, clientY: number, rect: DOMRect): number | null => {
    const worldX = (clientX - rect.left - transform.x) / transform.scale
    const worldY = (clientY - rect.top - transform.y) / transform.scale
    const x = Math.floor(worldX / BASE_CELL_PX)
    const screenRow = Math.floor(worldY / BASE_CELL_PX)
    const z = sizeZ - 1 - screenRow
    if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return null
    return z * sizeX + x
  }, [transform, sizeX, sizeZ])

  // Same math as screenToNode, but never returns null for an out-of-bounds
  // cursor — Rectangle mode's live preview needs to keep tracking the drag
  // past the map's edge (computeRectangleBounds clamps the result itself),
  // matching how a real rectangle-select tool behaves when you drag off
  // the canvas.
  const screenToTileRaw = useCallback((clientX: number, clientY: number, rect: DOMRect): { x: number; z: number } => {
    const worldX = (clientX - rect.left - transform.x) / transform.scale
    const worldY = (clientY - rect.top - transform.y) / transform.scale
    const x = Math.floor(worldX / BASE_CELL_PX)
    const screenRow = Math.floor(worldY / BASE_CELL_PX)
    const z = sizeZ - 1 - screenRow
    return { x, z }
  }, [transform, sizeZ])

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (rectangleDragRef.current) {
      const drag = rectangleDragRef.current
      const { x, z } = screenToTileRaw(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      setRectanglePreview(computeRectangleBounds(drag.startX, drag.startZ, x, z, e.shiftKey, e.altKey, sizeX, sizeZ))
      return
    }
    if (paintingRef.current && paintBiome !== null) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stagePaintNode(node, paintBiome)
      setHoveredNode(node)
      return
    }
    if (levelPaintingRef.current && levelBrush !== null) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stageLevelNode(node, levelBrush)
      setHoveredNode(node)
      return
    }
    if (roadPaintingRef.current && roadBrush !== null) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stageRoadNode(node, roadBrush)
      setHoveredNode(node)
      return
    }
    if (riverDragRef.current) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null && riverDragRef.current[riverDragRef.current.length - 1] !== node) {
        riverDragRef.current.push(node)
      }
      setHoveredNode(node)
      return
    }
    if (obstacleDragRef.current) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) {
        for (const n of tilesInRadius(node % sizeX, Math.floor(node / sizeX), brushRadius, sizeX, sizeZ)) {
          obstacleDragRef.current.add(n)
        }
      }
      setHoveredNode(node)
      return
    }
    if (eraserDragRef.current) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) {
        for (const n of tilesInRadius(node % sizeX, Math.floor(node / sizeX), brushRadius, sizeX, sizeZ)) {
          eraserDragRef.current.add(n)
        }
      }
      setHoveredNode(node)
      return
    }
    if (moveDragRef.current) {
      const drag = moveDragRef.current
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const rect = e.currentTarget.getBoundingClientRect()
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD_PX) {
          setHoveredNode(screenToNode(e.clientX, e.clientY, rect))
          return
        }
        drag.moved = true
        startMove(drag.item)
        // Without this, an item dragged without first being clicked-to-select
        // never surfaces its Move Save/Cancel controls (the info column only
        // shows them for `selected.key === moveState.key`) — and since the
        // icon onClick guard below is `!moveState`, no other item becomes
        // selectable either once a move starts. That combination was a real
        // dead end: the drag visibly staged nothing reachable, and clicking
        // anything else silently did nothing until Escape (which didn't
        // cancel Move either — see the Escape handler fix below).
        selectNode(drag.item.node)
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      const node = screenToNode(e.clientX, e.clientY, rect)
      if (node !== null && isNodeInBoundsForMove(drag.item, node)) {
        setMoveState((prev) => (prev ? { ...prev, node } : prev))
      }
      setHoveredNode(node)
      return
    }
    if (paintObjectDragRef.current) {
      const drag = paintObjectDragRef.current
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const rect = e.currentTarget.getBoundingClientRect()
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD_PX) {
          setHoveredNode(screenToNode(e.clientX, e.clientY, rect))
          return
        }
        drag.moved = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      // Drag-painting a placed object (map-grid painter, generalized from
      // terrain to any object): stamps a candidate at every newly-crossed
      // tile into paintObjectStaged, same "stage locally, then explicit
      // Save" convention as terrain paint — nothing here writes to disk. A
      // plain (non-dragged) click still falls through to onPointerUp's
      // one-shot immediate placeAt below, unchanged.
      const node = screenToNode(e.clientX, e.clientY, rect)
      if (node !== null && placingSid) stageObjectPaint(node, placingSid)
      setHoveredNode(node)
      return
    }
    const drag = dragRef.current
    if (drag) {
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD_PX) {
          setHoveredNode(screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
          return
        }
        drag.moved = true
        if (drag.button === 1) e.currentTarget.setPointerCapture(e.pointerId)
      }
      // Only the middle-button (pan) gesture actually moves the viewport —
      // a left-button drag that reaches here matched nothing else in
      // onPointerDown (e.g. empty background, no move/placing active), so it
      // deliberately does nothing rather than panning.
      if (drag.button === 1) {
        setTransform((prev) => ({ ...prev, x: drag.startTx + dx, y: drag.startTy + dy }))
        setHoveredNode(null) // suppress hover info while actively panning
      }
      return
    }
    setHoveredNode(screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (rectangleDragRef.current) {
      const drag = rectangleDragRef.current
      const { x, z } = screenToTileRaw(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      const bounds = computeRectangleBounds(drag.startX, drag.startZ, x, z, e.shiftKey, e.altKey, sizeX, sizeZ)
      applyRectangleFill(drag.tool, bounds)
      rectangleDragRef.current = null
      setRectanglePreview(null)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      return
    }
    if (paintingRef.current) {
      paintingRef.current = false
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      commitPaintStroke()
      return
    }
    if (levelPaintingRef.current) {
      levelPaintingRef.current = false
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      commitLevelStroke()
      return
    }
    if (roadPaintingRef.current) {
      roadPaintingRef.current = false
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      commitRoadStroke()
      return
    }
    if (riverDragRef.current) {
      commitRiverStroke(riverDragRef.current)
      riverDragRef.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      return
    }
    if (obstacleDragRef.current) {
      commitObstacleStroke([...obstacleDragRef.current])
      obstacleDragRef.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      return
    }
    if (eraserDragRef.current) {
      commitEraserStroke([...eraserDragRef.current])
      eraserDragRef.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      return
    }
    if (moveDragRef.current) {
      if (moveDragRef.current.moved && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      moveDragRef.current = null
      return
    }
    if (paintObjectDragRef.current) {
      const wasClick = !paintObjectDragRef.current.moved
      if (paintObjectDragRef.current.moved && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      paintObjectDragRef.current = null
      // A plain click (not a paint stroke) while placing a new object commits
      // it immediately and stays in placing mode (issue #167 Phase B) — same
      // "fires on pointerup, not the icon's own onClick" reasoning as Move.
      if (wasClick && placingSid) {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null && isNodeInBoundsForPlacement(placingSid, node)) {
          void placeAt(node)
        }
      } else if (wasClick && placingCreatureId) {
        // Single-click only — a drag here never staged anything (see
        // paintObjectDragRef's onPointerMove branch above), so it simply
        // does nothing on release instead of placing.
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null && placingCreatureTemplateSid && isNodeInBoundsForPlacement(placingCreatureTemplateSid, node)) {
          void placeCreatureAt(node)
        }
      } else if (wasClick && placingZoneSid) {
        // Single-click only, same as placing a creature above — zones have
        // no drag-to-paint.
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) placeZoneAt(node)
      } else if (!wasClick) {
        // An Objects-paint drag stroke — commit the whole accumulated batch now.
        commitObjectPaintStroke()
      }
      return
    }
    const drag = dragRef.current
    const wasClick = !drag?.moved
    if (drag?.moved && drag.button === 1 && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (drag?.button === 1) setIsPanning(false)
    dragRef.current = null
    // A plain click (not a pan) while a move is active relocates immediately
    // — fires here (not the icon cells' own onClick) so it works identically
    // whether the click lands on an empty tile or an occupied one.
    if (wasClick && moveState) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) applyMoveTo(node)
    }
  }
  const onContextMenuViewport = (e: ReactMouseEvent) => {
    if (placingSid) {
      e.preventDefault()
      stopPlacing()
    } else if (placingCreatureId) {
      e.preventDefault()
      stopPlacingCreature()
    }
  }
  const onPointerLeaveViewport = () => setHoveredNode(null)

  const zoomAt = useCallback((cursorX: number, cursorY: number, factor: number) => {
    setTransform((prev) => {
      const newScale = clampScale(prev.scale * factor)
      const worldX = (cursorX - prev.x) / prev.scale
      const worldY = (cursorY - prev.y) / prev.scale
      return { scale: newScale, x: cursorX - worldX * newScale, y: cursorY - worldY * newScale }
    })
  }, [])

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const factor = Math.exp(-e.deltaY * 0.001)
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor)
  }

  const zoomTo100 = useCallback(() => {
    setTransform((prev) => {
      const worldX = (containerSize.width / 2 - prev.x) / prev.scale
      const worldY = (containerSize.height / 2 - prev.y) / prev.scale
      return { scale: 1, x: containerSize.width / 2 - worldX, y: containerSize.height / 2 - worldY }
    })
  }, [containerSize])

  // ── Canvas overview layer — redrawn whenever the occupied set / filter /
  // catalog changes, or whenever the canvas element itself (re)mounts. Same
  // callback-ref reasoning as viewportEl above.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!canvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = canvasEl
    canvas.width = sizeX
    canvas.height = sizeZ
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, sizeX, sizeZ)
    // Base pass: every tile gets its light terrain/water fill, occupied or
    // not — this is what makes the grid readable even with all filters off.
    // An in-progress (not yet committed) Paint Terrain drag stroke wins over
    // the committed tilesMap value — same `terrainFillColor()` call as
    // committed tiles, just fed the in-progress value, so a mid-stroke tile
    // renders pixel-identical to what committing will produce (issue #195
    // Phase 1 pattern). Water has no in-progress buffer — it applies
    // immediately on click, so waterMap already reflects it by the next render.
    const tileCount = sizeX * sizeZ
    if (tilesMap.length === tileCount) {
      for (let node = 0; node < tileCount; node++) {
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        ctx.fillStyle = terrainFillColor(
          paintStaged.get(node) ?? tilesMap[node],
          waterMap[node],
          settings.terrainOpacity,
        )
        ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
      }
    }
    // Occupied-tile pass: opaque group-color swatch on top, as before.
    for (const [node, pick] of primaryByNode) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      ctx.fillStyle = GROUP_COLORS[pick.group]
      ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
    }
    // Road pass: an in-progress (not yet committed) Paint Road drag stroke
    // wins over the committed roadsMap value, same merge-before-render
    // pattern as the base terrain pass above. Roads are meant to read as
    // simple representative lines (not real game graphics — see
    // RawMapBlock2.roadsMap's doc comment), so a solid per-tile fill is
    // enough once several adjacent tiles are painted; skipped on top of an
    // occupied tile so the object swatch above stays legible.
    if (roadsMap.length === tileCount) {
      for (let node = 0; node < tileCount; node++) {
        const roadId = paintRoadStaged.get(node) ?? roadsMap[node]
        if (!roadId || primaryByNode.has(node)) continue
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        ctx.fillStyle = ROAD_BASE_COLORS[roadId] ?? ROAD_BASE_COLORS[1]
        ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
      }
    }
    // River pass: same flat per-tile fill treatment as the road pass above
    // — a solid RIVER_BASE_COLOR fill already reads as a simple line once
    // adjacent tiles are painted, matching the "abstract representative
    // lines, not real game graphics" ask, with no in-progress buffer (a
    // river stroke applies immediately on release, same as Obstacles/Eraser).
    for (const node of riverNodes.keys()) {
      if (primaryByNode.has(node)) continue
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      ctx.fillStyle = RIVER_BASE_COLOR
      ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
    }
    // Elevation tint pass: translucent darker/lighter fill over every
    // level -1 / level 1 tile (src/lib/map-grid/elevation-shading.ts),
    // toggle-gated. On top of the occupied swatch pass (translucent, so the
    // category color underneath stays legible) but before the blocked-tile
    // pass below.
    if (settings.showElevationShading) {
      for (const [node, tint] of elevationTintMap) {
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        ctx.fillStyle = tint === 'lighter' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'
        ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
      }
    }
  }, [
    canvasEl, primaryByNode, tilesMap, waterMap, sizeX, sizeZ, settings.terrainOpacity,
    settings.showElevationShading, elevationTintMap, paintStaged, roadsMap, paintRoadStaged, riverNodes,
  ])

  // ── Blocked-tile overlay canvas — a SEPARATE, top-stacked element (not one
  // more pass on canvasEl above) so the red tint paints over every tile
  // regardless of type, including the ones with a rendered object icon. The
  // icon layer below is DOM, stacked visually on top of canvasEl — a pass
  // added there would still render underneath every icon, which is exactly
  // the "overlay doesn't go on top of the map objects" bug this fixes. This
  // canvas is placed after the icon layer in the JSX instead, so it paints
  // over icons too. Same 1-unit-per-tile pixelated technique, same cheap
  // cost class as every other canvas layer here.
  const [blockedCanvasEl, setBlockedCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!blockedCanvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = blockedCanvasEl
    canvas.width = sizeX
    canvas.height = sizeZ
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, sizeX, sizeZ)
    if (!settings.showBlockedTiles) return
    ctx.fillStyle = 'rgba(220, 38, 38, 0.6)'
    for (const node of blockedTileSet) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
    }
  }, [blockedCanvasEl, sizeX, sizeZ, settings.showBlockedTiles, blockedTileSet])

  // ── Terrain-paint "pending" indicator canvas (issue #167 Phase D, redone
  // for issue #195 Phase 1) — the base canvasEl pass above now already
  // renders a staged tile with its real, final `terrainFillColor()`, so this
  // canvas's only remaining job is marking WHICH tiles are still unsaved, not
  // showing what they'll look like. A flat color fill can't do that without
  // distorting the now-accurate color underneath, so this draws a thin
  // outline instead — which needs sub-tile precision this canvas's siblings
  // don't (they're exactly 1 canvas pixel per tile, CSS-scaled up). Internal
  // resolution is bumped to SUBPX-per-tile just for this canvas; its CSS
  // display size (set in the JSX) stays identical to every other layer, so
  // it still lines up pixel-for-pixel on screen.
  const [paintCanvasEl, setPaintCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!paintCanvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = paintCanvasEl
    const SUBPX = 8
    canvas.width = sizeX * SUBPX
    canvas.height = sizeZ * SUBPX
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (paintStaged.size === 0) return
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.lineWidth = 2
    for (const node of paintStaged.keys()) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      const screenRow = sizeZ - 1 - z
      ctx.strokeRect(x * SUBPX + 1, screenRow * SUBPX + 1, SUBPX - 2, SUBPX - 2)
    }
  }, [paintCanvasEl, sizeX, sizeZ, paintStaged])

  // ── Object-paint "pending" indicator canvas — same outline technique and
  // rationale as the terrain-paint indicator above (issue #195 Phase 1): the
  // real catalog icon for each staged stamp now renders via
  // `stagedObjectPaintIcons` below, so this canvas only needs to mark which
  // tiles are unsaved, not draw a flat placeholder tint over them.
  const [paintObjectCanvasEl, setPaintObjectCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!paintObjectCanvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = paintObjectCanvasEl
    const SUBPX = 8
    canvas.width = sizeX * SUBPX
    canvas.height = sizeZ * SUBPX
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (paintObjectStaged.size === 0) return
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)'
    ctx.lineWidth = 2
    for (const node of paintObjectStaged.keys()) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      const screenRow = sizeZ - 1 - z
      ctx.strokeRect(x * SUBPX + 1, screenRow * SUBPX + 1, SUBPX - 2, SUBPX - 2)
    }
  }, [paintObjectCanvasEl, sizeX, sizeZ, paintObjectStaged])

  // ── Level/Water "pending" indicator canvases (issue #193 Phase 2) — same
  // outline technique as the two above: the real color already renders via
  // the base canvasEl pass (elevationTintMap/terrainFillColor merges above),
  // so these only mark which tiles are unsaved.
  const [paintLevelCanvasEl, setPaintLevelCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!paintLevelCanvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = paintLevelCanvasEl
    const SUBPX = 8
    canvas.width = sizeX * SUBPX
    canvas.height = sizeZ * SUBPX
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (paintLevelStaged.size === 0) return
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.9)'
    ctx.lineWidth = 2
    for (const node of paintLevelStaged.keys()) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      const screenRow = sizeZ - 1 - z
      ctx.strokeRect(x * SUBPX + 1, screenRow * SUBPX + 1, SUBPX - 2, SUBPX - 2)
    }
  }, [paintLevelCanvasEl, sizeX, sizeZ, paintLevelStaged])

  // ── Road "pending" indicator canvas — same outline technique as Level's
  // above: the real color already renders via the road pass on the base
  // canvasEl, so this only marks which tiles are unsaved.
  const [paintRoadCanvasEl, setPaintRoadCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!paintRoadCanvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = paintRoadCanvasEl
    const SUBPX = 8
    canvas.width = sizeX * SUBPX
    canvas.height = sizeZ * SUBPX
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (paintRoadStaged.size === 0) return
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.9)'
    ctx.lineWidth = 2
    for (const node of paintRoadStaged.keys()) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      const screenRow = sizeZ - 1 - z
      ctx.strokeRect(x * SUBPX + 1, screenRow * SUBPX + 1, SUBPX - 2, SUBPX - 2)
    }
  }, [paintRoadCanvasEl, sizeX, sizeZ, paintRoadStaged])

  // Water has no in-progress-stroke outline canvas (unlike Terrain/Level/
  // Objects) — a click applies immediately, so there's nothing pending to
  // outline by the time this would render.

  // ── Windowed DOM layer ──────────────────────────────────────────────────────
  const effectiveCellPx = BASE_CELL_PX * transform.scale
  const showIcons = effectiveCellPx >= ICON_LOD_THRESHOLD_PX

  // "Cell border thickness" was previously a CSS border drawn on the icon
  // cell — but the icon <img> itself was always a fixed 24px regardless of
  // cell size, so what actually reads as a colored border around each icon
  // (the always-on canvas swatch behind it, in the tile's category color,
  // showing through the gap) was never controlled by that setting at all.
  // Fixed by sizing the icon itself relative to the current on-screen cell
  // size instead: 0 thickness now genuinely means "icon fills the entire
  // tile," and shrinking it by `cellBorderThickness` screen pixels per side
  // reveals exactly that much of the swatch color as a frame. Divided by
  // transform.scale because this size is itself a child of the pan/zoom
  // CSS transform — expressing it in these pre-scale units is what keeps
  // the frame a constant physical size on screen at any zoom level, same
  // as the grid-line/map-edge overlays below.
  const iconSize = Math.max(4, BASE_CELL_PX - (2 * settings.cellBorderThickness) / transform.scale)

  const visibleRange = useMemo(
    () => getVisibleRange(
      { translateX: transform.x, translateY: transform.y, scale: transform.scale },
      containerSize,
      { sizeX, sizeZ },
      BASE_CELL_PX,
      OVERDRAW_CELLS,
    ),
    [transform, containerSize, sizeX, sizeZ],
  )

  const visibleCells = useMemo(() => {
    if (!showIcons || sizeX <= 0 || sizeZ <= 0) return []
    const cells: { x: number; z: number; node: number; pick: { primary: PlacedObject; group: GridGroup; count: number } }[] = []
    // visibleRange.zMin/zMax are screen rows (top-down pixel space); convert
    // each to its data z via the same sizeZ-1-z flip used everywhere else.
    for (let screenRow = visibleRange.zMin; screenRow <= visibleRange.zMax; screenRow++) {
      const z = sizeZ - 1 - screenRow
      for (let x = visibleRange.xMin; x <= visibleRange.xMax; x++) {
        const node = z * sizeX + x
        const pick = primaryByNode.get(node)
        if (!pick) continue
        // Multi-tile footprints (issue #167) get one bigger icon spanning
        // their bounding box instead — see multiTileIcons below — so skip
        // them here to avoid rendering the same object once per cell.
        const cells1 = pick.primary.type === 0 ? footprintCellsByKey.get(pick.primary.key) : undefined
        const bounds1 = cells1 ? footprintIconBounds(cells1) : null
        if (bounds1 && (bounds1.maxX > bounds1.minX || bounds1.maxZ > bounds1.minZ)) continue
        cells.push({ x, z, node, pick })
      }
    }
    return cells
  }, [showIcons, visibleRange, sizeX, sizeZ, primaryByNode, footprintCellsByKey])

  // Multi-tile footprint icons (issue #167) — discovered by iterating placed
  // objects directly rather than the node grid, so a large object's bounding
  // box is found by its own extent-vs-viewport intersection regardless of
  // where its anchor tile happens to sit (no OVERDRAW_CELLS bump needed for
  // this, unlike the original plan's assumption — see MapGridDialog's commit
  // notes). Only objects that actually win the stacking pick at their own
  // anchor tile render here, so one 1x1 object sitting exactly on another
  // object's anchor still takes priority the same way primaryByNode already
  // decides everywhere else.
  const multiTileIcons = useMemo(() => {
    if (!showIcons || sizeX <= 0 || sizeZ <= 0) return []
    const icons: {
      key: string
      minX: number; maxX: number; minZ: number; maxZ: number
      screenRowMin: number; screenRowMax: number
      pick: { primary: PlacedObject; group: GridGroup; count: number }
    }[] = []
    for (const obj of placedObjects) {
      if (obj.type !== 0) continue
      const cells = footprintCellsByKey.get(obj.key)
      if (!cells) continue
      const bounds = footprintIconBounds(cells)
      if (!bounds) continue
      if (bounds.maxX === bounds.minX && bounds.maxZ === bounds.minZ) continue // plain 1x1 — handled above
      const pick = primaryByNode.get(obj.node)
      if (!pick || pick.primary.key !== obj.key) continue
      const screenRowMin = sizeZ - 1 - bounds.maxZ
      const screenRowMax = sizeZ - 1 - bounds.minZ
      if (bounds.maxX < visibleRange.xMin || bounds.minX > visibleRange.xMax) continue
      if (screenRowMax < visibleRange.zMin || screenRowMin > visibleRange.zMax) continue
      icons.push({ key: obj.key, ...bounds, screenRowMin, screenRowMax, pick })
    }
    return icons
  }, [showIcons, sizeX, sizeZ, placedObjects, footprintCellsByKey, primaryByNode, visibleRange])

  // Combined, position-sorted render list — plain 1x1 icons and multi-tile
  // bounding boxes together, painted in top-left → bottom-right order
  // (screen row, then x) so overlapping objects layer correctly: whichever
  // is further down/right paints on top, matching how these are visually
  // placed in the real game. Two separate `.map()` passes (multi-tile always
  // fully on top of single-tile, regardless of actual screen position) was
  // the bug this replaces.
  const sortedIconEntries = useMemo(() => {
    const entries: {
      key: string
      left: number; top: number; width: number; height: number
      clickNode: number
      pick: { primary: PlacedObject; group: GridGroup; count: number }
      sortRow: number; sortCol: number
    }[] = []
    for (const c of visibleCells) {
      const screenRow = sizeZ - 1 - c.z
      entries.push({
        key: `s${c.node}`,
        left: c.x * BASE_CELL_PX,
        top: screenRow * BASE_CELL_PX,
        width: BASE_CELL_PX,
        height: BASE_CELL_PX,
        clickNode: c.node,
        pick: c.pick,
        sortRow: screenRow,
        sortCol: c.x,
      })
    }
    for (const m of multiTileIcons) {
      entries.push({
        key: `m${m.key}`,
        left: m.minX * BASE_CELL_PX,
        top: m.screenRowMin * BASE_CELL_PX,
        width: (m.maxX - m.minX + 1) * BASE_CELL_PX,
        height: (m.screenRowMax - m.screenRowMin + 1) * BASE_CELL_PX,
        clickNode: m.pick.primary.node,
        pick: m.pick,
        sortRow: m.screenRowMin,
        sortCol: m.minX,
      })
    }
    entries.sort((a, b) => a.sortRow - b.sortRow || a.sortCol - b.sortCol)
    return entries
  }, [visibleCells, multiTileIcons, sizeZ])

  // Ramp/slope direction arrows — windowed to the viewport the same way
  // visibleCells is, since ramp tiles (unlike the flood-fill tint/overlay
  // canvases) render as small DOM icons, not a canvas fill.
  const visibleRampArrows = useMemo(() => {
    if (!showIcons || !settings.showElevationShading || sizeX <= 0 || sizeZ <= 0) return []
    const arrows: { node: number; x: number; z: number; direction: RampDirection }[] = []
    for (let screenRow = visibleRange.zMin; screenRow <= visibleRange.zMax; screenRow++) {
      const z = sizeZ - 1 - screenRow
      for (let x = visibleRange.xMin; x <= visibleRange.xMax; x++) {
        const node = z * sizeX + x
        const direction = rampDirectionMap.get(node)
        if (direction) arrows.push({ node, x, z, direction })
      }
    }
    return arrows
  }, [showIcons, settings.showElevationShading, visibleRange, sizeX, sizeZ, rampDirectionMap])

  // ── Hover info panel + click-to-edit ────────────────────────────────────────
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const infoNode = hoveredNode
  const infoItems = infoNode !== null ? tileIndex.get(infoNode) ?? [] : []


  // Selection lives in a shared store (not local state) so AppShell's
  // panel-sync broadcast can see it for the undocked cross-window mirror.
  const selectedNode = useMapGridStore((s) => s.selectedNode)
  const columnClosed = useMapGridStore((s) => s.columnClosed)
  const selectNode = useMapGridStore((s) => s.selectNode)
  const closeColumn = useMapGridStore((s) => s.closeColumn)
  const selectedItems = selectedNode !== null ? tileIndex.get(selectedNode) ?? [] : []
  // The cell-info column swaps to a full object browser while this is true
  // (see the column render below), forcing the column open even with no
  // tile selected — declared up here (not alongside the rest of the "Place
  // object" state below) so columnOpen can reference it without a
  // temporal-dead-zone issue.
  const [objectBrowserOpen, setObjectBrowserOpen] = useState(false)
  const columnOpen = (selectedNode !== null && !columnClosed) || objectBrowserOpen

  // Imperatively resized rather than conditionally mounted (same convention
  // as AppShell's sidebar/editor/preview panels) so the Group/Panel tree
  // stays stable across opens/closes within one mount. State-backed (not a
  // plain useRef): closing the Map Grid dialog unmounts this Panel entirely
  // (MapGridDialog itself never unmounts — AppShell always renders it — but
  // it returns null while closed, which does unmount its children), so on
  // reopen a fresh Panel instance mounts with a fresh imperative handle. If
  // `columnOpen` was already true before the close and stays true after, its
  // value never "changes" from React's point of view, so a plain
  // `useEffect(..., [columnOpen])` keyed only on that boolean would never
  // re-fire against the new handle — the same class of stale-effect-on-
  // deferred-mount bug this file has already hit twice for viewportEl/canvasEl
  // (issue #122). Keying the effect on the ref value itself fixes it the same way.
  const [cellColumnPanel, setCellColumnPanel] = useState<PanelImperativeHandle | null>(null)
  useEffect(() => {
    cellColumnPanel?.resize(columnOpen ? '30%' : '0%')
  }, [columnOpen, cellColumnPanel])

  // Rename/set-display-name are docked-only (issue #125 scope decision) —
  // the undocked mirror renders MapGridCellContent without these callbacks.
  const entityUsageListMap = useMemo(() => buildEntityUsageMap(scenario, dialogs), [scenario, dialogs])
  const existingSids = useMemo(() => entities.map((e) => e.sid), [entities])
  const existingSidsAndLocTokens = useMemo(
    () => [...existingSids, ...Object.keys(localization)],
    [existingSids, localization],
  )
  const [renameTarget, setRenameTarget] = useState<MapEntity | null>(null)
  const [displayNameTarget, setDisplayNameTarget] = useState<MapEntity | null>(null)
  const [heroEditorTarget, setHeroEditorTarget] = useState<MapEntity | null>(null)
  // Every edit here applies to the in-memory .map document (applyEdit,
  // above) — nothing needs a real file path until an explicit Save, so a
  // brand-new never-saved map (see create-map.ts) must be fully editable
  // too. Previously required !!mapFilePath as well, a leftover from before
  // the in-memory-document rework when edits wrote straight to disk.
  const canEditEntities = isTauri()

  // issue #195 follow-up: every spawner/entity-property handler below used
  // to write to disk immediately on its own onChange already — that part's
  // unchanged, just now going through the shared in-memory applyEdit
  // wrapper (declared near the top of the component) instead of calling
  // saveMapFile directly.
  const handleSetNoCombineGeometry = (item: PlacedObject, value: boolean) =>
    applyEdit({ kind: 'setNoCombineGeometry', entityType: item.type, entityId: item.id, value }, 'set No Combine Geometry')
  const handleAssignEntitySid = (item: PlacedObject, sid: string) =>
    applyEdit({ kind: 'assignEntitySid', entityType: item.type, entityId: item.id, sid }, 'assign entity SID')
  const handleSetSpawnerPlayerType = (item: PlacedObject, spawnType: 0 | 1 | 2) =>
    applyEdit({ kind: 'setSpawnerPlayerType', entityType: item.type, entityId: item.id, spawnType }, 'set spawner Player type')
  const handleSetSpawnerOwner = (item: PlacedObject, newOwner: number) =>
    applyEdit({ kind: 'swapSpawnerOwner', entityType: item.type, entityId: item.id, newOwner }, 'reassign spawner owner')
  const handleSetCityFaction = (item: PlacedObject, factionSid: string) =>
    applyEdit({ kind: 'setCityFaction', entityType: item.type, entityId: item.id, factionSid }, 'set faction')
  const handleSetCitySpawnHero = (item: PlacedObject, spawnHero: boolean) =>
    applyEdit({ kind: 'setCitySpawnHero', entityType: item.type, entityId: item.id, spawnHero }, 'toggle companion hero')
  const handleSetHeroSid = (item: PlacedObject, heroSid: string) =>
    applyEdit({ kind: 'setHeroSid', entityType: item.type, entityId: item.id, heroSid }, 'set hero')

  const allPortals = useMemo(() => placedObjects.filter((p) => p.portalInfo), [placedObjects])
  const handleSetPortalTarget = (item: PlacedObject, patch: { targetIdx?: number; isActive?: boolean }) =>
    applyEdit({ kind: 'setPortalTarget', entityType: item.type, entityId: item.id, ...patch }, 'set portal target')
  const [highlightedNode, setHighlightedNode] = useState<number | null>(null)

  const handleSetGuardSquad = (item: PlacedObject, unitProps: { sid: string; count: number }[]) =>
    applyEdit({ kind: 'setGuardSquad', entityType: item.type, entityId: item.id, unitProps }, 'set guard squad')
  const handleSetCityGarrison = (item: PlacedObject, sids: string[]) =>
    applyEdit({ kind: 'setCityGarrison', entityType: item.type, entityId: item.id, sids }, 'set city garrison')
  const handleSetRandomSquadValue = (item: PlacedObject, requestedValue: number) =>
    applyEdit({ kind: 'setRandomSquadValue', entityType: item.type, entityId: item.id, requestedValue }, 'set random-squad value')
  const handleSetRewardParams = (item: PlacedObject, parameters: string[]) =>
    applyEdit({ kind: 'setRewardParams', entityType: item.type, entityId: item.id, parameters }, 'set reward params')

  // ── Move (issue #167 Phase A) ───────────────────────────────────────────
  // One active move at a time, keyed by the moving instance's own `key`.
  // Once started, every grid click AND arrow-key press relocates it
  // immediately (issue #195 follow-up — not a "pick then confirm with a
  // separate Save"); move mode stays armed afterward so you can keep trying
  // different spots. See applyMoveTo below.
  const [moveState, setMoveState] = useState<{ key: string; type: 0 | 1 | 2; id: number; sid: string; node: number } | null>(null)

  const startMove = (item: PlacedObject) => {
    setMoveState({ key: item.key, type: item.type, id: item.id, sid: item.sid, node: item.node })
  }
  const cancelMove = () => setMoveState(null)

  // A destination is valid only if the FULL footprint (issue #167's
  // multi-tile footprint work) fits on the map — a multi-tile object can't
  // be nudged/clicked to a spot that would push any part of it off the edge.
  // Markers/squads (type 1/2) have no footprint template, so this reduces to
  // a plain single-tile bounds check for them.
  const isNodeInBoundsForMove = useCallback((state: { type: 0 | 1 | 2; sid: string }, node: number): boolean => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return false
    if (state.type !== 0) return true
    const template = catalog?.mapObjects.find((o) => o.id === state.sid)
    return isFootprintInBounds(computeFootprintTiles(template, x, z), sizeX, sizeZ)
  }, [catalog, sizeX, sizeZ])

  // Relocates the currently-armed move target to `node` immediately (issue
  // #195 follow-up — no more separate Save step). Move mode stays armed
  // afterward so a click or arrow-key press can keep trying different spots,
  // same as before; only the moment each attempt takes effect changed —
  // there's no "staged, discardable" position anymore, only Ctrl+Z. Shared
  // by both the grid click handler (onPointerUp) and arrow-key nudging below.
  const applyMoveTo = useCallback((node: number) => {
    setMoveState((prev) => {
      if (!prev || !isNodeInBoundsForMove(prev, node) || prev.node === node) return prev
      applyEdit({ kind: 'moveObject', entityType: prev.type, entityId: prev.id, newNode: node }, 'move object')
      selectNode(node)
      return { ...prev, node }
    })
  }, [isNodeInBoundsForMove, applyEdit, selectNode])

  // ── Rotate — only `objects[]` (type 0) instances ever carry a rotation.
  // Each click applies one step immediately (issue #195 follow-up) — no
  // local state needed at all, since "current rotation" always reads live
  // from the already-committed item.
  const stepRotate = (item: PlacedObject, delta: 1 | -1) => {
    applyEdit({ kind: 'rotateObject', entityId: item.id, newRotation: stepRotation(item.rotation ?? 0, delta) }, 'rotate object')
  }

  // ── Delete (issue #167 Phase C) ─────────────────────────────────────────
  // Unlike Add/Move/Rotate, a delete still needs a deliberate confirmation
  // step (destructive-action UX guidance from #167's original research) —
  // this is now purely an "are you sure?" UI flag, not a staged edit;
  // confirming applies the delete immediately.
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ key: string; type: 0 | 1 | 2; id: number } | null>(null)
  const startDelete = (item: PlacedObject) => {
    setDeleteConfirmTarget({ key: item.key, type: item.type, id: item.id })
  }
  const cancelDelete = () => setDeleteConfirmTarget(null)
  const confirmDelete = () => {
    if (!deleteConfirmTarget) return
    applyEdit({ kind: 'deleteObject', entityType: deleteConfirmTarget.type, entityId: deleteConfirmTarget.id }, 'delete object')
    setDeleteConfirmTarget(null)
  }
  const deleteTarget = deleteConfirmTarget ? { key: deleteConfirmTarget.key } : null
  const deleteUsageWarnings = useMemo(() => {
    if (!deleteConfirmTarget) return []
    const item = placedObjects.find((o) => o.key === deleteConfirmTarget.key)
    if (!item?.entitySid) return []
    return (entityUsageListMap.get(item.entitySid) ?? []).map(describeEntityUsage)
  }, [deleteConfirmTarget, placedObjects, entityUsageListMap])

  // Arrow-key nudging (per the UX research in issue #167): while a move is
  // active, arrow keys relocate by one tile immediately, same as a click.
  // Ignored while focus is in a text field so it doesn't fight typing
  // elsewhere in the dialog (search box, etc.).
  useEffect(() => {
    if (!open || !moveState) return
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      let dx = 0
      let dz = 0
      if (e.key === 'ArrowUp') dz = 1
      else if (e.key === 'ArrowDown') dz = -1
      else if (e.key === 'ArrowLeft') dx = -1
      else if (e.key === 'ArrowRight') dx = 1
      else return
      e.preventDefault()
      const x = moveState.node % sizeX
      const z = Math.floor(moveState.node / sizeX)
      applyMoveTo((z + dz) * sizeX + (x + dx))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, moveState, sizeX, applyMoveTo])

  // Arrow-key panning — an optional alternative to middle-mouse-button drag.
  // Deliberately disabled while a move is active: the arrow keys relocate it
  // there instead (immediately above), and that takes priority over panning
  // the viewport.
  const PAN_STEP_PX = 60
  useEffect(() => {
    if (!open || moveState) return
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowUp') dy = PAN_STEP_PX
      else if (e.key === 'ArrowDown') dy = -PAN_STEP_PX
      else if (e.key === 'ArrowLeft') dx = PAN_STEP_PX
      else if (e.key === 'ArrowRight') dx = -PAN_STEP_PX
      else return
      e.preventDefault()
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, moveState])

  const moveTarget = moveState
    ? { key: moveState.key, x: moveState.node % sizeX, z: Math.floor(moveState.node / sizeX) }
    : null
  const moveFootprintBounds = useMemo(() => {
    if (!moveState) return null
    const x = moveState.node % sizeX
    const z = Math.floor(moveState.node / sizeX)
    if (moveState.type !== 0) return { minX: x, maxX: x, minZ: z, maxZ: z }
    const template = catalog?.mapObjects.find((o) => o.id === moveState.sid)
    return footprintIconBounds(computeFootprintTiles(template, x, z)) ?? { minX: x, maxX: x, minZ: z, maxZ: z }
  }, [moveState, sizeX, catalog])

  // ── Place object (issue #167 Phase B) ───────────────────────────────────
  // Pick a map-object sid, then every subsequent grid click adds a new
  // instance immediately — unlike Move, this doesn't stage-then-save: each
  // click is its own independent write (fully backed-up/verified by
  // saveMapFile, same as every other edit here), and placing mode stays
  // active afterward so multiple copies can be stamped down in a row.
  // Escape or right-click ends it. Mutually exclusive with Move (the icon
  // click/pointerup guards below key off whichever of the two is active).
  const [placingSid, setPlacingSid] = useState<string | null>(null)
  const stopPlacing = () => {
    setPlacingSid(null)
    setPaintObjectStaged(new Map())
  }
  // Two-stage version for Escape/the "Placing…" button's own click — a
  // switch to a different mode (Paint terrain, place a creature, etc.) still
  // wants the full stopPlacing() above unconditionally. First press only
  // clears any staged drag-paint (stays in placing mode); only a second
  // press (nothing left staged) exits placing mode entirely.
  const stopPlacingOrClearStaged = () => {
    if (paintObjectStaged.size > 0) setPaintObjectStaged(new Map())
    else stopPlacing()
  }

  // ── Place creature (Object Browser "Units" mode) ────────────────────────
  // A picked creature resolves to its dedicated one-unit squad template sid
  // (Core/DB/squads/**/one_tier_units_squads/) — the actual squads[] write
  // uses that template sid, never the creature's own id. Mutually exclusive
  // with placingSid (each pick handler clears the other). Deliberately
  // single-click-only, no drag-to-paint: reuses paintObjectDragRef for its
  // click-vs-drag threshold, but stageObjectPaint is only ever called for
  // placingSid, so a drag while placing a creature just does nothing.
  const [placingCreatureId, setPlacingCreatureId] = useState<string | null>(null)
  const stopPlacingCreature = () => setPlacingCreatureId(null)

  // ── Place zone/marker (issue #193 Phase 3) — thin wrapper on the already-
  // fully-built addMarkerInstance/addMarker write path, which had zero UI
  // anywhere before this. Deliberately single-click-only (like Add object),
  // not a drag stroke — a zone marker is a single simple placement, applied
  // immediately (issue #195 follow-up).
  const [placingZoneSid, setPlacingZoneSid] = useState<string | null>(null)
  const stopPlacingZone = () => setPlacingZoneSid(null)
  const placeZoneAt = (node: number) => {
    if (!placingZoneSid) return
    applyEdit({ kind: 'addMarker', sid: placingZoneSid, node }, 'place zone')
  }
  const placingCreatureTemplateSid = useMemo(() => {
    if (!placingCreatureId) return null
    const creature = catalog?.creatures.find((c) => c.id === placingCreatureId)
    if (!creature) return null
    const template = catalog?.squadTemplates.find((t) => t.unitSids.length === 1 && t.unitSids[0] === creature.id)
    return template?.id ?? null
  }, [placingCreatureId, catalog])
  // The sid currently driving the ghost-preview/bounds-check — whichever
  // placement mode is active. isNodeInBoundsForPlacement/computeFootprintTiles
  // both fall back to a plain 1×1 anchored cell for a sid absent from
  // catalog.mapObjects (every squad template), which is exactly right here.
  const activePlacingSid = placingSid ?? placingCreatureTemplateSid

  const isNodeInBoundsForPlacement = useCallback((sid: string, node: number): boolean => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return false
    const template = catalog?.mapObjects.find((o) => o.id === sid)
    return isFootprintInBounds(computeFootprintTiles(template, x, z), sizeX, sizeZ)
  }, [catalog, sizeX, sizeZ])

  // issue #195 follow-up: applies immediately (a single click was always
  // one addObject edit before any staging concept existed) — isNodeBlockedForObjectPaint
  // is declared below (safe to reference here since placeAt's BODY only
  // runs when actually called from an event handler, well after that
  // `const` exists; unlike a hook's dependency array, this isn't evaluated
  // at placeAt's own definition time), reusing the same blocked-tile check
  // the drag-paint tool already has.
  const placeAt = (node: number) => {
    if (!placingSid || isNodeBlockedForObjectPaint(node)) return
    applyEdit({ kind: 'addObject', entityType: 0, sid: placingSid, node }, 'place object')
  }

  // Squads have no footprint template (always single-tile), so no
  // blocked-tile check — matches this handler's pre-existing behavior.
  const placeCreatureAt = (node: number) => {
    if (!placingCreatureTemplateSid) return
    applyEdit({ kind: 'addObject', entityType: 2, sid: placingCreatureTemplateSid, node }, 'place unit')
  }

  // ── Paint objects (map-grid painter generalized from terrain-only to any
  // placeable object) — dragging while placingSid is active stamps a
  // candidate into paintObjectStaged at every newly-crossed tile (an
  // in-progress stroke, purely local); commitObjectPaintStroke below applies
  // the whole batch the instant the drag ends (issue #195 follow-up — no
  // separate Save click). A tile already blocked (existing object footprint,
  // water, or elevation wall — the same buildBlockedTileSet the red overlay
  // uses, plus whatever THIS stroke has staged so far) can't be painted on
  // at all; an existing non-blocking decorative instance sitting exactly on
  // a paintable tile gets overwritten (deleted, then replaced) on commit.
  const isNodeBlockedForObjectPaint = useCallback((node: number): boolean => {
    if (blockedTileSet.has(node)) return true
    for (const [stagedNode, sid] of paintObjectStaged) {
      for (const cell of objectBlockedCells(sid, stagedNode % sizeX, Math.floor(stagedNode / sizeX), catalog)) {
        if (cell.z * sizeX + cell.x === node) return true
      }
    }
    return false
  }, [blockedTileSet, paintObjectStaged, sizeX, catalog])

  const stageObjectPaint = useCallback((node: number, sid: string) => {
    if (!isNodeInBoundsForPlacement(sid, node) || isNodeBlockedForObjectPaint(node)) return
    if (paintObjectStaged.get(node) === sid) return
    setPaintObjectStaged((prev) => new Map(prev).set(node, sid))
  }, [isNodeInBoundsForPlacement, isNodeBlockedForObjectPaint, paintObjectStaged])

  const commitObjectPaintStroke = useCallback(() => {
    if (paintObjectStaged.size === 0) return
    const additions = [...paintObjectStaged.entries()].map(([node, sid]) => ({ node, sid }))
    const deletions = placedObjects
      .filter((o) => o.type === 0 && paintObjectStaged.has(o.node) && objectBlockedCells(o.sid, o.x, o.z, catalog).length === 0)
      .map((o) => o.id)
    setPaintObjectStaged(new Map())
    applyEdit({ kind: 'paintObjects', additions, deletions }, 'paint objects')
  }, [paintObjectStaged, placedObjects, catalog, applyEdit])

  // ── In-progress-stroke full-fidelity preview (issue #195 Phase 1) —
  // deliberately placed here rather than up near sortedIconEntries, since a
  // useMemo's dependency array is evaluated at THIS render's hook-call time
  // and can't forward-reference moveState/deleteConfirmTarget/
  // paintObjectStaged, all declared earlier in the component body but after
  // sortedIconEntries.

  // Committed objects an in-progress Paint Objects drag stroke will delete
  // on commit — mirrors commitObjectPaintStroke's own `deletions` filter
  // exactly, so the preview can never disagree with what committing produces.
  const stagedPaintObjectDeletionKeys = useMemo(() => {
    const keys = new Set<string>()
    if (paintObjectStaged.size === 0) return keys
    for (const o of placedObjects) {
      if (o.type === 0 && paintObjectStaged.has(o.node) && objectBlockedCells(o.sid, o.x, o.z, catalog).length === 0) {
        keys.add(o.key)
      }
    }
    return keys
  }, [paintObjectStaged, placedObjects, catalog])

  // Staged Paint Objects additions, rendered with their real catalog icon
  // instead of a flat swatch. Bounded by paintObjectStaged.size (a brush
  // stroke, never the whole map), so this stays a small additive DOM layer,
  // not the "one DOM node per map tile" pattern this project avoids.
  // Deliberately single-cell even for a multi-tile template — an accepted
  // simplification for a transient preview; the actual saved placement still
  // renders through the normal committed-object pipeline once saved.
  const stagedObjectPaintIcons = useMemo(() => {
    if (!showIcons || paintObjectStaged.size === 0) return []
    const icons: { key: string; left: number; top: number; sid: string }[] = []
    for (const [node, sid] of paintObjectStaged) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      icons.push({ key: `paintobj${node}`, left: x * BASE_CELL_PX, top: (sizeZ - 1 - z) * BASE_CELL_PX, sid })
    }
    return icons
  }, [showIcons, paintObjectStaged, sizeX, sizeZ])

  // Staged Move destination — same real-icon treatment as a paint-object
  // addition above, so the preview shows where the object will actually
  // land instead of only an outline box (the source tile fades out instead,
  // via isMoveSource in the icon render loop below).
  const stagedMoveIcon = useMemo(() => {
    if (!showIcons || !moveState) return null
    const x = moveState.node % sizeX
    const z = Math.floor(moveState.node / sizeX)
    return { key: `move${moveState.node}`, left: x * BASE_CELL_PX, top: (sizeZ - 1 - z) * BASE_CELL_PX, sid: moveState.sid }
  }, [showIcons, moveState, sizeX, sizeZ])

  useEffect(() => {
    if (!open || (!placingSid && !placingCreatureId && !placingZoneSid && !objectBrowserOpen && paintBiome === null && levelBrush === null && waterBrush === null && roadBrush === null && !riverActive && !obstacleBrushActive && !eraserActive && !moveState)) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Defer to a focused text field's own Escape handling (e.g. the
      // object browser's search popover) — otherwise this would close the
      // whole browser out from under a popover that Radix is already
      // closing on its own, the same "Escape does too much" class of bug
      // just fixed for the dialog itself.
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // moveState checked first: the doc comment on DraggableDialogContent's
      // onEscapeKeyDown ("Escape is reserved for canceling an in-progress
      // Move/Place") was never actually true for Move — this effect's guard
      // above never included moveState, so Escape silently did nothing while
      // a drag-to-move was staged, with no other way to cancel it short of
      // finding its Save/Cancel buttons (which requires it to be selected).
      if (moveState) cancelMove()
      else if (placingSid) stopPlacingOrClearStaged()
      else if (placingCreatureId) stopPlacingCreature()
      else if (placingZoneSid) stopPlacingZone()
      else if (paintBiome !== null) stopPainting()
      else if (levelBrush !== null) stopLevelPainting()
      else if (waterBrush !== null) stopWaterPainting()
      else if (roadBrush !== null) stopRoadPainting()
      else if (riverActive) stopRiverPainting()
      else if (obstacleBrushActive) stopObstaclePainting()
      else if (eraserActive) stopEraser()
      else setObjectBrowserOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, placingSid, placingCreatureId, placingZoneSid, objectBrowserOpen, paintBiome, levelBrush, waterBrush, roadBrush, riverActive, obstacleBrushActive, eraserActive, moveState, paintObjectStaged])

  // Ctrl+Z / Cmd+Z undoes the last edit applied to the in-memory .map
  // document (issue #195 follow-up: useMapDocumentStore's own zundo
  // temporal() covers this now — no local staging state to restore). Shift
  // (or Ctrl+Y) redoes. A separate effect from Escape's above since it
  // needs to listen whenever there's history to undo/redo, independent of
  // which (if any) placing/paint/move mode is currently active.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if ((key !== 'z' && key !== 'y') || !(e.ctrlKey || e.metaKey)) return
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const isRedo = key === 'y' || (key === 'z' && e.shiftKey)
      const temporal = useMapDocumentStore.temporal.getState()
      if (isRedo ? temporal.futureStates.length === 0 : temporal.pastStates.length === 0) return
      e.preventDefault()
      if (isRedo) useMapDocumentStore.getState().redo()
      else useMapDocumentStore.getState().undo()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const placingFootprintBounds = useMemo(() => {
    if (!activePlacingSid || hoveredNode === null) return null
    const x = hoveredNode % sizeX
    const z = Math.floor(hoveredNode / sizeX)
    const template = catalog?.mapObjects.find((o) => o.id === activePlacingSid)
    return footprintIconBounds(computeFootprintTiles(template, x, z)) ?? { minX: x, maxX: x, minZ: z, maxZ: z }
  }, [activePlacingSid, hoveredNode, sizeX, catalog])
  const placingValid = activePlacingSid !== null && hoveredNode !== null && isNodeInBoundsForPlacement(activePlacingSid, hoveredNode)

  // Brush-shape cursor preview (requested follow-up to the brush-radius
  // control) — same gating as the Size stepper's own visibility (Freehand
  // mode, Terrain-non-Bucket/Level/Obstacles): shows the actual circular
  // tilesInRadius() shape centered on the hovered tile, not just a plain
  // single-tile square, so the brush's real footprint is visible before
  // every click/drag rather than only after. Bounded by brushRadius (max
  // 5 -> at most ~69 tiles), a tiny cursor-following set, not a per-map-
  // tile render — doesn't reintroduce the one-DOM-node-per-map-tile
  // pattern this codebase avoids.
  const brushToolActive = interactionMode === 'freehand' && !terrainBucketMode && (paintBiome !== null || levelBrush !== null || roadBrush !== null || obstacleBrushActive || eraserActive)
  const brushPreviewTiles = useMemo(() => {
    if (!brushToolActive || hoveredNode === null) return []
    return tilesInRadius(hoveredNode % sizeX, Math.floor(hoveredNode / sizeX), brushRadius, sizeX, sizeZ)
  }, [brushToolActive, hoveredNode, brushRadius, sizeX, sizeZ])

  const hoveredScreenRow = hoveredNode !== null ? sizeZ - 1 - Math.floor(hoveredNode / sizeX) : null
  const hoveredX = hoveredNode !== null ? hoveredNode % sizeX : null

  if (!open) return null

  return (
    <>
    {/* Inline view, not a modal Dialog — replaces the main editor Group in
        AppShell's layout slot (issue #195 follow-up: the dialog blocked the
        rest of the editor and needed manual resizing to match the window;
        rendering here instead keeps the toolbar reachable and needs no
        resize chrome of its own). AppShell only mounts this component while
        `open` is true, so the `open`-gated effects/guards throughout this
        file (unchanged from the dialog version) still behave correctly. */}
    <div className="h-full flex flex-col overflow-hidden rounded-lg bg-[var(--column-center)] dark:bg-background">
        <div className="relative flex flex-col gap-2 px-4 pt-2.5 pb-2 pr-10 border-b border-border shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-7 w-7"
            title="Close Map Grid"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold shrink-0">
              Map Grid{sizeX > 0 && sizeZ > 0 ? ` — ${sizeX} x ${sizeZ}` : ''}
            </span>
            {/* Browse/Paint mode toggle (issue #193 Phase 1) — labeled, not
                icon-only (mode-switching UX research: redundant text avoids
                "mode error" confusion an icon-only toggle risks). Hidden
                entirely when the map can't be edited — Paint mode has
                nothing to switch to without write access, and Browse's
                filter pills stay the only/default row exactly as before. */}
            {canEditEntities && (
              <div className="flex items-center rounded border border-border p-0.5 shrink-0" data-nodrag>
                <button
                  className={`h-5 px-2 text-xs rounded-sm transition-colors ${
                    gridMode === 'browse' ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    // Deactivate every armed tool on the way out — a
                    // click in Browse mode must always mean "select this
                    // tile," never "paint/fill/place here." Real bug fix:
                    // switching modes previously only swapped which row
                    // rendered, leaving e.g. paintBiome still non-null, so
                    // a click after switching back to Browse could still
                    // trigger a full paint/flood-fill action. Uses the raw
                    // setters (not the stopX() wrappers, several of which
                    // are declared later in the component body than this
                    // callback) and deliberately does NOT clear any staged
                    // Map (paintStaged etc.) — only what's "live-armed,"
                    // so in-progress unsaved work survives a peek at
                    // Browse and back.
                    setPaintBiome(null)
                    setLevelBrush(null)
                    setWaterBrush(null)
                    setObstacleBrushActive(false)
                    setEraserActive(false)
                    setPlacingSid(null)
                    setPlacingCreatureId(null)
                    setPlacingZoneSid(null)
                    setObjectBrowserOpen(false)
                    setGridMode('browse')
                  }}
                >
                  Browse
                </button>
                <button
                  className={`h-5 px-2 text-xs rounded-sm transition-colors ${
                    gridMode === 'paint' ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setGridMode('paint')}
                >
                  Paint
                </button>
              </div>
            )}
            <div className="flex-1" />
            <div className="relative w-64 shrink-0" data-nodrag>
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sid / entity SID / name"
                className="h-6 pl-7 pr-6 text-xs"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6"
                  title="Clear search"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0" data-nodrag>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right shrink-0">
                {Math.round(transform.scale * 100)}%
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Zoom out"
                onClick={() => zoomAt(containerSize.width / 2, containerSize.height / 2, 0.8)}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Zoom in"
                onClick={() => zoomAt(containerSize.width / 2, containerSize.height / 2, 1.25)}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Zoom to 100%"
                onClick={zoomTo100}>
                <Percent className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Fit to window"
                onClick={fitToViewport}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={settings.showBlockedTiles ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                title="Toggle blocked-tile overlay"
                onClick={() => updateSettings({ ...settings, showBlockedTiles: !settings.showBlockedTiles })}
              >
                <Ban className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <MapGridSettingsDialog settings={settings} onChange={updateSettings} />
            </div>
          </div>

          {gridMode === 'paint' && canEditEntities ? (
            /* Paint-mode tool row (issue #193 Phase 1) — relocated Objects +
               Terrain tools from the old row-1 icon cluster, now labeled
               (not icon-only) and set against an amber-tinted row background
               — redundant signaling alongside the header toggle's own color
               change, so Paint mode is never identifiable by icon shape
               alone (mode-switching UX research: minimizes "mode error"
               risk). Behavior is unchanged from before this phase — same
               state, same handlers, same stage-then-Save convention. */
            <div className="flex items-center gap-2 -mx-4 px-4 py-1 bg-amber-500/10 border-y border-amber-500/20" data-nodrag>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-500 shrink-0">Tools:</span>
              {placingSid ? (
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" className="h-6 text-xs gap-1" onClick={stopPlacingOrClearStaged} title="Click to place one, drag to paint several">
                    <Plus className="h-3.5 w-3.5" />
                    Placing… (drag to paint)
                  </Button>
                  {paintObjectStaged.size > 0 && (
                    <p className="text-xs text-amber-600">{paintObjectStaged.size} staged</p>
                  )}
                </div>
              ) : placingCreatureId ? (
                <Button variant="secondary" size="sm" className="h-6 text-xs gap-1" onClick={stopPlacingCreature} title="Click a tile to place">
                  <Plus className="h-3.5 w-3.5" />
                  Placing unit…
                </Button>
              ) : (
                <Button
                  variant={objectBrowserOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 text-xs gap-1"
                  title="Place a new object"
                  onClick={() => { stopPainting(); stopLevelPainting(); stopWaterPainting(); stopRoadPainting(); stopRiverPainting(); stopPlacingZone(); stopObstaclePainting(); stopEraser(); setObjectBrowserOpen((prev) => !prev) }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Objects
                </Button>
              )}
              <div className="w-px h-4 bg-amber-500/30" />
              {paintBiome !== null ? (
                <div className="flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="secondary" size="sm" className="h-6 text-xs gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full border border-border/50"
                          style={{ backgroundColor: BIOME_BASE_COLORS[paintBiome] }}
                        />
                        {BIOME_NAMES[paintBiome]}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-40 p-1" data-nodrag>
                      {PAINT_BIOME_ORDER.map((b) => (
                        <button
                          key={b}
                          className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-accent"
                          onClick={() => setPaintBiome(b)}
                        >
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full border border-border/50"
                            style={{ backgroundColor: BIOME_BASE_COLORS[b] }}
                          />
                          {BIOME_NAMES[b]}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <div className="flex items-center rounded border border-border overflow-hidden">
                    <button
                      className={`h-6 px-2 text-xs transition-colors ${!terrainBucketMode ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent'}`}
                      title="Freehand brush — drag to paint"
                      onClick={() => setTerrainBucketMode(false)}
                    >
                      Brush
                    </button>
                    <button
                      className={`h-6 px-2 text-xs transition-colors ${terrainBucketMode ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent'}`}
                      title="Bucket fill — click to fill the contiguous same-biome region"
                      onClick={() => setTerrainBucketMode(true)}
                    >
                      Bucket
                    </button>
                  </div>
                  {paintStaged.size > 0 && (
                    <p className="text-xs text-amber-600">{paintStaged.size} staged</p>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopPainting}>
                    {paintStaged.size > 0 ? 'Cancel' : 'Stop (Esc)'}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  title="Paint terrain"
                  onClick={() => { stopPlacing(); setObjectBrowserOpen(false); stopLevelPainting(); stopWaterPainting(); stopRoadPainting(); stopRiverPainting(); stopPlacingZone(); stopObstaclePainting(); stopEraser(); setPaintBiome(1) }}
                >
                  <Paintbrush className="h-3.5 w-3.5" />
                  Terrain
                </Button>
              )}
              <div className="w-px h-4 bg-amber-500/30" />
              {/* Level brush (issue #193 Phase 2) — same freehand-stroke
                  staging as Terrain, targeting levelsMap instead of
                  tilesMap. Deliberately no ramp/climbsMap authoring — see
                  paintLevelTiles' doc comment in map-write.ts. */}
              {levelBrush !== null ? (
                <div className="flex items-center gap-1">
                  <div className="flex items-center rounded border border-border overflow-hidden">
                    {([-1, 0, 1] as const).map((lvl) => (
                      <button
                        key={lvl}
                        className={`h-6 px-2 text-xs transition-colors ${
                          levelBrush === lvl ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent'
                        }`}
                        onClick={() => setLevelBrush(lvl)}
                      >
                        {lvl === -1 ? 'Lower' : lvl === 0 ? 'Flat' : 'Higher'}
                      </button>
                    ))}
                  </div>
                  {paintLevelStaged.size > 0 && (
                    <p className="text-xs text-amber-600">{paintLevelStaged.size} staged</p>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopLevelPainting}>
                    {paintLevelStaged.size > 0 ? 'Cancel' : 'Stop (Esc)'}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  title="Paint elevation level"
                  onClick={() => { stopPlacing(); setObjectBrowserOpen(false); stopPainting(); stopWaterPainting(); stopRoadPainting(); stopRiverPainting(); stopPlacingZone(); stopObstaclePainting(); stopEraser(); setLevelBrush(0) }}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Level
                </Button>
              )}
              <div className="w-px h-4 bg-amber-500/30" />
              {/* Water flood-fill (issue #193 Phase 2) — click-to-fill, not
                  a freehand stroke — see applyWaterFill's doc comment. Each
                  click applies immediately (issue #195 follow-up), so
                  there's nothing to Cancel — just Stop to exit the tool. */}
              {waterBrush !== null ? (
                <div className="flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="secondary" size="sm" className="h-6 text-xs gap-1.5">
                        {WATER_TYPE_NAMES[waterBrush]}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-40 p-1" data-nodrag>
                      {WATER_TYPE_ORDER.map((w) => (
                        <button
                          key={w}
                          className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-accent"
                          onClick={() => setWaterBrush(w)}
                        >
                          {WATER_TYPE_NAMES[w]}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopWaterPainting}>
                    Stop (Esc)
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  title="Flood-fill water (click a tile at level 0 or lower)"
                  onClick={() => { stopPlacing(); setObjectBrowserOpen(false); stopPainting(); stopLevelPainting(); stopPlacingZone(); stopObstaclePainting(); stopEraser(); stopRoadPainting(); stopRiverPainting(); setWaterBrush(1) }}
                >
                  <Droplets className="h-3.5 w-3.5" />
                  Water
                </Button>
              )}
              <div className="w-px h-4 bg-amber-500/30" />
              {/* Road brush — same freehand-stroke staging as Level, targeting
                  roadsMap instead of levelsMap. Can freely paint over an
                  existing river node (or vice versa) — a straight road/river
                  crossing needs no special handling, confirmed against real
                  map data (see paintRoadTiles's doc comment). */}
              {roadBrush !== null ? (
                <div className="flex items-center gap-1">
                  <div className="flex items-center rounded border border-border overflow-hidden">
                    {([1, 2] as const).map((r) => (
                      <button
                        key={r}
                        className={`h-6 px-2 text-xs transition-colors ${
                          roadBrush === r ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent'
                        }`}
                        onClick={() => setRoadBrush(r)}
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full border border-border/50 mr-1 align-middle"
                          style={{ backgroundColor: ROAD_BASE_COLORS[r] }}
                        />
                        {ROAD_TYPE_NAMES[r]}
                      </button>
                    ))}
                  </div>
                  {paintRoadStaged.size > 0 && (
                    <p className="text-xs text-amber-600">{paintRoadStaged.size} staged</p>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopRoadPainting}>
                    {paintRoadStaged.size > 0 ? 'Cancel' : 'Stop (Esc)'}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  title="Paint a road (dirt or stone)"
                  onClick={() => { stopPlacing(); setObjectBrowserOpen(false); stopPainting(); stopLevelPainting(); stopWaterPainting(); stopPlacingZone(); stopObstaclePainting(); stopEraser(); stopRiverPainting(); setRoadBrush(1) }}
                >
                  <Milestone className="h-3.5 w-3.5" />
                  Road
                </Button>
              )}
              <div className="w-px h-4 bg-amber-500/30" />
              {/* River — a single-mode tool, ordered-drag path tracing (see
                  riverActive's own doc comment). Can freely cross an existing
                  road tile (or vice versa) — no special handling needed,
                  same as the road/river crossing case confirmed against
                  real map data. */}
              {riverActive ? (
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" className="h-6 text-xs gap-1" disabled>
                    <Waves className="h-3.5 w-3.5" />
                    Drawing…
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopRiverPainting}>
                    Stop (Esc)
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  title="Draw a river — drag to trace a path"
                  onClick={() => { stopPlacing(); setObjectBrowserOpen(false); stopPainting(); stopLevelPainting(); stopWaterPainting(); stopRoadPainting(); stopPlacingZone(); stopObstaclePainting(); stopEraser(); setRiverActive(true) }}
                >
                  <Waves className="h-3.5 w-3.5" />
                  River
                </Button>
              )}
              {fuzzyObstaclePools && (
                <>
                  <div className="w-px h-4 bg-amber-500/30" />
                  {/* Fuzzy obstacle brush (issue #193 Phase 5) — drag (or
                      Rectangle-mode select); every enclosed tile samples a
                      biome-appropriate obstacle/clutter/nothing on release,
                      weighted by distance from the stroke's center, and
                      applies immediately via the same 'paintObjects' edit
                      Objects itself uses (issue #195 follow-up — no staging,
                      nothing to Cancel mid-drag, only Stop to exit the tool). */}
                  {obstacleBrushActive ? (
                    <div className="flex items-center gap-1">
                      <Button variant="secondary" size="sm" className="h-6 text-xs gap-1" disabled>
                        <Mountain className="h-3.5 w-3.5" />
                        Drawing…
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopObstaclePainting}>
                        Stop (Esc)
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      title="Fuzzy obstacle brush — drag to scatter biome-appropriate obstacles/clutter"
                      onClick={() => {
                        stopPlacing(); setObjectBrowserOpen(false); stopPainting(); stopLevelPainting(); stopWaterPainting(); stopRoadPainting(); stopRiverPainting(); stopPlacingZone(); stopEraser()
                        setObstacleBrushActive(true)
                      }}
                    >
                      <Mountain className="h-3.5 w-3.5" />
                      Obstacles
                    </Button>
                  )}
                </>
              )}
              <div className="w-px h-4 bg-amber-500/30" />
              {/* Eraser (issue #195 follow-up) — deletes non-terrain
                  content (objects/units/zones) under the brush; drag
                  (brush-size, via eraserDragRef) or Rectangle-mode select,
                  same as Obstacles above. Applies immediately on release —
                  see commitEraserStroke's own doc comment. */}
              {eraserActive ? (
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" className="h-6 text-xs gap-1" disabled>
                    <Eraser className="h-3.5 w-3.5" />
                    Erasing…
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopEraser}>
                    Stop (Esc)
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  title="Eraser — drag to delete objects/units/zones (not terrain)"
                  onClick={() => {
                    stopPlacing(); setObjectBrowserOpen(false); stopPainting(); stopLevelPainting(); stopWaterPainting(); stopRoadPainting(); stopRiverPainting(); stopPlacingZone(); stopObstaclePainting()
                    setEraserActive(true)
                  }}
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Eraser
                </Button>
              )}
              {catalog && catalog.zoneTemplates.length > 0 && (
                <>
                  <div className="w-px h-4 bg-amber-500/30" />
                  {/* Zones (issue #193 Phase 3) — thin wrapper on the
                      already-fully-built addMarker write path. */}
                  {placingZoneSid ? (
                    <Button variant="secondary" size="sm" className="h-6 text-xs gap-1" onClick={stopPlacingZone} title="Click a tile to place">
                      <SquareDashed className="h-3.5 w-3.5" />
                      Placing {placingZoneSid}…
                    </Button>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" title="Place a zone marker">
                          <SquareDashed className="h-3.5 w-3.5" />
                          Zones
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-48 p-1 max-h-64 overflow-y-auto" data-nodrag>
                        {catalog.zoneTemplates.map((z) => (
                          <button
                            key={z.id}
                            className="flex items-center justify-between gap-2 w-full px-2 py-1 text-xs rounded hover:bg-accent"
                            onClick={() => {
                              stopPlacing(); setObjectBrowserOpen(false); stopPainting(); stopLevelPainting(); stopWaterPainting(); stopRoadPainting(); stopRiverPainting(); stopObstaclePainting(); stopEraser()
                              setPlacingZoneSid(z.id)
                            }}
                          >
                            <span>{z.id}</span>
                            <span className="text-muted-foreground">{z.sizeX}×{z.sizeZ}</span>
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </>
              )}
              {/* Freehand/Rectangle interaction mode (issue #193 Phase 4) —
                  a shared toggle for Terrain/Level/Water, not a separate
                  top-level tool. Only shown once a relevant brush is active,
                  since it has nothing to modify otherwise. */}
              {(paintBiome !== null || levelBrush !== null || waterBrush !== null || roadBrush !== null || obstacleBrushActive || eraserActive) && (
                <>
                  <div className="flex-1" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-500 shrink-0">Mode:</span>
                  <div className="flex items-center rounded border border-border overflow-hidden">
                    <button
                      className={`h-6 px-2 text-xs transition-colors ${interactionMode === 'freehand' ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent'}`}
                      title="Drag to paint tile by tile"
                      onClick={() => setInteractionMode('freehand')}
                    >
                      Freehand
                    </button>
                    <button
                      className={`h-6 px-2 text-xs transition-colors ${interactionMode === 'rectangle' ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent'}`}
                      title="Drag a rectangle — Shift=square, Alt=from center"
                      onClick={() => setInteractionMode('rectangle')}
                    >
                      Rectangle
                    </button>
                  </div>
                </>
              )}
              {/* Brush-size radius (issue #193 punch-list item, never wired
                  up until now) — only meaningful for a freehand per-tile
                  brush: Terrain (non-Bucket), Level, Obstacles. Water is
                  click-to-flood-fill regardless of interactionMode, and
                  Bucket/Rectangle already select their own explicit region,
                  so radius has nothing to modify for either. */}
              {interactionMode === 'freehand' && !terrainBucketMode && (paintBiome !== null || levelBrush !== null || roadBrush !== null || obstacleBrushActive || eraserActive) && (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-500 shrink-0">Size:</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Smaller brush"
                    disabled={brushRadius <= 1}
                    onClick={() => setBrushRadius((r) => Math.max(1, r - 1))}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs tabular-nums w-4 text-center">{brushRadius}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Bigger brush"
                    disabled={brushRadius >= 5}
                    onClick={() => setBrushRadius((r) => Math.min(5, r + 1))}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {/* issue #195 follow-up: every tool here now applies straight
                  to the in-memory .map document — there's no more per-tool
                  or per-dialog "Save to .map" button anywhere in this view.
                  Persisting to disk is exclusively a top-level action (File
                  Menu Save/Ctrl+S/Save As), which also covers the scenario
                  JSON in the same action — see AppShell's dirty-state
                  handling. Cancel/Stop next to each individual tool above
                  still discards just that one tool's own in-progress
                  (not-yet-committed) drag stroke. */}
            </div>
          ) : (
          <div className="flex gap-1 flex-wrap" data-nodrag>
            {GRID_GROUP_ORDER.map((g) => (
              <div key={g} className="flex items-stretch">
                <button
                  onClick={() => toggleGroup(g)}
                  className={`h-6 px-2 text-xs rounded shrink-0 border transition-colors ${
                    g === 'interactables' ? 'rounded-r-none border-r-0' : ''
                  } ${
                    filter[g]
                      ? 'bg-background text-foreground border-border'
                      : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
                  }`}
                  title={`Toggle ${GRID_GROUP_LABELS[g]}`}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: GROUP_COLORS[g], opacity: filter[g] ? 1 : 0.35 }}
                  />
                  {GRID_GROUP_LABELS[g]}
                </button>
                {g === 'interactables' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={`h-6 w-5 flex items-center justify-center rounded-r border transition-colors ${
                          filter[g]
                            ? 'bg-background text-foreground border-border'
                            : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
                        }`}
                        title="Interactables sub-categories"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 space-y-2" data-nodrag>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Sub-categories
                      </p>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="interactable-subcat-all"
                          checked={INTERACTABLE_SUBCATEGORY_ORDER.every((c) => interactableSubFilter[c])}
                          onCheckedChange={(v) => setAllInteractableSubcategories(Boolean(v))}
                        />
                        <Label htmlFor="interactable-subcat-all" className="text-xs cursor-pointer font-medium">
                          All
                        </Label>
                      </div>
                      <div className="border-t border-border pt-2 space-y-2">
                        {INTERACTABLE_SUBCATEGORY_ORDER.map((c) => (
                          <div key={c} className="flex items-center gap-2">
                            <Checkbox
                              id={`interactable-subcat-${c}`}
                              checked={interactableSubFilter[c]}
                              onCheckedChange={() => toggleInteractableSubcategory(c)}
                            />
                            <Label htmlFor={`interactable-subcat-${c}`} className="text-xs cursor-pointer">
                              {INTERACTABLE_SUBCATEGORY_LABELS[c]}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs w-full"
                        onClick={() => setAllInteractableSubcategories(true)}
                      >
                        Reset
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            ))}
            <div className="w-px h-4 bg-border mx-1 self-center" />
            <button
              onClick={toggleEntitySidsOnly}
              className={`h-6 px-2 text-xs rounded shrink-0 border transition-colors ${
                entitySidsOnly
                  ? 'bg-background text-foreground border-border'
                  : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
              }`}
              title="Show only items with a user-defined entity SID"
            >
              Entity SIDs only
            </button>
          </div>
          )}
        </div>

        <Group orientation="horizontal" className="flex-1 min-h-0">
        <Panel id="map-grid-viewport" defaultSize="100%" minSize="40%">
        <div className="relative h-full overflow-hidden bg-muted/30">
          {!context && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Load a .map file to see the grid.
            </div>
          )}

          {context && (sizeX <= 0 || sizeZ <= 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              This map has no known size.
            </div>
          )}

          {context && sizeX > 0 && sizeZ > 0 && (
            <div
              ref={setViewportEl}
              className={`absolute inset-0 touch-none select-none ${
                isPanning || moveState
                  ? 'cursor-move'
                  : placingSid || placingCreatureId || placingZoneSid || paintBiome !== null || levelBrush !== null || waterBrush !== null || roadBrush !== null || riverActive || obstacleBrushActive || eraserActive
                    ? 'cursor-crosshair'
                    : 'cursor-default'
              }`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeaveViewport}
              onWheel={onWheel}
              onContextMenu={onContextMenuViewport}
            >
              <div className="absolute left-0">
                  {settings.showGridNumbers && Array.from(
                      { length: visibleRange.zMax - visibleRange.zMin + 1 },
                      (_, i) => visibleRange.zMin + i,
                  ).map((screenRow) => (
                      <div
                          key={screenRow}
                          className={`absolute left-0 flex items-center justify-end pr-1 pointer-events-none ${TILE_NUMBER_CLASS} ${
                              screenRow === hoveredScreenRow ? 'text-foreground font-semibold' : 'text-muted-foreground'
                          }`}
                          style={{
                              top: transform.y + screenRow * effectiveCellPx,
                              height: effectiveCellPx,
                              width: 24,
                          }}
                      >
                          {sizeZ - 1 - screenRow}
                      </div>
                  ))}
              </div>
              <div className="absolute top-0">
                {settings.showGridNumbers && Array.from(
                    { length: visibleRange.xMax - visibleRange.xMin + 1 },
                    (_, i) => visibleRange.xMin + i,
                ).map((x) => (
                    <div
                        key={x}
                        className={`absolute top-0 flex items-center justify-center pointer-events-none ${TILE_NUMBER_CLASS} ${
                            x === hoveredX ? 'text-foreground font-semibold' : 'text-muted-foreground'
                        }`}
                        style={{
                            left: transform.x + x * effectiveCellPx,
                            width: effectiveCellPx,
                            height: 16,
                        }}
                    >
                        {x}
                    </div>
                ))}
              </div>
              <div
                className="absolute top-0 left-0"
                style={{
                  width: sizeX * BASE_CELL_PX,
                  height: sizeZ * BASE_CELL_PX,
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: '0 0',
                }}
              >
                {/* Overview swatch layer — always present, cheap regardless of map size */}
                <canvas
                  ref={setCanvasEl}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * BASE_CELL_PX,
                    height: sizeZ * BASE_CELL_PX,
                    imageRendering: 'pixelated',
                  }}
                />

                {/* Interactive icon layer — windowed to the visible range, only
                    above the LOD threshold. Single combined, position-sorted
                    list (see sortedIconEntries above) so plain and multi-tile
                    icons paint in one consistent top-left → bottom-right
                    order, instead of two separate passes where one always
                    fully covered the other regardless of actual position. */}
                {showIcons && sortedIconEntries.map((entry) => {
                  const name = entry.pick.primary.displayName || entry.pick.primary.entitySid || entry.pick.primary.sid
                  const visual = resolveGridCellVisual(entry.pick.primary, catalog)
                  const isSingleCell = entry.width === BASE_CELL_PX && entry.height === BASE_CELL_PX
                  const thisIconSize = isSingleCell
                    ? iconSize
                    : Math.max(4, Math.min(entry.width, entry.height) - (2 * settings.cellBorderThickness) / transform.scale)
                  // A hardcoded cursor-pointer here used to win over the
                  // viewport's own mode-aware cursor (move/crosshair)
                  // whenever the pointer sat directly over an icon, since a
                  // more specific element's CSS cursor always wins during hit
                  // -testing. pointer-events-none while a mode is active lets
                  // the viewport's cursor (and its pointer events — the
                  // onClick below already no-ops in every one of these modes
                  // anyway) show through uninterrupted.
                  const modeActive = !!moveState || !!placingSid || !!placingCreatureId || !!placingZoneSid || paintBiome !== null || levelBrush !== null || waterBrush !== null || roadBrush !== null || riverActive || obstacleBrushActive || eraserActive
                  // Staged-edit visual treatment (issue #195 Phase 1) — a
                  // committed icon that a pending edit will remove (Delete,
                  // or a Paint Objects stamp overwriting a decoration) or
                  // relocate (Move, now shown for real at its destination via
                  // stagedMoveIcon below) fades out; a pending Rotate gets a
                  // highlighted ring instead of an actually-rotated icon,
                  // since no committed object visually rotates its icon
                  // either — there's no "final appearance" to preview here,
                  // only a way to mark that a change is pending.
                  const isMoveSource = moveState?.key === entry.pick.primary.key
                  const isDeleting = deleteConfirmTarget?.key === entry.pick.primary.key || stagedPaintObjectDeletionKeys.has(entry.pick.primary.key)
                  return (
                    <div
                      key={entry.key}
                      className={`absolute flex items-center justify-center rounded-sm select-none ${
                        modeActive ? 'pointer-events-none' : 'hover:bg-accent/60 cursor-pointer'
                      }`}
                      style={{
                        left: entry.left,
                        top: entry.top,
                        width: entry.width,
                        height: entry.height,
                        boxSizing: 'border-box',
                        opacity: isDeleting || isMoveSource ? 0.35 : 1,
                        outline: isDeleting ? '2px dashed rgba(220, 38, 38, 0.9)' : undefined,
                        outlineOffset: isDeleting ? '-2px' : undefined,
                      }}
                      onClick={(e) => { e.stopPropagation(); if (!moveState && !placingSid && !placingCreatureId && !placingZoneSid && paintBiome === null && levelBrush === null && waterBrush === null && roadBrush === null && !riverActive && !obstacleBrushActive && !eraserActive) selectNode(entry.clickNode) }}
                    >
                      {visual.kind === 'icon' && <visual.Icon size={thisIconSize} className="shrink-0" />}
                      {visual.kind === 'text' && (
                        <span className="text-[9px] font-semibold leading-none shrink-0">{visual.text}</span>
                      )}
                      {visual.kind === 'catalog' && (
                        <CatalogIcon
                          iconId={entry.pick.primary.sid}
                          name={name}
                          size={thisIconSize}
                          src={settings.iconImagesEnabled ? undefined : null}
                        />
                      )}
                      {visual.kind === 'catalogOverride' && (
                        <CatalogIcon
                          iconId={visual.iconId}
                          name={visual.name}
                          size={thisIconSize}
                          src={settings.iconImagesEnabled ? undefined : null}
                        />
                      )}
                      {entry.pick.primary.spawnerInfo?.owner !== undefined && (
                        <span
                          className="absolute inset-0 flex items-center justify-center font-black leading-none pointer-events-none"
                          style={{
                            fontSize: Math.min(entry.width, entry.height) * 0.7,
                            color: 'white',
                            textShadow: '0 0 3px black, 0 0 3px black, 1px 1px 1px black',
                          }}
                        >
                          {entry.pick.primary.spawnerInfo.owner}
                        </span>
                      )}
                      {entry.pick.count > 1 && (
                        <span className="absolute bottom-0 right-0 text-[9px] leading-none px-0.5 rounded bg-background/90 border border-border">
                          {entry.pick.count}
                        </span>
                      )}
                    </div>
                  )
                })}

                {/* Staged (unsaved) object icons — Paint Objects additions +
                    the Move destination — real catalog icon, dashed outline
                    to mark "pending" (issue #195 Phase 1). Deliberately a
                    thinner render than sortedIconEntries above (no count/
                    owner badge, no multi-tile bounds): these are transient
                    previews of edits that don't exist as PlacedObject rows
                    yet, not committed data going through the same pipeline. */}
                {[...stagedObjectPaintIcons, ...(stagedMoveIcon ? [stagedMoveIcon] : [])].map((icon) => {
                  const visual = resolveGridCellVisual(
                    { key: icon.key, type: 0, id: -1, sid: icon.sid, x: 0, z: 0, node: 0 },
                    catalog,
                  )
                  return (
                    <div
                      key={icon.key}
                      className="absolute flex items-center justify-center rounded-sm select-none pointer-events-none"
                      style={{
                        left: icon.left,
                        top: icon.top,
                        width: BASE_CELL_PX,
                        height: BASE_CELL_PX,
                        boxSizing: 'border-box',
                        outline: '2px dashed rgba(34, 197, 94, 0.9)',
                        outlineOffset: '-2px',
                      }}
                    >
                      {visual.kind === 'icon' && <visual.Icon size={iconSize} className="shrink-0" />}
                      {visual.kind === 'text' && <span className="text-[9px] font-semibold leading-none shrink-0">{visual.text}</span>}
                      {(visual.kind === 'catalog' || visual.kind === 'catalogOverride') && (
                        <CatalogIcon
                          iconId={visual.kind === 'catalogOverride' ? visual.iconId : icon.sid}
                          name={visual.kind === 'catalogOverride' ? visual.name : icon.sid}
                          size={iconSize}
                          src={settings.iconImagesEnabled ? undefined : null}
                        />
                      )}
                    </div>
                  )
                })}

                {/* Ramp/slope direction arrows — purely visual, non-
                    interactive, so a hero-visible ramp tile is legible at a
                    glance instead of just being an unexplained flat/lighter
                    patch in the elevation tint above. */}
                {visibleRampArrows.map(({ node, x, z, direction }) => {
                  const ArrowIcon = RAMP_DIRECTION_ICONS[direction]
                  return (
                    <div
                      key={`ramp${node}`}
                      className="absolute flex items-center justify-center pointer-events-none text-foreground/70"
                      style={{
                        left: x * BASE_CELL_PX,
                        top: (sizeZ - 1 - z) * BASE_CELL_PX,
                        width: BASE_CELL_PX,
                        height: BASE_CELL_PX,
                      }}
                    >
                      <ArrowIcon size={iconSize * 0.6} strokeWidth={2.5} />
                    </div>
                  )
                })}

                {/* Blocked-tile overlay — a separate canvas stacked AFTER the
                    icon layer above, so the red tint paints on top of every
                    tile including occupied ones, not just bare terrain. */}
                <canvas
                  ref={setBlockedCanvasEl}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * BASE_CELL_PX,
                    height: sizeZ * BASE_CELL_PX,
                    imageRendering: 'pixelated',
                  }}
                />

                {/* Terrain-paint preview — staged (unsaved) tiles tinted with
                    their target biome, same stacking as the blocked-tile
                    overlay above. */}
                <canvas
                  ref={setPaintCanvasEl}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * BASE_CELL_PX,
                    height: sizeZ * BASE_CELL_PX,
                    imageRendering: 'pixelated',
                  }}
                />

                {/* Object-paint preview — staged (unsaved) object placements
                    tinted green, same stacking as the other overlays above. */}
                <canvas
                  ref={setPaintObjectCanvasEl}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * BASE_CELL_PX,
                    height: sizeZ * BASE_CELL_PX,
                    imageRendering: 'pixelated',
                  }}
                />

                {/* Level/Water "pending" outline indicators (issue #193
                    Phase 2) — same stacking as the overlays above. */}
                <canvas
                  ref={setPaintLevelCanvasEl}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * BASE_CELL_PX,
                    height: sizeZ * BASE_CELL_PX,
                    imageRendering: 'pixelated',
                  }}
                />

                {/* Road "pending" outline indicator — same stacking as the
                    overlays above. */}
                <canvas
                  ref={setPaintRoadCanvasEl}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * BASE_CELL_PX,
                    height: sizeZ * BASE_CELL_PX,
                    imageRendering: 'pixelated',
                  }}
                />
              </div>

              {/* Grid-line + map-edge overlays live in screen space (outside the
                  scaled content div above), so line/border thickness stays a
                  constant number of physical pixels regardless of zoom instead
                  of scaling with the content. Their extent (map width/height in
                  screen px) is still derived from the transform, so they track
                  pan/zoom exactly. */}
              {settings.showGridLines && (
                <div
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * effectiveCellPx,
                    height: sizeZ * effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    backgroundImage:
                      'linear-gradient(to right, rgba(0,0,0,0.18) 0 1px, transparent 1px 100%),' +
                      'linear-gradient(to bottom, rgba(0,0,0,0.18) 0 1px, transparent 1px 100%)',
                    backgroundSize: `${effectiveCellPx}px ${effectiveCellPx}px`,
                  }}
                />
              )}
              <div
                className="absolute top-0 left-0 pointer-events-none border-2 border-foreground/50"
                style={{
                  width: sizeX * effectiveCellPx,
                  height: sizeZ * effectiveCellPx,
                  transform: `translate(${transform.x}px, ${transform.y}px)`,
                  boxSizing: 'border-box',
                }}
              />

              {/* Connected-portal highlight (issue #127 item 8) — same screen-space
                  technique as the overlays above, so its border stays a constant
                  physical size instead of scaling with zoom. */}
              {highlightedNode !== null && (
                <div
                  className="absolute pointer-events-none rounded-sm border-[3px] border-yellow-400 animate-pulse"
                  style={{
                    left: (highlightedNode % sizeX) * effectiveCellPx,
                    top: (sizeZ - 1 - Math.floor(highlightedNode / sizeX)) * effectiveCellPx,
                    width: effectiveCellPx,
                    height: effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    boxSizing: 'border-box',
                  }}
                />
              )}
              {/* Selected-tile border — light/neutral so it reads distinctly
                  from the blue move-destination preview below even when both
                  show at once (the origin tile stays "selected" while its
                  move destination is staged elsewhere). */}
              {selectedNode !== null && (
                <div
                  className="absolute pointer-events-none rounded-sm border-[3px] border-yellow-200"
                  style={{
                    left: (selectedNode % sizeX) * effectiveCellPx,
                    top: (sizeZ - 1 - Math.floor(selectedNode / sizeX)) * effectiveCellPx,
                    width: effectiveCellPx,
                    height: effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    boxSizing: 'border-box',
                  }}
                />
              )}
              {/* Move destination preview (issue #167 Phase A) — spans the
                  full footprint of the item being moved, not just one tile,
                  so a multi-tile object's real shape/bounds are visible
                  while picking a destination. */}
              {moveFootprintBounds && (
                <div
                  className="absolute pointer-events-none rounded-sm border-[3px] border-blue-400"
                  style={{
                    left: moveFootprintBounds.minX * effectiveCellPx,
                    top: (sizeZ - 1 - moveFootprintBounds.maxZ) * effectiveCellPx,
                    width: (moveFootprintBounds.maxX - moveFootprintBounds.minX + 1) * effectiveCellPx,
                    height: (moveFootprintBounds.maxZ - moveFootprintBounds.minZ + 1) * effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    boxSizing: 'border-box',
                  }}
                />
              )}
              {/* Place-object ghost preview (issue #167 Phase B) — follows
                  the hovered tile, sized to the picked sid's real footprint;
                  red instead of green wherever the footprint won't fit on
                  the map (isNodeInBoundsForPlacement). */}
              {placingFootprintBounds && (
                <div
                  className={`absolute pointer-events-none rounded-sm border-[3px] ${placingValid ? 'border-emerald-400' : 'border-red-500'}`}
                  style={{
                    left: placingFootprintBounds.minX * effectiveCellPx,
                    top: (sizeZ - 1 - placingFootprintBounds.maxZ) * effectiveCellPx,
                    width: (placingFootprintBounds.maxX - placingFootprintBounds.minX + 1) * effectiveCellPx,
                    height: (placingFootprintBounds.maxZ - placingFootprintBounds.minZ + 1) * effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    boxSizing: 'border-box',
                  }}
                />
              )}
              {/* Rectangle-mode live drag preview (issue #193 Phase 4) —
                  same screen-space overlay technique as Move/Place above,
                  amber to match the Paint-mode row's own accent color. */}
              {rectanglePreview && (
                <div
                  className="absolute pointer-events-none rounded-sm border-[3px] border-amber-500"
                  style={{
                    left: rectanglePreview.minX * effectiveCellPx,
                    top: (sizeZ - 1 - rectanglePreview.maxZ) * effectiveCellPx,
                    width: (rectanglePreview.maxX - rectanglePreview.minX + 1) * effectiveCellPx,
                    height: (rectanglePreview.maxZ - rectanglePreview.minZ + 1) * effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    boxSizing: 'border-box',
                  }}
                />
              )}
              {settings.showGridHover && hoveredNode !== null && !brushToolActive && (
                <div
                    className="absolute pointer-events-none rounded-sm border-[2px] border-orange-500/50"
                    style={{
                        left: (hoveredNode % sizeX) * effectiveCellPx,
                        top: (sizeZ - 1 - Math.floor(hoveredNode / sizeX)) * effectiveCellPx,
                        width: effectiveCellPx,
                        height: effectiveCellPx,
                        transform: `translate(${transform.x}px, ${transform.y}px)`,
                        boxSizing: 'border-box',
                    }}
                />
              )}
              {/* Brush-shape cursor preview — one outline square per tile
                  the current brush radius would actually touch, composing
                  the circular shape tilesInRadius() computes (radius 1 is
                  exactly the one-tile square this replaces). */}
              {brushToolActive && brushPreviewTiles.map((node) => (
                <div
                  key={node}
                  className="absolute pointer-events-none border-[2px] border-amber-500/70"
                  style={{
                    left: (node % sizeX) * effectiveCellPx,
                    top: (sizeZ - 1 - Math.floor(node / sizeX)) * effectiveCellPx,
                    width: effectiveCellPx,
                    height: effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    boxSizing: 'border-box',
                  }}
                />
              ))}

              {/* Search-match highlight (issue #130) — one static (non-pulsing)
                  outline per matched node, deliberately distinct from the single
                  pulsing portal-highlight above so a multi-result set stays
                  legible as a set instead of all pulsing in unison. */}
              {Array.from(searchMatchedNodes).map((node) => (
                <div
                  key={node}
                  className="absolute pointer-events-none rounded-sm border-[3px] border-cyan-400"
                  style={{
                    left: (node % sizeX) * effectiveCellPx,
                    top: (sizeZ - 1 - Math.floor(node / sizeX)) * effectiveCellPx,
                    width: effectiveCellPx,
                    height: effectiveCellPx,
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </div>
          )}

          {/* Single shared hover info panel — not one per cell. Shown for every
              tile in bounds, occupied or not (issue #125), prefixed with the
              tile's terrain so an empty tile is still informative. */}
          {infoNode !== null && (
            <div className="absolute bottom-2 left-2 max-w-xs bg-popover border border-border rounded-md shadow-md p-2 text-xs space-y-1 pointer-events-none">
              <p className="font-semibold">
                {terrainLabel(tilesMap, waterMap, infoNode, sizeX, levelsMap, rampDirectionMap.get(infoNode))}
                {infoItems.length > 0 && ` — ${infoItems.length} item${infoItems.length > 1 ? 's' : ''}`}
              </p>
              {infoItems.map((it, i) => (
                <p key={i} className="text-muted-foreground truncate">
                  {it.displayName || it.entitySid || it.sid}
                  {it.type === 2 && ' (unit)'}
                  {it.type === 1 && ' (zone marker)'}
                </p>
              ))}
            </div>
          )}
        </div>
        </Panel>

        <Separator className="w-3 cursor-col-resize rounded-lg bg-transparent hover:bg-black/20 transition-colors duration-150 border-0 focus-visible:outline-none" />

        <Panel
          panelRef={setCellColumnPanel}
          id="map-grid-cell-column"
          defaultSize="0%"
          minSize="20%"
          maxSize="50%"
          collapsedSize="0%"
          collapsible
        >
          <div className="group flex h-full flex-col overflow-hidden border-l border-border bg-card">
            {objectBrowserOpen && !undocked ? (
              <ObjectBrowserPanel
                catalog={catalog}
                placingSid={placingSid}
                onPick={(sid) => { stopPainting(); stopPlacingCreature(); setPlacingSid(sid) }}
                placingCreatureId={placingCreatureId}
                onPickCreature={(id) => { stopPainting(); stopPlacing(); setPlacingCreatureId(id) }}
                onClose={() => setObjectBrowserOpen(false)}
              />
            ) : (
            <>
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
              <span className="text-xs font-semibold text-muted-foreground pl-1">Tile Info</span>
              <div className="flex items-center gap-0.5">
                <UndockButton panelId="mapGridCell" onUndock={() => onUndock?.()} disabled={undocked} />
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Close" onClick={closeColumn}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {undocked ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground gap-2 p-4 text-center">
                  <SquareArrowOutUpRight className="h-4 w-4 opacity-40 shrink-0" />
                  Open in a separate window
                </div>
              ) : selectedNode !== null ? (
                <MapGridCellContent
                  items={selectedItems}
                  terrainLabel={terrainLabel(tilesMap, waterMap, selectedNode, sizeX, levelsMap, rampDirectionMap.get(selectedNode))}
                  catalog={catalog}
                  existingSids={existingSids}
                  onRename={canEditEntities ? setRenameTarget : undefined}
                  onSetDisplayName={canEditEntities ? setDisplayNameTarget : undefined}
                  onEditFullHero={canEditEntities ? setHeroEditorTarget : undefined}
                  onSetNoCombineGeometry={canEditEntities ? handleSetNoCombineGeometry : undefined}
                  onAssignEntitySid={canEditEntities ? handleAssignEntitySid : undefined}
                  onSetSpawnerPlayerType={canEditEntities ? handleSetSpawnerPlayerType : undefined}
                  playersCount={context?.playersCount ?? 0}
                  onSetSpawnerOwner={canEditEntities ? handleSetSpawnerOwner : undefined}
                  onSetCityFaction={canEditEntities ? handleSetCityFaction : undefined}
                  onSetCitySpawnHero={canEditEntities ? handleSetCitySpawnHero : undefined}
                  onSetHeroSid={canEditEntities ? handleSetHeroSid : undefined}
                  allPortals={allPortals}
                  onSetPortalTarget={canEditEntities ? handleSetPortalTarget : undefined}
                  highlightedNode={highlightedNode}
                  onSetHighlightedNode={setHighlightedNode}
                  onSetGuardSquad={canEditEntities ? handleSetGuardSquad : undefined}
                  onSetCityGarrison={canEditEntities ? handleSetCityGarrison : undefined}
                  onSetRandomSquadValue={canEditEntities ? handleSetRandomSquadValue : undefined}
                  onSetRewardParams={canEditEntities ? handleSetRewardParams : undefined}
                  moveTarget={moveTarget}
                  onStartMove={canEditEntities ? startMove : undefined}
                  onCancelMove={canEditEntities ? cancelMove : undefined}
                  onStepRotate={canEditEntities ? stepRotate : undefined}
                  deleteTarget={deleteTarget}
                  deleteUsageWarnings={deleteUsageWarnings}
                  onStartDelete={canEditEntities ? startDelete : undefined}
                  onConfirmDelete={canEditEntities ? confirmDelete : undefined}
                  onCancelDelete={canEditEntities ? cancelDelete : undefined}
                />
              ) : null}
            </div>
            </>
            )}
          </div>
        </Panel>
        </Group>
    </div>

    <RenameEntitySidDialog
      open={renameTarget !== null}
      onOpenChange={(o) => { if (!o) setRenameTarget(null) }}
      entity={renameTarget}
      existingSids={existingSids}
      usageDescriptions={
        renameTarget ? (entityUsageListMap.get(renameTarget.sid) ?? []).map(describeEntityUsage) : []
      }
      mapFilePath={mapFilePath}
    />

    <SetDisplayNameDialog
      open={displayNameTarget !== null}
      onOpenChange={(o) => { if (!o) setDisplayNameTarget(null) }}
      entity={displayNameTarget}
      existingSids={existingSidsAndLocTokens}
      mapFilePath={mapFilePath}
    />

    <HeroEditorDialog
      open={heroEditorTarget !== null}
      onOpenChange={(o) => { if (!o) setHeroEditorTarget(null) }}
      entity={heroEditorTarget}
      existingSids={existingSidsAndLocTokens}
      mapFilePath={mapFilePath}
    />
    </>
  )
}
