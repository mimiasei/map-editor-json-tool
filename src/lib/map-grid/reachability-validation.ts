// ─── Map Grid — whole-map reachability validation + auto-fix ────────────────
// Generic pass over a finished MapContext: flood-fills from every player
// start (city-spawner/hero-spawner) over the same passability model the
// grid's own blocked-tile overlay uses (passability.ts), PLUS every active
// portal's own outbound link (see below) as a directed teleport edge, then
// flags every interactable/resource/squad placement no player start can
// reach. For each unreachable placement, a second search (0-1 BFS/Dial's
// algorithm, same technique proven in h3-import/accessibility-pass.ts's own
// auto-fix pass) finds the minimal set of OTHER placed objects whose solid
// footprint sits on the shortest bridge back to reachable territory — "what
// exactly is blocking the way", per the object(s) a map author would need to
// move or delete to open a path. A target with no such bridge at all (e.g.
// fully sealed by water or an unramped elevation wall, nothing placed
// involved) reports an empty `blockedBy`.
//
// Portal edges: per the user's own domain knowledge of this engine, a portal
// instance only ever sends a hero somewhere when it has a real destination
// set (`portalInfo.targetIdx`/`targetNode`, resolved by map-extract.ts) AND
// is currently active (`portalInfo.isActive` — an inactive portal is
// receive-only, the official guide's "exit portal", contributing no outbound
// edge of its own even if a targetIdx happens to still be set). Modeled as a
// one-way directed edge from the portal's own entrance cell to the linked
// portal's entrance cell — stepping on it warps you there; the return trip
// only exists if THAT portal separately has its own active target set
// (two-way links are just two such edges, one per side, matching
// portalInfo.linkKind's own derivation). Never symmetric by assumption.
//
// Auto-fix (computeReachabilityAutoFix) mirrors the established repair rule
// this codebase already uses twice (h3-import's own accessibility-pass.ts,
// and entrance-autofix.ts) for clearing a blocker: pure decoration (deleted
// outright) or a pickable artifact/resource (moved to a nearby free tile,
// deleted only if no such tile exists) — never a real load-bearing object
// (another squad, a mine, a city, an interactable, ...). Unlike those two
// passes, the TARGET itself (the unreachable interactable/resource/artifact/
// squad) is never relocated or deleted, by design (user-specified,
// 2026-09-14) — moving a map author's own placed content to "fix"
// reachability would silently change their map's design in a way clearing an
// incidental blocker doesn't. When a target's blocking chain isn't safely
// clearable this way (empty — sealed by terrain/water — or contains a
// non-clearable object), it's left for the caller to report, never silently
// dropped and never partially "fixed" by clearing only some of a chain that
// still wouldn't open the path. describeUnreachablePlacement calls out an
// elevation-wall seal specifically (fixable by the user adding a ramp or
// adjusting terrain) — a water seal or a real blocking object needs a manual
// map edit either way. This is a single static-snapshot pass (like
// computeEntranceAutoFix) — auto-fix-pass.ts's own outer loop is what
// converges it across multiple calls when one round's fixes change what the
// next round sees.
//
// Intentionally independent of h3-import's own applyAccessibilityPass: that
// pass runs mid-conversion over raw atlas node groups and actively nudges/
// deletes objects to fix what it can (and never checks squads[] at all,
// since squadGroups isn't passed to it). This pass runs LAST, over the final
// PlacedObject[] shape, and additionally covers squads.
//
// findUnreachablePlacements deliberately merges every player start into ONE
// combined flood fill — a placement only needs to be reachable by SOME
// player, never every player, since an asymmetric map (each player's own
// private home zone plus a shared neutral middle) is completely normal HOMM
// design, not a bug. That merge has a real, confirmed-via-a-user-report blind
// spot, though: two player starts can be on fully disconnected landmasses
// (no shared border, no bridging portal) while every real placement still
// happens to sit inside SOME player's own reachable pocket — nothing gets
// flagged, yet the isolated player can reach literally none of the map's
// actual content (their own pocket may be empty terrain, or contain nothing
// but scenery). findIsolatedPlayerStarts below is the dedicated check for
// exactly this: per-player-start reachability (not merged), flagging any
// start that can't reach any OTHER player's start at all. Deliberately
// report-only, with no auto-fix counterpart — unlike an object blocking a
// path, reconnecting two disconnected landmasses (a road, a bridge, a
// terrain edit, a portal pair) is a real map-design decision, not something
// safe to guess at automatically.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles, isFootprintInBounds } from './footprint'
import { buildBlockedTileSet, isElevationWallTile, NON_BLOCKING_SPAWNER_SIDS } from './passability'
import { groupOf } from './tile-index'

