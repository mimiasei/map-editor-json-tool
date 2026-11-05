// ─── Border obstacles between zones, on a map somebody already started ───────
// Walls every zone border with the generator's own wall plugs (zone-boundary.ts sealBoundaryBand) and leaves gates open: wherever a road already
// crosses a border, and at least one gate on every border that has none, so no zone is shut in. Existing objects, water, roads and rivers are never covered.
// A gate is one tile wide (the two tiles of the crossing), so a guard standing on it cannot be walked around; the caller puts the guards on `gates`.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { sealBoundaryBand } from './zone-boundary'
import type { PlacementState, ZonePlacement } from './zone-population'

/** Borders longer than this get a second gate, at the far end. */
const SECOND_GATE_BORDER_TILES = 80
/** Zones that only touch at a corner are not connected by a border worth a gate. */
const MIN_BORDER_TILES = 6
/** A road this close to a border tile counts as crossing it. */
const ROAD_CROSSING_REACH = 2
/** Road tiles of one border closer than this share a guard. */
const ROAD_GATE_SPACING = 4

export interface ZoneBorderWalls {
  walls: ZonePlacement[]
  /** Where a guard belongs: one tile of every gate this pass opened, and of every road crossing a border. */
  gates: number[]
}

export function wallZoneBorders(options: {
  sizeX: number
  sizeZ: number
  zoneIdByNode: readonly number[]
  zoneBiome: Map<number, BiomeId>
  mapObjects: CatalogMapObject[]
  catalogById: Map<string, CatalogMapObject>
  state: PlacementState
  rng: () => number
  /** Road, river and water tiles: always left open. */
  openNodes: ReadonlySet<number>
  roadNodes: ReadonlySet<number>
}): ZoneBorderWalls {
  const { sizeX, sizeZ, zoneIdByNode, state, roadNodes } = options
  const tileCount = sizeX * sizeZ

  // Per border: the tile on one side and its neighbour across (the crossing a hero walks over).
  const pairs = new Map<string, { n: number; m: number }[]>()
  const addBorder = (n: number, m: number): void => {
    if (zoneIdByNode[n] === zoneIdByNode[m]) return
    const key = `${Math.min(zoneIdByNode[n], zoneIdByNode[m])}:${Math.max(zoneIdByNode[n], zoneIdByNode[m])}`
    const list = pairs.get(key)
    if (list) list.push({ n, m })
    else pairs.set(key, [{ n, m }])
  }
  for (let n = 0; n < tileCount; n++) {
    if (n % sizeX < sizeX - 1) addBorder(n, n + 1)
    if (n + sizeX < tileCount) addBorder(n, n + sizeX)
  }

  const nearRoad = (n: number): boolean => {
    const x = n % sizeX
    const z = Math.floor(n / sizeX)
    for (let dz = -ROAD_CROSSING_REACH; dz <= ROAD_CROSSING_REACH; dz++) {
      for (let dx = -ROAD_CROSSING_REACH; dx <= ROAD_CROSSING_REACH; dx++) {
        if (roadNodes.has((z + dz) * sizeX + x + dx)) return true
      }
    }
    return false
  }
  const distance = (a: number, b: number): number => Math.hypot((a % sizeX) - (b % sizeX), Math.floor(a / sizeX) - Math.floor(b / sizeX))

  const keepOpen = new Set<number>(options.openNodes)
  const gates: number[] = []
  // The wall band is four tiles across (both border tiles and one more each side): the gate is that corridor, one tile wide.
  const openGate = ({ n, m }: { n: number; m: number }): void => {
    const d = m - n
    for (const node of [n - d, n, m, m + d]) if (node >= 0 && node < tileCount) keepOpen.add(node)
    gates.push(n)
  }
  for (const crossings of pairs.values()) {
    if (crossings.length < MIN_BORDER_TILES) continue
    // Roads already cross this border: they are the gates, and each gets a guard (parallel road tiles count as one crossing).
    const guarded: number[] = []
    for (const c of crossings) {
      if (!roadNodes.has(c.n) || !roadNodes.has(c.m) || guarded.some((g) => distance(g, c.n) < ROAD_GATE_SPACING)) continue
      guarded.push(c.n)
      gates.push(c.n)
    }
    if (crossings.some(({ n }) => nearRoad(n))) continue
    const free = crossings.filter(({ n, m }) => !state.blocked.has(n) && !state.blocked.has(m))
    if (free.length === 0) continue
    const mx = crossings.reduce((s, c) => s + (c.n % sizeX), 0) / crossings.length
    const mz = crossings.reduce((s, c) => s + Math.floor(c.n / sizeX), 0) / crossings.length
    const centre = [...free].sort((a, b) => Math.hypot((a.n % sizeX) - mx, Math.floor(a.n / sizeX) - mz) - Math.hypot((b.n % sizeX) - mx, Math.floor(b.n / sizeX) - mz))[0]
    openGate(centre)
    if (crossings.length > SECOND_GATE_BORDER_TILES) openGate(free.reduce((far, c) => (distance(c.n, centre.n) > distance(far.n, centre.n) ? c : far), centre))
  }

  const walls = sealBoundaryBand({
    sizeX, sizeZ, zoneIdByNode: [...zoneIdByNode], zoneBiome: options.zoneBiome, mapObjects: options.mapObjects, catalogById: options.catalogById,
    isBlocked: (node) => state.blocked.has(node), keepOpen, importantNodes: new Set(state.usedAnchors), state, rng: options.rng,
  })
  return { walls, gates }
}
