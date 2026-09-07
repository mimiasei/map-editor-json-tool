// ─── RMG island zones (issue #210, follow-up to Milestone 3) ────────────────
// "Islands" water-content mode — VCMI's own `allowedWaterContent: islands`
// concept (issue #210's research notes), but genuinely different from
// zone-water.ts's in-zone lakes: a chosen neutral zone's own tile pool is
// shrunk to a compact landmass blob BEFORE population runs, the rest of
// that zone's tiles are flooded, and the landmass is reconnected to the
// rest of the map via a PORTAL pair — not a boat. Confirmed real: zero
// boat/ship/naval objects exist anywhere in Core.zip's own catalog or any
// real sample map in maps/*.map, and the actual game has no water-travel
// mechanic implemented (community-confirmed). Portals ARE a real,
// already-modeled mechanic in this codebase (`objectsProperties.propPortals`
// — an explicit `{id, targetIdx}` link, not H3's same-color auto-connect,
// per portal-links.ts's own doc comment) — the generator (generate-
// random-map.ts) builds each pair's adjacency directly rather than reusing
// H3-import's `linkPortalPairs` (that function's same-sid ring fallback is
// correct for H3's any-to-any monolith networks, but WRONG here once a
// portal color gets reused across more than one unrelated island pair —
// see PORTAL_SIDS's own doc comment), then feeds it straight into
// accessibility-pass.ts's existing `portalAdjacencyByObjectId` parameter.
//
// A real, hard rule (not just this module's own default): an island tile
// is reachable ONLY by portal, never a road — `generate-random-map.ts`'s
// own road loop places one portal pair per zone-graph EDGE that touches an
// island (exactly mirroring how a non-island edge gets one road) instead
// of ever attempting a road there, rather than let its usual "no road
// found, retry excluding water, reclaim whatever water the repair path
// needed" fallback quietly pave a land bridge through the deliberate moat
// (a real bug this session found: that fallback doesn't know "island" is a
// special kind of unreachable). This holds independent of the separate
// `usePortals` bonus-shortcut toggle — turning that off only stops the
// extra forced-portal shortcut elsewhere, never an island's own mandatory
// portal connections.
//
// `includePlayerZones` (a real user request) lets a player's own start be
// one of these islands too, not just neutral "treasure" zones — the
// original, still-default behavior keeps every player land-connected.
// "Island amount" (`waterChance` below) is a real 0-100% of the eligible
// zone count either way — at 100%, EVERY eligible zone becomes an island
// (every player's own start too, once `includePlayerZones` is on), leaving
// no "mainland" at all. That's only safe because connectivity here is
// per-EDGE (see above), not "each island finds some nearest non-island
// zone" (an earlier version of this design, replaced once 100% could mean
// zero non-island zones exist for that model to find at all).
//
// Known limitation, confirmed via a 35-seed verification sweep: at
// aggressive settings (most neutral zones turned into small islands, e.g.
// 5 of 6 at `waterChance` near 1), an island's own tightly packed content
// (mine/treasure/guard/portal, all sharing one modest landmass) can
// occasionally wall off a pocket of itself beyond the accessibility pass's
// own nudge radius — a real, disclosed degrade (logWarn in generate-
// random-map.ts), not a silent failure, and the same class of "crowded
// zone" edge case this generator's obstacle/treasure density already
// produces at extreme settings without islands at all. At the default
// `waterChance` (0.4), the same sweep showed roughly 1 unreachable object
// per 2 generations on a 64×64/4-player map, out of hundreds placed.

import { growBlob } from './zone-water'
import { nearestTile, type ZoneCenter } from './zone-layout'
import type { ZoneSpec } from './zone-graph'

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export interface IslandZoneResult {
  /** zoneId -> its own shrunk landmass tile list — replaces `tilesByZone`'s
   *  entry for this zone so every later step (anchor, population, roads)
   *  naturally treats only the landmass as this zone's real land. */
  landmassByZone: Map<number, number[]>
  /** Every tile outside a chosen island zone's own landmass — flood these
   *  with water once population has finished with the shrunk zone. */
  floodNodes: Set<number>
}

