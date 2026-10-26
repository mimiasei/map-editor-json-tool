// ─── Map grid — tile index & category grouping ──────────────────────────────
// Pure, framework-free logic (issue #122 Phase 1) — no React, so this is
// reusable by both the grid dialog's rendering and any future click-to-edit
// handler without re-deriving anything.

import type { PlacedObject } from '@/types/map-context'
import { findMapObject } from '@/lib/catalog/map-object-lookup'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles, type FootprintCell } from '@/lib/map-grid/footprint'
import { orderStack } from '@/lib/map-grid/stack-order'

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
  const category = findMapObject(catalog, placed.sid)?.category
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
  const template = findMapObject(catalog, obj.sid)
  return computeFootprintTiles(template, obj.x, obj.z, obj.rotation)
}

/**
 * Groups placed objects by tile (node). A multi-tile object (issue #167) is
 * registered under every *solid* (`value === 1`) cell of its resolved
 * footprint, not just its anchor node — so hovering/clicking anywhere within
 * a 3×3 mountain's shape finds and selects it. Deliberately excludes `2`
 * (interaction-only, no mesh) cells: a real bug caught after shipping —
 * artifact/resource/spawner templates are typically a single "1" padded by
 * an 8-cell "2" ring (e.g. `random-res`: one "1" at its pivot, eight "2"
 * around it), and registering all 9 cells made that one spawner instance win
 * the stacking pick (spawners outrank most other groups) across its entire
 * 3×3 ring, painting swaths of plain ground the spawner's category color even
 * though only its single center tile is real. Falls back to the object's own
 * anchor node when a resolved footprint has no "1" cell at all (e.g.
 * `random-squad`, all "2"/"0") so it's still findable somewhere. Markers
 * included — filtering them out of the stacking/rendering decision is the
 * caller's job via groupOf().
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
    const solidCells = resolveFootprintCells(obj, catalog).filter((cell) => cell.value === 1)
    if (solidCells.length === 0) {
      add(obj.node, obj)
      continue
    }
    for (const cell of solidCells) {
      if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
      add(cell.z * sizeX + cell.x, obj)
    }
    // A mirrored footprint can leave the anchor (the tile the object's handle sits on) off its block tiles; keep it selectable there.
    if ((obj.rotation ?? 0) >= 10 && !solidCells.some((c) => c.z * sizeX + c.x === obj.node)) add(obj.node, obj)
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
 * The item on top of a tile's stack (stack-order.ts: the newest object, or the user's arrangement in `manual`). Returns undefined only
 * for an empty `items` list.
 */
export function pickPrimary(items: PlacedObject[], catalog: GameCatalog | null, manual?: readonly string[]): PrimaryPick | undefined {
  const top = orderStack(items, catalog, manual)[0]
  const group = top ? groupOf(top, catalog) : undefined
  return top && group ? { primary: top, group, count: items.length } : undefined
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
