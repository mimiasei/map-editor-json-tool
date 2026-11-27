// ─── Moving shipyard portals out of sealed pockets ──────────────────────────
// The shipyard portals (water-portals.ts) are placed on an island's shore before the trees, mountains and the rest of the objects go down. Those can
// close the few tiles around a portal: it then stands in a pocket of 3 to 8 tiles, cut off from the island it was meant to join to the hub. Its
// partner on the other island is fine, but nobody can walk to this portal, or leave the pocket after arriving, so the island behind the pair is
// not reachable from anywhere (checked on Back For Revenge - Allied: two pairs had both ends in sealed pockets). The accessibility pass cannot see
// it: it counts every linked portal's entrance as a start, so a pocket holding one always looks reachable.
//
// So, once everything stands: a portal whose walkable region is small and much smaller than the biggest region of its island moves into that
// biggest region, onto the nearest spot where its footprint fits and its entrance leads somewhere. The link (by object id) does not change.
// A region with a player start in it is left alone: H3 puts players in sealed pockets on purpose, with a portal as the way out.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { buildBlockedTileSet, NON_BLOCKING_SPAWNER_SIDS } from '@/lib/map-grid/passability'
import type { ObjectPlacementGroup } from './accessibility-pass'

const NEIGHBORS_4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
/** A region this small, and much smaller than the island's biggest, is a pocket. */
const POCKET_MAX_TILES = 12
const POCKET_RATIO = 0.25

export interface PortalRepositionReport {
  moved: number
  /** Portals still in a small region because no place fit in the island's biggest one. */
  stranded: number
}

