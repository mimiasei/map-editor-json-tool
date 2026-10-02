// ─── Map Grid — every player start must reach every other (generated maps) ──
// Final-net counterpart to rmg/zone-validation.ts's `repairIsolatedPlayerStarts`
// (issue #248): that repair only ever tries one tactic (punch a ramp through
// an elevation wall bordering the player's own pocket) and can come up empty
// at aggressive hill/valley/water settings, shipping a player who cannot
// reach anyone. This runs on the finished container and always finds a way:
// a cheapest-modification search (Dijkstra) from the isolated start's pocket
// to the rest of the map, where stepping onto
//   - a free tile costs ~nothing,
//   - an unramped elevation wall costs a ramp (`climbs`),
//   - a water tile costs reclaiming it to land,
//   - a decoration's solid cell costs deleting that decoration,
// and a real, non-decorative object (mine, dwelling, city, …) is never
// removed. Applied along the found path, then re-verified (bounded loop).

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { buildBlockedTileSet, isElevationWallTile } from './passability'
import { groupOf } from './tile-index'
import { accessNodesFor, buildNodeOwners, buildPortalEdges, floodFill, PLAYER_START_SIDS } from './reachability-validation'

type ConnectivityContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

export interface ConnectivityGuaranteeResult {
  climbAdds: number[]
  /** Tiles reclaimed from water: set water 0 and level 0. */
  waterReclaims: number[]
  /** Decorations deleted because their solid cell sat on the only path. */
  decorationDeletions: { id: number; sid: string }[]
  levelChanges: { node: number; level: number }[]
  climbClears: number[]
}

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const COST_FREE = 1
const COST_WALL = 4
const COST_DECORATION = 6
const COST_WATER = 8

