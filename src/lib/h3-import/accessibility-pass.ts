// ─── Post-conversion accessibility pass ──────────────────────────────────────
// User-reported real bug: converted maps sometimes have pickable items,
// resources, or interactable entrances (and occasionally whole underground
// pockets) a player can't actually reach — a lossy side effect of this
// importer's own object placement (bigger/differently-shaped OE stock
// footprints than the original H3 object had, tree/mountain cluster spillover,
// ...), not something present in the source H3 map. This pass runs LAST
// (after every object is placed, clamped, and the envelope wall is painted)
// and repairs it, reusing this project's own existing passability model
// rather than inventing a new one:
//
// - "Must be reachable" targets are auto-detected, not hand-listed: any
//   placed instance whose catalog footprint carries a `value===2` walkable
//   interaction cell (`footprint.ts`'s own documented meaning — every
//   interactable/artifact/resource/spawner uses this), or whose sid is one of
//   `passability.ts`'s `NON_BLOCKING_SPAWNER_SIDS` (random-res/-squad/-item,
//   walked onto anywhere). Pure scenery never qualifies — it's the obstacle,
//   never the target.
// - Reachability is a flood fill from every placed player start
//   (city-spawner/hero-spawner) over non-blocked tiles (`passability.ts`'s
//   own `buildBlockedTileSet`), PLUS the real portal links this same import
//   just generated (`portal-links.ts`) as directed teleport edges — not a
//   same-sid "any portal of this color connects" guess, so the model matches
//   exactly what's emitted.
// - Fix order, cheapest first: (1) delete a decorative object (tracked via
//   `decorativeIds`, populated only at the scenery-placement call sites in
//   `convert-h3m-to-map.ts` — these sids never carry an `objectsProperties.*`
//   row, so deletion is always safe) if it's the only thing sealing off a
//   pocket that contains an unreachable target; (2) failing that, nudge the
//   target itself a short distance to the nearest free, reachable tile
//   (never delete a real target — only decoration is ever removed); (3)
//   anything still stuck is reported, not silently dropped.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { buildBlockedTileSet, NON_BLOCKING_SPAWNER_SIDS } from '@/lib/map-grid/passability'

export interface ObjectPlacementGroup {
  ids: number[]
  nodes: number[]
  rotations: number[]
  levels: number[]
}

export interface AccessibilityReport {
  targetsChecked: number
  decorRemoved: number
  targetsNudged: number
  stillUnreachable: number
}

const PLAYER_START_SIDS = new Set(['city-spawner', 'hero-spawner'])
const MAX_NUDGE_RADIUS = 12

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

function nodeAt(x: number, z: number, atlasWidth: number, atlasHeight: number): number | null {
  if (x < 0 || x >= atlasWidth || z < 0 || z >= atlasHeight) return null
  return z * atlasWidth + x
}

/** Every footprint cell a hero must be able to reach to actually use this
 *  instance: `value===2` interaction cells for a normal template, or every
 *  cell for a walked-onto-anywhere placeholder (random-res/-squad/-item —
 *  these never block per `passability.ts`, so any of their cells works).
 *  Returns an empty array for anything that isn't a "must be reachable"
 *  target (pure scenery, unresolvable sid). */
function accessNodesFor(
  sid: string, x: number, z: number, catalogById: Map<string, CatalogMapObject>, atlasWidth: number, atlasHeight: number,
): number[] {
  const template = catalogById.get(sid)
  if (!template) return []
  const cells = computeFootprintTiles(template, x, z)
  const wanted = NON_BLOCKING_SPAWNER_SIDS.has(sid) ? cells : cells.filter((c) => c.value === 2)
  const nodes: number[] = []
  for (const cell of wanted) {
    const node = nodeAt(cell.x, cell.z, atlasWidth, atlasHeight)
    if (node !== null) nodes.push(node)
  }
  return nodes
}

/** Multi-source flood fill over non-blocked atlas nodes, 4-neighbor plus any
 *  directed portal edge starting at the visited node. Mutates `visited` in
 *  place (both to report the result and so repeated calls — one per
 *  unreachable pocket — never re-walk already-claimed territory). */
