// ─── Built-in zone layouts (archetypes) ──────────────────────────────────────
// The built-in (no game template) RMG used to always build one ring of
// alternating player/neutral zones laid out at equal angles — every map was
// the same pie. Each map now picks one of several layout archetypes.
//
// An archetype is a per-player SECTOR UNIT — zones at a polar position
// (radius as a fraction of the inset map ellipse, angle as a fraction of the
// player's sector), with edges inside the sector and to the next/previous
// sector — plus optional shared center zone(s). The unit is repeated once per
// player at equal angles, so every player gets identical surroundings
// (rotational symmetry = fairness by construction, issue #254). Variety comes
// from the archetype pick, a random global rotation and one random jitter of
// the unit's radii/angles (the same jitter in every sector).

import type { NeutralZoneRole, ZoneGraph, ZoneSpec } from './zone-graph'
import type { ZoneCenter } from './zone-layout'

export const LAYOUT_ARCHETYPES = ['ring', 'ringCenter', 'innerRing', 'doubleNeutral', 'pockets', 'hub'] as const
export type LayoutArchetype = (typeof LAYOUT_ARCHETYPES)[number]

interface UnitZone {
  /** Name inside the unit; edges refer to it, `+`/`-` suffix = next/previous sector's zone. */
  key: string
  kind: 'player' | 'neutral'
  role?: NeutralZoneRole
  size: number
  /** Radius, 1 = the inset ellipse the old ring used. */
  r: number
  /** Angle as a fraction of the player's sector (0 = the player's own direction). */
  a: number
}

interface ArchetypeDef {
  unit: UnitZone[]
  edges: [string, string][]
  /** Shared zone at the map center, linked to these unit keys in every sector. */
  center?: { size: number; links: string[] }
  /** Most players this layout is picked for. With more, its outer zones get
   *  so narrow that the tiling's shape noise makes player zones measurably
   *  unequal (measured: 21-49% area spread at 6 players vs ≤ 9% at 3-4;
   *  innerRing 17-23% at 8 vs the ring's own ~10%). */
  maxPlayers?: number
}

const DEFS: Record<LayoutArchetype, ArchetypeDef> = {
  // Today's layout: player and neutral zones alternate on one ring.
  ring: {
    unit: [
      { key: 'P', kind: 'player', size: 3, r: 1, a: 0 },
      { key: 'N', kind: 'neutral', role: 'between', size: 2, r: 1, a: 0.5 },
    ],
    edges: [['P', 'N'], ['N', 'P+']],
  },
  // The ring plus a treasure zone in the middle reachable from every neutral zone.
  ringCenter: {
    unit: [
      { key: 'P', kind: 'player', size: 3, r: 1, a: 0 },
      { key: 'N', kind: 'neutral', role: 'between', size: 2, r: 0.95, a: 0.5 },
    ],
    edges: [['P', 'N'], ['N', 'P+']],
    center: { size: 3, links: ['N'] },
  },
  // Players on the outside; the neutral zones form an inner ring of their own.
  innerRing: {
    unit: [
      { key: 'P', kind: 'player', size: 3, r: 1, a: 0 },
      { key: 'I', kind: 'neutral', role: 'inner', size: 2, r: 0.5, a: 0.5 },
    ],
    edges: [['P', 'I'], ['I', 'P+'], ['I', 'I+']],
    maxPlayers: 7,
  },
  // Two neutral zones between neighbouring players.
  doubleNeutral: {
    unit: [
      { key: 'P', kind: 'player', size: 3, r: 1, a: 0 },
      { key: 'A', kind: 'neutral', role: 'between', size: 2, r: 1, a: 1 / 3 },
      { key: 'B', kind: 'neutral', role: 'between', size: 2, r: 1, a: 2 / 3 },
    ],
    edges: [['P', 'A'], ['A', 'B'], ['B', 'P+']],
    maxPlayers: 4,
  },
  // An inner ring, plus a dead-end treasure pocket behind each neutral zone.
  pockets: {
    unit: [
      { key: 'P', kind: 'player', size: 3, r: 0.75, a: 0 },
      { key: 'N', kind: 'neutral', role: 'between', size: 2, r: 0.65, a: 0.5 },
      { key: 'K', kind: 'neutral', role: 'pocket', size: 1.5, r: 1.05, a: 0.5 },
    ],
    edges: [['P', 'N'], ['N', 'P+'], ['N', 'K']],
    maxPlayers: 4,
  },
  // A spoke from every player to a shared center; no direct ring between players.
  hub: {
    unit: [
      { key: 'P', kind: 'player', size: 3, r: 1, a: 0 },
      { key: 'S', kind: 'neutral', role: 'inner', size: 2, r: 0.5, a: 0 },
    ],
    edges: [['P', 'S']],
    center: { size: 3, links: ['S'] },
    maxPlayers: 4,
  },
}

/** Extra treasure for special neutral zones, as `resourcesValue` relative to
 *  1 for ordinary ones (zone-population.ts scales treasure by it). */
export const ROLE_TREASURE_SCALE: Record<NeutralZoneRole, number> = { between: 1, inner: 1, center: 1.5, pocket: 1.3 }

