// ─── RMG zone layout + shaping (issue #210, Milestones 1 & 4) ───────────────
// `layoutZoneCenters` places zone centers evenly around a ring (a BFS walk
// of the zone graph, so graph-adjacent zones start geometrically adjacent
// too) as the SEED configuration, then `relaxZoneCenters` runs a real
// Fruchterman-Reingold force-directed relaxation on top of it — connected
// zones attract, every pair repels as a "soft sphere" sized by each zone's
// own `size` (VCMI's own description), so zones with different sizes
// actually claim proportionally different amounts of space rather than
// sitting on a perfectly uniform ring. `assignTilesToZones` (the plain
// weighted-Voronoi tessellation) is kept for callers that don't need real
// Penrose-tiling zone shapes; `zone-shape-penrose.ts`'s
// `assignTilesToZonesPenrose` (Milestone 4) is what the real generator
// pipeline uses now — see that file's own header comment for why a real
// de Bruijn pentagrid tiling was worth the implementation risk this
// project's own plan originally flagged it for.

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
 * Fruchterman-Reingold force-directed relaxation (issue #210's own research
 * notes on VCMI's real algorithm) starting from `initialCenters` (normally
 * `layoutZoneCenters`'s own ring seed, matching VCMI's "N×N grid seed, then
 * relax" structure). Every zone is a "soft sphere" — its own effective
 * radius is `baseRadius * sqrt(zone.size)`, so two zones' natural
 * equilibrium spacing is the SUM of their own radii, not a single map-wide
 * constant — connected zones (graph edges) attract toward that spacing,
 * every pair (connected or not) repels away from it, and simulated
 * annealing (a cooling "temperature" cap on each step's movement) settles
 * the system rather than letting it oscillate forever. Positions stay
 * clamped to the same inset bounds `layoutZoneCenters` itself respects.
 * `radiusMultiplier` (default 1 — unchanged prior behavior) scales every
 * zone's own equilibrium "soft sphere" radius uniformly: below 1 packs
 * zones tighter (denser, more crowded interiors), above 1 spreads them
 * further apart (more open space per zone) — generate-random-map.ts's own
 * user-facing `zoneSpread` option.
 */
export function relaxZoneCenters(
  sizeX: number,
  sizeZ: number,
  graph: ZoneGraph,
  initialCenters: ZoneCenter[],
  rng: () => number,
  iterations = 300,
  radiusMultiplier = 1,
): ZoneCenter[] {
  const n = initialCenters.length
  if (n <= 1) return initialCenters

  const zoneById = new Map(graph.zones.map((z) => [z.id, z]))
  const baseRadius = Math.sqrt((sizeX * sizeZ) / n) * 0.35 * radiusMultiplier
  const radius = initialCenters.map((c) => baseRadius * Math.sqrt(zoneById.get(c.zoneId)?.size ?? 1))

  const insetX = Math.max(1, Math.floor(sizeX * 0.1))
  const insetZ = Math.max(1, Math.floor(sizeZ * 0.1))
  const minX = insetX
  const maxX = sizeX - 1 - insetX
  const minZ = insetZ
  const maxZ = sizeZ - 1 - insetZ

  const posX = initialCenters.map((c) => c.x)
  const posZ = initialCenters.map((c) => c.z)
  let temperature = Math.max(sizeX, sizeZ) * 0.08

  for (let iter = 0; iter < iterations; iter++) {
    const dispX = new Array(n).fill(0)
    const dispZ = new Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = posX[i] - posX[j]
        let dz = posZ[i] - posZ[j]
        let dist = Math.hypot(dx, dz)
        if (dist < 0.01) {
          dx = rng() - 0.5
          dz = rng() - 0.5
          dist = Math.max(0.01, Math.hypot(dx, dz))
        }
        const k = radius[i] + radius[j]
        const force = (k * k) / dist
        const fx = (dx / dist) * force
        const fz = (dz / dist) * force
        dispX[i] += fx; dispZ[i] += fz
        dispX[j] -= fx; dispZ[j] -= fz
      }
    }

    for (const [a, b] of graph.edges) {
      const dx = posX[a] - posX[b]
      const dz = posZ[a] - posZ[b]
      const dist = Math.max(0.01, Math.hypot(dx, dz))
      const k = radius[a] + radius[b]
      const force = (dist * dist) / k
      const fx = (dx / dist) * force
      const fz = (dz / dist) * force
      dispX[a] -= fx; dispZ[a] -= fz
      dispX[b] += fx; dispZ[b] += fz
    }

    for (let i = 0; i < n; i++) {
      const dist = Math.max(0.01, Math.hypot(dispX[i], dispZ[i]))
      const capped = Math.min(dist, temperature)
      posX[i] = Math.min(maxX, Math.max(minX, posX[i] + (dispX[i] / dist) * capped))
      posZ[i] = Math.min(maxZ, Math.max(minZ, posZ[i] + (dispZ[i] / dist) * capped))
    }

    temperature *= 0.97
  }

  return initialCenters.map((c, i) => ({ zoneId: c.zoneId, x: Math.round(posX[i]), z: Math.round(posZ[i]) }))
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
