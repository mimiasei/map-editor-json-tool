// ─── RMG zone layout + shaping (issue #210, Milestone 1) ────────────────────
// Two steps, both deliberately simpler substitutes for VCMI's own
// Fruchterman-Reingold layout relaxation + Penrose-tiling zone shaping (see
// issue #210's own risk note — those are the least essential-to-gameplay,
// most algorithmically involved pieces of VCMI's real RMG, worth revisiting
// once this simpler version's actual pain points are known):
//
// 1. `layoutZoneCenters` places zone centers evenly around a ring, ordered
//    by a breadth-first walk of the zone graph rather than raw declaration
//    order — so graph-adjacent zones end up geometrically adjacent too,
//    without needing real force-directed physics.
// 2. `assignTilesToZones` is a multiplicative-weighted Voronoi tessellation
//    (distance to center, divided by each zone's own size weight) — gives
//    every zone an irregular, organically-sized region without porting
//    VCMI's specific Penrose subdivision geometry.

import type { ZoneGraph, ZoneSpec } from './zone-graph'

export interface ZoneCenter {
  zoneId: number
  x: number
  z: number
}

/** Breadth-first zone order starting from zone 0, so placing zones evenly
 *  around a circle in this order puts every graph-adjacent pair next to
 *  each other geometrically. `buildZoneGraph`'s own ring topology is
 *  already in this order, but computing it from the graph (rather than
 *  assuming ring order) keeps this file correct if a richer topology
 *  (star/tree) replaces that later. */
function bfsOrder(graph: ZoneGraph): number[] {
  const n = graph.zones.length
  const adjacency: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of graph.edges) {
    adjacency[a].push(b)
    adjacency[b].push(a)
  }
  const visited = new Set<number>([0])
  const order = [0]
  const queue = [0]
  while (queue.length > 0) {
    const node = queue.shift() as number
    for (const neighbor of adjacency[node]) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      order.push(neighbor)
      queue.push(neighbor)
    }
  }
  // buildZoneGraph always produces a connected graph, so this never fires
  // today — kept so a disconnected graph fails soft (every zone still gets
  // a center) rather than silently dropping unreachable ones.
  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) order.push(i)
  }
  return order
}

/** One center point per zone, indexed by zone id (`centers[zone.id]`),
 *  evenly spaced around an inset ring so no zone center sits at the very
 *  map edge. */
export function layoutZoneCenters(sizeX: number, sizeZ: number, graph: ZoneGraph): ZoneCenter[] {
  const order = bfsOrder(graph)
  const insetX = Math.max(1, Math.floor(sizeX * 0.12))
  const insetZ = Math.max(1, Math.floor(sizeZ * 0.12))
  const cx = (sizeX - 1) / 2
  const cz = (sizeZ - 1) / 2
  const rx = cx - insetX
  const rz = cz - insetZ
  const n = order.length

  const centers: ZoneCenter[] = new Array(n)
  order.forEach((zoneId, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const x = Math.min(sizeX - 1, Math.max(0, Math.round(cx + rx * Math.cos(angle))))
    const z = Math.min(sizeZ - 1, Math.max(0, Math.round(cz + rz * Math.sin(angle))))
    centers[zoneId] = { zoneId, x, z }
  })
  return centers
}

/**
 * Assigns every map tile to its nearest zone center, weighted by each
 * zone's `size` (a bigger zone's center "reaches" proportionally further).
 * Returns both a flat `zoneIdByNode` lookup (same row-major indexing as
 * every other flat map array) and each zone's own tile list.
 */
export function assignTilesToZones(
  sizeX: number,
  sizeZ: number,
  centers: ZoneCenter[],
  zones: ZoneSpec[],
): { zoneIdByNode: number[]; tilesByZone: Map<number, number[]> } {
  const weightByZone = new Map(zones.map((z) => [z.id, Math.sqrt(z.size)]))
  const zoneIdByNode = new Array<number>(sizeX * sizeZ)
  const tilesByZone = new Map<number, number[]>(zones.map((z) => [z.id, []]))

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      let bestZoneId = centers[0].zoneId
      let bestScore = Infinity
      for (const center of centers) {
        const dx = x - center.x
        const dz = z - center.z
        const score = Math.sqrt(dx * dx + dz * dz) / (weightByZone.get(center.zoneId) ?? 1)
        if (score < bestScore) {
          bestScore = score
          bestZoneId = center.zoneId
        }
      }
      const node = z * sizeX + x
      zoneIdByNode[node] = bestZoneId
      tilesByZone.get(bestZoneId)!.push(node)
    }
  }

  return { zoneIdByNode, tilesByZone }
}

/** The tile within `tiles` closest to `center` — used to pick a zone's own
 *  real "anchor" tile (player spawn node, a road/river endpoint, or an
 *  island landmass's own growth seed) from its own assigned tiles, since a
 *  zone's raw layout center coordinate can itself belong to a neighboring
 *  zone (or, for an island zone, its own flooded portion) at a boundary. */
export function nearestTile(tiles: number[], sizeX: number, center: ZoneCenter): number {
  let best = tiles[0]
  let bestDist = Infinity
  for (const node of tiles) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const dist = (x - center.x) ** 2 + (z - center.z) ** 2
    if (dist < bestDist) { bestDist = dist; best = node }
  }
  return best
}
