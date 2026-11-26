// ─── Shipyard portals: the stand-in for ships ───────────────────────────────
// OE has no boats, shipyards or sea objects, so an island an H3 map reached by ship has no way in. Where the H3 map has shipyards, every
// shipyard becomes a portal on its own island, and the islands are tied together through one hub island: each other island gets a
// two-way portal pair (one portal on its own shore, one on the hub's shore). A hero can then go from any island to the hub and back,
// which is what a ship did. Only land that touches water counts as an island: caves separated by rock were never sea-going.
// Pairs are linked explicitly (`targetIdx`), never by sid, so they cannot mix with the monolith pairs (`portal-links.ts`).

import type { CatalogMapObject } from '@/lib/catalog/types'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'

/** Not used by the H3 mapping table (monoliths are portal_1-3, the subterranean gate portal_5). */
export const WATER_PORTAL_SID = 'portal_4'

const MIN_ISLAND_TILES = 16
const SEARCH_RADIUS = 6

export interface WaterPortalEnv {
  width: number
  height: number
  catalogById: Map<string, CatalogMapObject>
  waterMap: number[]
  levelsMap: number[]
  /** Atlas nodes of the H3 floor (not rock, not water). */
  landNodes: Set<number>
  /** Tiles a blocking object already stands on. */
  solidClaimed: Set<number>
  /** Entrance cells of the objects already placed: a portal never goes on one, or that object could not be used. */
  entranceNodes: Set<number>
  /** The tiles around those entrances: avoided while there is room elsewhere. */
  avoidNodes: Set<number>
  /** Anchor nodes of the objects already placed (player starts included): an island holding any of them always counts, however small. */
  objectNodes: number[]
  rng: () => number
  /** Places a `WATER_PORTAL_SID` with its anchor on `node` and returns its object id. */
  place: (node: number) => number
}

export interface WaterPortalResult {
  /** Two-way pairs of object ids. */
  links: [number, number][]
  /** Portals placed (two per pair). */
  portals: number
  /** Islands joined to the hub, the hub included. */
  islands: number
  /** Shipyards that became portals; the rest found no island to pair with. */
  shipyardsConverted: number
}

interface Island { id: number; tiles: number[]; shipyardCount: number }

