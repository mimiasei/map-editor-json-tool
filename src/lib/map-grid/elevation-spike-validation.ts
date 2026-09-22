// ─── Map Grid — single-tile elevation spike/pit validation ──────────────────
// Flags a placement (object or squad) sitting on a tile whose ALL in-bounds
// 4-neighbors share one level, different from the tile's own — an isolated
// spike/pit, most plausibly a stray remnant of zone-elevation.ts's organic
// blob growth. Deliberately distinct from isElevationWallTile
// (passability.ts): that flags any node bordering a *different* level on
// just one side (the normal case, fixed elsewhere by punching a ramp through
// the boundary — repairSealedZones/repairIsolatedPlayerStarts); this is the
// narrower "every side differs" case, where there's no coherent boundary to
// ramp, just a stray value that should be flattened to match its
// surroundings instead. A node already served by a real ramp on one side
// (climbsMap === 1) is excluded — that's a legitimate ramped 1-tile
// platform, not a problem.

import type { MapContext, PlacedObject } from '@/types/map-context'

export interface ElevationSpikePlacement {
  key: string
  sid: string
  id: number
  entityType: 0 | 2
  x: number
  z: number
  node: number
  fromLevel: number
  toLevel: number
}

type SpikeContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap'>

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export function findElevationSpikePlacements(context: SpikeContext): ElevationSpikePlacement[] {
  const { sizeX, sizeZ, placedObjects, levelsMap, climbsMap } = context
  const tileCount = sizeX * sizeZ
  if (sizeX <= 0 || sizeZ <= 0 || levelsMap.length !== tileCount) return []
  const climbs = climbsMap.length === tileCount ? climbsMap : []

  const issues: ElevationSpikePlacement[] = []
  const seenNodes = new Set<number>()
  for (const obj of placedObjects as PlacedObject[]) {
    if (obj.type !== 0 && obj.type !== 2) continue
    if (seenNodes.has(obj.node)) continue

    const ownLevel = levelsMap[obj.node] ?? 0
    let neighborLevel: number | null = null
    let uniform = true
    let neighborCount = 0
    let nearRamp = false
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = obj.x + dx
      const nz = obj.z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      neighborCount++
      const nNode = nz * sizeX + nx
      if (climbs[nNode] === 1) nearRamp = true
      const nLevel = levelsMap[nNode] ?? 0
      if (neighborLevel === null) neighborLevel = nLevel
      else if (nLevel !== neighborLevel) { uniform = false; break }
    }
    if (!uniform || neighborCount === 0 || neighborLevel === null || nearRamp) continue
    if (neighborLevel === ownLevel) continue

    seenNodes.add(obj.node)
    issues.push({
      key: obj.key, sid: obj.sid, id: obj.id, entityType: obj.type,
      x: obj.x, z: obj.z, node: obj.node, fromLevel: ownLevel, toLevel: neighborLevel,
    })
  }
  return issues
}

export function describeElevationSpikePlacement(issue: ElevationSpikePlacement): string {
  return `${issue.sid} (id ${issue.id}) at (${issue.x}, ${issue.z}) sits on a level-${issue.fromLevel} tile surrounded by level ${issue.toLevel}`
}
