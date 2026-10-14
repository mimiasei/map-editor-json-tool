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

import { logWarn } from '@/lib/logger'
import type { NeutralZoneRole, ZoneGraph, ZoneSpec } from './zone-graph'
import type { ZoneCenter } from './zone-layout'

export const LAYOUT_ARCHETYPES = ['ring', 'ringCenter', 'innerRing', 'doubleNeutral', 'pockets', 'hub'] as const
export type LayoutArchetype = (typeof LAYOUT_ARCHETYPES)[number]

/** Name, one-line description and a fuller explanation (how the map looks and the zone rules) of each layout, for the generator dialog. */
export const LAYOUT_LABELS: Record<LayoutArchetype, { label: string; description: string; details: string }> = {
  ring: { label: 'Ring', description: 'Player and neutral zones alternate on one ring.',
    details: 'One ring around the map: a player zone, a neutral zone, the next player zone, and so on, so there are as many neutral zones as players. Every zone touches only the two zones beside it. Each player has one neutral zone on either side, and a rival can only be reached by going through neutral zones around the ring.' },
  ringCenter: { label: 'Ring with center', description: 'The ring plus a treasure zone in the middle, reachable from every neutral zone.',
    details: 'The same ring of player and neutral zones as Ring, plus one large treasure zone in the middle of the map. Every neutral zone on the ring connects to the middle zone, which holds extra treasure, so there are shortcuts across the map. Player zones do not connect to the middle directly.' },
  innerRing: { label: 'Inner ring', description: 'Players on the outside; the neutral zones form an inner ring of their own.',
    details: 'Players sit at the edge of the map and the neutral zones form a smaller ring in the middle. Each player zone connects to the two inner zones nearest to it, and the inner zones connect to each other around the ring. Player zones never touch each other, so every route between players runs through the middle. Offered for up to 7 players.' },
  doubleNeutral: { label: 'Double neutral', description: 'Two neutral zones between neighbouring players.',
    details: 'A ring where each pair of neighbouring player zones has two neutral zones in a row between them (player, neutral, neutral, player, ...). Rivals are further apart and the map has twice as many neutral zones as players. Every zone touches only the two beside it. Offered for up to 4 players.' },
  pockets: { label: 'Pockets', description: 'An inner ring, plus a dead-end treasure pocket behind each neutral zone.',
    details: 'A tighter ring of player and neutral zones in the middle of the map, as in Ring. Behind each neutral zone, towards the map edge, lies a small dead-end treasure pocket with richer treasure that is reached only through that neutral zone. Offered for up to 4 players.' },
  hub: { label: 'Hub', description: 'A spoke from every player to a shared center; no direct ring between players.',
    details: 'Like the hub of a wheel: each player has a single neutral zone towards the middle, and all of these connect to one large central zone with extra treasure. There is no ring between players, so the only way to a rival is through your neutral zone and the centre. Offered for up to 4 players.' },
}

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

/** Left-right mirror structure of a mirrored layout (see `layoutArchetype`'s `mirrored`). */
export interface MirrorInfo {
  /** The zone on the other side of the vertical axis; a zone on the axis maps to itself. */
  partner: Map<number, number>
  /** Left zones and axis zones carry the generated content, right zones are copies. */
  side: Map<number, 'left' | 'right' | 'axis'>
}

export interface BuiltInLayout {
  archetype: LayoutArchetype
  graph: ZoneGraph
  centers: ZoneCenter[]
  /** Only for a mirrored layout. */
  mirror?: MirrorInfo
}

function zoneCount(def: ArchetypeDef, playerCount: number): number {
  return def.unit.length * playerCount + (def.center ? 1 : 0)
}

/** Fewest and most neutral zones a built-in layout gives `playerCount`
 *  players (what the dialog tells the user). Ignores the map-size rule, which
 *  can drop the larger layouts on a small map; `ring` always remains. */
export function neutralZoneRange(playerCount: number): { min: number; max: number } {
  const counts = LAYOUT_ARCHETYPES
    .filter((name) => playerCount <= (DEFS[name].maxPlayers ?? Infinity))
    .map((name) => DEFS[name].unit.filter((u) => u.kind === 'neutral').length * playerCount + (DEFS[name].center ? 1 : 0))
  return { min: Math.min(...counts), max: Math.max(...counts) }
}

/** Whether `name` can be used for this map size and player count: not too
 *  crowded and not over its player limit (`ring` always fits). */
function archetypeFits(name: LayoutArchetype, sizeX: number, sizeZ: number, playerCount: number): boolean {
  return name === 'ring' || (
    (sizeX * sizeZ) / zoneCount(DEFS[name], playerCount) >= MIN_TILES_PER_ZONE && playerCount <= (DEFS[name].maxPlayers ?? Infinity))
}

/** The layouts a user can pick for this map size and player count. */
export function availableArchetypes(sizeX: number, sizeZ: number, playerCount: number): LayoutArchetype[] {
  return LAYOUT_ARCHETYPES.filter((name) => archetypeFits(name, sizeX, sizeZ, playerCount))
}

/** Pick an archetype (weighted; `weights` from the tuning file, default 1
 *  each) and lay it out. `radiusScale` scales every radius (the generator's
 *  zone-spread option, same as the old ring). Archetypes too crowded for the
 *  map, or with more players than their `maxPlayers`, are skipped; `ring` is
 *  always possible. */
