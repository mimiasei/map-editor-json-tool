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
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
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
import { terrainFillColor, terrainLabel, BIOME_NAMES, BIOME_BASE_COLORS, type BiomeId } from '@/lib/map-grid/terrain-colors'
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
import { saveMapFile } from '@/lib/map-save'
import { stepRotation } from '@/lib/map-write'
import { logError } from '@/lib/logger'
import UndockButton from '@/components/panels/UndockButton'
import MapGridSettingsDialog, {
  loadMapGridSettings,
  saveMapGridSettings,
} from '@/components/map-grid/MapGridSettingsDialog'
import { ZoomIn, ZoomOut, Maximize2, Percent, X, SquareArrowOutUpRight, Search, ChevronDown, Ban, Plus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Paintbrush } from 'lucide-react'

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
/** Shared styling for both row and column tile-number gutters — everything
 *  except color, which depends on whether this label's row/column is hovered. */
const TILE_NUMBER_CLASS = 'text-[10px] bg-background/80'

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
  const elevationTintMap = useMemo(() => buildElevationTintMap(levelsMap), [levelsMap])

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
  // State-backed (not a plain ref): DraggableDialogContent defers its own
  // layout via internal state that resolves through its own effect, so a
  // plain useEffect here can fire before that resolves and never re-fire once
  // it does (nothing in ITS OWN deps would change). A callback ref, by
  // contrast, is invoked by React exactly when this DOM node mounts, no
  // matter how deeply that mount was deferred by an ancestor.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number; moved: boolean } | null>(null)

  // Drag-to-move (issue #167 punch list "real drag-to-move v2") — a
  // pointerdown directly on an occupied tile's icon records the candidate
  // item here (not yet a move — same click-vs-drag threshold disambiguation
  // dragRef above uses for panning). Crossing CLICK_DRAG_THRESHOLD_PX in
  // onPointerMove is what actually calls startMove and begins live-updating
  // moveState.node under the cursor; releasing without crossing it lets the
  // pointerup's native click reach the icon's own onClick (plain select),
  // completely unchanged from before this feature existed.
  const moveDragRef = useRef<{ item: PlacedObject; startX: number; startY: number; moved: boolean } | null>(null)

  // Staged (unsaved) object-paint placements — declared up here, ahead of
  // both its own preview-canvas effect and the "Place object" section below
  // that populates it, since a dependency array (unlike a plain closure
  // reference inside a handler body) is evaluated at this render's hook-call
  // time, not deferred until later — so it needs the binding to already
  // exist by then.
  const [paintObjectStaged, setPaintObjectStaged] = useState<Map<number, string>>(new Map())

  // ── Paint terrain (issue #167 Phase D) ──────────────────────────────────
  // Repaints tilesMap's biome only — never touches objects[]/squads[]/
  // markers[]/any objectsProperties.* table (a different top-level array
  // entirely), so by construction this can't affect a placed object. One
  // tool active at a time: activating this stops Place/the object browser
  // (below), and picking a sid to place stops this (see stopPainting call
  // sites). A whole drag stroke accumulates into one staged batch — nothing
  // written until Save, same "stage locally, then explicit Save to .map"
  // convention as Move/Add/Delete/Rotate — so one file write covers the
  // whole stroke, not one per tile dragged over. Declared this early (ahead
  // of onPointerDown/Move/Up and the paint-preview canvas effect below,
  // which both reference it) to avoid a temporal-dead-zone reference.
  const [paintBiome, setPaintBiome] = useState<BiomeId | null>(null)
  const [paintStaged, setPaintStaged] = useState<Map<number, BiomeId>>(new Map())
  const paintingRef = useRef(false)

  const stopPainting = () => {
    setPaintBiome(null)
    setPaintStaged(new Map())
  }
  const stagePaintNode = useCallback((node: number, biomeId: BiomeId) => {
    setPaintStaged((prev) => {
      if (prev.get(node) === biomeId) return prev
      const next = new Map(prev)
      next.set(node, biomeId)
      return next
    })
  }, [])
  const savePaint = async () => {
    if (paintStaged.size === 0 || !mapFilePath) return
    const changes = [...paintStaged.entries()].map(([node, biomeId]) => ({ node, biomeId }))
    try {
      await saveMapFile(mapFilePath, { kind: 'paintTerrain', changes })
      setPaintStaged(new Map())
    } catch (e) {
      logError(`Failed to paint terrain: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

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
    if (e.button !== 0) return
    // Paint mode replaces panning entirely while active — a pointer-down
    // starts a paint stroke (captured so it continues even if the cursor
    // briefly leaves the canvas), not a viewport drag.
    if (paintBiome !== null) {
      paintingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stagePaintNode(node, paintBiome)
      return
    }
    // A pointerdown directly on an occupied tile (no move/placing/paint
    // already active) is a drag-to-move candidate — real commitment (calling
    // startMove) waits for the same movement threshold as panning below, so
    // a plain click still reaches the icon's own onClick unmolested.
    if (canEditEntities && !moveState && !placingSid) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      const item = node !== null ? primaryByNode.get(node)?.primary : undefined
      if (item) {
        moveDragRef.current = { item, startX: e.clientX, startY: e.clientY, moved: false }
        return
      }
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: transform.x, startTy: transform.y, moved: false }
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

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (paintingRef.current && paintBiome !== null) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null) stagePaintNode(node, paintBiome)
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
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      const node = screenToNode(e.clientX, e.clientY, rect)
      if (node !== null && isNodeInBoundsForMove(drag.item, node)) {
        setMoveState((prev) => (prev ? { ...prev, node } : prev))
      }
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
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      // Drag-painting a placed object (map-grid painter, generalized from
      // terrain to any object): stamps a candidate at every newly-crossed
      // tile into paintObjectStaged, same "stage locally, then explicit
      // Save" convention as terrain paint — nothing here writes to disk. A
      // plain (non-dragged) click still falls through to onPointerUp's
      // one-shot immediate placeAt below, unchanged.
      if (placingSid) {
        const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        if (node !== null) stageObjectPaint(node, placingSid)
        setHoveredNode(node)
        return
      }
      setTransform((prev) => ({ ...prev, x: drag.startTx + dx, y: drag.startTy + dy }))
      setHoveredNode(null) // suppress hover info while actively panning
      return
    }
    setHoveredNode(screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (paintingRef.current) {
      paintingRef.current = false
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
    const wasClick = !dragRef.current?.moved
    if (dragRef.current?.moved) e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
    // A plain click (not a pan) while a move is active updates the staged
    // destination — fires here (not the icon cells' own onClick) so it works
    // identically whether the click lands on an empty tile or an occupied one.
    if (wasClick && moveState) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null && isNodeInBoundsForMove(moveState, node)) {
        setMoveState((prev) => (prev ? { ...prev, node } : prev))
      }
    }
    // A plain click while placing a new object commits it immediately and
    // stays in placing mode (issue #167 Phase B) — same "fires on pointerup,
    // not the icon's own onClick" reasoning as Move above.
    if (wasClick && placingSid) {
      const node = screenToNode(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
      if (node !== null && isNodeInBoundsForPlacement(placingSid, node)) {
        void placeAt(node)
      }
    }
  }
  const onContextMenuViewport = (e: ReactMouseEvent) => {
    if (placingSid) {
      e.preventDefault()
      stopPlacing()
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
    const tileCount = sizeX * sizeZ
    if (tilesMap.length === tileCount) {
      for (let node = 0; node < tileCount; node++) {
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        ctx.fillStyle = terrainFillColor(tilesMap[node], waterMap[node], settings.terrainOpacity)
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
    settings.showElevationShading, elevationTintMap,
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

  // ── Terrain-paint preview canvas (issue #167 Phase D) — same "separate,
  // top-stacked canvas painted after the icon layer" technique as the
  // blocked-tile overlay above, so the preview tint is visible over icons
  // too. Shows the STAGED (not yet saved) biome for every touched tile —
  // the "see it before it's real" feedback Move/Add's ghost previews
  // already establish for their own tools.
  const [paintCanvasEl, setPaintCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!paintCanvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = paintCanvasEl
    canvas.width = sizeX
    canvas.height = sizeZ
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, sizeX, sizeZ)
    if (paintStaged.size === 0) return
    ctx.globalAlpha = 0.55
    for (const [node, biomeId] of paintStaged) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      ctx.fillStyle = BIOME_BASE_COLORS[biomeId]
      ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
    }
    ctx.globalAlpha = 1
  }, [paintCanvasEl, sizeX, sizeZ, paintStaged])

  // ── Object-paint preview canvas — same technique as the terrain-paint
  // preview above, one flat tint per staged tile (not the real catalog icon;
  // a lighter-weight stand-in given a stroke can stage many tiles at once).
  const [paintObjectCanvasEl, setPaintObjectCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!paintObjectCanvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = paintObjectCanvasEl
    canvas.width = sizeX
    canvas.height = sizeZ
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, sizeX, sizeZ)
    if (paintObjectStaged.size === 0) return
    ctx.globalAlpha = 0.55
    ctx.fillStyle = 'rgba(34, 197, 94, 1)'
    for (const node of paintObjectStaged.keys()) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
    }
    ctx.globalAlpha = 1
  }, [paintObjectCanvasEl, sizeX, sizeZ, paintObjectStaged])

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
  const canEditEntities = isTauri() && !!mapFilePath

  const handleSetNoCombineGeometry = async (item: PlacedObject, value: boolean) => {
    if (!mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'setNoCombineGeometry', entityType: item.type, entityId: item.id, value })
    } catch (e) {
      logError(`Failed to set No Combine Geometry: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleAssignEntitySid = async (item: PlacedObject, sid: string) => {
    if (!mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'assignEntitySid', entityType: item.type, entityId: item.id, sid })
    } catch (e) {
      logError(`Failed to assign entity SID: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleSetSpawnerPlayerType = async (item: PlacedObject, spawnType: 0 | 1 | 2) => {
    if (!mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'setSpawnerPlayerType', entityType: item.type, entityId: item.id, spawnType })
    } catch (e) {
      logError(`Failed to set spawner Player type: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const allPortals = useMemo(() => placedObjects.filter((p) => p.portalInfo), [placedObjects])
  const handleSetPortalTarget = async (item: PlacedObject, patch: { targetIdx?: number; isActive?: boolean }) => {
    if (!mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'setPortalTarget', entityType: item.type, entityId: item.id, ...patch })
    } catch (e) {
      logError(`Failed to set portal target: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const [highlightedNode, setHighlightedNode] = useState<number | null>(null)

  const handleSetGuardSquad = async (item: PlacedObject, unitProps: { sid: string; count: number }[]) => {
    if (!mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'setGuardSquad', entityType: item.type, entityId: item.id, unitProps })
    } catch (e) {
      logError(`Failed to set guard squad: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const handleSetCityGarrison = async (item: PlacedObject, sids: string[]) => {
    if (!mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'setCityGarrison', entityType: item.type, entityId: item.id, sids })
    } catch (e) {
      logError(`Failed to set city garrison: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const handleSetRewardParams = async (item: PlacedObject, parameters: string[]) => {
    if (!mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'setRewardParams', entityType: item.type, entityId: item.id, parameters })
    } catch (e) {
      logError(`Failed to set reward params: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Move (issue #167 Phase A) ───────────────────────────────────────────
  // One active move at a time, keyed by the moving instance's own `key`.
  // Once started, every grid click AND arrow-key press updates the staged
  // destination (not a one-shot "pick then confirm") — nothing is written
  // until an explicit Save, the same "stage locally, then Save to .map"
  // convention issue #125's spawner Player-type edit established.
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

  const saveMove = async () => {
    if (!moveState || !mapFilePath) return
    const { type, id, node } = moveState
    try {
      await saveMapFile(mapFilePath, { kind: 'moveObject', entityType: type, entityId: id, newNode: node })
      setMoveState(null)
      // Follow the moved instance to its new tile (per issue #167's "Impact
      // on the rest of the editor" note: selectedNode is a tile index chosen
      // before the edit, not an identity — it needs an explicit retarget).
      selectNode(node)
    } catch (e) {
      logError(`Failed to move object: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Rotate — same "stage locally, then explicit Save to .map" convention
  // as Move/Delete. Only `objects[]` (type 0) instances ever carry a
  // rotation. Stepping the left/right arrow both starts staging (from the
  // instance's current rotation) if it isn't already, and applies one step —
  // there's no separate "enter rotate mode" click, unlike Move (which needs
  // a mode to pick a destination on the grid) or Delete (whose confirmation
  // copy deliberately needs a pause before committing).
  const [rotateState, setRotateState] = useState<{ key: string; id: number; rotation: number } | null>(null)
  const stepRotate = (item: PlacedObject, delta: 1 | -1) => {
    setRotateState((prev) => {
      const current = prev?.key === item.key ? prev.rotation : (item.rotation ?? 0)
      return { key: item.key, id: item.id, rotation: stepRotation(current, delta) }
    })
  }
  const cancelRotate = () => setRotateState(null)
  const saveRotate = async () => {
    if (!rotateState || !mapFilePath) return
    const { id, rotation } = rotateState
    try {
      await saveMapFile(mapFilePath, { kind: 'rotateObject', entityId: id, newRotation: rotation })
      setRotateState(null)
    } catch (e) {
      logError(`Failed to rotate object: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Delete (issue #167 Phase C) ─────────────────────────────────────────
  // Same "stage locally, then explicit Save to .map" convention as Move —
  // unlike Add, a delete's confirmation copy should be more deliberate
  // (destructive-action UX guidance from #167's original research), so
  // there's real value in a staged, cancelable window rather than
  // committing on the first click.
  const [deleteState, setDeleteState] = useState<{ key: string; type: 0 | 1 | 2; id: number } | null>(null)
  const startDelete = (item: PlacedObject) => {
    setDeleteState({ key: item.key, type: item.type, id: item.id })
  }
  const cancelDelete = () => setDeleteState(null)
  const saveDelete = async () => {
    if (!deleteState || !mapFilePath) return
    const { type, id } = deleteState
    try {
      await saveMapFile(mapFilePath, { kind: 'deleteObject', entityType: type, entityId: id })
      setDeleteState(null)
    } catch (e) {
      logError(`Failed to delete object: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const deleteTarget = deleteState ? { key: deleteState.key } : null
  const deleteUsageWarnings = useMemo(() => {
    if (!deleteState) return []
    const item = placedObjects.find((o) => o.key === deleteState.key)
    if (!item?.entitySid) return []
    return (entityUsageListMap.get(item.entitySid) ?? []).map(describeEntityUsage)
  }, [deleteState, placedObjects, entityUsageListMap])

  // Arrow-key nudging (per the UX research in issue #167): while a move is
  // active, arrow keys adjust the staged destination by one tile — cheap,
  // precise (positions here are always whole-tile), and an alternative to
  // clicking a destination on the grid rather than a replacement for it.
  // Ignored while focus is in a text field so it doesn't fight typing
  // elsewhere in the dialog (search box, staged-edit inputs, etc.).
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
      setMoveState((prev) => {
        if (!prev) return prev
        const x = prev.node % sizeX
        const z = Math.floor(prev.node / sizeX)
        const newNode = (z + dz) * sizeX + (x + dx)
        if (!isNodeInBoundsForMove(prev, newNode)) return prev
        return { ...prev, node: newNode }
      })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, moveState, sizeX, isNodeInBoundsForMove])

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

  const isNodeInBoundsForPlacement = useCallback((sid: string, node: number): boolean => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return false
    const template = catalog?.mapObjects.find((o) => o.id === sid)
    return isFootprintInBounds(computeFootprintTiles(template, x, z), sizeX, sizeZ)
  }, [catalog, sizeX, sizeZ])

  const placeAt = async (node: number) => {
    if (!placingSid || !mapFilePath) return
    try {
      await saveMapFile(mapFilePath, { kind: 'addObject', entityType: 0, sid: placingSid, node })
    } catch (e) {
      logError(`Failed to place object: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Paint objects (map-grid painter generalized from terrain-only to any
  // placeable object) — dragging while placingSid is active stamps a
  // candidate into paintObjectStaged at every newly-crossed tile instead of
  // placing immediately, same staged-then-explicit-Save convention terrain
  // paint established. A tile already blocked (existing object footprint,
  // water, or elevation wall — the same buildBlockedTileSet the red overlay
  // uses, plus whatever THIS stroke has staged so far) can't be painted on
  // at all; an existing non-blocking decorative instance sitting exactly on
  // a paintable tile gets overwritten (deleted, then replaced) on Save —
  // see savePaintObjects.
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
    setPaintObjectStaged((prev) => (prev.get(node) === sid ? prev : new Map(prev).set(node, sid)))
  }, [isNodeInBoundsForPlacement, isNodeBlockedForObjectPaint])

  const savePaintObjects = async () => {
    if (paintObjectStaged.size === 0 || !mapFilePath) return
    const additions = [...paintObjectStaged.entries()].map(([node, sid]) => ({ node, sid }))
    const deletions = placedObjects
      .filter((o) => o.type === 0 && paintObjectStaged.has(o.node) && objectBlockedCells(o.sid, o.x, o.z, catalog).length === 0)
      .map((o) => o.id)
    try {
      await saveMapFile(mapFilePath, { kind: 'paintObjects', additions, deletions })
      setPaintObjectStaged(new Map())
    } catch (e) {
      logError(`Failed to paint objects: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    if (!open || (!placingSid && !objectBrowserOpen && paintBiome === null)) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Defer to a focused text field's own Escape handling (e.g. the
      // object browser's search popover) — otherwise this would close the
      // whole browser out from under a popover that Radix is already
      // closing on its own, the same "Escape does too much" class of bug
      // just fixed for the dialog itself.
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (placingSid) stopPlacing()
      else if (paintBiome !== null) stopPainting()
      else setObjectBrowserOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, placingSid, objectBrowserOpen, paintBiome])

  const placingFootprintBounds = useMemo(() => {
    if (!placingSid || hoveredNode === null) return null
    const x = hoveredNode % sizeX
    const z = Math.floor(hoveredNode / sizeX)
    const template = catalog?.mapObjects.find((o) => o.id === placingSid)
    return footprintIconBounds(computeFootprintTiles(template, x, z)) ?? { minX: x, maxX: x, minZ: z, maxZ: z }
  }, [placingSid, hoveredNode, sizeX, catalog])
  const placingValid = placingSid !== null && hoveredNode !== null && isNodeInBoundsForPlacement(placingSid, hoveredNode)

  const hoveredScreenRow = hoveredNode !== null ? sizeZ - 1 - Math.floor(hoveredNode / sizeX) : null
  const hoveredX = hoveredNode !== null ? hoveredNode % sizeX : null

  if (!open) return null

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={900}
        defaultHeight={650}
        minWidth={500}
        minHeight={360}
        storageKey="map-grid"
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Escape is reserved for canceling an in-progress Move/Place (the
        // window keydown handlers above) — it should never also close the
        // whole dialog underneath whatever it just canceled. Close via the
        // [X] button or the toolbar toggle instead.
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Map Grid</DialogTitle>

        {/* pr-10 clears the dialog's own [X] close button, which is absolutely
            positioned top-right independent of this row's flow — without it,
            wrapped content here can sit underneath and silently eat clicks. */}
        <DraggableDialogDragHandle className="flex flex-col gap-2 px-4 pt-2.5 pb-2 pr-10 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold shrink-0">
              Map Grid{sizeX > 0 && sizeZ > 0 ? ` — ${sizeX} x ${sizeZ}` : ''}
            </span>
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
              {canEditEntities && (
                placingSid ? (
                  <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="h-6 text-xs gap-1" onClick={stopPlacing} title="Click to place one, drag to paint several">
                      <Plus className="h-3.5 w-3.5" />
                      Placing… (drag to paint)
                    </Button>
                    {paintObjectStaged.size > 0 && (
                      <>
                        <p className="text-xs text-amber-600">{paintObjectStaged.size} staged</p>
                        <Button size="sm" className="h-6 text-xs" onClick={savePaintObjects}>
                          Save to .map
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <Button
                    variant={objectBrowserOpen ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-6 w-6"
                    title="Place a new object"
                    onClick={() => { stopPainting(); setObjectBrowserOpen((prev) => !prev) }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )
              )}
              {canEditEntities && (
                paintBiome !== null ? (
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
                    {paintStaged.size > 0 && (
                      <>
                        <p className="text-xs text-amber-600">{paintStaged.size} staged</p>
                        <Button size="sm" className="h-6 text-xs" onClick={savePaint}>
                          Save to .map
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopPainting}>
                      {paintStaged.size > 0 ? 'Cancel' : 'Stop (Esc)'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Paint terrain"
                    onClick={() => { stopPlacing(); setObjectBrowserOpen(false); setPaintBiome(1) }}
                  >
                    <Paintbrush className="h-3.5 w-3.5" />
                  </Button>
                )
              )}
              <div className="w-px h-4 bg-border mx-1" />
              <MapGridSettingsDialog settings={settings} onChange={updateSettings} />
            </div>
          </div>

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
        </DraggableDialogDragHandle>

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
              className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none select-none"
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
                  return (
                    <div
                      key={entry.key}
                      className="absolute flex items-center justify-center hover:bg-accent/60 rounded-sm cursor-pointer select-none"
                      style={{
                        left: entry.left,
                        top: entry.top,
                        width: entry.width,
                        height: entry.height,
                        boxSizing: 'border-box',
                      }}
                      onClick={(e) => { e.stopPropagation(); if (!moveState && !placingSid && paintBiome === null) selectNode(entry.clickNode) }}
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
                      {entry.pick.count > 1 && (
                        <span className="absolute bottom-0 right-0 text-[9px] leading-none px-0.5 rounded bg-background/90 border border-border">
                          {entry.pick.count}
                        </span>
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
              {settings.showGridHover && hoveredNode !== null && (
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
                onPick={(sid) => { stopPainting(); setPlacingSid(sid) }}
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
                  allPortals={allPortals}
                  onSetPortalTarget={canEditEntities ? handleSetPortalTarget : undefined}
                  highlightedNode={highlightedNode}
                  onSetHighlightedNode={setHighlightedNode}
                  onSetGuardSquad={canEditEntities ? handleSetGuardSquad : undefined}
                  onSetCityGarrison={canEditEntities ? handleSetCityGarrison : undefined}
                  onSetRewardParams={canEditEntities ? handleSetRewardParams : undefined}
                  moveTarget={moveTarget}
                  onStartMove={canEditEntities ? startMove : undefined}
                  onSaveMove={canEditEntities ? saveMove : undefined}
                  onCancelMove={canEditEntities ? cancelMove : undefined}
                  rotateTarget={rotateState}
                  onStepRotate={canEditEntities ? stepRotate : undefined}
                  onSaveRotate={canEditEntities ? saveRotate : undefined}
                  onCancelRotate={canEditEntities ? cancelRotate : undefined}
                  deleteTarget={deleteTarget}
                  deleteUsageWarnings={deleteUsageWarnings}
                  onStartDelete={canEditEntities ? startDelete : undefined}
                  onSaveDelete={canEditEntities ? saveDelete : undefined}
                  onCancelDelete={canEditEntities ? cancelDelete : undefined}
                />
              ) : null}
            </div>
            </>
            )}
          </div>
        </Panel>
        </Group>
      </DraggableDialogContent>
    </Dialog>

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
