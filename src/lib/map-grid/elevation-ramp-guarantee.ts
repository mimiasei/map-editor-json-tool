// ─── Map Grid — every elevated area must have a working ramp ────────────────
// Real user report (issue #248): RMG-generated hills/valleys sometimes had no
// ramp at all, which must never happen. Several later steps can remove or
// bury a ramp after the elevation generator placed it (a solid object landing
// on the ramp tile, the spike auto-fix flattening it, a water reclaim), so
// this is a final, generation-agnostic check over the finished map: every
// 4-connected dry area of level ≠ 0 must be bordered by at least one ramp
// (`climbsMap === 1`, on the lower side of the boundary — the same rule
// passability.ts's `isElevationWallTile` and the real sample maps follow)
// that no object's solid footprint is standing on. A component without one
// gets a new ramp where a legal, unoccupied spot exists; if there is truly
// none, the area is flattened back to level 0 — never shipped rampless.

import type { MapContext } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { buildBlockedTileSet } from './passability'

type RampGuaranteeContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

export interface ElevationRampGuaranteeResult {
  climbAdds: number[]
  levelChanges: { node: number; level: number }[]
  climbClears: number[]
}

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export function computeElevationRampGuarantee(context: RampGuaranteeContext, catalog: GameCatalog | null): ElevationRampGuaranteeResult {
  const { sizeX, sizeZ } = context
  const result: ElevationRampGuaranteeResult = { climbAdds: [], levelChanges: [], climbClears: [] }
  const tileCount = sizeX * sizeZ
  if (sizeX <= 0 || sizeZ <= 0 || context.levelsMap.length !== tileCount) return result

  const levels = [...context.levelsMap]
  const climbs = context.climbsMap.length === tileCount ? [...context.climbsMap] : new Array<number>(tileCount).fill(0)
  const hasWater = context.waterMap.length === tileCount
  const isDry = (n: number): boolean => !hasWater || context.waterMap[n] === 0
  // Object footprints only (an empty levels/climbs/water array makes
  // buildBlockedTileSet skip its terrain sources) — a ramp under a solid
  // object is unusable, but terrain walls are exactly what a ramp is for.
  const objectSolid = buildBlockedTileSet({ ...context, levelsMap: [], climbsMap: [], waterMap: [] }, catalog)

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

  const seen = new Set<number>()
  for (let start = 0; start < tileCount; start++) {
    if (seen.has(start) || levels[start] === 0 || !isDry(start)) continue
    const level = levels[start]
    const comp: number[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length > 0) {
      const node = queue.pop() as number
      comp.push(node)
      for (const n of neighborsOf(node)) {
        if (seen.has(n) || levels[n] !== level || !isDry(n)) continue
        seen.add(n)
        queue.push(n)
      }
    }

    // A hill's ramp is an outside tile one level below, bordering the
    // component; a valley's ramp is one of the component's own tiles,
    // bordering a tile one level above.
    const served = level > 0
      ? comp.some((t) => neighborsOf(t).some((n) => climbs[n] === 1 && levels[n] < level && !objectSolid.has(n)))
      : comp.some((t) => climbs[t] === 1 && !objectSolid.has(t) && neighborsOf(t).some((n) => levels[n] > level))
    if (served) continue

    let best: number | null = null
    for (const t of comp) {
      for (const n of neighborsOf(t)) {
        const rampNode = level > 0 ? n : t
        const otherSide = level > 0 ? t : n
        if (level > 0 ? levels[n] !== level - 1 : levels[n] !== level + 1) continue
        if (!isDry(rampNode) || !isDry(otherSide) || climbs[rampNode] === 1) continue
        if (objectSolid.has(rampNode) || objectSolid.has(otherSide)) continue
        if (best === null || rampNode < best) best = rampNode
      }
    }
    if (best !== null) {
      climbs[best] = 1
      result.climbAdds.push(best)
      continue
    }

    for (const t of comp) {
      levels[t] = 0
      result.levelChanges.push({ node: t, level: 0 })
      if (climbs[t] === 1) { climbs[t] = 0; result.climbClears.push(t) }
    }
    for (const t of comp) {
      for (const n of neighborsOf(t)) {
        if (climbs[n] !== 1) continue
        if (neighborsOf(n).every((m) => levels[m] === levels[n])) { climbs[n] = 0; result.climbClears.push(n) }
      }
    }
  }
  return result
}