/** Every one of `allTiles` whose 4 neighbors are ALL either also in
 *  `allTiles` or off the map edge — i.e. tiles that don't directly touch a
 *  different zone. Growing a landmass only within this interior guarantees
 *  at least a 1-tile moat of flooded boundary between the landmass and any
 *  neighboring zone's own land — without this, `growBlob` (which has no
 *  notion of "stay away from the zone's own edge") can and does reach the
 *  zone's physical boundary before hitting its target size, leaving the
 *  "island" directly walkable from its neighbor with no water in between
 *  at all (confirmed the hard way: an earlier version of this function
 *  grew the landmass from `allTiles` directly, and real generated islands
 *  came out fully land-reachable, portal or not — the accessibility pass
 *  never even needed the portal edge to prove reachability). */
function computeInteriorTiles(sizeX: number, sizeZ: number, allTiles: number[]): number[] {
  const zoneSet = new Set(allTiles)
  const interior: number[] = []
  for (const node of allTiles) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    let isInterior = true
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue // map edge — never a foreign-zone boundary
      if (!zoneSet.has(nz * sizeX + nx)) { isInterior = false; break }
    }
    if (isInterior) interior.push(node)
  }
  return interior
}

/**
 * Picks up to `maxIslands` zones — neutral zones only by default, or ANY
 * zone (including player starts) when `includePlayerZones` is true, a real
 * user-requested override of this module's own original "every player's
 * own start stays land-connected" default (see `GenerateTerrainOptions`'
 * own `islandsIncludePlayerZones` doc comment in generate-terrain.ts for
 * the full rationale, and generate-random-map.ts's own header comment on
 * the hard rule this enables: an island — ANY island, player or neutral —
 * is reachable ONLY by portal, never a road, regardless of the separate
 * `usePortals` bonus-shortcut toggle) — and shrinks each one's own tile
 * pool to a compact landmass grown from its own center — confined to the
 * zone's own INTERIOR (see `computeInteriorTiles`) so a real moat of
 * flooded boundary always separates it from every neighboring zone — sized
 * `landmassFraction` of the zone's original tile count. Zones smaller than
 * `minZoneSize`, or with too little interior to bother, are skipped.
 */
export function computeIslandZones(
  sizeX: number,
  sizeZ: number,
  zones: ZoneSpec[],
  tilesByZone: Map<number, number[]>,
  centers: ZoneCenter[],
  rng: () => number,
  maxIslands: number,
  landmassFraction: number,
  includePlayerZones = false,
  minZoneSize = 60,
  minInteriorSize = 12,
): IslandZoneResult {
  const landmassByZone = new Map<number, number[]>()
  const floodNodes = new Set<number>()

  const eligibleZones = includePlayerZones ? zones : zones.filter((z) => z.kind === 'neutral')
  const shuffled = [...eligibleZones]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  let chosen = 0
  for (const zone of shuffled) {
    if (chosen >= maxIslands) break
    const allTiles = tilesByZone.get(zone.id) ?? []
    if (allTiles.length < minZoneSize) continue

    const interiorTiles = computeInteriorTiles(sizeX, sizeZ, allTiles)
    if (interiorTiles.length < minInteriorSize) continue // no room for a real moat

    const targetLandSize = Math.max(10, Math.round(allTiles.length * landmassFraction))
    const seed = nearestTile(interiorTiles, sizeX, centers[zone.id])
    const landmass = growBlob(seed, sizeX, sizeZ, targetLandSize, new Set(interiorTiles), rng)

    landmassByZone.set(zone.id, [...landmass])
    for (const node of allTiles) {
      if (!landmass.has(node)) floodNodes.add(node)
    }
    chosen += 1
  }

  return { landmassByZone, floodNodes }
}

