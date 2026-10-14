/**
 * Mirrored maps, last pass: no walkable route between two starts may be free of guards.
 *
 * The border sealing leaves a few gaps (a one-tile corridor a wall did not fit in, a wall the final auto-fix takes
 * down). This pass looks for the easiest route from each start to the others, counting a tile next to a guard as
 * guarded, and where it finds a route with no guard it puts one on the narrowest stretch of that route, together with
 * its mirror image, then looks again.
 */
import type { CatalogMapObject } from '@/lib/catalog/types'
import type { MapContainer } from '@/lib/map-write'
import { addObjectInstances } from '@/lib/map-write'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { isElevationWallTile } from '@/lib/map-grid/passability'
import { createPlacementState, tryPlaceAt, type ZonePlacement } from './zone-population'
import { mirrorNode } from './zone-mirror'

const GUARDED_COST = 1000
/** A guard goes no closer than this (Chebyshev) to a start. */
const START_CLEARANCE = 5
const MAX_GUARDS = 24

export interface GuardFreeRoutesInput {
  sizeX: number
  sizeZ: number
  catalogById: Map<string, CatalogMapObject>
  /** Every object on the finished map (anchor, sid, rotation), the start spawners included. */
  objects: { sid: string; node: number; rotation: number }[]
  /** Tiles of guard squads (concrete squads and random-squad objects). */
  guardNodes: number[]
  startSid: string
  waterMap: number[]
  levelsMap: number[]
  climbsMap: number[]
  nextTempId: () => number
  /** Settings of the new guards (a copy of an existing zone-boundary guard); none = nothing is added. */
  guardOverrides?: NonNullable<ZonePlacement['randomSquadOverrides']>
}

export interface GuardFreeRoutesResult {
  guards: ZonePlacement[]
  /** Routes that were still guard-free when the limit was reached. */
  remaining: number
}

export function closeGuardFreeRoutes(input: GuardFreeRoutesInput): GuardFreeRoutesResult {
  const { sizeX, sizeZ, catalogById, objects, waterMap, levelsMap, climbsMap } = input
  const result: GuardFreeRoutesResult = { guards: [], remaining: 0 }
  if (!input.guardOverrides) return result
  const tileCount = sizeX * sizeZ
  const nodeOf = (x: number, z: number): number => z * sizeX + x

  const solid = new Uint8Array(tileCount)
  const occupied = new Set<number>()
  const anchors = new Set<number>()
  const starts: number[] = []
  for (const o of objects) {
    anchors.add(o.node)
    if (o.sid === input.startSid) starts.push(o.node)
    if (o.sid === 'random-squad') continue
    for (const c of computeFootprintTiles(catalogById.get(o.sid), o.node % sizeX, Math.floor(o.node / sizeX), o.rotation)) {
      if (c.x < 0 || c.x >= sizeX || c.z < 0 || c.z >= sizeZ || c.value === 0) continue
      occupied.add(nodeOf(c.x, c.z))
      if (c.value === 1) solid[nodeOf(c.x, c.z)] = 1
    }
  }
  if (starts.length < 2) return result
  const blocked = new Uint8Array(tileCount)
  for (let n = 0; n < tileCount; n++) blocked[n] = solid[n] || waterMap[n] !== 0 || isElevationWallTile(n, sizeX, sizeZ, levelsMap, climbsMap) ? 1 : 0

  const guards = new Set(input.guardNodes)
  const zoc = new Uint8Array(tileCount)
  const addZoc = (g: number): void => {
    const gx = g % sizeX
    const gz = Math.floor(g / sizeX)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx
      const z = gz + dz
      if (x >= 0 && x < sizeX && z >= 0 && z < sizeZ) zoc[nodeOf(x, z)] = 1
    }
  }
  for (const g of guards) addZoc(g)

  const state = createPlacementState(occupied, anchors)
  for (const g of guards) state.usedAnchors.add(g)
  for (let n = 0; n < tileCount; n++) if (blocked[n]) { state.blocked.add(n); state.usedAnchors.add(n) }

  const near = (c: number): number[] => {
    const out: number[] = []
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = (c % sizeX) + dx
      const z = Math.floor(c / sizeX) + dz
      if (x >= 0 && x < sizeX && z >= 0 && z < sizeZ && !blocked[nodeOf(x, z)]) out.push(nodeOf(x, z))
    }
    return out
  }
  const startZones = starts.map(near)
  const clearOfStarts = (n: number): boolean => starts.every((s) => Math.max(Math.abs((s % sizeX) - (n % sizeX)), Math.abs(Math.floor(s / sizeX) - Math.floor(n / sizeX))) >= START_CLEARANCE)
  const openAround = (n: number): number => {
    let open = 0
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = (n % sizeX) + dx
      const z = Math.floor(n / sizeX) + dz
      if (x >= 0 && x < sizeX && z >= 0 && z < sizeZ && !blocked[nodeOf(x, z)]) open++
    }
    return open
  }
  const canGuard = (n: number): boolean => !blocked[n] && !occupied.has(n) && !state.usedAnchors.has(n) && clearOfStarts(n)

  /** The cheapest route from start `from` to any other start: its tiles, and how many guard zones it crosses. */
  const easiestRoute = (from: number): { path: number[]; guarded: number } | null => {
    const goals = new Set<number>()
    startZones.forEach((zone, i) => { if (i !== from) for (const n of zone) goals.add(n) })
    const dist = new Float64Array(tileCount).fill(Infinity)
    const prev = new Int32Array(tileCount).fill(-1)
    const heap: [number, number][] = []
    const push = (d: number, n: number): void => {
      heap.push([d, n])
      let i = heap.length - 1
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
    }
    const pop = (): [number, number] => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let i = 0
        for (;;) {
          let m = i
          const l = 2 * i + 1
          const r = l + 1
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r
          if (m === i) break
          [heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top
    }
    for (const n of startZones[from]) { dist[n] = 0; push(0, n) }
    while (heap.length) {
      const [d, n] = pop()
      if (d > dist[n]) continue
      if (goals.has(n)) {
        const path: number[] = []
        for (let c = n; c >= 0; c = prev[c]) path.push(c)
        return { path, guarded: Math.floor(d / GUARDED_COST) }
      }
      const x = n % sizeX
      const z = Math.floor(n / sizeX)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const m = nodeOf(nx, nz)
        if (blocked[m]) continue
        if (dx && dz && (blocked[nodeOf(nx, z)] || blocked[nodeOf(x, nz)])) continue
        const nd = d + (zoc[m] ? GUARDED_COST : 1)
        if (nd < dist[m]) { dist[m] = nd; prev[m] = n; push(nd, m) }
      }
    }
    return null
  }

  const left = sizeX / 2 - 1
  let placed = 0
  for (let from = 0; from < starts.length; from++) {
    for (let attempt = 0; attempt < 8 && placed < MAX_GUARDS; attempt++) {
      const route = easiestRoute(from)
      if (!route || route.guarded > 0) break
      // The narrowest stretch of the route that can take a guard and its mirror image.
      let best = -1
      let bestOpen = Infinity
      for (const t of route.path) {
        const n = t % sizeX <= left ? t : mirrorNode(t, sizeX)
        if (!canGuard(n) || !canGuard(mirrorNode(n, sizeX))) continue
        const open = openAround(n)
        if (open < bestOpen) { bestOpen = open; best = n }
      }
      if (best < 0) { result.remaining++; break }
      const twin = mirrorNode(best, sizeX)
      if (!tryPlaceAt('random-squad', best, sizeX, sizeZ, catalogById, state)) { result.remaining++; break }
      const placements: ZonePlacement[] = [{ tempId: input.nextTempId(), sid: 'random-squad', node: best, randomSquadOverrides: { ...input.guardOverrides } }]
      if (twin !== best && tryPlaceAt('random-squad', twin, sizeX, sizeZ, catalogById, state)) {
        placements.push({ tempId: input.nextTempId(), sid: 'random-squad', node: twin, randomSquadOverrides: { ...input.guardOverrides } })
      }
      for (const p of placements) { result.guards.push(p); guards.add(p.node); addZoc(p.node) }
      placed++
    }
  }
  return result
}

