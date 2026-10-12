// ─── RMG road network: which zone connections get a road ──────────────────
// Port of VCMI's CRoadRandomizer::dropRandomRoads (lib/rmg/CRoadRandomizer.cpp):
// a Kruskal-style spanning tree over the zone graph. Every town zone ends up
// connected by road, with exactly one road between any two towns (no
// cycles), and a road never dead-ends in a zone without a town.

export interface RoadEdgeSelection {
  /** Edges (`a:b`, a < b) of the spanning tree, pruned of town-less dead ends. */
  tree: Set<string>
  /** Candidate edges left out of the tree — each would close a cycle, or was a dead end. */
  extra: [number, number][]
}

export const roadEdgeKey = (a: number, b: number): string => `${Math.min(a, b)}:${Math.max(a, b)}`

/**
 * `edges` are the deduplicated road candidates; `townZones` the zones that
 * hold a town (a player city or random city); `sortKey` orders the edges
 * (VCMI shuffles them — callers pass a seeded roll shared by every edge of
 * the same kind, so equivalent edges of every player are considered
 * together, issue #254; ties break by zone id so it stays deterministic).
 * With no town anywhere every zone counts as one, so the result is still a tree.
 */
export function selectRoadEdges(
  zoneCount: number,
  edges: readonly [number, number][],
  townZones: ReadonlySet<number>,
  sortKey: (a: number, b: number) => number,
): RoadEdgeSelection {
  const hasTown = (z: number): boolean => townZones.size === 0 || townZones.has(z)
  const parent = Array.from({ length: zoneCount }, (_, i) => i)
  const componentHasTown = Array.from({ length: zoneCount }, (_, i) => hasTown(i))
  const find = (z: number): number => {
    while (parent[z] !== z) { parent[z] = parent[parent[z]]; z = parent[z] }
    return z
  }
  const ordered = edges
    .map(([a, b]) => ({ a: Math.min(a, b), b: Math.max(a, b), key: sortKey(a, b) }))
    .sort((p, q) => p.key - q.key || p.a - q.a || p.b - q.b)

  const tree = new Set<string>()
  const extra: [number, number][] = []
  for (const { a, b } of ordered) {
    const ra = find(a)
    const rb = find(b)
    // Joins two different components, at least one with a town. Anything else
    // closes a loop or links two town-less pieces.
    if (ra !== rb && (componentHasTown[ra] || componentHasTown[rb])) {
      parent[ra] = rb
      componentHasTown[rb] = componentHasTown[ra] || componentHasTown[rb]
      tree.add(roadEdgeKey(a, b))
    } else {
      extra.push([a, b])
    }
  }

  // Prune loose ends: a town-less zone with exactly one road loses it,
  // repeatedly, so roads only pass through empty zones on the way between towns.
  for (let changed = true; changed;) {
    changed = false
    const degree = new Map<number, number>()
    for (const key of tree) {
      for (const z of key.split(':').map(Number)) degree.set(z, (degree.get(z) ?? 0) + 1)
    }
    for (const key of [...tree]) {
      const [a, b] = key.split(':').map(Number)
      if ((!hasTown(a) && degree.get(a) === 1) || (!hasTown(b) && degree.get(b) === 1)) {
        tree.delete(key)
        extra.push([a, b])
        changed = true
        break
      }
    }
  }
  return { tree, extra }
}

/** The tree's edges in breadth-first order from each component's first town
 *  zone, as [alreadyConnected, new] pairs — so every edge after a
 *  component's first can join the network built so far. */
export function orderTreeEdges(
  tree: ReadonlySet<string>,
  townZones: ReadonlySet<number>,
): [number, number][] {
  const adj = new Map<number, number[]>()
  for (const key of tree) {
    const [a, b] = key.split(':').map(Number)
    adj.set(a, [...(adj.get(a) ?? []), b])
    adj.set(b, [...(adj.get(b) ?? []), a])
  }
  const roots = [...adj.keys()].sort((p, q) => Number(townZones.has(q)) - Number(townZones.has(p)) || p - q)
  const seen = new Set<number>()
  const out: [number, number][] = []
  for (const root of roots) {
    if (seen.has(root)) continue
    seen.add(root)
    const queue = [root]
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]
      for (const v of (adj.get(u) ?? []).sort((p, q) => p - q)) {
        if (seen.has(v)) continue
        seen.add(v)
        out.push([u, v])
        queue.push(v)
      }
    }
  }
  return out
}