export function repositionStrandedPortals(
  objectGroups: Map<string, ObjectPlacementGroup>,
  portalSid: string,
  atlasWidth: number,
  atlasHeight: number,
  out: { levelsMap: number[]; climbsMap: number[]; waterMap: number[] },
  catalog: GameCatalog,
  catalogById: Map<string, CatalogMapObject>,
  forbiddenNodes: Set<number>,
): PortalRepositionReport {
  const report: PortalRepositionReport = { moved: 0, stranded: 0 }
  const group = objectGroups.get(portalSid)
  const template = catalogById.get(portalSid)
  if (!group || group.ids.length === 0 || !template) return report
  const total = atlasWidth * atlasHeight
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < atlasWidth && z < atlasHeight

  const flat: PlacedObject[] = []
  for (const [sid, g] of objectGroups) {
    for (let i = 0; i < g.ids.length; i++) {
      const node = g.nodes[i]
      flat.push({ key: `0:${g.ids[i]}`, type: 0, id: g.ids[i], sid, x: node % atlasWidth, z: Math.floor(node / atlasWidth), node, rotation: g.rotations[i] ?? 0 })
    }
  }
  const context = { sizeX: atlasWidth, sizeZ: atlasHeight, levelsMap: out.levelsMap, climbsMap: out.climbsMap, waterMap: out.waterMap, forbiddenNodes }
  const blocked = buildBlockedTileSet({ ...context, placedObjects: flat }, catalog)
  // Terrain only: the island a tile belongs to, whatever stands on it.
  const terrainBlocked = buildBlockedTileSet({ ...context, placedObjects: [] }, catalog)

  const label = (isBlocked: Set<number>): { of: Int32Array; sizes: number[] } => {
    const of = new Int32Array(total).fill(-1)
    const sizes: number[] = []
    for (let start = 0; start < total; start++) {
      if (of[start] !== -1 || isBlocked.has(start)) continue
      const id = sizes.length
      let count = 0
      const stack = [start]
      of[start] = id
      while (stack.length > 0) {
        const n = stack.pop() as number
        count += 1
        const x = n % atlasWidth, z = Math.floor(n / atlasWidth)
        for (const [dx, dz] of NEIGHBORS_4) {
          if (!inside(x + dx, z + dz)) continue
          const m = (z + dz) * atlasWidth + x + dx
          if (of[m] !== -1 || isBlocked.has(m)) continue
          of[m] = id
          stack.push(m)
        }
      }
      sizes.push(count)
    }
    return { of, sizes }
  }
  const walk = label(blocked)
  const island = label(terrainBlocked)

  // The biggest walkable region of every island.
  const biggestWalk = new Map<number, number>()
  const biggestId = new Map<number, number>()
  const seenWalk = new Set<number>()
  for (let n = 0; n < total; n++) {
    const w = walk.of[n], isl = island.of[n]
    if (w < 0 || isl < 0 || seenWalk.has(w)) continue
    seenWalk.add(w)
    if (walk.sizes[w] > (biggestWalk.get(isl) ?? 0)) { biggestWalk.set(isl, walk.sizes[w]); biggestId.set(isl, w) }
  }

  // Tiles other objects need: their entrance cells, and the cells a walk-onto placeholder covers (it blocks nothing, but a portal on it would).
  const reserved = new Set<number>()
  for (const [sid, g] of objectGroups) {
    if (sid === portalSid) continue
    const t = catalogById.get(sid)
    if (!t) continue
    for (let i = 0; i < g.ids.length; i++) {
      const ax = g.nodes[i] % atlasWidth, az = Math.floor(g.nodes[i] / atlasWidth)
      for (const c of computeFootprintTiles(t, ax, az, g.rotations[i] ?? 0)) {
        if (!inside(c.x, c.z)) continue
        if (NON_BLOCKING_SPAWNER_SIDS.has(sid) ? c.value >= 1 : c.value === 2) reserved.add(c.z * atlasWidth + c.x)
      }
    }
  }

  const accessOf = (ax: number, az: number): number | null => {
    const cell = computeFootprintTiles(template, ax, az, 0).find((c) => c.value === 2)
    return cell && inside(cell.x, cell.z) ? cell.z * atlasWidth + cell.x : null
  }

  // Regions a player starts in.
  const startRegions = new Set<number>()
  for (const [sid, g] of objectGroups) {
    if (sid !== 'city-spawner' && sid !== 'hero-spawner') continue
    const t = catalogById.get(sid)
    for (let i = 0; i < g.ids.length; i++) {
      const sx = g.nodes[i] % atlasWidth, sz = Math.floor(g.nodes[i] / atlasWidth)
      const cells = t ? computeFootprintTiles(t, sx, sz, g.rotations[i] ?? 0).filter((c) => c.value === 2) : []
      for (const c of cells.length > 0 ? cells : [{ x: sx, z: sz }]) {
        if (inside(c.x, c.z) && walk.of[c.z * atlasWidth + c.x] >= 0) startRegions.add(walk.of[c.z * atlasWidth + c.x])
      }
    }
  }

  const taken = new Set<number>()
  for (let i = 0; i < group.ids.length; i++) {
    const node = group.nodes[i]
    const ax = node % atlasWidth, az = Math.floor(node / atlasWidth)
    const access = accessOf(ax, az)
    if (access === null) continue
    const region = walk.of[access]
    const isl = island.of[access]
    if (isl < 0) continue
    if (startRegions.has(region)) continue
    const size = region >= 0 ? walk.sizes[region] : 0
    const biggest = biggestWalk.get(isl) ?? 0
    if (size >= POCKET_MAX_TILES || size >= biggest * POCKET_RATIO) continue

    // The nearest anchor, in the island's biggest region, where the footprint fits and the entrance has a free neighbour in that region.
    const target = biggestId.get(isl) as number
    const candidates: { n: number; d: number }[] = []
    for (let n = 0; n < total; n++) if (walk.of[n] === target) candidates.push({ n, d: Math.hypot((n % atlasWidth) - ax, Math.floor(n / atlasWidth) - az) })
    candidates.sort((a, b) => a.d - b.d)
    let placed = false
    for (const { n } of candidates) {
      const x = n % atlasWidth, z = Math.floor(n / atlasWidth)
      const cells = computeFootprintTiles(template, x, z, 0)
      let fits = true
      for (const c of cells) {
        if (c.value < 1) continue
        const cn = c.z * atlasWidth + c.x
        if (!inside(c.x, c.z) || walk.of[cn] !== target || reserved.has(cn) || taken.has(cn)) { fits = false; break }
      }
      if (!fits) continue
      const solid = new Set(cells.filter((c) => c.value === 1).map((c) => c.z * atlasWidth + c.x))
      const entrance = cells.find((c) => c.value === 2)
      if (entrance) {
        const open = NEIGHBORS_4.some(([dx, dz]) => {
          const ex = entrance.x + dx, ez = entrance.z + dz
          if (!inside(ex, ez)) return false
          const m = ez * atlasWidth + ex
          return walk.of[m] === target && !solid.has(m) && !reserved.has(m)
        })
        if (!open) continue
      }
      group.nodes[i] = n
      for (const c of cells) if (c.value >= 1) taken.add(c.z * atlasWidth + c.x)
      report.moved += 1
      placed = true
      break
    }
    if (!placed) report.stranded += 1
  }
  return report
}