/** The same pass on a finished container (after the auto-fix, which may have taken a guard or a wall away). */
export function closeGuardFreeRoutesInContainer(container: MapContainer, catalog: { mapObjects: CatalogMapObject[] }): MapContainer {
  const b2 = JSON.parse(new TextDecoder().decode(container.chunks[1])) as {
    objects: { sid: string; nodes: number[]; rotations?: number[] }[]
    squads?: { nodes: number[] }[]
    objectsProperties?: { propRandomSquads?: { requestedValue: number; fraction: string; weeklyIncrementBonus?: number }[] }
    waterMap: number[]; levelsMap: number[]; climbsMap: number[]
  }
  const b1 = JSON.parse(new TextDecoder().decode(container.chunks[0])) as { sizeX: number; sizeZ: number }
  const sizeX = b1.sizeX
  const sizeZ = b1.sizeZ
  const catalogById = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  const objects: { sid: string; node: number; rotation: number }[] = []
  for (const g of b2.objects) g.nodes.forEach((node, i) => objects.push({ sid: g.sid, node, rotation: g.rotations?.[i] ?? 0 }))
  const startSid = b2.objects.some((g) => g.sid === 'city-spawner') ? 'city-spawner' : 'hero-spawner'
  const rows = [...(b2.objectsProperties?.propRandomSquads ?? [])].sort((a, b) => a.requestedValue - b.requestedValue)
  const row = rows[Math.floor(rows.length * 0.75)]
  if (!row) return container
  let nextId = 1_000_000
  const routes = closeGuardFreeRoutes({
    sizeX, sizeZ, catalogById, objects, startSid,
    guardNodes: [...(b2.squads ?? []).flatMap((s) => s.nodes), ...(b2.objects.find((g) => g.sid === 'random-squad')?.nodes ?? [])],
    waterMap: b2.waterMap, levelsMap: b2.levelsMap, climbsMap: b2.climbsMap, nextTempId: () => nextId++,
    guardOverrides: { requestedValue: row.requestedValue, fraction: row.fraction, weeklyIncrementBonus: row.weeklyIncrementBonus },
  })
  if (routes.guards.length === 0) return container
  const { block2Chunk } = addObjectInstances(container.chunks[1], routes.guards.map((g) => ({ sid: g.sid, node: g.node, randomSquadOverrides: g.randomSquadOverrides })))
  const chunks = container.chunks.slice()
  chunks[1] = block2Chunk
  return { ...container, chunks }
}