export interface UnreachablePlacement {
  sid: string
  id: number
  x: number
  z: number
  node: number
  /** Other placed objects whose solid footprint lies on the shortest path
   *  back to reachable territory — move or delete one to open a way in.
   *  Empty when no such bridge exists at all (sealed by water/terrain, not
   *  by anything a map author placed). */
  blockedBy: { id: number; sid: string }[]
  /** Only meaningful when blockedBy is empty: whether the seal is (at least
   *  partly) an unramped elevation wall (levelsMap ±1 boundary with no
   *  adjacent climb) rather than pure water — this is the one seal cause a
   *  map author can fix directly (add a ramp / adjust terrain), so it gets
   *  called out by name rather than folded into a generic "sealed" message. */
  sealedByElevation: boolean
}

export interface ReachabilityAutoFixDeletion {
  /** Always 0 — a blocking chain's own solid footprint owners are only ever
   *  swept from objects[] (analyzeReachability's `nodeOwners` index). */
  entityType: 0
  id: number
  sid: string
  /** The unreachable placement this deletion unblocks. */
  unblocks: { sid: string; id: number }
}

export interface ReachabilityAutoFixRelocation {
  /** A pickable artifact/resource blocker moved out of the way to open the
   *  path — always 0, same reason as ReachabilityAutoFixDeletion. The
   *  unreachable TARGET itself is never relocated (see this file's header
   *  comment) — only a blocker ever appears here. */
  entityType: 0
  id: number
  sid: string
  fromNode: number
  toNode: number
}

export interface ReachabilityAutoFixResult {
  deletions: ReachabilityAutoFixDeletion[]
  relocations: ReachabilityAutoFixRelocation[]
  /** Placements whose blocking chain wasn't safely clearable — either sealed
   *  by terrain/water (no placed object stands in the way at all, see
   *  `sealedByElevation`) or blocked by a real, load-bearing object (a mine,
   *  a city, an interactable, ...). The target itself is never moved or
   *  deleted to resolve these — left for the user to fix by hand (a ramp/
   *  terrain edit, or relocating the blocking object themselves). */
  unresolved: UnreachablePlacement[]
}

type ReachabilityContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

const PLAYER_START_SIDS = new Set(['city-spawner', 'hero-spawner'])
const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** Every footprint cell a hero must actually stand on to use this instance:
 *  a fixed squad (squads[], type 2) or a walk-onto-anywhere placeholder
 *  (random-res/-squad/-item) is just its own tile (neither carries a real
 *  footprint template); anything else uses its catalog template's
 *  `value===2` interaction cell(s), same convention as entrance-validation.ts
 *  and accessibility-pass.ts. Returns an empty array for placements with no
 *  entrance concept at all (plain decoration, player starts, unresolved sid)
 *  — those are never reachability targets. */
function accessNodesFor(item: PlacedObject, catalogById: Map<string, CatalogMapObject>, sizeX: number): number[] {
  if (item.type === 2 || NON_BLOCKING_SPAWNER_SIDS.has(item.sid)) return [item.node]
  if (item.type !== 0) return []
  const template = catalogById.get(item.sid)
  if (!template) return []
  return computeFootprintTiles(template, item.x, item.z)
    .filter((c) => c.value === 2)
    .map((c) => c.z * sizeX + c.x)
}

/** Directed portal warp edges (source entrance node → linked portal's own
 *  entrance node) — see this file's header comment for exactly when an edge
 *  exists. Every real sample places portal linkage between type-0 (objects[])
 *  instances only, matching map-extract.ts's own join assumption. */
function buildPortalEdges(placedObjects: PlacedObject[], catalogById: Map<string, CatalogMapObject>, sizeX: number): Map<number, number[]> {
  const type0ById = new Map<number, PlacedObject>()
  for (const o of placedObjects) if (o.type === 0) type0ById.set(o.id, o)

  const edges = new Map<number, number[]>()
  for (const item of placedObjects) {
    const info = item.portalInfo
    if (!info || !info.isActive || info.targetIdx === undefined) continue
    const target = type0ById.get(info.targetIdx)
    if (!target) continue
    const fromNodes = accessNodesFor(item, catalogById, sizeX)
    const toNodes = accessNodesFor(target, catalogById, sizeX)
    if (fromNodes.length === 0 || toNodes.length === 0) continue
    for (const from of fromNodes) {
      const list = edges.get(from)
      if (list) list.push(...toNodes)
      else edges.set(from, [...toNodes])
    }
  }
  return edges
}

