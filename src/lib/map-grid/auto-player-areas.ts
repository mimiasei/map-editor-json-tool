// ─── Auto-paint Player Areas for the cities already on the map ────────────────
// The random map generator paints one Player Area per player zone, from its zone partition: zone centres, a size-weighted
// tessellation of the map (assignTilesToZonesPenrose) and one neutral zone between the players, which stays unpainted. A map that was
// not generated has no zones, only its city spawners, so this builds the same kind of layout around them: a player zone centred on each
// city, a neutral zone between each pair of neighbours, and the same tessellation. The tiles of the player zones are the areas.
// Zone sizes use the generator's weights (player 3, neutral 2, zone-graph.ts).

import type { MapContext, PlacedObject } from '@/types/map-context'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { assignTilesToZonesPenrose } from '@/lib/rmg/zone-shape-penrose'
import type { ZoneSpec } from '@/lib/rmg/zone-graph'
import type { ZoneCenter } from '@/lib/rmg/zone-layout'

export interface PlayerAreaPlan {
  /** Every tile of every player area, with its area id (1..n, in player order). */
  changes: { node: number; zoneId: number }[]
  /** The players the areas were made for, area id = index + 1. */
  players: PlacedObject[]
}

/** The city spawners that are the players' starts, in player order. */
export function playerCities(context: Pick<MapContext, 'placedObjects'>): PlacedObject[] {
  return context.placedObjects
    .filter((o) => o.type === 0 && o.sid === 'city-spawner')
    .sort((a, b) => (a.spawnerInfo?.owner ?? 0) - (b.spawnerInfo?.owner ?? 0) || a.id - b.id)
}

/** Whether any tile is painted as a Player Area (zone id 0 is "unpainted"). */
export function hasPlayerAreas(context: Pick<MapContext, 'customAreasPainting'>): boolean {
  return context.customAreasPainting.some((id) => id !== 0)
}

/** The areas to paint, or null when the map has fewer than two player cities. */
export function planPlayerAreas(context: Pick<MapContext, 'placedObjects' | 'sizeX' | 'sizeZ'>): PlayerAreaPlan | null {
  const { sizeX, sizeZ } = context
  const players = playerCities(context)
  if (players.length < 2 || sizeX <= 0 || sizeZ <= 0) return null
  const n = players.length

  const zones: ZoneSpec[] = []
  const centers: ZoneCenter[] = []
  players.forEach((p, i) => {
    zones.push({ id: i, kind: 'player', playerIndex: i + 1, size: 3 })
    centers.push({ zoneId: i, x: p.x, z: p.z })
  })

  // A neutral zone between each pair of neighbours around the players' middle. Two players have the same midpoint twice, so the neutral
  // zones sit to either side of the line between them; with more, each is pushed out from the middle.
  const midX = players.reduce((s, p) => s + p.x, 0) / n
  const midZ = players.reduce((s, p) => s + p.z, 0) / n
  const ring = [...players.keys()].sort((a, b) => Math.atan2(players[a].z - midZ, players[a].x - midX) - Math.atan2(players[b].z - midZ, players[b].x - midX))
  for (let k = 0; k < n; k++) {
    const a = players[ring[k]]
    const b = players[ring[(k + 1) % n]]
    const mx = (a.x + b.x) / 2
    const mz = (a.z + b.z) / 2
    let x: number
    let z: number
    if (n === 2) {
      const dx = b.x - a.x
      const dz = b.z - a.z
      const side = k === 0 ? 1 : -1
      x = mx - dz * 0.3 * side
      z = mz + dx * 0.3 * side
    } else {
      const outX = mx - midX
      const outZ = mz - midZ
      const len = Math.hypot(outX, outZ) || 1
      const push = Math.hypot(a.x - midX, a.z - midZ) * 0.25
      x = mx + (outX / len) * push
      z = mz + (outZ / len) * push
    }
    x = Math.min(sizeX - 1, Math.max(0, Math.round(x)))
    z = Math.min(sizeZ - 1, Math.max(0, Math.round(z)))
    zones.push({ id: n + k, kind: 'neutral', size: 2 })
    centers.push({ zoneId: n + k, x, z })
  }

  // The tessellation draws on a random number generator; seeding it from the cities makes the same map give the same areas.
  const seed = players.reduce((s, p) => (Math.imul(s, 31) + p.node + 1) >>> 0, 17)
  const { zoneIdByNode } = assignTilesToZonesPenrose(sizeX, sizeZ, centers, zones, createSeededRng(seed))

  const changes: { node: number; zoneId: number }[] = []
  for (let node = 0; node < zoneIdByNode.length; node++) {
    const zone = zoneIdByNode[node]
    if (zone < n) changes.push({ node, zoneId: zone + 1 })
  }
  return { changes, players }
}
