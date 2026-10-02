// ─── RMG zone shaping via real Penrose tiling (issue #210, Milestone 4) ────
// Replaces zone-layout.ts's plain weighted-Voronoi tile assignment with
// VCMI's own real two-step approach (issue #210's research notes): "a set
// of Penrose tiling vertices is created... tiles assign to nearest vertex,
// vertices assign to nearest zone." penrose-tiling.ts generates the actual
// aperiodic tiling (verified against its own known mathematical invariants
// — see that file's header comment); this module only does the RMG-
// specific plumbing: build a tiling covering the map, dedupe its vertices,
// assign each vertex to its nearest (size-weighted) zone center exactly
// like the old Voronoi assignment did per-tile, then assign each MAP TILE
// to its nearest vertex's zone via a spatially-bucketed approximate
// nearest-neighbor search (exact nearest-neighbor precision doesn't matter
// here — this only feeds zone/biome assignment, never collision or
// pathfinding, so a rare near-tie resolved "wrong" is invisible).
//
// Because Penrose vertices are still a genuine Voronoi partition of the
// SAME zone centers (just sampled at discrete vertex positions instead of
// every tile), each zone's resulting tile set closely approximates the
// same smooth region the old Voronoi assignment produced — with jagged,
// irregular boundaries instead of smooth curves, not a structurally
// different (or disconnected) partition. Confirmed empirically, not just
// assumed: a verification sweep found 0 zones split into multiple
// disconnected tile components across every tested size/zone-count
// combination (see the PR this file landed in).

import { generatePenroseTiling, randomPentagridOffsets, type RhombusTile } from './penrose-tiling'
import type { ZoneCenter } from './zone-layout'
import type { ZoneSpec } from './zone-graph'

/** Default tiles-per-pentagrid-unit — tunes Penrose vertex density. Lower =
 *  finer, more jagged boundaries (more compute); higher = coarser,
 *  blockier. Callers can override via `assignTilesToZonesPenrose`'s own
 *  `scale` param (generate-random-map.ts's `zoneJaggedness` option maps a
 *  user-facing 0-1 slider onto this same range — see that file's own doc
 *  comment for the exact mapping). */
const DEFAULT_SCALE = 4

/** Every unique vertex across `tiles`, deduped by rounded coordinate (many
 *  rhombi share a vertex), converted from pentagrid units into map tile
 *  coordinates. */
function collectVertices(tiles: RhombusTile[], scale: number, cx: number, cz: number): [number, number][] {
  const seen = new Set<string>()
  const vertices: [number, number][] = []
  const TOL = 4
  for (const tile of tiles) {
    for (const [vx, vy] of tile.vertices) {
      const key = `${vx.toFixed(TOL)},${vy.toFixed(TOL)}`
      if (seen.has(key)) continue
      seen.add(key)
      vertices.push([vx * scale + cx, vy * scale + cz])
    }
  }
  return vertices
}

const AREA_BALANCE_ITERATIONS = 40
const AREA_BALANCE_TOLERANCE = 0.04

