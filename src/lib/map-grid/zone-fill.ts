// ─── Player Areas — bucket fill and the objects inside the area ──────────────
// The bucket stops at blocked tiles (mountains, water, cliffs bound a zone), which also stopped it at a city or mine standing in the middle
// of the area: its blocking tiles stayed unpainted, so the player's start was not inside any area. A blocked patch that the filled area
// closes in on every side is part of the area, like painting terrain under it; one that touches the outside (a mountain wall on the
// border) stays out.

/**
 * Blocked tiles to add to a bucket-filled `region`: connected groups of tiles that are blocked, free to take (`canTake`) and not in the
 * region, whose every outside neighbour lies in the region. A group on the map edge is not enclosed.
 */
export function enclosedBlockedTiles(
  region: readonly number[],
  isBlocked: (node: number) => boolean,
  canTake: (node: number) => boolean,
  sizeX: number,
  sizeZ: number,
): number[] {
  const inRegion = new Set(region)
  const seen = new Set<number>()
  const out: number[] = []
  const neighbours = (node: number): (number | null)[] => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    return [
      x > 0 ? node - 1 : null,
      x < sizeX - 1 ? node + 1 : null,
      z > 0 ? node - sizeX : null,
      z < sizeZ - 1 ? node + sizeX : null,
    ]
  }
  // Candidates are only worth a look next to the region.
  for (const start of region) {
    for (const first of neighbours(start)) {
      if (first === null || seen.has(first) || inRegion.has(first) || !isBlocked(first) || !canTake(first)) continue
      const group: number[] = []
      let enclosed = true
      const stack = [first]
      seen.add(first)
      while (stack.length > 0) {
        const node = stack.pop()!
        group.push(node)
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        if (x === 0 || z === 0 || x === sizeX - 1 || z === sizeZ - 1) enclosed = false
        for (const n of neighbours(node)) {
          if (n === null || inRegion.has(n)) continue
          if (isBlocked(n) && canTake(n)) {
            if (!seen.has(n)) {
              seen.add(n)
              stack.push(n)
            }
          } else {
            enclosed = false
          }
        }
      }
      if (enclosed) out.push(...group)
    }
  }
  return out
}
