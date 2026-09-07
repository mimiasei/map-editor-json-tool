// ─── RMG zone graph (issue #210, Milestone 1) ───────────────────────────────
// VCMI's own RMG represents a random map as an undirected graph of zones
// linked by required connections, then seeds zone layout from a Dijkstra
// distance graph over that structure (see issue #210's research notes).
// This is the first real version of that idea in TSE: one zone per player
// plus one neutral "treasure" zone between each consecutive pair of players,
// all connected in a single ring — deliberately simpler than VCMI's own
// mixed star/tree/ring topologies (a Milestone 3 concern, once real template
// authoring exists), but a genuine graph with real Dijkstra-computable
// distances, not a hardcoded layout.

export interface ZoneSpec {
  id: number
  kind: 'player' | 'neutral'
  /** Only set for `kind: 'player'` — 1-based player index this zone starts. */
  playerIndex?: number
  /** Relative tile-count weight for the Voronoi zone-shaping pass
   *  (zone-layout.ts) — a bigger `size` claims more map tiles. */
  size: number
}

export interface ZoneGraph {
  zones: ZoneSpec[]
  /** Undirected zone-id pairs — every required connection. */
  edges: [number, number][]
}

/**
 * One player zone + one neutral zone per player, alternating around a ring
 * (`player0 - neutral0 - player1 - neutral1 - ... - player(N-1) -
 * neutral(N-1) - player0`). Every player zone sits exactly 2 hops from
 * every other player zone via their shared neutral zone (or the ring's own
 * neutral zones for non-adjacent players) — guaranteed connected by
 * construction, no isolated zones possible.
 */
export function buildZoneGraph(playerCount: number): ZoneGraph {
  const zones: ZoneSpec[] = []
  const edges: [number, number][] = []

  for (let p = 0; p < playerCount; p++) {
    const playerZoneId = zones.length
    zones.push({ id: playerZoneId, kind: 'player', playerIndex: p + 1, size: 3 })
    const neutralZoneId = zones.length
    zones.push({ id: neutralZoneId, kind: 'neutral', size: 2 })
    edges.push([playerZoneId, neutralZoneId])
  }
  for (let p = 0; p < playerCount; p++) {
    const neutralZoneId = p * 2 + 1
    const nextPlayerZoneId = ((p + 1) % playerCount) * 2
    edges.push([neutralZoneId, nextPlayerZoneId])
  }

  return { zones, edges }
}

/**
 * All-pairs shortest hop-count distance between zones — VCMI's own
 * "Distance Graph" step (issue #210's research notes), used by
 * zone-layout.ts to seed zone placement so graph-adjacent zones end up
 * geometrically close. Every edge costs 1 hop (this graph is unweighted),
 * so a plain per-source BFS computes the same result Dijkstra would.
 */
export function zoneDistanceMatrix(graph: ZoneGraph): number[][] {
  const n = graph.zones.length
  const adjacency: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of graph.edges) {
    adjacency[a].push(b)
    adjacency[b].push(a)
  }

  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity))
  for (let start = 0; start < n; start++) {
    dist[start][start] = 0
    const queue: number[] = [start]
    while (queue.length > 0) {
      const node = queue.shift() as number
      for (const neighbor of adjacency[node]) {
        if (dist[start][neighbor] > dist[start][node] + 1) {
          dist[start][neighbor] = dist[start][node] + 1
          queue.push(neighbor)
        }
      }
    }
  }
  return dist
}
