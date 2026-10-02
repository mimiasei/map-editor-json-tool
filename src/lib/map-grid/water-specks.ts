// ─── Map Grid — empty land specks inside water ──────────────────────────────
// Real user request (issue #248): "when creating water areas, there's no
// point in having small unreachable island spots in them without anything on
// them." A speck is a 4-connected group of non-water tiles that nothing
// cares about: no placed object (other than pure decoration), no road/river,
// no zone anchor, level 0, no ramp. Flooding it only ever enlarges an
// existing water body, since by construction the group is entirely bordered
// by water or the map edge.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles } from './footprint'
import { groupOf } from './tile-index'

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** Components of non-water tiles with no tile in `occupied`, all at level 0
 *  with no ramp — returned flat. `waterNodes` empty means there is no lake
 *  to enclose anything, so nothing is a speck. */
export function findEmptyLandSpecks(
  sizeX: number, sizeZ: number, waterNodes: Set<number>, occupied: Set<number>, levelsMap: number[], climbsMap: number[],
): number[] {
  if (waterNodes.size === 0) return []
  const seen = new Set<number>()
  const flood: number[] = []
  const tileCount = sizeX * sizeZ
  for (let start = 0; start < tileCount; start++) {
    if (seen.has(start) || waterNodes.has(start)) continue
    const comp: number[] = []
    const queue = [start]
    seen.add(start)
    let keep = false
    while (queue.length > 0) {
      const node = queue.pop() as number
      comp.push(node)
      if (occupied.has(node) || levelsMap[node] !== 0 || climbsMap[node] === 1) keep = true
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const n = nz * sizeX + nx
        if (seen.has(n) || waterNodes.has(n)) continue
        seen.add(n)
        queue.push(n)
      }
    }
    if (!keep) flood.push(...comp)
  }
  return flood
}

type SpeckContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap' | 'riverNodes' | 'roadsMap'>

export interface WaterSpeckGuaranteeResult {
  floodChanges: { node: number; waterId: number }[]
  /** Decorations standing on a flooded speck — they would end up in water. */
  decorationDeletions: number[]
}

/** Container-level version, run last on a generated map: a speck can be left
 *  empty by an earlier fix (an unreachable object on it was relocated away),
 *  and a decoration alone (a beach's dry-grass tuft) doesn't make it worth
 *  keeping. */
export function computeWaterSpeckGuarantee(context: SpeckContext, catalog: GameCatalog | null): WaterSpeckGuaranteeResult {
  const { sizeX, sizeZ } = context
  const tileCount = sizeX * sizeZ
  const none: WaterSpeckGuaranteeResult = { floodChanges: [], decorationDeletions: [] }
  if (sizeX <= 0 || sizeZ <= 0 || context.waterMap.length !== tileCount || context.levelsMap.length !== tileCount) return none
  const waterNodes = new Set<number>()
  for (let n = 0; n < tileCount; n++) if (context.waterMap[n] !== 0) waterNodes.add(n)
  if (waterNodes.size === 0) return none

  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const occupied = new Set<number>(context.riverNodes.keys())
  for (let n = 0; n < tileCount; n++) if ((context.roadsMap[n] ?? 0) > 0) occupied.add(n)
  const decorationsAt = new Map<number, PlacedObject[]>()
  for (const obj of context.placedObjects as PlacedObject[]) {
    const isDecoration = obj.type === 0 && groupOf(obj, catalog) === 'decorations'
    const cells = obj.type === 0 ? computeFootprintTiles(catalogById.get(obj.sid), obj.x, obj.z) : []
    const nodes = [obj.node, ...cells.filter((c) => c.value !== 0).map((c) => c.z * sizeX + c.x)]
    for (const n of nodes) {
      if (isDecoration) {
        const list = decorationsAt.get(n)
        if (list) list.push(obj)
        else decorationsAt.set(n, [obj])
      } else {
        occupied.add(n)
      }
    }
  }

  const specks = findEmptyLandSpecks(sizeX, sizeZ, waterNodes, occupied, context.levelsMap, context.climbsMap)
  if (specks.length === 0) return none
  const deletions = new Set<number>()
  const floodChanges = specks.map((node) => {
    for (const o of decorationsAt.get(node) ?? []) deletions.add(o.id)
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    let waterId = 1
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const w = context.waterMap[nz * sizeX + nx]
      if (w) { waterId = w; break }
    }
    return { node, waterId }
  })
  return { floodChanges, decorationDeletions: [...deletions] }
}