function floodFill(seeds: number[], blocked: Set<number>, sizeX: number, sizeZ: number, portalEdges: Map<number, number[]>): Set<number> {
  const visited = new Set<number>()
  const queue: number[] = []
  for (const seed of seeds) {
    if (visited.has(seed) || blocked.has(seed)) continue
    visited.add(seed)
    queue.push(seed)
  }
  while (queue.length > 0) {
    const node = queue.pop() as number
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (visited.has(n) || blocked.has(n)) continue
      visited.add(n)
      queue.push(n)
    }
    const portalTargets = portalEdges.get(node)
    if (portalTargets) {
      for (const n of portalTargets) {
        if (visited.has(n) || blocked.has(n)) continue
        visited.add(n)
        queue.push(n)
      }
    }
  }
  return visited
}

interface ReachabilityAnalysis {
  sizeX: number
  sizeZ: number
  catalogById: Map<string, CatalogMapObject>
  reachable: Set<number>
  unreachable: { item: PlacedObject; accessNodes: number[]; blockedBy: { id: number; sid: string }[] }[]
}

/** Shared core: flood fill (grid + portal edges) from every player start,
 *  then a 0-1 BFS (Dial's algorithm) outward from the reachable region to
 *  identify, for every still-unreachable target, the minimal chain of other
 *  placed objects' solid footprint standing on the shortest bridge back.
 *  Consumed by both `findUnreachablePlacements` (report) and
 *  `computeReachabilityAutoFix` (report + fix). */
function analyzeReachability(context: ReachabilityContext, catalog: GameCatalog | null): ReachabilityAnalysis {
  const { sizeX, sizeZ, placedObjects } = context
  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  if (sizeX <= 0 || sizeZ <= 0) return { sizeX, sizeZ, catalogById, reachable: new Set(), unreachable: [] }

  const seeds: number[] = []
  const targets: { item: PlacedObject; accessNodes: number[] }[] = []
  for (const item of placedObjects) {
    if (item.type === 0 && PLAYER_START_SIDS.has(item.sid)) {
      const nodes = accessNodesFor(item, catalogById, sizeX)
      seeds.push(...(nodes.length > 0 ? nodes : [item.node]))
      continue
    }
    const accessNodes = accessNodesFor(item, catalogById, sizeX)
    if (accessNodes.length > 0) targets.push({ item, accessNodes })
  }
  const portalEdges = buildPortalEdges(placedObjects, catalogById, sizeX)
  if (seeds.length === 0 || targets.length === 0) return { sizeX, sizeZ, catalogById, reachable: new Set(), unreachable: [] }

  const blocked = buildBlockedTileSet(context, catalog)
  const reachable = floodFill(seeds, blocked, sizeX, sizeZ, portalEdges)

  const unreachable = targets.filter((t) => !t.accessNodes.some((n) => reachable.has(n)))
  if (unreachable.length === 0) return { sizeX, sizeZ, catalogById, reachable, unreachable: [] }

  // Solid (value===1) footprint cell ownership — same source buildBlockedTileSet
  // itself sweeps for `type === 0` placements — so a blocking cell on the
  // bridge path traces back to the specific object responsible.
  const nodeOwners = new Map<number, { id: number; sid: string }[]>()
  for (const obj of placedObjects) {
    if (obj.type !== 0) continue
    const template = catalogById.get(obj.sid)
    for (const cell of computeFootprintTiles(template, obj.x, obj.z)) {
      if (cell.value !== 1) continue
      const node = cell.z * sizeX + cell.x
      const owners = nodeOwners.get(node)
      const entry = { id: obj.id, sid: obj.sid }
      if (owners) owners.push(entry)
      else nodeOwners.set(node, [entry])
    }
  }

  // 0-1 BFS (Dial's algorithm, bucket-queued) outward from the reachable
  // region: a free neighbor (or a portal warp) costs 0, a neighbor blocked
  // entirely by placed-object footprint(s) costs 1 (attributable to those
  // object ids), a neighbor blocked by anything else (water, an unramped
  // elevation wall) is impassable — nothing here can be "moved". Finds, for
  // every node, the minimum number of distinct objects standing between it
  // and reachable territory, same technique as accessibility-pass.ts's own
  // bridge search.
  const dist = new Map<number, number>([...reachable].map((n) => [n, 0]))
  const cameFrom = new Map<number, number>()
  const viaOwners = new Map<number, { id: number; sid: string }[]>()
  const buckets: number[][] = [[...reachable]]
  const relax = (from: number, to: number, cost: number, owners: { id: number; sid: string }[]) => {
    const nd = (dist.get(from) as number) + cost
    const existing = dist.get(to)
    if (existing !== undefined && existing <= nd) return
    dist.set(to, nd)
    cameFrom.set(to, from)
    viaOwners.set(to, owners)
    while (buckets.length <= nd) buckets.push([])
    buckets[nd].push(to)
  }
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d]
    for (let i = 0; i < bucket.length; i++) {
      const node = bucket[i]
      if (dist.get(node) !== d) continue // stale — a shorter distance already found
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        const n = nz * sizeX + nx
        if (!blocked.has(n)) { relax(node, n, 0, []); continue }
        const owners = nodeOwners.get(n)
        if (owners) relax(node, n, 1, owners)
      }
      const portalTargets = portalEdges.get(node)
      if (portalTargets) for (const n of portalTargets) relax(node, n, 0, [])
    }
  }

  const results: ReachabilityAnalysis['unreachable'] = []
  for (const { item, accessNodes } of unreachable) {
    let best: number | null = null
    for (const n of accessNodes) {
      const d = dist.get(n)
      if (d !== undefined && (best === null || d < (dist.get(best) as number))) best = n
    }
    const blockedBy = new Map<number, { id: number; sid: string }>()
    if (best !== null) {
      let cur = best
      while (!reachable.has(cur)) {
        for (const owner of viaOwners.get(cur) ?? []) blockedBy.set(owner.id, owner)
        const parent = cameFrom.get(cur)
        if (parent === undefined) break
        cur = parent
      }
    }
    results.push({ item, accessNodes, blockedBy: [...blockedBy.values()] })
  }
  return { sizeX, sizeZ, catalogById, reachable, unreachable: results }
}

