// ─── RMG areas[] recomputation (issue #210, Milestone 3) ────────────────────
// The `.map` format's own `areas[]` region index — CLAUDE.md documents this
// as "the map's own connectivity/region index... split into multiple
// regions by GME's own (unreplicated-here) terrain-aware algorithm," and
// `buildBlankMap`'s own doc comment flags leaving it as one giant
// all-tiles region as "a known, real gap." Since this generator already
// partitions the whole map into zones (zone-layout.ts's Voronoi tile
// assignment), each zone IS a natural real region — this reuses that
// partition directly rather than inventing a second, separate
// region-splitting algorithm.
//
// Confirmed against a real, multi-area shipped map (Glittering_Strait.map,
// 15 areas): `neighbors` is a real, SYMMETRIC adjacency list (0/15 real
// areas had an asymmetric edge), and a non-`-1` `keyObjectId` always
// refers to a real id present in `objects[]` (6/15 real areas had one —
// not every area needs one). `rootNode`'s exact in-game meaning is less
// certain; used here as the zone's own anchor tile (already computed for
// spawn/road purposes elsewhere in this generator) — a defensible choice,
// not independently confirmed against real data the way neighbors'/
// keyObjectId's shape was.

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export interface ZoneArea {
  id: number
  keyObjectId: number
  rootNode: number
  nodes: number[]
  neighbors: number[]
  biome: string
}

/** Every OTHER zone id physically touching `zoneId`'s own tiles — computed
 *  from the real Voronoi tile assignment (`zoneIdByNode`), not the
 *  abstract zone graph's own edges (zone-graph.ts). A ring-topology graph
 *  edge doesn't guarantee two zones' actual painted regions border each
 *  other, and two zones that AREN'T graph-connected sometimes do end up
 *  physically adjacent after Voronoi shaping — this is a real, independent
 *  geometry computation, not derived from the graph. */
function computeZoneNeighbors(sizeX: number, sizeZ: number, zoneIdByNode: number[]): Map<number, Set<number>> {
  const neighbors = new Map<number, Set<number>>()
  const addEdge = (a: number, b: number): void => {
    if (!neighbors.has(a)) neighbors.set(a, new Set())
    if (!neighbors.has(b)) neighbors.set(b, new Set())
    neighbors.get(a)!.add(b)
    neighbors.get(b)!.add(a)
  }
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const node = z * sizeX + x
      const zoneId = zoneIdByNode[node]
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const neighborZoneId = zoneIdByNode[nz * sizeX + nx]
        if (neighborZoneId !== zoneId) addEdge(zoneId, neighborZoneId)
      }
    }
  }
  return neighbors
}

export function computeZoneAreas(
  sizeX: number,
  sizeZ: number,
  zoneIdByNode: number[],
  tilesByZone: Map<number, number[]>,
  zoneAnchorNode: Map<number, number>,
  zoneBiomeName: Map<number, string>,
  keyObjectIdByZone: Map<number, number>,
): ZoneArea[] {
  const neighborSets = computeZoneNeighbors(sizeX, sizeZ, zoneIdByNode)
  const areas: ZoneArea[] = []
  for (const [zoneId, nodes] of tilesByZone) {
    if (nodes.length === 0) continue
    areas.push({
      id: zoneId,
      keyObjectId: keyObjectIdByZone.get(zoneId) ?? -1,
      rootNode: zoneAnchorNode.get(zoneId) ?? nodes[0],
      nodes,
      neighbors: [...(neighborSets.get(zoneId) ?? [])].sort((a, b) => a - b),
      biome: zoneBiomeName.get(zoneId) ?? 'Grass',
    })
  }
  return areas
}