const NEIGHBORS_4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export function buildWaterPortals(env: WaterPortalEnv, shipyardNodes: number[]): WaterPortalResult {
  const none: WaterPortalResult = { links: [], portals: 0, islands: 0, shipyardsConverted: 0 }
  if (shipyardNodes.length === 0) return none
  const { width, height, waterMap, levelsMap, landNodes, solidClaimed } = env
  const isLand = (n: number) => landNodes.has(n) && waterMap[n] === 0 && levelsMap[n] === 0
  const hasWaterNear = (n: number): boolean => {
    const x = n % width, z = Math.floor(n / width)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx >= 0 && nz >= 0 && nx < width && nz < height && waterMap[nz * width + nx] !== 0) return true
    }
    return false
  }

  // Land components, 4-neighbour.
  const islandOf = new Int32Array(width * height).fill(-1)
  const islands: Island[] = []
  for (const start of landNodes) {
    if (islandOf[start] !== -1 || !isLand(start)) continue
    const tiles: number[] = []
    const queue = [start]
    islandOf[start] = islands.length
    while (queue.length > 0) {
      const n = queue.pop() as number
      tiles.push(n)
      const x = n % width, z = Math.floor(n / width)
      for (const [dx, dz] of NEIGHBORS_4) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue
        const m = nz * width + nx
        if (islandOf[m] !== -1 || !isLand(m)) continue
        islandOf[m] = islands.length
        queue.push(m)
      }
    }
    islands.push({ id: islands.length, tiles, shipyardCount: 0 })
  }
  const occupied = new Set(env.objectNodes.map((n) => islandOf[n]).filter((i) => i >= 0))
  const qualifying = islands.filter((isl) => (isl.tiles.length >= MIN_ISLAND_TILES || occupied.has(isl.id)) && isl.tiles.some(hasWaterNear))
  if (qualifying.length < 2) return none
  const qualifies = new Set(qualifying.map((i) => i.id))

  const template = env.catalogById.get(WATER_PORTAL_SID)
  if (!template) return none
  // Strictest first: room around it and off other objects' entrances; then only the entrances; last, anywhere free (the placement
  // auto-fix then moves whichever object blocks an entrance).
  const TIERS = [{ margin: true, avoid: true }, { margin: false, avoid: true }, { margin: false, avoid: false }]
  type Tier = (typeof TIERS)[number]
  const fitsAt = (island: number, ax: number, az: number, { margin, avoid }: Tier): boolean => {
    const cells = computeFootprintTiles(template, ax, az, 0)
    for (const c of cells) {
      if (c.value < 1) continue
      if (c.x < 0 || c.z < 0 || c.x >= width || c.z >= height) return false
      const n = c.z * width + c.x
      if (islandOf[n] !== island || solidClaimed.has(n) || env.entranceNodes.has(n) || (avoid && env.avoidNodes.has(n))) return false
      if (!margin) continue
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = c.x + dx, nz = c.z + dz
        if (nx >= 0 && nz >= 0 && nx < width && nz < height && solidClaimed.has(nz * width + nx)) return false
      }
    }
    // The portal's own entrance must lead somewhere: a free land tile beside it that is not the portal itself.
    for (const c of cells) {
      if (c.value !== 2) continue
      const open = NEIGHBORS_4.some(([dx, dz]) => {
        const nx = c.x + dx, nz = c.z + dz
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) return false
        const m = nz * width + nx
        return islandOf[m] === island && !solidClaimed.has(m) && !cells.some((q) => q.value === 1 && q.x === nx && q.z === nz)
      })
      if (!open) return false
    }
    return true
  }
  const placeAt = (ax: number, az: number): number => {
    const id = env.place(az * width + ax)
    for (const c of computeFootprintTiles(template, ax, az, 0)) if (c.value >= 1) solidClaimed.add(c.z * width + c.x)
    return id
  }
  /** The nearest fitting anchor to `node` (a shipyard goes where its building stood). */
  const placeNear = (island: number, node: number): number | null => {
    const x0 = node % width, z0 = Math.floor(node / width)
    for (const tier of TIERS) {
      for (let r = 0; r <= SEARCH_RADIUS; r++) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          if (fitsAt(island, x0 + dx, z0 + dz, tier)) return placeAt(x0 + dx, z0 + dz)
        }
      }
    }
    return null
  }
  /** Somewhere along the island's shore, away from other objects where there is room. */
  const placeOnShore = (island: number): number | null => {
    const shore = islands[island].tiles.filter(hasWaterNear)
    for (let i = shore.length - 1; i > 0; i--) { const j = Math.floor(env.rng() * (i + 1)); [shore[i], shore[j]] = [shore[j], shore[i]] }
    for (const tier of TIERS) {
      for (const n of shore) {
        const x = n % width, z = Math.floor(n / width)
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (fitsAt(island, x + dx, z + dz, tier)) return placeAt(x + dx, z + dz)
        }
      }
    }
    return null
  }

  // Each shipyard becomes a portal on its own island.
  const shipPortals = new Map<number, number[]>()
  let converted = 0
  for (const node of shipyardNodes) {
    const island = islandOf[node] >= 0 ? islandOf[node] : -1
    if (island < 0 || !qualifies.has(island)) continue
    const id = placeNear(island, node)
    if (id === null) continue
    converted += 1
    islands[island].shipyardCount += 1
    shipPortals.set(island, [...(shipPortals.get(island) ?? []), id])
  }
  if (converted === 0) return none

  // The hub: most shipyards, then the largest.
  const hub = [...qualifying].sort((a, b) => (b.shipyardCount - a.shipyardCount) || (b.tiles.length - a.tiles.length))[0]
  const others = qualifying.filter((i) => i.id !== hub.id)
  const links: [number, number][] = []
  let portals = converted
  const pair = (a: number | null, b: number | null) => {
    if (a === null || b === null) return
    links.push([a, b])
  }
  for (const isl of others) {
    const own = shipPortals.get(isl.id) ?? []
    // An island without a shipyard gets one portal of its own; one with several shipyards pairs each of them with the hub.
    const harbors = own.length > 0 ? own : [placeOnShore(isl.id)].map((id) => { if (id !== null) portals += 1; return id })
    for (const h of harbors) {
      const hubSide = placeOnShore(hub.id)
      if (hubSide !== null) portals += 1
      pair(h, hubSide)
    }
  }
  // A shipyard on the hub itself pairs with a new portal on some other island's shore.
  let next = 0
  for (const h of shipPortals.get(hub.id) ?? []) {
    const target = others[next++ % others.length]
    const far = placeOnShore(target.id)
    if (far !== null) portals += 1
    pair(h, far)
  }
  // Unpaired leftovers (no room found) are not counted as links; a portal without a partner stays inert, which the import report shows.
  return { links, portals, islands: qualifying.length, shipyardsConverted: converted }
}