export function assignTilesToZonesPenrose(
  sizeX: number,
  sizeZ: number,
  centers: ZoneCenter[],
  zones: ZoneSpec[],
  rng: () => number,
  scale = DEFAULT_SCALE,
): { zoneIdByNode: number[]; tilesByZone: Map<number, number[]> } {
  const cx = (sizeX - 1) / 2
  const cz = (sizeZ - 1) / 2
  const maxExtent = Math.max(sizeX, sizeZ)
  const gridRange = Math.ceil(maxExtent / 2 / scale) + Math.ceil(6 / scale) + 4

  const gammas = randomPentagridOffsets(rng)
  const tiles = generatePenroseTiling(gammas, gridRange)
  const vertices = collectVertices(tiles, scale, cx, cz)

  // Spatially bucket vertices for fast approximate-nearest-vertex lookup
  // per map tile — a plain O(tiles × vertices) scan would be too slow at
  // thousands of vertices × tens of thousands of tiles.
  const bucketSize = Math.max(2, scale)
  const bucketCols = Math.max(1, Math.ceil(sizeX / bucketSize))
  const bucketRows = Math.max(1, Math.ceil(sizeZ / bucketSize))
  const buckets = new Map<number, number[]>()
  const bucketOf = (x: number, z: number): [number, number] => [
    Math.min(bucketCols - 1, Math.max(0, Math.floor(x / bucketSize))),
    Math.min(bucketRows - 1, Math.max(0, Math.floor(z / bucketSize))),
  ]
  for (let i = 0; i < vertices.length; i++) {
    const [bx, bz] = bucketOf(vertices[i][0], vertices[i][1])
    const bi = bz * bucketCols + bx
    const list = buckets.get(bi)
    if (list) list.push(i)
    else buckets.set(bi, [i])
  }

  const tileVertex = new Int32Array(sizeX * sizeZ)
  const maxRing = Math.max(bucketCols, bucketRows)

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const [bx, bz] = bucketOf(x, z)
      let bestVertex = -1
      let bestDist = Infinity
      for (let ring = 0; ring <= maxRing; ring++) {
        for (let dbz = -ring; dbz <= ring; dbz++) {
          for (let dbx = -ring; dbx <= ring; dbx++) {
            if (Math.max(Math.abs(dbx), Math.abs(dbz)) !== ring) continue
            const nbx = bx + dbx
            const nbz = bz + dbz
            if (nbx < 0 || nbx >= bucketCols || nbz < 0 || nbz >= bucketRows) continue
            const list = buckets.get(nbz * bucketCols + nbx)
            if (!list) continue
            for (const vi of list) {
              const [vx, vz] = vertices[vi]
              const d = (vx - x) ** 2 + (vz - z) ** 2
              if (d < bestDist) { bestDist = d; bestVertex = vi }
            }
          }
        }
        if (bestVertex !== -1 && ring * bucketSize > Math.sqrt(bestDist)) break
      }
      tileVertex[z * sizeX + x] = bestVertex
    }
  }

  // Each vertex -> nearest (size-weighted) zone center. Same weighting
  // convention zone-layout.ts's own Voronoi assignment uses — then the
  // weights are nudged until every zone's tile count matches its share of
  // the map by `size` (issue #254): a plain weighted Voronoi left player
  // zones differing in area by up to ~65% at 4-6 players (measured over
  // 12 seeds), so one player simply owned far more land than another. The
  // per-zone correction is clamped so no zone's reach can balloon enough to
  // wrap around its neighbors (disconnected enclaves).
  const baseWeight = new Map(zones.map((z) => [z.id, Math.sqrt(z.size)]))
  const weightByZone = new Map(baseWeight)
  const vertexZoneId = new Array<number>(vertices.length)
  const assignVertices = (): void => {
    for (let i = 0; i < vertices.length; i++) {
      const [vx, vz] = vertices[i]
      let bestZoneId = centers[0].zoneId
      let bestScore = Infinity
      for (const center of centers) {
        const dx = vx - center.x
        const dz = vz - center.z
        const score = Math.sqrt(dx * dx + dz * dz) / (weightByZone.get(center.zoneId) ?? 1)
        if (score < bestScore) {
          bestScore = score
          bestZoneId = center.zoneId
        }
      }
      vertexZoneId[i] = bestZoneId
    }
  }
  const countAreas = (): Map<number, number> => {
    const areas = new Map<number, number>(zones.map((z) => [z.id, 0]))
    for (let node = 0; node < tileVertex.length; node++) {
      const v = tileVertex[node]
      const zoneId = v !== -1 ? vertexZoneId[v] : centers[0].zoneId
      areas.set(zoneId, (areas.get(zoneId) ?? 0) + 1)
    }
    return areas
  }
  assignVertices()
  const totalSize = zones.reduce((sum, z) => sum + z.size, 0)
  const totalTiles = sizeX * sizeZ
  for (let iter = 0; iter < AREA_BALANCE_ITERATIONS; iter++) {
    const areas = countAreas()
    let worst = 0
    for (const z of zones) {
      const target = (totalTiles * z.size) / totalSize
      worst = Math.max(worst, Math.abs((areas.get(z.id) ?? 0) - target) / target)
    }
    if (worst < AREA_BALANCE_TOLERANCE) break
    for (const z of zones) {
      const target = (totalTiles * z.size) / totalSize
      const step = Math.min(1.25, Math.max(0.8, Math.sqrt(target / Math.max(1, areas.get(z.id) ?? 0))))
      const base = baseWeight.get(z.id) ?? 1
      weightByZone.set(z.id, Math.min(base * 1.8, Math.max(base * 0.55, (weightByZone.get(z.id) ?? base) * step)))
    }
    assignVertices()
  }

  const zoneIdByNode = new Array<number>(sizeX * sizeZ)
  const tilesByZone = new Map<number, number[]>(zones.map((z) => [z.id, []]))
  for (let node = 0; node < tileVertex.length; node++) {
    const v = tileVertex[node]
    const zoneId = v !== -1 ? vertexZoneId[v] : centers[0].zoneId
    zoneIdByNode[node] = zoneId
    tilesByZone.get(zoneId)!.push(node)
  }

  return { zoneIdByNode, tilesByZone }
}
