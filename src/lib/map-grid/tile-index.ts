// ─── Map grid — tile index & category grouping ──────────────────────────────
// Pure, framework-free logic (issue #122 Phase 1) — no React, so this is
// reusable by both the grid dialog's rendering and any future click-to-edit
// handler without re-deriving anything.

import type { PlacedObject } from '@/types/map-context'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles, type FootprintCell } from '@/lib/map-grid/footprint'

// ─── User-facing groups ───────────────────────────────────────────────────────
// Collapses the 9 raw CatalogMapObject categories + squads + markers into the
// 7 groups requested for filtering, in stacking-priority order (index 0 wins
// ties against every group after it). `markers` (type 1) are "trigger
// zones" per the official guide — a real, uniform, functional concept (see
// issue #130's investigation), not decorative — so they get their own
// lowest-priority group rather than being excluded outright.

export type GridGroup = 'units' | 'artifacts' | 'spawners' | 'interactables' | 'resources' | 'decorations' | 'zones'

export const GRID_GROUP_ORDER: GridGroup[] = [
  'units', 'artifacts', 'spawners', 'interactables', 'resources', 'decorations', 'zones',
]

export const GRID_GROUP_LABELS: Record<GridGroup, string> = {
  units: 'Units',
  artifacts: 'Artifact pickups',
  spawners: 'Spawners',
  interactables: 'Interactables',
  resources: 'Resource piles',
  decorations: 'Decorations',
  zones: 'Zones',
}

const CATEGORY_TO_GROUP: Record<CatalogMapObject['category'], GridGroup> = {
  artifacts: 'artifacts',
  spawns: 'spawners',
  interactables: 'interactables',
  resources: 'resources',
  environments: 'decorations',
  animals: 'decorations',
  fxs: 'decorations',
  test: 'decorations',
  blocks: 'decorations',
}

/**
 * Resolve a placed instance's user-facing group. Every placed object now
 * resolves to a real group (issue #130) — markers are 'zones', not excluded.
 */
export function groupOf(placed: PlacedObject, catalog: GameCatalog | null): GridGroup | undefined {
  if (placed.type === 1) return 'zones' // markers[] — trigger zones
  if (placed.type === 2) return 'units' // squads[] — always a unit placement
  const category = catalog?.mapObjects.find((o) => o.id === placed.sid)?.category
  // Unresolved (no catalog match — Core.zip not loaded, or a sid missing from
  // even the bundled fallback) defaults to decorations: the safest "can't
  // identify this" bucket, since that's already the catch-all for anything
  // not gameplay-significant.
  return category ? CATEGORY_TO_GROUP[category] : 'decorations'
}

// ─── Tile index ───────────────────────────────────────────────────────────────

/**
 * A placed instance's real footprint cells (issue #167's object-footprint-size
 * work) — only `objects[]` (type 0) carries a footprint template; squads/
 * markers aren't terrain and always resolve to their single placed tile.
 * Shared by buildTileIndex (below) and the grid renderer's multi-tile icon
 * bounding-box computation, so both agree on exactly the same shape.
 */
export function resolveFootprintCells(obj: PlacedObject, catalog: GameCatalog | null): FootprintCell[] {
  if (obj.type !== 0) return [{ x: obj.x, z: obj.z, value: 1 }]
  const template = catalog?.mapObjects.find((o) => o.id === obj.sid)
  return computeFootprintTiles(template, obj.x, obj.z)
}

/**
 * Groups placed objects by tile (node). A multi-tile object (issue #167) is
 * registered under *every* cell of its resolved footprint, not just its
 * anchor node — so hovering/clicking anywhere within a 3×3 mountain's shape
 * finds and selects it, not only its single anchor tile. Markers included —
 * filtering them out of the stacking/rendering decision is the caller's job
 * via groupOf().
 */
export function buildTileIndex(
  objects: PlacedObject[],
  catalog: GameCatalog | null,
  sizeX: number,
  sizeZ: number,
): Map<number, PlacedObject[]> {
  const index = new Map<number, PlacedObject[]>()
  const add = (node: number, obj: PlacedObject) => {
    const list = index.get(node)
    if (list) list.push(obj)
    else index.set(node, [obj])
  }
  for (const obj of objects) {
    if (obj.type !== 0 || sizeX <= 0 || sizeZ <= 0) {
      add(obj.node, obj)
      continue
    }
    const cells = resolveFootprintCells(obj, catalog)
    if (cells.length <= 1) {
      add(obj.node, obj)
      continue
    }
    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
      add(cell.z * sizeX + cell.x, obj)
    }
  }
  return index
}

export interface PrimaryPick {
  primary: PlacedObject
  group: GridGroup
  /** Total items on this tile, including markers and anything excluded from priority. */
  count: number
}

/**
 * Pick which item "wins" a tile's icon when multiple objects are stacked —
 * highest-priority group first (GRID_GROUP_ORDER), first-encountered within a
 * tier as the deterministic tiebreak. Returns undefined only for an empty
 * `items` list — every placed object now resolves to a real group (issue #130).
 */
export function pickPrimary(items: PlacedObject[], catalog: GameCatalog | null): PrimaryPick | undefined {
  let best: { placed: PlacedObject; group: GridGroup; rank: number } | undefined
  for (const item of items) {
    const group = groupOf(item, catalog)
    if (!group) continue // marker — doesn't compete
    const rank = GRID_GROUP_ORDER.indexOf(group)
    if (!best || rank < best.rank) best = { placed: item, group, rank }
  }
  if (!best) return undefined
  return { primary: best.placed, group: best.group, count: items.length }
}

// ─── Viewport windowing (tier-2 rendering) ───────────────────────────────────

export interface VisibleRange {
  xMin: number
  xMax: number
  zMin: number
  zMax: number
}

/**
 * Which tile columns/rows are inside the current pan/zoom viewport, plus a
 * small overdraw margin — bounds the number of mounted DOM cells to roughly
 * "viewport size" regardless of total map size (issue #122: real maps go up
 * to 256×256 = 65,536 tiles, too many to mount unconditionally).
 */
export function getVisibleRange(
  /** Current transform: cell (0,0)'s top-left screen position + current cell size in px. */
  transform: { translateX: number; translateY: number; scale: number },
  containerSize: { width: number; height: number },
  gridSize: { sizeX: number; sizeZ: number },
  cellSizePx: number,
  overdraw = 2,
): VisibleRange {
  const effectiveCell = cellSizePx * transform.scale
  const xMin = Math.floor(-transform.translateX / effectiveCell) - overdraw
  const zMin = Math.floor(-transform.translateY / effectiveCell) - overdraw
  const xMax = Math.ceil((containerSize.width - transform.translateX) / effectiveCell) + overdraw
  const zMax = Math.ceil((containerSize.height - transform.translateY) / effectiveCell) + overdraw
  return {
    xMin: Math.max(0, xMin),
    zMin: Math.max(0, zMin),
    xMax: Math.min(gridSize.sizeX - 1, xMax),
    zMax: Math.min(gridSize.sizeZ - 1, zMax),
  }
}
