// ─── Sealed start pockets ────────────────────────────────────────────────────
// Some H3 maps put a player's start inside a tiny walled-in pocket (trees and mountains all around) whose only way out is a one-way
// monolith: [HotA] Barren Lands starts all 8 heroes that way, each in a 1-8 tile pocket. The importer places trees and mountains by cluster
// packing, so the wall is never tile-exact and OE ended up with open gaps (checked on that map: 4 of the 8 pockets leaked into one shared
// 150+ tile region, and 3 had lost their portal). The accessibility pass then made it worse by deleting decoration to connect the pockets.
//
// A pocket is the 8-connected set of H3 walkable tiles around a start (8-connected because H3 heroes move diagonally) that is small enough
// to be an enclosure and not just a spot in open land. Its ring is every tile touching it that H3 blocks; the converter makes sure each ring
// tile is blocked in OE too, with solid pieces the accessibility pass is not allowed to delete (`sealIds`).

/** A start region larger than this is open land, not a pocket. Barren Lands' pockets are 1 to 8 tiles. */
export const POCKET_MAX_TILES = 64

export interface StartPocket {
  nodes: Set<number>
  /** Tiles touching the pocket (8 neighbours) that are not part of it. */
  ring: number[]
}

/** Every distinct small enclosure around `startNodes`. `walkable` is every atlas node an H3 hero can stand on (H3's own passability, plus the
 *  tiles objects are visited from). Starts in open land produce nothing. */
export function findStartPockets(startNodes: number[], walkable: Set<number>, atlasWidth: number, atlasHeight: number): StartPocket[] {
  const pockets: StartPocket[] = []
  const claimed = new Set<number>()
  for (const start of startNodes) {
    if (claimed.has(start)) continue
    const nodes = new Set<number>([start])
    const queue = [start]
    let open = false
    while (queue.length > 0 && !open) {
      const node = queue.pop() as number
      const x = node % atlasWidth
      const z = Math.floor(node / atlasWidth)
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= atlasWidth || nz >= atlasHeight) continue
          const n = nz * atlasWidth + nx
          if (nodes.has(n) || !walkable.has(n)) continue
          nodes.add(n)
          queue.push(n)
        }
      }
      if (nodes.size > POCKET_MAX_TILES) open = true
    }
    for (const n of nodes) claimed.add(n)
    if (open) continue
    const ring = new Set<number>()
    for (const node of nodes) {
      const x = node % atlasWidth
      const z = Math.floor(node / atlasWidth)
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= atlasWidth || nz >= atlasHeight) continue
          const n = nz * atlasWidth + nx
          if (!nodes.has(n)) ring.add(n)
        }
      }
    }
    pockets.push({ nodes, ring: [...ring] })
  }
  return pockets
}

/** Where a 3x3 hero-spawner goes inside a pocket. Its solid cells (everything but the one entrance cell) block, and in a pocket a few tiles wide
 *  that can fill the way to the portal, so the entrance cell is picked among the pocket's tiles: first the one from which the most `goals`
 *  (portal entrances) can still be walked to, then the largest walkable area left, then the fewest pocket tiles covered, then closest to the
 *  tile the H3 hero stands on. `relSolid` are the solid cells relative to the entrance cell. Returns null when no tile fits. */
export function pickSpawnerEntrance(
  pocket: Set<number>, hardBlocked: Set<number>, goals: number[], relSolid: { dx: number; dz: number }[],
  atlasWidth: number, atlasHeight: number, preferred: number,
): number | null {
  const px = preferred % atlasWidth
  const pz = Math.floor(preferred / atlasWidth)
  let best: { node: number; key: number[] } | null = null
  for (const acc of pocket) {
    if (hardBlocked.has(acc)) continue
    const ax = acc % atlasWidth
    const az = Math.floor(acc / atlasWidth)
    const cells = new Set<number>()
    let fits = true
    for (const { dx, dz } of relSolid) {
      const x = ax + dx
      const z = az + dz
      const n = z * atlasWidth + x
      if (x < 0 || z < 0 || x >= atlasWidth || z >= atlasHeight || hardBlocked.has(n)) { fits = false; break }
      cells.add(n)
    }
    if (!fits) continue
    let covered = 0
    for (const n of cells) if (pocket.has(n)) covered += 1
    const reach = new Set<number>([acc])
    const queue = [acc]
    while (queue.length > 0) {
      const node = queue.pop() as number
      const x = node % atlasWidth
      const z = Math.floor(node / atlasWidth)
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = (z + dz) * atlasWidth + x + dx
          if ((dx === 0 && dz === 0) || reach.has(n) || !pocket.has(n) || cells.has(n) || hardBlocked.has(n)) continue
          reach.add(n)
          queue.push(n)
        }
      }
    }
    const reached = goals.filter((g) => reach.has(g)).length
    const key = [-reached, -reach.size, covered, Math.max(Math.abs(ax - px), Math.abs(az - pz))]
    if (!best || lexLess(key, best.key)) best = { node: acc, key }
  }
  return best?.node ?? null
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}