/**
 * Which zone-graph edges should get a portal, given every edge touching an
 * island is a CANDIDATE (generate-random-map.ts's road loop would
 * otherwise portal literally every one of them — confirmed the hard way:
 * on the ring topology every zone has degree exactly 2, so an island zone
 * always ends up with 2 full portal PAIRS — 4 portal objects — since BOTH
 * of its own edges touch an island (itself), a real user report that this
 * is simply too many; a small island only needs one way in and out, a
 * large one at most two).
 *
 * Greedily drops candidate edges that are provably redundant — checked via
 * a real connectivity test on the ABSTRACT zone graph (a Union-Find over
 * `zones`/`edges`, not the tile grid; this graph is tiny, at most
 * `2×playerCount` nodes, so this is cheap regardless of map size) — never
 * dropping an edge if doing so would disconnect any zone from any other,
 * and never dropping an island's own edge below `desiredPortalCount(zoneId)`
 * connections. This is why a naive "just keep 1 edge per island, drop the
 * rest" rule doesn't work on its own: on a ring, TWO adjacent islands each
 * independently dropping "their" redundant edge can silently cut the ring
 * into two disconnected halves (confirmed by hand-tracing a real 2-player
 * case) — only a real connectivity check catches that.
 */
export function selectIslandConnections(
  zones: ZoneSpec[],
  edges: [number, number][],
  islandZoneIds: Set<number>,
  desiredPortalCount: (zoneId: number) => number,
): [number, number][] {
  const portalEdgeIndices: number[] = []
  const roadEdgeIndices: number[] = []
  edges.forEach((edge, i) => {
    if (islandZoneIds.has(edge[0]) || islandZoneIds.has(edge[1])) portalEdgeIndices.push(i)
    else roadEdgeIndices.push(i)
  })

  const kept = new Set(portalEdgeIndices)

  const isConnectedWithout = (excludeIdx: number): boolean => {
    const parent = new Map<number, number>(zones.map((z) => [z.id, z.id]))
    const find = (x: number): number => {
      while (parent.get(x) !== x) x = parent.get(x) as number
      return x
    }
    const union = (a: number, b: number): void => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    for (const i of roadEdgeIndices) union(edges[i][0], edges[i][1])
    for (const i of kept) {
      if (i === excludeIdx) continue
      union(edges[i][0], edges[i][1])
    }
    const roots = new Set(zones.map((z) => find(z.id)))
    return roots.size === 1
  }

  const portalCountByZone = new Map<number, number>()
  const bump = (zoneId: number, delta: number): void => {
    if (!islandZoneIds.has(zoneId)) return
    portalCountByZone.set(zoneId, (portalCountByZone.get(zoneId) ?? 0) + delta)
  }
  for (const i of portalEdgeIndices) {
    bump(edges[i][0], 1)
    bump(edges[i][1], 1)
  }

  for (const i of portalEdgeIndices) {
    const [a, b] = edges[i]
    const aOver = islandZoneIds.has(a) && (portalCountByZone.get(a) ?? 0) > desiredPortalCount(a)
    const bOver = islandZoneIds.has(b) && (portalCountByZone.get(b) ?? 0) > desiredPortalCount(b)
    // Only a candidate for removal if at least one island endpoint has
    // more connections than it needs — never drop an island's own sole
    // required connection just because the OTHER endpoint happens to be
    // over quota (that endpoint has its own other edge to fall back on;
    // this one might not).
    if (!aOver && !bOver) continue
    if (!isConnectedWithout(i)) continue
    kept.delete(i)
    bump(a, -1)
    bump(b, -1)
  }

  return [...kept].map((i) => edges[i])
}

/** Real portal base sids (Core/DB/map/objects/4_interactables.json) —
 *  cycled per island so multiple islands read as visually distinct portal
 *  networks. Safe to reuse a color across more than 5 islands: OE's own
 *  `propPortals` link is an explicit per-instance `{id, targetIdx}` row,
 *  never a same-sid/color auto-connect, so two unrelated pairs sharing one
 *  color never cross-link (unlike H3's own same-color-monolith runtime
 *  behavior, which is why this generator does NOT reuse portal-links.ts's
 *  `linkPortalPairs` — that function's group-by-sid ring fallback assumes
 *  every same-sid instance belongs to one network, true for H3 imports,
 *  false here once a color repeats across separate island pairs). */
export const PORTAL_SIDS = ['portal_1', 'portal_2', 'portal_3', 'portal_4', 'portal_5']