class MinHeap {
  private items: [number, number][] = []
  get size(): number { return this.items.length }
  push(cost: number, node: number): void {
    const a = this.items
    a.push([cost, node])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= a[i][0]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): [number, number] {
    const a = this.items
    const top = a[0]
    const last = a.pop() as [number, number]
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

export function computeConnectivityGuarantee(context: ConnectivityContext, catalog: GameCatalog | null): ConnectivityGuaranteeResult {
  const result: ConnectivityGuaranteeResult = { climbAdds: [], waterReclaims: [], decorationDeletions: [], levelChanges: [], climbClears: [] }
  const { sizeX, sizeZ } = context
  const tileCount = sizeX * sizeZ
  if (sizeX <= 0 || sizeZ <= 0 || context.levelsMap.length !== tileCount) return result
  const catalogById = new Map<string, CatalogMapObject>((catalog?.mapObjects ?? []).map((o) => [o.id, o]))

  let placed = [...(context.placedObjects as PlacedObject[])]
  const levels = [...context.levelsMap]
  const climbs = context.climbsMap.length === tileCount ? [...context.climbsMap] : new Array<number>(tileCount).fill(0)
  const water = context.waterMap.length === tileCount ? [...context.waterMap] : new Array<number>(tileCount).fill(0)
  const changedLevels = new Map<number, number>()
  const setLevel = (node: number, level: number): void => { levels[node] = level; changedLevels.set(node, level) }

  const neighborsOf = (n: number): number[] => {
    const x = n % sizeX
    const z = Math.floor(n / sizeX)
    const out: number[] = []
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      out.push(nz * sizeX + nx)
    }
    return out
  }

  for (let round = 0; round < 12; round++) {
    const starts = placed.filter((p) => p.type === 0 && PLAYER_START_SIDS.has(p.sid)).map((item) => {
      const nodes = accessNodesFor(item, catalogById, sizeX)
      return { item, access: nodes.length > 0 ? nodes : [item.node] }
    })
    if (starts.length < 2) break
    const ctx = { ...context, placedObjects: placed, levelsMap: levels, climbsMap: climbs, waterMap: water }
    const blocked = buildBlockedTileSet(ctx, catalog)
    const portalEdges = buildPortalEdges(placed, catalogById, sizeX)
    const reaches = starts.map((s) => floodFill(s.access, blocked, sizeX, sizeZ, portalEdges))
    const isolatedIdx = starts.findIndex((_, i) => !starts.some((o, j) => j !== i && o.access.some((n) => reaches[i].has(n))))
    if (isolatedIdx < 0) break

    // A start whose own entrance cell is itself blocked (floodFill drops a
    // blocked seed) has an EMPTY pocket — seed the search from the entrance
    // cell(s) instead, so that very tile gets fixed as the first path step.
    const pocket = reaches[isolatedIdx].size > 0 ? reaches[isolatedIdx] : new Set<number>()
    const startNodes = pocket.size > 0 ? [...pocket] : starts[isolatedIdx].access
    const goal = floodFill(starts.filter((_, j) => j !== isolatedIdx).flatMap((s) => s.access), blocked, sizeX, sizeZ, portalEdges)
    const nodeOwners = buildNodeOwners(placed, catalogById, sizeX)
    const placedById = new Map<number, PlacedObject>()
    for (const o of placed) if (o.type === 0) placedById.set(o.id, o)
    const isDecoration = (id: number): boolean => {
      const o = placedById.get(id)
      return !!o && groupOf(o, catalog) === 'decorations'
    }

    const stepCost = (n: number): number | null => {
      if (water[n] !== 0) return COST_WATER
      const owners = nodeOwners.get(n)
      if (owners && owners.length > 0 && blocked.has(n)) return owners.every((o) => isDecoration(o.id)) ? COST_DECORATION : null
      if (blocked.has(n)) return COST_WALL
      return COST_FREE
    }

    const dist = new Map<number, number>()
    const prev = new Map<number, number>()
    const heap = new MinHeap()
    for (const n of startNodes) { dist.set(n, 0); heap.push(0, n) }
    let reached: number | null = null
    while (heap.size > 0) {
      const [d, node] = heap.pop()
      if (d !== dist.get(node)) continue
      if (goal.has(node) && !pocket.has(node)) { reached = node; break }
      for (const n of neighborsOf(node)) {
        const c = stepCost(n)
        if (c === null) continue
        const nd = d + c
        const existing = dist.get(n)
        if (existing !== undefined && existing <= nd) continue
        dist.set(n, nd)
        prev.set(n, node)
        heap.push(nd, n)
      }
    }
    if (reached === null) break // walled in by real, non-decorative objects only — nothing safe to change

    const path: number[] = []
    for (let cur: number | undefined = reached; cur !== undefined && !pocket.has(cur); cur = prev.get(cur)) path.push(cur)
    path.reverse()

    const objectSolid = buildBlockedTileSet({ ...ctx, levelsMap: [], climbsMap: [], waterMap: [] }, catalog)
    const deleteIds = new Set<number>()
    for (let k = 0; k < path.length; k++) {
      const cur = path[k]
      if (water[cur] !== 0) {
        water[cur] = 0
        setLevel(cur, 0)
        result.waterReclaims.push(cur)
      }
      for (const o of nodeOwners.get(cur) ?? []) {
        if (isDecoration(o.id)) deleteIds.add(o.id)
      }
      if (!isElevationWallTile(cur, sizeX, sizeZ, levels, climbs)) continue
      const before = k > 0 ? path[k - 1] : null
      const after = k + 1 < path.length ? path[k + 1] : null
      const candidates = [cur, ...(before !== null ? [before] : []), ...(after !== null ? [after] : []), ...neighborsOf(cur)]
      let ramped = false
      for (const x of candidates) {
        if (climbs[x] === 1 || water[x] !== 0 || objectSolid.has(x)) continue
        if (!neighborsOf(x).some((m) => levels[m] > levels[x])) continue // a ramp is only ever the LOWER side of a boundary
        climbs[x] = 1
        if (isElevationWallTile(cur, sizeX, sizeZ, levels, climbs)) { climbs[x] = 0; continue }
        result.climbAdds.push(x)
        ramped = true
        break
      }
      if (!ramped) {
        // No legal ramp spot anywhere around this wall tile — flatten the
        // whole elevated area it belongs to rather than leave the player
        // walled in (a ramp-less hill/valley is what this guarantee exists
        // to prevent in the first place).
        const level = levels[cur]
        const queue = [cur]
        const seenFlat = new Set<number>([cur])
        while (queue.length > 0) {
          const n = queue.pop() as number
          setLevel(n, 0)
          if (climbs[n] === 1) { climbs[n] = 0; result.climbClears.push(n) }
          for (const m of neighborsOf(n)) {
            if (seenFlat.has(m) || levels[m] !== level || water[m] !== 0) continue
            seenFlat.add(m)
            queue.push(m)
          }
        }
      }
    }
    if (deleteIds.size > 0) {
      for (const id of deleteIds) {
        const o = placedById.get(id)
        if (o) result.decorationDeletions.push({ id, sid: o.sid })
      }
      placed = placed.filter((o) => !(o.type === 0 && deleteIds.has(o.id)))
    }
  }

  result.levelChanges = [...changedLevels].map(([node, level]) => ({ node, level }))
  return result
}
