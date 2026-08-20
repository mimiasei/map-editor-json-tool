// ─── Map grid — elevation "bevel" shading ────────────────────────────────────
// The blocked-tile overlay (passability.ts) paints every elevation-wall tile
// the same flat red as every object- and water-blocked tile, which the user
// pointed out makes it impossible to tell *why* a given tile is red. This is
// a second, independent visual layer specifically for the elevation source:
// a soft highlight on the *higher* side of a level boundary (levelsMap -1/0/1)
// and a soft shadow on the *lower* side, so the border between ground and a
// raised/lowered area reads as a raised/sunken edge rather than an arbitrary
// blob.
//
// Mirrors the exact "wall vs. interior" rule already confirmed for the red
// overlay (passability.ts's isElevationWallTile): a level-≠0 tile only gets
// shaded where it actually borders a *different* level, and never where a
// climbsMap ramp connects the two tiers — so the shading and the red overlay
// agree on where the map is actually a wall vs. a passable slope. A tile that
// borders both a higher and a lower neighbor (e.g. a thin ground strip between
// a raised area and a basin) picks the "higher side" tint — an accepted
// approximation, since one flat canvas tile can't show two different edge
// tints on two different sides at once.

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export type ElevationShade = 'highlight' | 'shadow'

/**
 * Per-node shading verdict for every tile that sits on an (unramped)
 * elevation boundary. `highlight` = this tile is the higher side of the
 * boundary (the raised edge catching light); `shadow` = the lower side (in
 * the shadow of the higher ground next to it). Absent from the map entirely
 * = plain, unshaded ground.
 */
export function buildElevationShadeMap(
  sizeX: number,
  sizeZ: number,
  levelsMap: number[],
  climbsMap: number[],
): Map<number, ElevationShade> {
  const shades = new Map<number, ElevationShade>()
  const tileCount = sizeX * sizeZ
  if (sizeX <= 0 || sizeZ <= 0 || levelsMap.length !== tileCount) return shades
  const climbs = climbsMap.length === tileCount ? climbsMap : []

  for (let node = 0; node < tileCount; node++) {
    const level = levelsMap[node] ?? 0
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    let sawLower = false
    let sawHigher = false
    let nearRamp = climbs[node] === 1
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const nNode = nz * sizeX + nx
      const nLevel = levelsMap[nNode] ?? 0
      if (nLevel < level) sawLower = true
      if (nLevel > level) sawHigher = true
      if (climbs[nNode] === 1) nearRamp = true
    }
    if (nearRamp || (!sawLower && !sawHigher)) continue
    shades.set(node, sawLower ? 'highlight' : 'shadow')
  }
  return shades
}
