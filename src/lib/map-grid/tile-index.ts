// ─── Map grid — tile index & category grouping ──────────────────────────────
// Pure, framework-free logic (issue #122 Phase 1) — no React, so this is
// reusable by both the grid dialog's rendering and any future click-to-edit
// handler without re-deriving anything.

import type { PlacedObject } from '@/types/map-context'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'

// ─── User-facing groups ───────────────────────────────────────────────────────
// Collapses the 9 raw CatalogMapObject categories + squads into the 6 groups
// requested for filtering, in stacking-priority order (index 0 wins ties
// against every group after it). `markers` (type 1) never participate — they
// are editor-only zone annotations, not gameplay objects.

export type GridGroup = 'units' | 'artifacts' | 'spawners' | 'interactables' | 'resources' | 'decorations'

export const GRID_GROUP_ORDER: GridGroup[] = [
  'units', 'artifacts', 'spawners', 'interactables', 'resources', 'decorations',
]

export const GRID_GROUP_LABELS: Record<GridGroup, string> = {
  units: 'Units',
  artifacts: 'Artifact pickups',
  spawners: 'Spawners',
  interactables: 'Interactables',
  resources: 'Resource piles',
  decorations: 'Decorations',
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
 * Resolve a placed instance's user-facing group. Returns undefined for
 * markers (excluded from the grid stack entirely) — callers should filter
 * those out before grouping/priority logic sees them.
 */
export function groupOf(placed: PlacedObject, catalog: GameCatalog | null): GridGroup | undefined {
  if (placed.type === 1) return undefined // markers — not a gameplay object
  if (placed.type === 2) return 'units' // squads[] — always a unit placement
  const category = catalog?.mapObjects.find((o) => o.id === placed.sid)?.category
  // Unresolved (no catalog match — Core.zip not loaded, or a sid missing from
  // even the bundled fallback) defaults to decorations: the safest "can't
  // identify this" bucket, since that's already the catch-all for anything
  // not gameplay-significant.
  return category ? CATEGORY_TO_GROUP[category] : 'decorations'
}

// ─── Tile index ───────────────────────────────────────────────────────────────

/** Groups placed objects by tile (node). Markers included — filtering them
 *  out of the stacking/rendering decision is the caller's job via groupOf(). */
export function buildTileIndex(objects: PlacedObject[]): Map<number, PlacedObject[]> {
  const index = new Map<number, PlacedObject[]>()
  for (const obj of objects) {
    const list = index.get(obj.node)
    if (list) list.push(obj)
    else index.set(obj.node, [obj])
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
 * tier as the deterministic tiebreak. Returns undefined only when every item
 * on the tile is a marker (nothing groupable to show).
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
