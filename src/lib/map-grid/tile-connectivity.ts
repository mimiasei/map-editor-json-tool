// ─── Map grid — generic 4-neighbor tile connectivity ─────────────────────────
// Shared by anything that needs "which of this tile's cardinal neighbors
// also have some feature" — river-shape.ts's real `s`-bitmask derivation,
// and the road/river line-rendering canvas (MapGridDialog.tsx), which both
// need the exact same neighbor scan so a rendered line segment's direction
// always agrees with what actually gets written to disk.

export type CardinalDirection = 'N' | 'S' | 'E' | 'W'

const NEIGHBOR_OFFSETS: [number, number, CardinalDirection][] = [
  [1, 0, 'E'],
  [-1, 0, 'W'],
  [0, 1, 'N'],
  [0, -1, 'S'],
]

/** Which of `node`'s 4 cardinal neighbors satisfy `hasFeature`. */
export function connectedDirections(
  node: number,
  hasFeature: (node: number) => boolean,
  sizeX: number,
  sizeZ: number,
): CardinalDirection[] {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  const dirs: CardinalDirection[] = []
  for (const [dx, dz, dir] of NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    if (hasFeature(nz * sizeX + nx)) dirs.push(dir)
  }
  return dirs
}