/** Whether any of a target's access nodes (or their immediate 4-neighbors,
 *  since the wall tile itself may be one step outside the target's own
 *  footprint) is an unramped elevation-wall tile — see passability.ts's
 *  `isElevationWallTile`. Only meaningful for a target whose blockedBy came
 *  back empty (no placed object owns any of the tiles sealing it in) — a
 *  true seal there is always terrain (this) and/or water, never "nothing". */
function isSealedByElevation(accessNodes: number[], context: ReachabilityContext): boolean {
  const { sizeX, sizeZ, levelsMap, climbsMap } = context
  for (const node of accessNodes) {
    if (isElevationWallTile(node, sizeX, sizeZ, levelsMap, climbsMap)) return true
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      if (isElevationWallTile(nz * sizeX + nx, sizeX, sizeZ, levelsMap, climbsMap)) return true
    }
  }
  return false
}

/** Every placement TSE considers reachability-significant (interactables,
 *  resources, artifacts, mines, fixed squads, random guard/resource/item
 *  placeholders — anything with a real entrance or walk-onto-anywhere
 *  concept) that no player start's flood fill actually touches. */
export function findUnreachablePlacements(context: ReachabilityContext, catalog: GameCatalog | null): UnreachablePlacement[] {
  const { unreachable } = analyzeReachability(context, catalog)
  return unreachable.map(({ item, accessNodes, blockedBy }) => ({
    sid: item.sid,
    id: item.id,
    x: item.x,
    z: item.z,
    node: item.node,
    blockedBy,
    sealedByElevation: blockedBy.length === 0 && isSealedByElevation(accessNodes, context),
  }))
}

export interface IsolatedPlayerStart {
  /** Block 1 `spawns.spawns[]` player slot (1..N) — see `spawnerInfo.owner`'s
   *  own doc comment in map-context.ts. -1 if somehow missing (never seen on
   *  a real map, but propSpawns is a join, not a guarantee). */
  owner: number
  sid: string
  id: number
  x: number
  z: number
  node: number
}