export function buildBuiltInLayout(
  sizeX: number, sizeZ: number, playerCount: number, rng: () => number,
  radiusScale = 1, weights: Partial<Record<LayoutArchetype, number>> = {}, forced?: LayoutArchetype, mirrored = false,
): BuiltInLayout {
  if (mirrored && (playerCount % 2 !== 0 || sizeX % 2 !== 0)) throw new Error('A mirrored map needs an even player count and an even map width')
  if (forced) {
    if (archetypeFits(forced, sizeX, sizeZ, playerCount)) return layoutArchetype(forced, sizeX, sizeZ, playerCount, rng, radiusScale, mirrored)
    logWarn(`RMG layout: ${forced} does not fit ${playerCount} players on ${sizeX}x${sizeZ} — picking a random layout instead`)
  }
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
  return layoutArchetype(archetype, sizeX, sizeZ, playerCount, rng, radiusScale, mirrored)
}

/** Lay out one archetype: build its graph and the zone centers.
 *
 *  `mirrored`: the layout is a left-right mirror image across the map's vertical
 *  middle line (even player counts only). Sector 0's middle (`a` = 0.5) points
 *  straight up, so the line passes through the zones at `a` = 0.5 (and, for a
 *  unit with none, between sectors); zone (sector s, `a`) mirrors to (-s, 1 - a), or
 *  (1 - s, 0) when `a` = 0. Random rotation and angle jitter are off (they would break
 *  the symmetry), the radius jitter is shared by mirrored unit zones, and the player
 *  slots alternate sides (1 left, 2 right, 3 left, ...) so two humans in slots 1 and 2
 *  face each other and the AI players split evenly. */
export function layoutArchetype(
  archetype: LayoutArchetype, sizeX: number, sizeZ: number, playerCount: number, rng: () => number, radiusScale = 1, mirrored = false,
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

  const sector = (2 * Math.PI) / playerCount
  const rotation = mirrored ? -sector / 2 : rng() * 2 * Math.PI
  // One jitter per unit zone, shared by every sector (keeps the layout symmetric).
  const jitter = def.unit.map(() => ({ r: 1 - rng() * 0.12, a: mirrored ? 0 : (rng() - 0.5) * 0.16 }))

  // Unit zone that mirrors unit zone i (a -> 1 - a, same kind/role/radius); a = 0 maps to itself.
  const mirrorUnit = (i: number): number => {
    const u = def.unit[i]
    if (u.a === 0) return i
    const j = def.unit.findIndex((v) => v.kind === u.kind && v.role === u.role && Math.abs(v.r - u.r) < 1e-9 && Math.abs(v.a - (1 - u.a)) < 1e-9)
    if (j < 0) throw new Error(`Layout ${archetype} cannot be mirrored`)
    return j
  }
  if (mirrored) {
    // Mirrored unit zones share their radius jitter.
    def.unit.forEach((_, i) => { const j = mirrorUnit(i); if (j < i) jitter[i] = jitter[j] })
  }
  const playerSlot = (s: number): number => {
    // Pair p holds sector 1 + p on the right and sector (N - p) % N on the left.
    const right = s >= 1 && s <= playerCount / 2
    const p = right ? s - 1 : (playerCount - s) % playerCount
    return 2 * p + (right ? 2 : 1)
  }

  for (let s = 0; s < playerCount; s++) {
    def.unit.forEach((u, i) => {
      const id = zones.length
      zones.push(u.kind === 'player'
        ? { id, kind: 'player', playerIndex: mirrored ? playerSlot(s) : s + 1, size: u.size }
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

  if (!mirrored) return { archetype, graph: { zones, edges }, centers }

  // Mirror structure: partner zone ids, with the partner's center forced to the exact reflection.
  const partner = new Map<number, number>()
  const side = new Map<number, 'left' | 'right' | 'axis'>()
  const mod = (n: number): number => ((n % playerCount) + playerCount) % playerCount
  for (let s = 0; s < playerCount; s++) {
    def.unit.forEach((u, i) => {
      const id = idByKey.get(`${s}:${u.key}`) as number
      const j = mirrorUnit(i)
      const other = idByKey.get(`${u.a === 0 ? mod(1 - s) : mod(-s)}:${def.unit[j].key}`) as number
      partner.set(id, other)
    })
  }
  if (def.center) partner.set(zones.length - 1, zones.length - 1)
  for (const zone of zones) {
    const other = partner.get(zone.id) as number
    if (other === zone.id) {
      side.set(zone.id, 'axis')
      centers[zone.id] = { ...centers[zone.id], x: Math.floor((sizeX - 1) / 2) }
    } else if (other > zone.id) {
      // The earlier id keeps its computed center; the later one is its exact reflection.
      const c = centers[zone.id]
      const leftOne = c.x <= (sizeX - 1) / 2
      side.set(zone.id, leftOne ? 'left' : 'right')
      side.set(other, leftOne ? 'right' : 'left')
      centers[other] = { ...centers[other], x: sizeX - 1 - c.x, z: c.z }
    }
  }
  return { archetype, graph: { zones, edges }, centers, mirror: { partner, side } }
}
