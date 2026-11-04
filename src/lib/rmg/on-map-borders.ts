// ─── Border obstacles between zones, on a map somebody already started ───────
// Walls every zone border with the generator's own wall plugs (zone-boundary.ts sealBoundaryBand) and leaves gates open: wherever a road already
// crosses a border, and at least one gate on every border that has none, so no zone is shut in. Existing objects, water, roads and rivers are never covered.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { sealBoundaryBand } from './zone-boundary'
import type { PlacementState, ZonePlacement } from './zone-population'

/** A gate opens this many tiles to each side of its centre tile. */
const GATE_RADIUS = 2
/** Borders longer than this get a second gate, at the far end. */
const SECOND_GATE_BORDER_TILES = 80
/** Zones that only touch at a corner are not connected by a border worth a gate. */
const MIN_BORDER_TILES = 6
/** A road this close to a border tile counts as crossing it. */
const ROAD_CROSSING_REACH = 2

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
}): ZonePlacement[] {
  const { sizeX, sizeZ, zoneIdByNode, state, roadNodes } = options
  const tileCount = sizeX * sizeZ

  const pairs = new Map<string, number[]>()
  const addBorder = (n: number, m: number): void => {
    if (zoneIdByNode[n] === zoneIdByNode[m]) return
    const key = `${Math.min(zoneIdByNode[n], zoneIdByNode[m])}:${Math.max(zoneIdByNode[n], zoneIdByNode[m])}`
    const list = pairs.get(key)
    if (list) list.push(n)
    else pairs.set(key, [n])
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
  const openGate = (centre: number): void => {
    const cx = centre % sizeX
    const cz = Math.floor(centre / sizeX)
    for (let dz = -GATE_RADIUS; dz <= GATE_RADIUS; dz++) {
      for (let dx = -GATE_RADIUS; dx <= GATE_RADIUS; dx++) {
        const x = cx + dx
        const z = cz + dz
        if (x >= 0 && x < sizeX && z >= 0 && z < sizeZ) keepOpen.add(z * sizeX + x)
      }
    }
  }
  for (const tiles of pairs.values()) {
    if (tiles.length < MIN_BORDER_TILES || tiles.some(nearRoad)) continue
    const free = tiles.filter((n) => !state.blocked.has(n))
    if (free.length === 0) continue
    const mx = tiles.reduce((s, n) => s + (n % sizeX), 0) / tiles.length
    const mz = tiles.reduce((s, n) => s + Math.floor(n / sizeX), 0) / tiles.length
    const centre = [...free].sort((a, b) => Math.hypot((a % sizeX) - mx, Math.floor(a / sizeX) - mz) - Math.hypot((b % sizeX) - mx, Math.floor(b / sizeX) - mz))[0]
    openGate(centre)
    if (tiles.length > SECOND_GATE_BORDER_TILES) openGate(free.reduce((far, n) => (distance(n, centre) > distance(far, centre) ? n : far), centre))
  }

  return sealBoundaryBand({
    sizeX, sizeZ, zoneIdByNode: [...zoneIdByNode], zoneBiome: options.zoneBiome, mapObjects: options.mapObjects, catalogById: options.catalogById,
    isBlocked: (node) => state.blocked.has(node), keepOpen, importantNodes: new Set(state.usedAnchors), state, rng: options.rng,
  })
}