/** Below this many map tiles per zone an archetype is too crowded and isn't picked. */
const MIN_TILES_PER_ZONE = 350

export interface BuiltInLayout {
  archetype: LayoutArchetype
  graph: ZoneGraph
  centers: ZoneCenter[]
}

function zoneCount(def: ArchetypeDef, playerCount: number): number {
  return def.unit.length * playerCount + (def.center ? 1 : 0)
}

/** Pick an archetype (weighted; `weights` from the tuning file, default 1
 *  each) and lay it out. `radiusScale` scales every radius (the generator's
 *  zone-spread option, same as the old ring). Archetypes too crowded for the
 *  map, or with more players than their `maxPlayers`, are skipped; `ring` is
 *  always possible. */
export function buildBuiltInLayout(
  sizeX: number, sizeZ: number, playerCount: number, rng: () => number,
  radiusScale = 1, weights: Partial<Record<LayoutArchetype, number>> = {},
): BuiltInLayout {
  const tiles = sizeX * sizeZ
  const options = LAYOUT_ARCHETYPES
    .map((name) => ({ name, weight: Math.max(0, weights[name] ?? 1) }))
    .filter((o) => o.weight > 0 && (o.name === 'ring' || (
      tiles / zoneCount(DEFS[o.name], playerCount) >= MIN_TILES_PER_ZONE && playerCount <= (DEFS[o.name].maxPlayers ?? Infinity))))
  const total = options.reduce((s, o) => s + o.weight, 0)
  let archetype: LayoutArchetype = 'ring'
  if (total > 0) {
    let roll = rng() * total
    for (const o of options) {
      if (roll < o.weight) { archetype = o.name; break }
      roll -= o.weight
    }
  }
  return layoutArchetype(archetype, sizeX, sizeZ, playerCount, rng, radiusScale)
}

/** Lay out one archetype: build its graph and the zone centers. */
export function layoutArchetype(
  archetype: LayoutArchetype, sizeX: number, sizeZ: number, playerCount: number, rng: () => number, radiusScale = 1,
): BuiltInLayout {
  const def = DEFS[archetype]
  const zones: ZoneSpec[] = []
  const centers: ZoneCenter[] = []
  const idByKey = new Map<string, number>() // `${sector}:${key}`

  const insetX = Math.max(1, Math.floor(sizeX * 0.12))
  const insetZ = Math.max(1, Math.floor(sizeZ * 0.12))
  const cx = (sizeX - 1) / 2
  const cz = (sizeZ - 1) / 2
  const rx = (cx - insetX) * radiusScale
  const rz = (cz - insetZ) * radiusScale
  const clampX = (x: number): number => Math.min(sizeX - 1 - insetX / 2, Math.max(insetX / 2, x))
  const clampZ = (z: number): number => Math.min(sizeZ - 1 - insetZ / 2, Math.max(insetZ / 2, z))

  const rotation = rng() * 2 * Math.PI
  // One jitter per unit zone, shared by every sector (keeps the layout symmetric).
  const jitter = def.unit.map(() => ({ r: 1 - rng() * 0.12, a: (rng() - 0.5) * 0.16 }))
  const sector = (2 * Math.PI) / playerCount

  for (let s = 0; s < playerCount; s++) {
    def.unit.forEach((u, i) => {
      const id = zones.length
      zones.push(u.kind === 'player'
        ? { id, kind: 'player', playerIndex: s + 1, size: u.size }
        : { id, kind: 'neutral', size: u.size, role: u.role })
      const angle = rotation - Math.PI / 2 + sector * (s + u.a + (u.a === 0 ? 0 : jitter[i].a))
      const r = u.r * jitter[i].r
      centers.push({ zoneId: id, x: Math.round(clampX(cx + rx * r * Math.cos(angle))), z: Math.round(clampZ(cz + rz * r * Math.sin(angle))) })
      idByKey.set(`${s}:${u.key}`, id)
    })
  }

  const edges: [number, number][] = []
  const resolve = (s: number, ref: string): number => {
    const offset = ref.endsWith('+') ? 1 : ref.endsWith('-') ? -1 : 0
    const key = offset === 0 ? ref : ref.slice(0, -1)
    return idByKey.get(`${(s + offset + playerCount) % playerCount}:${key}`) as number
  }
  const seen = new Set<string>()
  const addEdge = (a: number, b: number): void => {
    if (a === b) return
    const k = a < b ? `${a}:${b}` : `${b}:${a}`
    if (seen.has(k)) return
    seen.add(k)
    edges.push([a, b])
  }
  for (let s = 0; s < playerCount; s++) {
    for (const [from, to] of def.edges) addEdge(resolve(s, from), resolve(s, to))
  }

  if (def.center) {
    const id = zones.length
    zones.push({ id, kind: 'neutral', size: def.center.size, role: 'center' })
    centers.push({ zoneId: id, x: Math.round(cx), z: Math.round(cz) })
    for (let s = 0; s < playerCount; s++) {
      for (const link of def.center.links) addEdge(id, resolve(s, link))
    }
  }

  return { archetype, graph: { zones, edges }, centers }
}
