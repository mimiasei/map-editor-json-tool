// ─── Border obstacles between zones, on a map somebody already started ───────
// Walls every zone border with the generator's own wall plugs (zone-boundary.ts sealBoundaryBand) and leaves gates open: wherever a road already
// crosses a border, and at least one gate on every border that has none, so no zone is shut in. Existing objects, water, roads and rivers are never covered.
// A gate is one tile wide (the two tiles of the crossing), so a guard standing on it cannot be walked around; the caller puts the guards on `gates`.
// Two steps: `planBorderGates` runs before the treasure and decoration layers (so they keep off the gate corridors), `wallZoneBorders` after them.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { sealBoundaryBand } from './zone-boundary'
import type { PlacementState, ZonePlacement } from './zone-population'

/** Borders longer than this get a second gate, at the far end. */
const SECOND_GATE_BORDER_TILES = 80
/** Zones that only touch at a corner are not connected by a border worth a gate. */
const MIN_BORDER_TILES = 6
/** Road tiles of one border closer than this share a guard. */
const ROAD_GATE_SPACING = 4

export interface BorderGatePlan {
  /** The one-tile-wide corridor of every gate this plan opens: nothing is built on these tiles. */
  corridors: Set<number>
  /** One entry per gate (opened ones and road crossings), each the tiles a guard can stand on, best first: the crossing's two tiles, then the corridor tile behind each. */
  gates: number[][]
}

export function planBorderGates(options: {
  sizeX: number
  sizeZ: number
  zoneIdByNode: readonly number[]
  state: PlacementState
  roadNodes: ReadonlySet<number>
}): BorderGatePlan {
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

  const distance = (a: number, b: number): number => Math.hypot((a % sizeX) - (b % sizeX), Math.floor(a / sizeX) - Math.floor(b / sizeX))

  const corridors = new Set<number>()
  const gates: number[][] = []
  // The wall band is four tiles across (both border tiles and one more each side): the gate is that corridor, one tile wide.
  const openGate = ({ n, m }: { n: number; m: number }): void => {
    const d = m - n
    for (const node of [n - d, n, m, m + d]) if (node >= 0 && node < tileCount) corridors.add(node)
    gates.push([n, m, n - d, m + d].filter((node) => node >= 0 && node < tileCount))
  }
  for (const crossings of pairs.values()) {
    if (crossings.length < MIN_BORDER_TILES) continue
    // Roads already cross this border: they are the gates, and each gets a guard (parallel road tiles count as one crossing).
    const guarded: number[] = []
    for (const c of crossings) {
      if (!roadNodes.has(c.n) || !roadNodes.has(c.m) || guarded.some((g) => distance(g, c.n) < ROAD_GATE_SPACING)) continue
      guarded.push(c.n)
      gates.push([c.n, c.m])
    }
    // Only a road that really crosses is the gate; one that runs alongside the border does not let anybody through.
    if (guarded.length > 0) continue
    const free = crossings.filter(({ n, m }) => !state.blocked.has(n) && !state.blocked.has(m))
    if (free.length === 0) continue
    const mx = crossings.reduce((s, c) => s + (c.n % sizeX), 0) / crossings.length
    const mz = crossings.reduce((s, c) => s + Math.floor(c.n / sizeX), 0) / crossings.length
    const centre = [...free].sort((a, b) => Math.hypot((a.n % sizeX) - mx, Math.floor(a.n / sizeX) - mz) - Math.hypot((b.n % sizeX) - mx, Math.floor(b.n / sizeX) - mz))[0]
    openGate(centre)
    if (crossings.length > SECOND_GATE_BORDER_TILES) openGate(free.reduce((far, c) => (distance(c.n, centre.n) > distance(far.n, centre.n) ? c : far), centre))
  }

  return { corridors, gates }
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
  plan: BorderGatePlan
}): ZonePlacement[] {
  const { sizeX, sizeZ, zoneIdByNode, state } = options
  return sealBoundaryBand({
    sizeX, sizeZ, zoneIdByNode: [...zoneIdByNode], zoneBiome: options.zoneBiome, mapObjects: options.mapObjects, catalogById: options.catalogById,
    isBlocked: (node) => state.blocked.has(node), keepOpen: new Set([...options.openNodes, ...options.plan.corridors]), importantNodes: new Set(state.usedAnchors), state, rng: options.rng,
  })
}
