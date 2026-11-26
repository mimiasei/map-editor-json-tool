// ─── Portal linking (propPortals) ────────────────────────────────────────────
// OE's portal linkage is an explicit one-to-one `{id, targetIdx, isActive}` row (`map-write.ts`'s `PropPortalEntry`), never a colour- or
// sid-based auto-connect, so a placed-but-unlinked portal is very likely inert in-game: the importer writes every link itself.
//
// H3 connects monoliths by colour, which is the object subtype (checked on a real map, all_portals.h3m: every colour of a two-way, one-way
// entrance and one-way exit has its own subtype, and an entrance and its exit share one). Several colours share one OE look, so the network is
// taken from the H3 data, not from the OE sid:
//   two-way monoliths (object 45), same subtype  -> a pair gets a two-way link; more than two get a ring (every one still reaches every other
//                                                    by walking it, not always in one hop: OE has one target per portal)
//   one-way entrance (43) -> exit (44), same subtype -> each entrance points at an exit (round robin); the exit has no target of its own
//   subterranean gates (103)                          -> each surface gate is paired with an underground gate of the same kind first, then the
//                                                        nearest unused one
// Whether OE lets a portal without a target still be arrived at is an assumption, not tested in the game.

export interface H3PortalPlacement {
  id: number
  layer: number
  x: number
  y: number
  kind: 'two-way' | 'entrance' | 'exit' | 'gate'
  /** The H3 colour (monolith subtype); gates share one network. */
  network: number
  /** The H3 sprite, so gates of one kind (cave gate, HotA exit) pair with each other before any other. */
  look?: string
}

export interface PortalLinkResult {
  /** Rows to merge into `objectsProperties.propPortals`. */
  propPortals: { type: number; id: number; targetIdx: number; isActive: boolean }[]
  /** Directed adjacency: portal instance id -> the id it teleports to. Consumed
   *  directly by the accessibility pass's reachability graph so the model
   *  matches exactly what's emitted, not a re-derived assumption. */
  adjacencyByObjectId: Map<number, number>
  /** Portals with nothing to link to (a lone monolith, an entrance without exit, a gate without a partner): left unlinked. */
  unpairedCount: number
  /** Portals that did receive a link. */
  linkedCount: number
}

export function linkH3Portals(portals: H3PortalPlacement[]): PortalLinkResult {
  const propPortals: PortalLinkResult['propPortals'] = []
  const adjacencyByObjectId = new Map<number, number>()
  let unpairedCount = 0
  let linkedCount = 0
  const link = (from: number, to: number) => {
    propPortals.push({ type: 0, id: from, targetIdx: to, isActive: true })
    adjacencyByObjectId.set(from, to)
    linkedCount += 1
  }

  const byNetwork = new Map<string, H3PortalPlacement[]>()
  for (const portal of portals) {
    // An entrance and its exit are one network; a two-way colour and a one-way colour with the same subtype are not.
    const key = `${portal.kind === 'entrance' || portal.kind === 'exit' ? 'one-way' : portal.kind}:${portal.network}`
    byNetwork.set(key, [...(byNetwork.get(key) ?? []), portal])
  }

  for (const group of byNetwork.values()) {
    const kind = group[0].kind
    if (kind === 'two-way') {
      if (group.length < 2) { unpairedCount += group.length; continue }
      group.forEach((portal, i) => link(portal.id, group[(i + 1) % group.length].id))
      // Exactly two: the ring is already the reciprocal link.
    } else if (kind === 'gate') {
      const surface = group.filter((g) => g.layer === 0)
      const under = group.filter((g) => g.layer !== 0)
      const pairs: [number, number][] = []
      for (const s of surface) for (const u of under) pairs.push([s.id, u.id])
      const dist = (a: number, b: number) => {
        const pa = group.find((g) => g.id === a) as H3PortalPlacement
        const pb = group.find((g) => g.id === b) as H3PortalPlacement
        return Math.hypot(pa.x - pb.x, pa.y - pb.y)
      }
      const lookOf = (id: number) => (group.find((g) => g.id === id) as H3PortalPlacement).look
      const mismatch = (l: [number, number]) => (lookOf(l[0]) === lookOf(l[1]) ? 0 : 1)
      pairs.sort((l, r) => mismatch(l) - mismatch(r) || dist(l[0], l[1]) - dist(r[0], r[1]))
      const used = new Set<number>()
      for (const [a, b] of pairs) {
        if (used.has(a) || used.has(b)) continue
        used.add(a); used.add(b)
        link(a, b); link(b, a)
      }
      unpairedCount += group.length - used.size
    } else {
      const entrances = group.filter((g) => g.kind === 'entrance')
      const exits = group.filter((g) => g.kind === 'exit')
      if (exits.length === 0) { unpairedCount += entrances.length; continue }
      entrances.forEach((entrance, i) => link(entrance.id, exits[i % exits.length].id))
    }
  }

  return { propPortals, adjacencyByObjectId, unpairedCount, linkedCount }
}
