// ─── Map grid — circular brush radius ─────────────────────────────────────────
// Pure geometry, no file I/O — issue #193 punch-list item ("shared brush size
// control (radius, not just single-tile) for Terrain/Level/Obstacles"),
// scoped in the original plan but never wired up in any phase.

/**
 * Every tile within `radius` tiles of `(centerX, centerZ)` (inclusive,
 * Euclidean distance — a circular brush, not a square one), clamped to the
 * map's own bounds. `radius === 1` (the default/minimum) returns exactly
 * the center tile alone, matching the single-tile behavior every brush had
 * before this control existed.
 */
export function tilesInRadius(
  centerX: number,
  centerZ: number,
  radius: number,
  sizeX: number,
  sizeZ: number,
): number[] {
  const nodes: number[] = []
  const r = Math.max(1, radius)
  const rSquared = (r - 1 + 0.5) * (r - 1 + 0.5)
  const minX = Math.max(0, centerX - (r - 1))
  const maxX = Math.min(sizeX - 1, centerX + (r - 1))
  const minZ = Math.max(0, centerZ - (r - 1))
  const maxZ = Math.min(sizeZ - 1, centerZ + (r - 1))
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX
      const dz = z - centerZ
      if (dx * dx + dz * dz <= rSquared) nodes.push(z * sizeX + x)
    }
  }
  return nodes
}