/** Every player-start (city-spawner/hero-spawner) whose OWN flood fill
 *  (grid + active portal edges — same model as analyzeReachability, but
 *  never merged with any other player's) cannot reach any OTHER player
 *  start's own entrance — i.e. two (or more) players are on fully
 *  disconnected landmasses with no bridging portal either. See this file's
 *  header comment for why this needs its own separate pass instead of
 *  folding into findUnreachablePlacements's merged model. A no-op (always
 *  `[]`) for a single-player map — isolation is only meaningful relative to
 *  another player. */
export function findIsolatedPlayerStarts(context: ReachabilityContext, catalog: GameCatalog | null): IsolatedPlayerStart[] {
  const { sizeX, sizeZ, placedObjects } = context
  if (sizeX <= 0 || sizeZ <= 0) return []
  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const starts = placedObjects.filter((p) => p.type === 0 && PLAYER_START_SIDS.has(p.sid))
  if (starts.length < 2) return []

  const blocked = buildBlockedTileSet(context, catalog)
  const portalEdges = buildPortalEdges(placedObjects, catalogById, sizeX)
  const startsWithAccess = starts.map((item) => {
    const nodes = accessNodesFor(item, catalogById, sizeX)
    return { item, accessNodes: nodes.length > 0 ? nodes : [item.node] }
  })

  const isolated: IsolatedPlayerStart[] = []
  for (const start of startsWithAccess) {
    const reach = floodFill(start.accessNodes, blocked, sizeX, sizeZ, portalEdges)
    const reachesAnotherPlayer = startsWithAccess.some(
      (other) => other.item !== start.item && other.accessNodes.some((n) => reach.has(n)),
    )
    if (!reachesAnotherPlayer) {
      isolated.push({ owner: start.item.spawnerInfo?.owner ?? -1, sid: start.item.sid, id: start.item.id, x: start.item.x, z: start.item.z, node: start.item.node })
    }
  }
  return isolated
}

function* ringOffsets(cx: number, cz: number, radius: number): Generator<[number, number]> {
  for (let x = cx - radius; x <= cx + radius; x++) {
    yield [x, cz - radius]
    yield [x, cz + radius]
  }
  for (let z = cz - radius + 1; z <= cz + radius - 1; z++) {
    yield [cx - radius, z]
    yield [cx + radius, z]
  }
}

/** Nearest free tile (expanding ring search) for relocating a pickable
 *  blocker (artifact/resource) out of the way — no reachability requirement,
 *  it just needs a spot where its own footprint isn't blocked, same rule
 *  entrance-autofix.ts's own `findNearbyFreeTile` uses. */
function findFreeTileForBlocker(
  obj: PlacedObject,
  context: ReachabilityContext,
  catalog: GameCatalog | null,
  catalogById: Map<string, CatalogMapObject>,
  avoid: Set<number>,
  occupiedAnchors: Set<number>,
): number | null {
  const { sizeX, sizeZ, waterMap, placedObjects } = context
  const template = catalogById.get(obj.sid)
  const blocked = buildBlockedTileSet(
    { ...context, placedObjects: (placedObjects as PlacedObject[]).filter((o) => !(o.type === obj.type && o.id === obj.id)) },
    catalog,
  )
  const isValid = (x: number, z: number): boolean => {
    const cells = computeFootprintTiles(template, x, z)
    if (!isFootprintInBounds(cells, sizeX, sizeZ)) return false
    const anchorNode = z * sizeX + x
    if (occupiedAnchors.has(anchorNode) && anchorNode !== obj.node) return false
    for (const cell of cells) {
      const n = cell.z * sizeX + cell.x
      if ((waterMap[n] ?? 0) !== 0) return false
      if (cell.value === 1 && (blocked.has(n) || avoid.has(n))) return false
    }
    return true
  }
  const maxRadius = Math.max(sizeX, sizeZ)
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (const [x, z] of ringOffsets(obj.x, obj.z, radius)) {
      if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
      if (isValid(x, z)) return z * sizeX + x
    }
  }
  return null
}

/** Marks a relocation destination's own SOLID cells as claimed, so a later
 *  fix decided in the same pass won't pick the same tile — see
 *  entrance-autofix.ts's own `claimNode` for the same rationale. */
function claimSolidCells(node: number, template: CatalogMapObject | undefined, sizeX: number, avoid: Set<number>): void {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  for (const cell of computeFootprintTiles(template, x, z)) {
    if (cell.value === 1) avoid.add(cell.z * sizeX + cell.x)
  }
}

