// ─── Map grid — ramp/slope direction indicator ───────────────────────────────
// A flat 2D top-down tile alone doesn't show which way a slope climbs — this
// derives that from data already parsed this session. Reuses the confirmed
// elevation model (see passability.ts/elevation-shading.ts): a climbsMap===1
// ramp tile's own level is always -1 or 0 (never 1), and it sits on the lower
// side of a level boundary, directly bordering the higher side. "Up" is
// simply the screen direction of whichever neighbor is a higher level than
// the ramp tile itself.

export type RampDirection = 'up' | 'down' | 'left' | 'right'

// z-1 moves DOWN on screen (screenRow = sizeZ-1-z increases as z decreases);
// z+1 moves UP on screen — the same flip used everywhere else in the grid
// dialog (screenToNode, the arrow-key nudge in Move, etc).
const NEIGHBOR_OFFSETS: [number, number, RampDirection][] = [
  [-1, 0, 'left'],
  [1, 0, 'right'],
  [0, -1, 'down'],
  [0, 1, 'up'],
]

/**
 * Per-node "up" screen direction for every `climbsMap === 1` ramp tile.
 * Picks the first higher-level neighbor found (in left/right/down/up order).
 * Verified against every ramp tile in 5 real sample maps (225 total, across
 * Gorges_of_Discord/Glittering_Strait/Fun_and_Graves/Stormlight/TheQuest):
 * every single one has exactly one higher-level neighbor — no ties, no
 * ramp with zero higher neighbors — so the "first found" pick is never
 * actually exercised in practice, and the omit-if-none case is a defensive
 * fallback rather than an observed scenario.
 */
export function buildRampDirectionMap(
  sizeX: number,
  sizeZ: number,
  levelsMap: number[],
  climbsMap: number[],
): Map<number, RampDirection> {
  const directions = new Map<number, RampDirection>()
  const tileCount = sizeX * sizeZ
  if (sizeX <= 0 || sizeZ <= 0 || levelsMap.length !== tileCount || climbsMap.length !== tileCount) return directions

  for (let node = 0; node < tileCount; node++) {
    if (climbsMap[node] !== 1) continue
    const level = levelsMap[node] ?? 0
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz, dir] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const nLevel = levelsMap[nz * sizeX + nx] ?? 0
      if (nLevel > level) {
        directions.set(node, dir)
        break
      }
    }
  }
  return directions
}
