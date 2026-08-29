// ─── Portal pair linking (propPortals) ───────────────────────────────────────
// A converted map's portal objects (two-way monolith sids `portal_1`/`_2`/`_3`,
// subterranean gate `portal_5`, whirlpool `portal_magic`) previously got NO
// `objectsProperties.propPortals` row at all — confirmed via `map-write.ts`/
// `map-parser.ts`/`map-extract.ts`: OE's own portal linkage is an explicit
// one-to-one `{id, targetIdx, isActive}` row (`map-write.ts`'s
// `PropPortalEntry`/`upsertPropPortals`), never a color/sid-based
// auto-connect the way H3's own runtime treats same-color monoliths — so a
// placed-but-unlinked portal is very likely inert in-game. This is a real,
// load-bearing prerequisite for underground reachability (see
// `accessibility-pass.ts`), not scope creep: a monolith/gate that doesn't
// actually teleport makes anything only reachable through it truly
// unreachable, independent of any physical-blocking fix.
//
// Exactly 2 same-sid instances get a true reciprocal two-way link (matches
// this format's own `linkKind: 'two-way'` definition — `map-extract.ts`).
// More than 2 (a real H3 case — several same-color monoliths sharing one
// network) get a directed ring instead, since `targetIdx` can only ever name
// ONE partner: every instance still reaches every other by walking the ring,
// just not always via a single reciprocal hop. This is a documented
// approximation of H3's true any-to-any network, not independently confirmed
// against real game behavior for groups larger than 2 — flagged in the
// import report (`portalsLinked`/`portalsUnpaired`), not silently assumed.

export interface ObjectPlacementGroup {
  ids: number[]
  nodes: number[]
}

export interface PortalLinkResult {
  /** Rows to merge into `objectsProperties.propPortals`. */
  propPortals: { type: number; id: number; targetIdx: number; isActive: boolean }[]
  /** Directed adjacency: portal instance id -> the id it teleports to. Consumed
   *  directly by the accessibility pass's reachability graph so the model
   *  matches exactly what's emitted, not a re-derived assumption. */
  adjacencyByObjectId: Map<number, number>
  /** Portal instances placed alone (no same-sid sibling to link to) — left
   *  unlinked, likely inert in-game; a real, disclosed gap. */
  unpairedCount: number
  /** Portal instances that did receive a link (either side of a two-way pair,
   *  or any ring hop). */
  linkedCount: number
}

/** `objectGroups` is the importer's own sid -> placement-group map (see
 *  `convert-h3m-to-map.ts`) — only sids starting with `portal` (this
 *  project's own existing convention for portal kind detection, see
 *  `h3-object-mapping.ts`'s `resolveObjectSid`) are considered. */
export function linkPortalPairs(objectGroups: Map<string, ObjectPlacementGroup>): PortalLinkResult {
  const propPortals: PortalLinkResult['propPortals'] = []
  const adjacencyByObjectId = new Map<number, number>()
  let unpairedCount = 0
  let linkedCount = 0

  for (const [sid, group] of objectGroups) {
    if (!sid.startsWith('portal')) continue
    const ids = group.ids
    if (ids.length < 2) {
      unpairedCount += ids.length
      continue
    }
    if (ids.length === 2) {
      const [a, b] = ids
      propPortals.push({ type: 0, id: a, targetIdx: b, isActive: true })
      propPortals.push({ type: 0, id: b, targetIdx: a, isActive: true })
      adjacencyByObjectId.set(a, b)
      adjacencyByObjectId.set(b, a)
      linkedCount += 2
      continue
    }
    for (let i = 0; i < ids.length; i++) {
      const from = ids[i]
      const to = ids[(i + 1) % ids.length]
      propPortals.push({ type: 0, id: from, targetIdx: to, isActive: true })
      adjacencyByObjectId.set(from, to)
      linkedCount += 1
    }
  }

  return { propPortals, adjacencyByObjectId, unpairedCount, linkedCount }
}