/**
 * Computes (but does not apply) fixes for every unreachable placement this
 * pass finds: clear a safely-removable blocking chain (delete decorations,
 * relocate pickable artifacts/resources) when the ENTIRE chain is safely
 * clearable — the target itself is never relocated or deleted (see this
 * file's header comment). A chain that isn't fully clearable (sealed by
 * terrain/water, or containing even one real load-bearing object) is left
 * whole and reported via `unresolved` — partially clearing just the
 * decorations in a mixed chain would still leave the path closed (the BFS
 * already found the globally cheapest bridge, so a chain member left in
 * place means no cheaper bridge exists without it), so nothing is touched
 * for those. A single static-snapshot pass, same as computeEntranceAutoFix —
 * the caller (auto-fix-pass.ts) loops this against freshly-rebuilt state to
 * converge across multiple rounds.
 */
export function computeReachabilityAutoFix(context: ReachabilityContext, catalog: GameCatalog | null): ReachabilityAutoFixResult {
  const { sizeX, placedObjects } = context
  const analysis = analyzeReachability(context, catalog)
  if (analysis.unreachable.length === 0) return { deletions: [], relocations: [], unresolved: [] }

  const placedById = new Map<number, PlacedObject>()
  for (const o of placedObjects) if (o.type === 0) placedById.set(o.id, o)

  const deletions: ReachabilityAutoFixDeletion[] = []
  const relocations: ReachabilityAutoFixRelocation[] = []
  const unresolved: UnreachablePlacement[] = []
  const alreadyMarked = new Set<number>()
  const claimedDestinations = new Set<number>()
  const occupiedAnchors = new Set(placedObjects.map((o) => o.node))

  for (const { item, accessNodes, blockedBy } of analysis.unreachable) {
    const clearable = blockedBy.length > 0 && blockedBy.every((b) => {
      const obj = placedById.get(b.id)
      if (!obj) return false
      const group = groupOf(obj, catalog)
      return group === 'decorations' || group === 'artifacts' || group === 'resources'
    })

    if (!clearable) {
      unresolved.push({
        sid: item.sid,
        id: item.id,
        x: item.x,
        z: item.z,
        node: item.node,
        blockedBy,
        sealedByElevation: blockedBy.length === 0 && isSealedByElevation(accessNodes, context),
      })
      continue
    }

    for (const b of blockedBy) {
      if (alreadyMarked.has(b.id)) continue
      alreadyMarked.add(b.id)
      const obj = placedById.get(b.id) as PlacedObject
      const group = groupOf(obj, catalog)
      if (group === 'artifacts' || group === 'resources') {
        const target = findFreeTileForBlocker(obj, context, catalog, analysis.catalogById, claimedDestinations, occupiedAnchors)
        if (target !== null) {
          claimSolidCells(target, analysis.catalogById.get(obj.sid), sizeX, claimedDestinations)
          occupiedAnchors.delete(obj.node)
          occupiedAnchors.add(target)
          relocations.push({ entityType: 0, id: obj.id, sid: obj.sid, fromNode: obj.node, toNode: target })
          continue
        }
      }
      occupiedAnchors.delete(obj.node)
      deletions.push({ entityType: 0, id: obj.id, sid: obj.sid, unblocks: { sid: item.sid, id: item.id } })
    }
  }

  return { deletions, relocations, unresolved }
}

export function describeUnreachablePlacement(issue: UnreachablePlacement): string {
  const where = `${issue.sid} (id ${issue.id}) at (${issue.x}, ${issue.z})`
  if (issue.blockedBy.length === 0) {
    return issue.sealedByElevation
      ? `${where} — unreachable from any player start: sealed by a raised/lowered terrain level with no ramp connecting it to the rest of the map. This can't be auto-fixed; add a climb ramp or adjust the terrain yourself.`
      : `${where} — unreachable from any player start (sealed by terrain/water, nothing placed to move)`
  }
  const blockers = issue.blockedBy.map((b) => `${b.sid} (id ${b.id})`).join(', ')
  return `${where} — unreachable from any player start, blocked by: ${blockers}`
}

export function describeIsolatedPlayerStart(issue: IsolatedPlayerStart): string {
  return `Player ${issue.owner}'s ${issue.sid} (id ${issue.id}) at (${issue.x}, ${issue.z}) can't reach any other player's start — no connected path or bridging portal. Whichever side has less of the map's real content is effectively unplayable for that player, even though findUnreachablePlacements won't flag any of it (it's still "reachable", just only by the other player).`
}