function floodFill(
  seeds: number[], blocked: Set<number>, atlasWidth: number, atlasHeight: number,
  portalNodeAdjacency: Map<number, number[]>, visited: Set<number>,
): void {
  const queue: number[] = []
  for (const seed of seeds) {
    if (visited.has(seed)) continue
    visited.add(seed)
    queue.push(seed)
  }
  while (queue.length > 0) {
    const node = queue.pop() as number
    const x = node % atlasWidth
    const z = Math.floor(node / atlasWidth)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const n = nodeAt(x + dx, z + dz, atlasWidth, atlasHeight)
      if (n === null || visited.has(n) || blocked.has(n)) continue
      visited.add(n)
      queue.push(n)
    }
    const portalTargets = portalNodeAdjacency.get(node)
    if (portalTargets) {
      for (const n of portalTargets) {
        if (visited.has(n) || blocked.has(n)) continue
        visited.add(n)
        queue.push(n)
      }
    }
  }
}

interface TargetInfo {
  id: number
  sid: string
  accessNodes: number[]
}

export function applyAccessibilityPass(
  objectGroups: Map<string, ObjectPlacementGroup>,
  atlasWidth: number,
  atlasHeight: number,
  out: { levelsMap: number[]; climbsMap: number[]; waterMap: number[] },
  catalog: GameCatalog,
  catalogById: Map<string, CatalogMapObject>,
  decorativeIds: Set<number>,
  portalAdjacencyByObjectId: Map<number, number>,
): AccessibilityReport {
  const idToNode = new Map<number, number>()
  const idToSid = new Map<number, string>()
  for (const [sid, group] of objectGroups) {
    for (let i = 0; i < group.ids.length; i++) {
      idToNode.set(group.ids[i], group.nodes[i])
      idToSid.set(group.ids[i], sid)
    }
  }

  const buildFlatPlaced = (): PlacedObject[] => {
    const flat: PlacedObject[] = []
    for (const [sid, group] of objectGroups) {
      for (let i = 0; i < group.ids.length; i++) {
        const id = group.ids[i]
        const node = group.nodes[i]
        flat.push({ key: `0:${id}`, type: 0, id, sid, x: node % atlasWidth, z: Math.floor(node / atlasWidth), node })
      }
    }
    return flat
  }

  const portalNodeAdjacency = new Map<number, number[]>()
  for (const [fromId, toId] of portalAdjacencyByObjectId) {
    const fromNode = idToNode.get(fromId)
    const toNode = idToNode.get(toId)
    if (fromNode === undefined || toNode === undefined) continue
    const list = portalNodeAdjacency.get(fromNode)
    if (list) list.push(toNode)
    else portalNodeAdjacency.set(fromNode, [toNode])
  }

  const seeds: number[] = []
  const targets: TargetInfo[] = []
  for (const [sid, group] of objectGroups) {
    for (let i = 0; i < group.ids.length; i++) {
      const id = group.ids[i]
      const node = group.nodes[i]
      const x = node % atlasWidth
      const z = Math.floor(node / atlasWidth)
      const accessNodes = accessNodesFor(sid, x, z, catalogById, atlasWidth, atlasHeight)
      if (accessNodes.length === 0) continue
      if (PLAYER_START_SIDS.has(sid)) seeds.push(...accessNodes)
      targets.push({ id, sid, accessNodes })
    }
  }

  const report: AccessibilityReport = { targetsChecked: targets.length, decorRemoved: 0, targetsNudged: 0, stillUnreachable: 0 }
  if (seeds.length === 0 || targets.length === 0) return report

  const passContext = { sizeX: atlasWidth, sizeZ: atlasHeight, levelsMap: out.levelsMap, climbsMap: out.climbsMap, waterMap: out.waterMap }
  let blocked = buildBlockedTileSet({ ...passContext, placedObjects: buildFlatPlaced() }, catalog)
  let reachable = new Set<number>()
  floodFill(seeds, blocked, atlasWidth, atlasHeight, portalNodeAdjacency, reachable)

  const isReachable = (t: TargetInfo) => t.accessNodes.some((n) => reachable.has(n))
  let unreachable = targets.filter((t) => !isReachable(t))
  if (unreachable.length === 0) return report

  // Blocking-cell ownership index (value===1 footprint cells only — the same
  // cells `buildBlockedTileSet`'s own source 1 rule contributes) so a
  // blocked cell on a bridging path can be traced back to the specific
  // object responsible.
  const nodeOwners = new Map<number, { id: number; sid: string }[]>()
  for (const [sid, group] of objectGroups) {
    const template = catalogById.get(sid)
    for (let i = 0; i < group.ids.length; i++) {
      const node = group.nodes[i]
      const x = node % atlasWidth
      const z = Math.floor(node / atlasWidth)
      for (const cell of computeFootprintTiles(template, x, z)) {
        if (cell.value !== 1) continue
        const cellNode = nodeAt(cell.x, cell.z, atlasWidth, atlasHeight)
        if (cellNode === null) continue
        const owners = nodeOwners.get(cellNode)
        const entry = { id: group.ids[i], sid }
        if (owners) owners.push(entry)
        else nodeOwners.set(cellNode, [entry])
      }
    }
  }

  // Minimum-decorative-removal shortest path from the reachable region to
  // every other node, via a 0-1 BFS (Dial's algorithm, bucket-queued): a
  // free neighbor costs 0, a neighbor blocked ENTIRELY by decorative
  // object(s) costs 1 (paid by deleting them), a neighbor blocked by
  // anything else (real terrain/water/wall, or a non-decorative object) is
  // impassable. This — not a single "peel the outermost frontier" pass —
  // is what correctly handles blocking several decorative objects deep
  // (dense tree/mountain cluster fill, common underground): it finds the
  // exact chain of objects standing between a pocket and the reachable
  // region, however long, in one search, rather than only opening the
  // first layer and mistaking that for progress.
  const dist = new Map<number, number>([...reachable].map((n) => [n, 0]))
  const cameFrom = new Map<number, number>()
  const viaDeleteIds = new Map<number, number[]>()
  const buckets: number[][] = [[...reachable]]
  const relax = (from: number, to: number, cost: number, deleteIds: number[]) => {
    const nd = (dist.get(from) as number) + cost
    const existing = dist.get(to)
    if (existing !== undefined && existing <= nd) return
    dist.set(to, nd)
    cameFrom.set(to, from)
    viaDeleteIds.set(to, deleteIds)
    while (buckets.length <= nd) buckets.push([])
    buckets[nd].push(to)
  }
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d]
    for (let i = 0; i < bucket.length; i++) {
      const node = bucket[i]
      if (dist.get(node) !== d) continue // stale — a better distance was already found
      const x = node % atlasWidth
      const z = Math.floor(node / atlasWidth)
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const n = nodeAt(x + dx, z + dz, atlasWidth, atlasHeight)
        if (n === null) continue
        if (!blocked.has(n)) { relax(node, n, 0, []); continue }
        const owners = nodeOwners.get(n)
        if (owners && owners.every((o) => decorativeIds.has(o.id))) {
          relax(node, n, 1, owners.map((o) => o.id))
        }
      }
      const portalTargets = portalNodeAdjacency.get(node)
      if (portalTargets) for (const n of portalTargets) relax(node, n, 0, [])
    }
  }

  const reachableSet = reachable
  const toDelete = new Set<number>()
  for (const target of unreachable) {
    let best: number | null = null
    for (const n of target.accessNodes) {
      const d = dist.get(n)
      if (d !== undefined && (best === null || d < (dist.get(best) as number))) best = n
    }
    if (best === null) continue // no bridgeable path — handled by the nudge phase below
    let cur = best
    while (!reachableSet.has(cur)) {
      const ids = viaDeleteIds.get(cur)
      if (ids) for (const id of ids) toDelete.add(id)
      const parent = cameFrom.get(cur)
      if (parent === undefined) break
      cur = parent
    }
  }

  for (const id of toDelete) {
    const sid = idToSid.get(id)
    if (sid === undefined) continue
    const group = objectGroups.get(sid)
    if (!group) continue
    const index = group.ids.indexOf(id)
    if (index === -1) continue
    group.ids.splice(index, 1)
    group.nodes.splice(index, 1)
    group.rotations.splice(index, 1)
    group.levels.splice(index, 1)
  }
  report.decorRemoved = toDelete.size

  if (toDelete.size > 0) {
    blocked = buildBlockedTileSet({ ...passContext, placedObjects: buildFlatPlaced() }, catalog)
    reachable = new Set<number>()
    floodFill(seeds, blocked, atlasWidth, atlasHeight, portalNodeAdjacency, reachable)
    unreachable = unreachable.filter((t) => !isReachable(t))
  }
  if (unreachable.length === 0) return report

  // Nudge phase: relocate each still-stuck target to the nearest free,
  // reachable tile within a short radius. `nudgeBlocked` starts as the
  // post-deletion blocked set and is kept in sync as each successful nudge
  // vacates its old cells and occupies its new ones, so two targets in the
  // same pocket never land on top of each other.
  const nudgeBlocked = new Set(blocked)
  for (const target of unreachable) {
    const sid = target.sid
    const template = catalogById.get(sid)
    const anchorNode = idToNode.get(target.id)
    if (anchorNode === undefined) { report.stillUnreachable += 1; continue }
    const anchorX = anchorNode % atlasWidth
    const anchorZ = Math.floor(anchorNode / atlasWidth)
    const ownCells = computeFootprintTiles(template, anchorX, anchorZ)
    const ownNodes = new Set<number>()
    for (const cell of ownCells) {
      const n = nodeAt(cell.x, cell.z, atlasWidth, atlasHeight)
      if (n !== null) ownNodes.add(n)
    }

    let placed = false
    for (let radius = 1; radius <= MAX_NUDGE_RADIUS && !placed; radius++) {
      for (const [cx, cz] of ringOffsets(anchorX, anchorZ, radius)) {
        if (cx < 0 || cx >= atlasWidth || cz < 0 || cz >= atlasHeight) continue
        const candidateCells = computeFootprintTiles(template, cx, cz)
        let valid = true
        for (const cell of candidateCells) {
          const n = nodeAt(cell.x, cell.z, atlasWidth, atlasHeight)
          if (n === null) { valid = false; break }
          if (cell.value === 1 && nudgeBlocked.has(n) && !ownNodes.has(n)) { valid = false; break }
        }
        if (!valid) continue
        const candidateAccess = NON_BLOCKING_SPAWNER_SIDS.has(sid)
          ? candidateCells.map((c) => nodeAt(c.x, c.z, atlasWidth, atlasHeight)).filter((n): n is number => n !== null)
          : candidateCells.filter((c) => c.value === 2).map((c) => nodeAt(c.x, c.z, atlasWidth, atlasHeight)).filter((n): n is number => n !== null)
        if (candidateAccess.length === 0 || !candidateAccess.some((n) => reachable.has(n))) continue

        for (const n of ownNodes) nudgeBlocked.delete(n)
        for (const cell of candidateCells) {
          if (cell.value !== 1) continue
          const n = nodeAt(cell.x, cell.z, atlasWidth, atlasHeight)
          if (n !== null) nudgeBlocked.add(n)
        }
        const group = objectGroups.get(sid)
        if (group) {
          const index = group.ids.indexOf(target.id)
          if (index !== -1) group.nodes[index] = cz * atlasWidth + cx
        }
        placed = true
        break
      }
    }
    if (placed) report.targetsNudged += 1
    else report.stillUnreachable += 1
  }

  return report
}

/** Every integer cell at exact Chebyshev distance `radius` from `(cx, cz)`,
 *  perimeter order (top row, bottom row, then the two side columns). */
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
