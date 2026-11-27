// ─── Covering an H3 footprint with OE pieces of fixed sizes ──────────────────
// For H3 objects that become a mix of OE models (a volcanic vent, a lava lake, a lava fissure): the table lists, per square size, the OE sids that
// can stand on it. Going over the blocked H3 cells, each uncovered cell gets the biggest piece (with a random skip, as `packMountainClusterVaried`
// does) whose square contains it, lies on no other piece and has at least half its area on footprint cells still to be covered; the smallest
// piece is the fallback. So a piece hangs over the footprint where H3's blocked cells are few but the sprite is big (a vent blocks 2 cells and
// looks like a mountain; a 1-cell lava pool becomes OE's smallest pool, 2x2). Anchors follow the catalog pivots: a 3x3 stands on its centre cell,
// a 1x1 or 2x2 on its corner cell (the footprint reaches towards higher H3 y, see h3-decoration-pools.ts).

import type { ClusterPlacement, FootprintCell } from './scenery-clusters'

export interface CoverPiece {
  /** Edge of the square footprint: 1, 2 or 3. */
  size: number
  sids: string[]
}

const BIG_SKIP_CHANCE: Record<number, number> = { 3: 0.45, 2: 0.4 }

/** A piece may hang over the footprint, but at least this share of its area must lie on footprint cells still to be covered. */
const MIN_COVERAGE = 0.5

export function coverCells(cells: FootprintCell[], pieces: CoverPiece[], rng: () => number): ClusterPlacement[] {
  const sizes = pieces.map((p) => p.size).sort((a, b) => b - a)
  const smallest = sizes[sizes.length - 1]
  const key = (x: number, z: number) => `${x},${z}`
  const occupied = new Set(cells.map((c) => key(c.x, c.z)))
  const claimed = new Set<string>()
  /** Every tile a placed piece stands on, hanging over or not: pieces never overlap. */
  const taken = new Set<string>()
  const placements: ClusterPlacement[] = []
  let last: string | undefined
  const pick = (size: number): string => {
    const list = (pieces.find((p) => p.size === size) as CoverPiece).sids
    const fresh = list.filter((sid) => sid !== last)
    const from = fresh.length > 0 ? fresh : list
    const sid = from[Math.floor(rng() * from.length)]
    last = sid
    return sid
  }
  const blockOf = (size: number, ox: number, oz: number): string[] => {
    const block: string[] = []
    for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) block.push(key(ox + dx, oz + dz))
    return block
  }
  /** The origins of the squares of `size` that contain `cell`, free of other pieces, with the most still-uncovered footprint cells. */
  const bestOrigins = (size: number, cell: FootprintCell): { ox: number; oz: number; score: number }[] => {
    let best: { ox: number; oz: number; score: number }[] = []
    let bestScore = -1
    for (let oz = cell.z - size + 1; oz <= cell.z; oz++) {
      for (let ox = cell.x - size + 1; ox <= cell.x; ox++) {
        const block = blockOf(size, ox, oz)
        if (block.some((k) => taken.has(k))) continue
        const score = block.filter((k) => occupied.has(k) && !claimed.has(k)).length
        if (score > bestScore) { bestScore = score; best = [{ ox, oz, score }] } else if (score === bestScore) best.push({ ox, oz, score })
      }
    }
    return best
  }
  const place = (size: number, ox: number, oz: number) => {
    for (const k of blockOf(size, ox, oz)) {
      taken.add(k)
      if (occupied.has(k)) claimed.add(k)
    }
    placements.push({ sid: pick(size), anchor: size === 3 ? { x: ox + 1, z: oz + 1 } : { x: ox, z: oz } })
  }

  for (const cell of [...cells].sort((a, b) => (a.z - b.z) || (a.x - b.x))) {
    if (claimed.has(key(cell.x, cell.z))) continue
    let done = false
    for (const size of sizes) {
      if (size > smallest && rng() < (BIG_SKIP_CHANCE[size] ?? 0.4)) continue
      const origins = bestOrigins(size, cell)
      if (origins.length === 0 || (size > smallest && origins[0].score < size * size * MIN_COVERAGE)) continue
      const chosen = origins[Math.floor(rng() * origins.length)]
      place(size, chosen.ox, chosen.oz)
      done = true
      break
    }
    if (done) continue
    // Nothing free of the neighbouring pieces: the smallest piece on the cell itself, if that tile is still free.
    if (!taken.has(key(cell.x, cell.z))) place(smallest, smallest === 1 ? cell.x : cell.x - smallest + 1, smallest === 1 ? cell.z : cell.z - smallest + 1)
  }
  return placements
}
